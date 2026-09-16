const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  return {
    hidden: false, disabled: false, listeners: {}, children: [], dataset: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    replaceChildren(...children) { this.children = children; },
    append(child) { this.children.push(child); },
    setAttribute(name, value) { this[name] = value; },
    showModal() { this.open = true; }, close() { this.open = false; this.listeners.close?.(); },
    scrollIntoView() {},
    click() { return this.listeners.click?.(); }
  };
}

function environment(script, elements, admin, options = {}) {
  const document = {
    listeners: {},
    getElementById(id) { return elements[id]; },
    createElement() { return element(); },
    createTextNode(text) { return text; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    dispatchEvent(event) { this.listeners[event.type]?.(event); }
  };
  const context = vm.createContext({
    DOMPurify: { isSupported: true, sanitize: html => html }, // DOM sanitization is exercised with the real browser below.
    document, localStorage: options.storage, getComputedStyle: options.getComputedStyle || (() => ({ getPropertyValue: name => ({ '--primary-background-color': '#222', '--primary-text-color': 'white', '--primary-highlight-color': '#2e2e2e' }[name]) })), window: { addEventListener() {}, BlogAdmin: admin, confirm: () => true, location: { href: 'https://pyeonju.github.io/admin/', origin: 'https://pyeonju.github.io', search: options.search || '', assign: options.assign || (() => {}) } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    encodeURIComponent, TextEncoder, TextDecoder, btoa, atob, URLSearchParams, URL, Date: options.Date || Date
  });
  vm.runInContext(fs.readFileSync('assets/vendor/js-yaml-5.4.2.min.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('assets/vendor/markdown-it-15.0.2.min.js', 'utf8'), context);
  if (options.markdownit) context.markdownit = options.markdownit;
  vm.runInContext(fs.readFileSync(script, 'utf8'), context);
  document.runtime = context;
  return document;
}

test('아니요 preserves the post; 네 deletes by SHA and removes it', async () => {
  const dialog = element();
  const confirm = element();
  const cancel = element();
  const row = element();
  row.remove = () => { row.removed = true; };
  const button = element();
  button.dataset = { path: '_posts/2026-09-14-hello.md', title: 'Hello' };
  button.closest = () => row;
  const calls = [];
  const admin = {
    verified: true, branch: 'main',
    contentsPath: path => '/repos/owner/repo/contents/' + path,
    async request(path, options) { calls.push({ path, options }); return options ? {} : { sha: 'current-sha' }; }
  };
  const document = environment('assets/js/delete-post.js', {
    'delete-dialog': dialog, 'delete-status': element(), 'delete-confirm': confirm,
    'delete-cancel': cancel, 'delete-post-title': element()
  }, admin);
  const clickPost = () => document.listeners.click({ target: { closest: () => button } });
  clickPost();
  cancel.click();
  assert.equal(row.removed, undefined);
  assert.equal(calls.length, 0);
  clickPost();
  await confirm.click();
  assert.equal(row.removed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    message: 'Delete post: Hello', sha: 'current-sha', branch: 'main'
  });
});

test('Blog switches between 10, 15 and 20 posts and numbered pages', () => {
  const rows = Array.from({ length: 23 }, () => element());
  const list = element(); list.children = rows;
  const select = element(); select.value = '10';
  const navigation = element();
  environment('assets/js/pagination.js', {
    'blog-post-list': list, 'posts-per-page': select, 'blog-pagination': navigation
  }, {});
  assert.equal(rows.filter(row => !row.hidden).length, 10);
  assert.equal(navigation.children.length, 3);
  navigation.children[1].click();
  assert.equal(rows[10].hidden, false);
  assert.equal(rows[0].hidden, true);
  assert.equal(navigation.children[1].textContent, '[2]');
  select.value = '15'; select.listeners.change();
  assert.equal(rows.filter(row => !row.hidden).length, 15);
  assert.equal(navigation.children.length, 2);
  select.value = '20'; select.listeners.change();
  assert.equal(rows.filter(row => !row.hidden).length, 20);
  assert.equal(navigation.children.length, 2);
});


test('Consecutive Korean posts use composed filenames and keep the editor visible', async () => {
  const elements = Object.fromEntries(['post-form','post-status','editor-locked','publish-button','post-title','post-series','post-summary','post-content'].map(id => [id, element()]));
  const form = elements['post-form'];
  let resets = 0;
  form.reset = () => { resets++; };
  const writes = [];
  const admin = {
    verified: true, branch: 'main', contentsPath: path => path,
    async request(path, options) {
      if (!options) { const error = new Error('Not Found'); error.status = 404; throw error; }
      writes.push({ path, payload: JSON.parse(options.body) });
      return { content: { html_url: 'https://github.com/example/post' } };
    }
  };
  environment('assets/js/editor.js', elements, admin);
  for (const title of ['테스트용', '두 번째 글']) {
    elements['post-title'].value = title;
    elements['post-series'].value = 'C++';
    elements['post-summary'].value = '소개';
    elements['post-content'].value = '# 본문';
    await form.listeners.submit({ preventDefault() {} });
    assert.equal(form.hidden, false);
  }
  assert.equal(resets, 2);
  assert.equal(writes.length, 2);
  assert.match(writes[0].path, /-테스트용\.md$/);
  for (const write of writes) assert.equal(write.path, write.path.normalize('NFC'));
});

function editorFields() {
  return Object.fromEntries(['post-form','post-status','editor-locked','publish-button','editor-heading','original-post-date','post-title','post-series','post-summary','post-content'].map(id => [id, element()]));
}

for (const withDate of [true, false]) for (const nested of [true, false]) {
  test('Editing preserves file path, metadata and ' + (withDate ? 'explicit date' : 'filename-derived date') + (nested ? ' in year folder' : ''), async () => {
    const yaml = require('../assets/vendor/js-yaml-5.4.2.min.js');
    const elements = editorFields();
    let resets = 0;
    elements['post-form'].reset = () => { resets++; };
    const writes = [];
    const meta = {
      layout: 'post', title: '원래 제목', series: 'C++', summarize: '원래 소개',
      ...(withDate ? { date: '2020-12-22 10:30:00 +0900' } : {}),
      comments: true, tags: ['server', 'C++'], permalink: '/my-original-post/',
      custom: { label: 'yes', count: 2 }
    };
    const body = '# 원래 본문\n\n![이미지](/Image/server.png)\n';
    const source = '---\n' + yaml.dump(meta) + '---\n\n' + body;
    const admin = {
      verified: true, branch: 'main', contentsPath: path => path,
      async request(path, options) {
        if (!options) return { encoding: 'base64', content: Buffer.from(source).toString('base64'), sha: 'original-sha' };
        writes.push({ path, payload: JSON.parse(options.body) });
        return { content: { html_url: 'https://github.com/example/post', sha: 'saved-sha-' + writes.length } };
      }
    };
    const path = nested ? '_posts/2020/2020-12-22-original.md' : '_posts/2020-12-22-original.md';
    environment('assets/js/editor.js', elements, admin, { search: '?edit=' + encodeURIComponent(path) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements['post-title'].value, meta.title);
    assert.equal(elements['post-series'].value, meta.series);
    assert.equal(elements['post-summary'].value, meta.summarize);
    assert.equal(elements['post-content'].value, body);
    elements['post-title'].value = '수정한 제목';
    elements['post-series'].value = 'Network';
    elements['post-summary'].value = '수정한 소개';
    elements['post-content'].value = body + '추가 내용\n';
    await elements['post-form'].listeners.submit({ preventDefault() {} });
    assert.equal(writes[0].path, path);
    assert.equal(writes[0].payload.sha, 'original-sha');
    const written = Buffer.from(writes[0].payload.content, 'base64').toString('utf8');
    const header = yaml.load(written.match(/^---\n([\s\S]*?)\n---/)[1], { schema: yaml.CORE_SCHEMA });
    assert.equal(header.date, meta.date);
    assert.equal(Object.hasOwn(header, 'date'), withDate);
    assert.equal(header.permalink, meta.permalink);
    assert.deepEqual(header.custom, meta.custom);
    assert.deepEqual(header.tags, meta.tags);
    assert.equal(header.comments, true);
    assert.equal(header.title, '수정한 제목');
    assert.equal(header.series, 'Network');
    assert.equal(header.summarize, '수정한 소개');
    assert.ok(written.endsWith(body + '추가 내용\n'));
    await elements['post-form'].listeners.submit({ preventDefault() {} });
    assert.equal(writes[1].payload.sha, 'saved-sha-1');
    assert.equal(resets, 0);
  });
}

test('A conflicting edit keeps the entered content and shows a conflict message', async () => {
  const elements = editorFields();
  const source = '---\ntitle: Original\ndate: 2020-12-22\n---\n\nBody';
  const admin = {
    verified: true, branch: 'main', contentsPath: path => path,
    async request(path, options) {
      if (!options) return { encoding: 'base64', content: Buffer.from(source).toString('base64'), sha: 'old-sha' };
      const error = new Error('Conflict'); error.status = 409; throw error;
    }
  };
  environment('assets/js/editor.js', elements, admin, { search: '?edit=_posts%2F2020-12-22-original.md' });
  await new Promise(resolve => setImmediate(resolve));
  elements['post-content'].value = 'Unsaved changes';
  await elements['post-form'].listeners.submit({ preventDefault() {} });
  assert.equal(elements['post-content'].value, 'Unsaved changes');
  assert.match(elements['post-status'].textContent, /충돌/);
});

test('Deleting from a post page returns to Blog only after confirmation succeeds', async () => {
  const dialog = element(), confirm = element(), cancel = element();
  const button = element();
  button.dataset = { path: '_posts/2020-12-22-original.md', title: 'Original', afterDelete: '/blog/' };
  button.closest = () => null;
  const requests = [], navigations = [];
  const admin = {
    verified: true, branch: 'main', contentsPath: path => path,
    async request(path, options) { requests.push(options); return options ? {} : { sha: 'current-sha' }; }
  };
  const document = environment('assets/js/delete-post.js', {
    'delete-dialog': dialog, 'delete-status': element(), 'delete-confirm': confirm,
    'delete-cancel': cancel, 'delete-post-title': element()
  }, admin, { assign: url => navigations.push(url) });
  const open = () => document.listeners.click({ target: { closest: () => button } });
  open(); cancel.click();
  assert.equal(requests.length, 0);
  assert.equal(navigations.length, 0);
  open(); await confirm.click();
  assert.equal(requests[1].method, 'DELETE');
  assert.deepEqual(navigations, ['/blog/']);
});

test('New posts save KST timestamps across UTC midnight and preserve chronological order', async () => {
  const elements = editorFields();
  elements['post-form'].reset = () => {};
  const writes = [];
  let now = Date.parse('2026-09-15T15:02:03Z');
  class Clock extends Date { static now() { return now; } }
  const admin = { verified: true, branch: 'main', contentsPath: path => path,
    async request(path, options) {
      if (!options) { const e = new Error('Missing'); e.status = 404; throw e; }
      writes.push({ path, data: JSON.parse(options.body) });
      return { content: { html_url: 'https://github.com/example/post' } };
    }
  };
  environment('assets/js/editor.js', elements, admin, { Date: Clock });
  for (const title of ['first', 'second']) {
    elements['post-title'].value = title;
    elements['post-content'].value = 'body';
    elements['post-series'].value = 'C++';
    elements['post-summary'].value = '';
    await elements['post-form'].listeners.submit({ preventDefault() {} });
    now += 60000;
  }
  const yaml = require('../assets/vendor/js-yaml-5.4.2.min.js');
  const dates = writes.map(write => {
    assert.match(write.path, /^_posts\/2026\/2026-09-16-/);
    const source = Buffer.from(write.data.content, 'base64').toString();
    return yaml.load(source.split('---')[1], { schema: yaml.CORE_SCHEMA }).date;
  });
  assert.deepEqual(dates, ['2026-09-16 00:02:03 +0900', '2026-09-16 00:03:03 +0900']);
});

test('Preview renders Markdown inline without publishing and clears on reset', async () => {
  const elements = editorFields();
  for (const id of ['preview-button','post-preview','preview-content','preview-title','preview-status']) elements[id] = element();
  elements['post-title'].value = '<img src=x onerror=alert(1)>';
  elements['post-content'].value = '# Heading\n\n![image](/image.png)\n\n```cpp\nint x;\n```';
  const calls = [];
  const admin = { verified: true, async request(path, options, responseType) {
    calls.push({ path, options, responseType });
    return '<h1>Heading</h1><img src="/image.png"><pre><code>int x;</code></pre>';
  } };
  const doc = environment('assets/js/preview.js', elements, admin);
  await elements['preview-button'].click();
  assert.equal(calls.length, 0, 'Preview must not send the draft to GitHub');
  assert.equal(elements['post-preview'].hidden, false);
  assert.equal(elements['preview-title'].textContent, '<img src=x onerror=alert(1)>');
  assert.match(elements['preview-content'].innerHTML, /<pre><code[^>]*>int x;/);
  assert.doesNotMatch(fs.readFileSync('admin.html', 'utf8'), /<iframe/);
  elements['post-form'].listeners.reset();
  assert.equal(elements['post-preview'].hidden, true);
  assert.equal(elements['preview-content'].textContent, '');
  admin.verified = false;
  doc.listeners['blog-admin-change']();
  await elements['preview-button'].click();
  assert.equal(calls.length, 0);
});

test('Preview failure preserves the draft and allows retry', async () => {
  const elements = editorFields();
  for (const id of ['preview-button','post-preview','preview-content','preview-title','preview-status']) elements[id] = element();
  elements['post-content'].value = 'Keep this text';
  elements['post-title'].value = 'Title';
  environment('assets/js/preview.js', elements, { verified: true }, { markdownit: () => { throw new Error('Render failure'); } });
  await elements['preview-button'].click();
  assert.equal(elements['post-content'].value, 'Keep this text');
  assert.equal(elements['preview-button'].disabled, false);
  assert.match(elements['preview-status'].textContent, /Render failure/);
  assert.equal(elements['post-preview'].hidden, false);
  assert.equal(elements['preview-content'].textContent, 'Keep this text');
  assert.match(elements['preview-content'].className, /preview-plain/);
});

test('Preview keeps plain text, line breaks, angle brackets and readable theme colors', async () => {
  const elements = editorFields();
  for (const id of ['preview-button','post-preview','preview-content','preview-title','preview-status']) elements[id] = element();
  elements['post-title'].value = '일반 글';
  elements['post-content'].value = '그냥 Text 입니다.\n다음 줄입니다.\n\n<Text>\nvector<int> & 비교';
  environment('assets/js/preview.js', elements, { verified: true });
  await elements['preview-button'].click();
  const html = elements['preview-content'].innerHTML;
  assert.match(html, /그냥 Text 입니다\.<br>/);
  assert.match(html, /다음 줄입니다\./);
  assert.match(html, /&lt;Text&gt;/);
  assert.match(html, /vector&lt;int&gt; &amp; 비교/);
  assert.equal(elements['preview-content'].className, 'post-content');
});

function draftFields() {
  const fields = editorFields();
  for (const id of ['draft-status','draft-recovery','draft-recovery-message','draft-save','draft-restore','draft-discard']) fields[id] = element();
  for (const id of ['post-title','post-series','post-summary','post-content']) fields[id].value = '';
  fields['draft-recovery'].hidden = true;
  return fields;
}
function storage() {
  const data = new Map();
  return { data, get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key) };
}

test('Drafts auto-save all fields, recover after reopening, stay separate and clear after publishing', () => {
  const saved = storage();
  const admin = { verified: true };
  let fields = draftFields();
  let doc = environment('assets/js/drafts.js', fields, admin, { storage: saved });
  doc.runtime.window.BlogDrafts.activate({ path: 'new', branch: 'main', sha: '' });
  fields['post-title'].value = '제목';
  fields['post-series'].value = 'C++';
  fields['post-summary'].value = '소개';
  fields['post-content'].value = '본문\n두 번째 줄';
  fields['post-content'].listeners.input();
  assert.equal(saved.data.size, 1);
  assert.equal([...saved.data.values()][0].includes('blog_token'), false);
  fields = draftFields();
  doc = environment('assets/js/drafts.js', fields, admin, { storage: saved });
  doc.runtime.window.BlogDrafts.activate({ path: 'new', branch: 'main', sha: '' });
  assert.equal(fields['draft-recovery'].hidden, false);
  fields['draft-restore'].click();
  assert.equal(fields['post-content'].value, '본문\n두 번째 줄');
  assert.equal(fields['post-title'].value, '제목');
  assert.equal(fields['post-series'].value, 'C++');
  assert.equal(fields['post-summary'].value, '소개');
  const editFields = draftFields();
  const editDoc = environment('assets/js/drafts.js', editFields, admin, { storage: saved });
  editDoc.runtime.window.BlogDrafts.activate({ path: '_posts/a.md', branch: 'main', sha: 'old' });
  assert.equal(editFields['draft-recovery'].hidden, true);
  editFields['post-content'].value = '수정 초안';
  editFields['post-content'].listeners.input();
  assert.equal(saved.data.size, 2);
  doc.runtime.window.BlogDrafts.published('new-sha');
  assert.equal(saved.data.size, 1, 'Only the published draft is cleared');
  editDoc.runtime.window.BlogDrafts.published('edit-sha');
  assert.equal(saved.data.size, 0);
});

test('An edit draft warns about a newer original, does not overwrite before restore and can be discarded', () => {
  const saved = storage();
  const admin = { verified: true };
  const first = draftFields();
  let doc = environment('assets/js/drafts.js', first, admin, { storage: saved });
  doc.runtime.window.BlogDrafts.activate({ path: '_posts/a.md', branch: 'main', sha: 'old' });
  first['post-content'].value = 'old draft';
  first['post-content'].listeners.input();
  const next = draftFields();
  next['post-content'].value = 'latest published text';
  doc = environment('assets/js/drafts.js', next, admin, { storage: saved });
  doc.runtime.window.BlogDrafts.activate({ path: '_posts/a.md', branch: 'main', sha: 'new' });
  assert.match(next['draft-recovery-message'].textContent, /원본 글이 변경/);
  assert.equal(next['post-content'].value, 'latest published text');
  next['post-content'].listeners.input();
  assert.match([...saved.data.values()][0], /old draft/);
  next['draft-discard'].click();
  assert.equal(saved.data.size, 0);
  assert.equal(next['post-content'].value, 'latest published text');
});

test('Draft storage failure leaves the editor text intact and reports failure', () => {
  const fields = draftFields();
  const doc = environment('assets/js/drafts.js', fields, { verified: true }, { storage: {
    getItem() { return null; }, setItem() { throw new Error('Quota'); }
  } });
  doc.runtime.window.BlogDrafts.activate({ path: 'new', branch: 'main', sha: '' });
  fields['post-content'].value = 'keep me';
  fields['post-content'].listeners.input();
  assert.equal(fields['post-content'].value, 'keep me');
  assert.match(fields['draft-status'].textContent, /임시저장하지 못했습니다/);
});


test('Preview stays readable while the stylesheet has not loaded', async () => {
  const elements = editorFields();
  for (const id of ['preview-button','post-preview','preview-content','preview-title','preview-status']) elements[id] = element();
  elements['post-title'].value = '';
  elements['post-content'].value = '# 안녕하세요\n\n그리고 그냥\n\n이런식으로 작성하는 텍스트';
  environment('assets/js/preview.js', elements, { verified: true }, { getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  await elements['preview-button'].click();
  assert.match(elements['preview-content'].innerHTML, /<h1>안녕하세요<\/h1>/);
  assert.match(elements['preview-content'].innerHTML, /<p>이런식으로 작성하는 텍스트<\/p>/);
  assert.equal(elements['post-preview'].hidden, false);
});

function authEnvironment(saved, start) {
  let now = start;
  let timerId = 0;
  const timers = new Map();
  const listeners = {};
  const fields = Object.fromEntries(['admin-dialog','admin-form','admin-button','admin-status','github-token','admin-confirm','admin-cancel','new-post-link'].map(id => [id, element()]));
  const calls = [];
  class Clock extends Date { static now() { return now; } }
  const document = {
    getElementById: id => fields[id], querySelectorAll: () => [], hidden: false,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    dispatchEvent(event) { listeners[event.type]?.(event); }
  };
  const context = vm.createContext({ document, window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    sessionStorage: saved, Date: Clock, encodeURIComponent,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setTimeout(fn, ms) { timers.set(++timerId, { fn, time: now + ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url) { calls.push(url); return { ok: true, async json() { return url.endsWith('/user') ? { login: 'PYeonju' } : { permissions: { push: true }, default_branch: 'main' }; } }; }
  });
  vm.runInContext(fs.readFileSync('assets/js/admin-link.js', 'utf8'), context);
  return { admin: context.window.BlogAdmin, calls, fields,
    event: (name, trusted = true) => listeners[name]?.({ type: name, isTrusted: trusted }),
    advance(ms, runTimers = true) {
      now += ms;
      if (runTimers) for (const [id, timer] of [...timers]) if (timer.time <= now) { timers.delete(id); timer.fn(); }
    }
  };
}

test('Admin expires only after 30 idle minutes; typing, IME, pointer and wheel restart the deadline', async () => {
  const saved = storage();
  saved.setItem('blog_token', 'mock');
  const start = Date.parse('2026-09-16T00:00:00Z');
  saved.setItem('blog_last_activity', String(start));
  const app = authEnvironment(saved, start);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.admin.verified, true);
  for (const input of ['keydown','input','compositionupdate','pointerdown','pointermove','wheel']) {
    app.advance(29 * 60000);
    assert.equal(app.admin.verified, true);
    app.event(input);
  }
  app.advance(29 * 60000);
  assert.equal(app.admin.verified, true);
  app.advance(60000);
  assert.equal(app.admin.verified, false);
  assert.equal(saved.getItem('blog_token'), null);
  assert.equal(saved.getItem('blog_last_activity'), null);
});

test('Page reload preserves idle deadline; expired credentials never reach GitHub', async () => {
  const saved = storage();
  const start = Date.parse('2026-09-16T00:00:00Z');
  saved.setItem('blog_token', 'mock');
  saved.setItem('blog_last_activity', String(start));
  const reload = authEnvironment(saved, start + 29 * 60000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reload.admin.verified, true);
  reload.advance(60000, false); // Simulate a suspended tab whose timer did not run.
  const before = reload.calls.length;
  await assert.rejects(reload.admin.request('/repos/example'), /자동 로그아웃/);
  assert.equal(reload.calls.length, before);
  assert.equal(reload.admin.verified, false);
  saved.setItem('blog_token', 'mock');
  saved.setItem('blog_last_activity', String(start));
  const expired = authEnvironment(saved, start + 30 * 60000);
  assert.equal(expired.calls.length, 0);
  assert.equal(saved.getItem('blog_token'), null);
});

test('Synthetic events and background requests cannot keep an admin session alive', async () => {
  const saved = storage();
  saved.setItem('blog_token', 'mock');
  const start = Date.parse('2026-09-16T00:00:00Z');
  saved.setItem('blog_last_activity', String(start));
  const app = authEnvironment(saved, start);
  await new Promise(resolve => setImmediate(resolve));
  app.advance(29 * 60000);
  app.event('keydown', false);
  await app.admin.request('/repos/example');
  app.advance(60000);
  assert.equal(app.admin.verified, false);
});

test('Only three drafts survive; resaving updates one slot and eviction uses last save time', () => {
  const saved = storage();
  saved.setItem('theme', 'dark');
  let now = Date.parse('2026-09-16T00:00:00Z');
  class Clock extends Date { static now() { return now; } }
  const editors = [];
  for (const id of ['a','b','c']) {
    const fields = draftFields();
    const doc = environment('assets/js/drafts.js', fields, { verified: true }, { storage: saved, search: '?draft=' + id, Date: Clock });
    doc.runtime.window.BlogDrafts.activate({ path: 'new', branch: 'main', sha: '' });
    fields['post-title'].value = id;
    fields['post-content'].value = id + ' content';
    fields['post-content'].listeners.input();
    editors.push(fields);
    now += 1000;
  }
  const count = () => [...saved.data.keys()].filter(key => key.startsWith('blog-draft:')).length;
  assert.equal(count(), 3);
  editors[0]['draft-save'].click(); // a is now newer than b and c.
  assert.equal(count(), 3);
  now += 1000;
  const fourth = draftFields();
  const doc = environment('assets/js/drafts.js', fourth, { verified: true }, { storage: saved, search: '?draft=d', Date: Clock });
  doc.runtime.window.BlogDrafts.activate({ path: 'new', branch: 'main', sha: '' });
  fourth['post-title'].value = 'd';
  fourth['post-content'].value = 'd content';
  fourth['draft-save'].click();
  assert.equal(count(), 3);
  assert.equal([...saved.data.keys()].some(key => key.endsWith('new:b')), false);
  assert.equal([...saved.data.keys()].some(key => key.endsWith('new:a')), true);
  assert.equal(saved.getItem('theme'), 'dark');
  assert.match(fourth['draft-status'].textContent, /가장 오래된/);
});
