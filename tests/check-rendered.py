from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import unicodedata

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.stack = []
        self.fields = {}
        self.post_urls = []
        self.details = 0
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.fields[attrs['id']] = (tag, list(self.stack))
        if tag == 'a' and any('post-list' in a.get('class', '').split() for _, a in self.stack):
            self.post_urls.append(attrs['href'])
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

admin = Page(Path('_site/admin/index.html').read_text())
for name in ('post-title', 'post-series', 'post-summary', 'post-content', 'publish-button'):
    tag, parents = admin.fields[name]
    assert any(a.get('id') == 'post-form' for _, a in parents), name
    assert not any(t in ('datalist', 'option') for t, _ in parents), name

for page in ('blog', 'series'):
    output = Page(Path(f'_site/{page}/index.html').read_text())
    for url in output.post_urls:
        path = unquote(urlsplit(url).path)
        assert path == unicodedata.normalize('NFC', path), url
        target = Path('_site') / path.lstrip('/')
        if path.endswith('/'):
            target /= 'index.html'
        assert target.is_file(), f'Broken post link: {url}'
    if page == 'series' and output.post_urls:
        assert output.details, 'Missing collapsible series'
print('Rendered editor fields, post links, and collapsible series checked.')
