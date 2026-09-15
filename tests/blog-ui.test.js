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
    document, window: { BlogAdmin: admin, location: { href: 'https://pyeonju.github.io/admin/', origin: 'https://pyeonju.github.io', search: options.search || '', assign: options.assign || (() => {}) } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    encodeURIComponent, TextEncoder, TextDecoder, btoa, atob, URLSearchParams, URL, Date: options.Date || Date
  });
  vm.runInContext(fs.readFileSync('assets/vendor/js-yaml-5.4.2.min.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync(script, 'utf8'), context);
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

for (const withDate of [true, false]) {
  test('Editing preserves file path, metadata and ' + (withDate ? 'explicit date' : 'filename-derived date'), async () => {
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
    const path = '_posts/2020-12-22-original.md';
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
    assert.match(write.path, /^_posts\/2026-09-16-/);
    const source = Buffer.from(write.data.content, 'base64').toString();
    return yaml.load(source.split('---')[1], { schema: yaml.CORE_SCHEMA }).date;
  });
  assert.deepEqual(dates, ['2026-09-16 00:02:03 +0900', '2026-09-16 00:03:03 +0900']);
});

test('Preview renders Markdown in an isolated frame without publishing and clears on reset', async () => {
  const elements = editorFields();
  for (const id of ['preview-button','post-preview','preview-frame','preview-status']) elements[id] = element();
  elements['preview-frame'].dataset.styles = '/assets/css/styles.css';
  elements['post-title'].value = '<img src=x onerror=alert(1)>';
  elements['post-content'].value = '# Heading\n\n![image](/image.png)\n\n```cpp\nint x;\n```';
  const calls = [];
  const admin = { verified: true, async request(path, options, responseType) {
    calls.push({ path, options, responseType });
    return '<h1>Heading</h1><img src="/image.png"><pre><code>int x;</code></pre>';
  } };
  const doc = environment('assets/js/preview.js', elements, admin);
  await elements['preview-button'].click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/markdown');
  assert.equal(calls[0].responseType, 'text');
  assert.equal(JSON.parse(calls[0].options.body).text, elements['post-content'].value);
  assert.equal(elements['post-preview'].hidden, false);
  assert.match(elements['preview-frame'].srcdoc, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(elements['preview-frame'].srcdoc, /<pre><code>int x;/);
  assert.match(fs.readFileSync('admin.html', 'utf8'), /id="preview-frame"[^>]*sandbox=""/);
  elements['post-form'].listeners.reset();
  assert.equal(elements['post-preview'].hidden, true);
  assert.equal(elements['preview-frame'].srcdoc, '');
  admin.verified = false;
  doc.listeners['blog-admin-change']();
  await elements['preview-button'].click();
  assert.equal(calls.length, 1);
});

test('Preview failure preserves the draft and allows retry', async () => {
  const elements = editorFields();
  for (const id of ['preview-button','post-preview','preview-frame','preview-status']) elements[id] = element();
  elements['post-content'].value = 'Keep this text';
  elements['post-title'].value = 'Title';
  environment('assets/js/preview.js', elements, { verified: true, async request() { throw new Error('Network failure'); } });
  await elements['preview-button'].click();
  assert.equal(elements['post-content'].value, 'Keep this text');
  assert.equal(elements['preview-button'].disabled, false);
  assert.match(elements['preview-status'].textContent, /Network failure/);
});
