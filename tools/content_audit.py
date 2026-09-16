"""Read-only content inventory: python3 tools/content_audit.py [--check]."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Fail for missing image references or invalid post folders')
args = parser.parse_args()
posts = sorted(Path('_posts').rglob('*.md'))
images = sorted(p for p in Path('assets/images').rglob('*') if p.is_file())
references = set()
problems = []
for post in posts:
    if not re.fullmatch(r'_posts/\d{4}/\d{4}-\d{2}-\d{2}-.+\.md', str(post)):
        problems.append('Unexpected post path: ' + str(post))
    if post.parent.name != post.name[:4]:
        problems.append('Post year mismatch: ' + str(post))
    if not re.search(r'^post_id: .+', post.read_text(), re.M):
        problems.append('Missing post_id: ' + str(post))
# Scan text sources, including HTML and CSS, rather than guessing from filenames.
for folder in ['_posts', '_layouts', '_includes', 'assets/css', '_sass']:
    for source in Path(folder).rglob('*'):
        if source.is_file():
            for match in re.findall(r'/assets/images/[^\s<>"\')\]]+', source.read_text()):
                references.add(unquote(match).split('?')[0].split('#')[0].lstrip('/'))
for source in [*Path('.').glob('*.md'), *Path('.').glob('*.html'), Path('_data/profile.json')]:
    for match in re.findall(r'/assets/images/[^\s<>"\')\]]+', source.read_text()):
        references.add(unquote(match).split('?')[0].split('#')[0].lstrip('/'))
for ref in sorted(references):
    if not Path(ref).is_file(): problems.append('Missing image: ' + ref)
by_hash = {}
for image in images:
    by_hash.setdefault(hashlib.sha256(image.read_bytes()).hexdigest(), []).append(str(image))
print(json.dumps({
    'posts': len(posts), 'images': len(images), 'image_bytes': sum(p.stat().st_size for p in images),
    'unreferenced_candidates': [str(p) for p in images if str(p) not in references],
    'duplicate_groups': [paths for paths in by_hash.values() if len(paths) > 1],
    'problems': problems,
}, ensure_ascii=False, indent=2))
# No automatic deletion: unpublished browser drafts and external links are not visible here.
if args.check and problems: raise SystemExit(1)
