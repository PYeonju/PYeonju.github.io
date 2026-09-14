# PYeonju's blog

Jekyll blog hosted at https://pyeonju.github.io/. Blog lists every post; Series groups posts by the optional `series` front matter value. Posts live in `_posts/`.

## Publish from the browser

1. In repository Settings → Pages, set **Build and deployment → Source: GitHub Actions** (one-time setup).
2. On any blog page, click **관리자 권한** and enter a **fine-grained personal access token** restricted to `PYeonju/PYeonju.github.io` with **Contents: Read and write**. Only GitHub user `PYeonju` with push permission can publish from the editor.
3. Write a title, optional Series (for example `C++`), optional summary, and Markdown body. Click **글 등록**. The editor commits a new file to `_posts/` on the default branch, which triggers the Pages workflow. Once signed in, the navigation shows **New Post** in that browser tab. Each post in Blog and Series also shows a delete button (×); **네** deletes the post after confirmation and **아니요** leaves it alone. Blog visitors can select 10, 15, or 20 posts per page and navigate with numbered page buttons.

The token stays in this tab's `sessionStorage`, is sent only to `api.github.com`, and is cleared by **관리자 로그아웃** or closing the tab. Use a short token expiration and revoke it from GitHub settings if compromised. The visible button is only a convenience: GitHub checks permission for every write. A public static site cannot provide a server-side login by itself.

Local preview: `bundle install && bundle exec jekyll serve`.
