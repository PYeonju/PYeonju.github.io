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

function environment(script, elements, admin) {
  const document = {
    listeners: {},
    getElementById(id) { return elements[id]; },
    createElement() { return element(); },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    dispatchEvent(event) { this.listeners[event.type]?.(event); }
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    document, window: { BlogAdmin: admin },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    encodeURIComponent
  });
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
