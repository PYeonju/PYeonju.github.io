---
---
(function () {
  'use strict';
  const moves = {{ site.data.content_moves | jsonify }};
  function remap(text) {
    for (const [oldPath, newPath] of Object.entries(moves.images)) text = text.replaceAll(oldPath, newPath);
    return text;
  }
  window.BlogContentPaths = { remap };
  const url = new URL(window.location.href);
  const edit = url.searchParams.get('edit');
  if (moves.posts[edit]) {
    url.searchParams.set('edit', moves.posts[edit]);
    window.history.replaceState(null, '', url.href);
  }
  // Preserve timestamps and draft IDs while migrating already saved local drafts.
  const prefix = 'blog-draft:v1:PYeonju/PYeonju.github.io:';
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      try {
        const draft = JSON.parse(localStorage.getItem(key));
        if (!Array.isArray(draft?.values) || typeof draft.values[3] !== 'string') continue;
        let target = key;
        for (const [oldPath, newPath] of Object.entries(moves.posts)) {
          if (key.endsWith(':' + oldPath)) target = key.slice(0, -oldPath.length) + newPath;
        }
        draft.values[3] = remap(draft.values[3]);
        if (target !== key && localStorage.getItem(target)) continue;
        localStorage.setItem(target, JSON.stringify(draft));
        if (target !== key) localStorage.removeItem(key);
      } catch { /* Keep unreadable drafts intact. */ }
    }
  } catch { /* Storage can be unavailable without blocking the editor. */ }
}());
