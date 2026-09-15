from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit, parse_qs
import unicodedata
from datetime import datetime

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.stack = []
        self.fields = {}
        self.post_urls = []
        self.details = 0
        self.edit_paths = []
        self.delete_paths = []
        self.times = []
        self.series = None
        self.neighbors = {}
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'time':
            self.times.append(datetime.fromisoformat(attrs['datetime']))
        if tag == 'a' and any(a.get('class') == 'post-categories' for _, a in self.stack):
            self.series = attrs['href']
        if tag == 'a' and attrs.get('class') in ('series-previous', 'series-next'):
            self.neighbors[attrs['rel']] = attrs['href']
        assert attrs.get('id') != 'preview-frame', 'Preview must be inline'
        if 'id' in attrs:
            self.fields[attrs['id']] = (tag, list(self.stack))
        if tag == 'a' and any('post-list' in a.get('class', '').split() for _, a in self.stack):
            self.post_urls.append(attrs['href'])
        if tag == 'a' and attrs.get('class') == 'edit-post':
            assert any('data-admin-only' in a and 'hidden' in a for _, a in self.stack)
            self.edit_paths.append(parse_qs(urlsplit(attrs['href']).query)['edit'][0])
        if tag == 'button' and attrs.get('data-after-delete'):
            assert attrs['data-after-delete'] == '/blog/'
            self.delete_paths.append(attrs['data-path'])
        if tag == 'details' and attrs.get('class') == 'series-group':
            self.details += 1
            assert 'open' not in attrs, 'Series should start collapsed'
        if tag not in VOID:
            self.stack.append((tag, attrs))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

assert Path('_site/assets/vendor/js-yaml-5.4.2.min.js').is_file()
assert Path('_site/assets/vendor/markdown-it-15.0.2.min.js').is_file()
admin = Page(Path('_site/admin/index.html').read_text())
assert 'preview-content' in admin.fields
assert Path('_site/assets/vendor/dompurify-3.4.15.min.js').is_file()
for name in ('post-title', 'post-series', 'post-summary', 'post-content', 'publish-button'):
    tag, parents = admin.fields[name]
    assert any(a.get('id') == 'post-form' for _, a in parents), name
    assert not any(t in ('datalist', 'option') for t, _ in parents), name

post_pages = {}
for page in ('blog', 'series'):
    output = Page(Path(f'_site/{page}/index.html').read_text())
    if page == 'blog':
        assert output.times == sorted(output.times, reverse=True), 'Blog must show newest posts first'
    for url in output.post_urls:
        path = unquote(urlsplit(url).path)
        assert path == unicodedata.normalize('NFC', path), url
        target = Path('_site') / path.lstrip('/')
        if path.endswith('/'):
            target /= 'index.html'
        assert target.is_file(), f'Broken post link: {url}'
        detail = Page(target.read_text())
        post_pages[url] = detail
        assert detail.times, 'Missing post timestamp'
        assert len(detail.edit_paths) == 1, url
        assert detail.edit_paths == detail.delete_paths, url
        assert Path(detail.edit_paths[0]).is_file(), detail.edit_paths
        assert 'delete-dialog' in detail.fields, url
    if page == 'series' and output.post_urls:
        assert output.details, 'Missing collapsible series'
print('Rendered editor fields, post links, and collapsible series checked.')

for url, post in post_pages.items():
    for rel, neighbor_url in post.neighbors.items():
        assert neighbor_url != url
        neighbor = post_pages[neighbor_url]
        assert post.series and post.series == neighbor.series, 'Cross-series link'
        assert neighbor.neighbors.get('next' if rel == 'prev' else 'prev') == url, 'Missing return link'
        assert (neighbor.times[0] <= post.times[0]) if rel == 'prev' else (neighbor.times[0] >= post.times[0])
for series in {p.series for p in post_pages.values() if p.series}:
    group = [p for p in post_pages.values() if p.series == series]
    assert sum('prev' in p.neighbors for p in group) == len(group) - 1
    assert sum('next' in p.neighbors for p in group) == len(group) - 1
print('Timestamps, newest-first order, inline preview and series neighbors checked.')
