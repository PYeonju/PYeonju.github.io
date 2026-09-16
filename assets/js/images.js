(function () {
  'use strict';
  const body = document.getElementById('post-content');
  const picker = document.getElementById('image-files');
  const button = document.getElementById('image-add');
  const status = document.getElementById('image-status');
  const admin = window.BlogAdmin;
  const pattern = /blog-image\/([a-f0-9-]+\.(?:png|jpg|gif|webp))/g;
  const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  let database;
  let busy = false;
  const urls = new Map();
  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('blog-images-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(request.error); };
    });
    return database;
  }
  async function stored(method, key, value) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('images', method === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('images');
      const request = method === 'put' ? store.put(value, key) : store[method](key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('이미지 저장 실패'));
    });
  }
  const references = text => [...new Set([...text.matchAll(pattern)].map(match => match[1]))];
  const available = () => admin.verified && !body.disabled && !busy;
  function update() { button.disabled = !available(); }
  async function add(files) {
    if (!available()) return;
    const images = Array.from(files);
    if (!images.length) return;
    busy = true;
    update();
    document.dispatchEvent(new CustomEvent('blog-image-state'));
    try {
      for (const file of images) {
        if (!types[file.type]) throw new Error('PNG, JPG, GIF, WebP 이미지를 선택해 주세요.');
        if (file.size > 10 * 1024 * 1024) throw new Error('이미지는 한 장당 10MB까지 넣을 수 있습니다.');
        // Decode before accepting a file whose MIME type might be misleading.
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        const id = crypto.randomUUID() + '.' + types[file.type];
        await stored('put', id, file);
        if (!admin.verified || body.disabled) { await stored('delete', id); break; }
        const text = '\n![이미지 설명](blog-image/' + id + ')\n';
        body.setRangeText(text, body.selectionStart, body.selectionEnd, 'end');
        body.dispatchEvent(new Event('input', { bubbles: true }));
        status.textContent = '이미지를 넣었습니다. 미리보기로 확인하세요. 게시할 때 GitHub에 저장됩니다.';
      }
    } catch (error) {
      status.textContent = '이미지 추가 실패: ' + error.message;
    } finally {
      busy = false;
      picker.value = '';
      update();
      document.dispatchEvent(new CustomEvent('blog-image-state'));
    }
  }
  button.addEventListener('click', () => { if (available()) picker.click(); });
  picker.addEventListener('change', () => void add(picker.files));
  body.addEventListener('paste', event => {
    const files = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
    if (files.length) { event.preventDefault(); void add(files); }
  });
  body.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
  body.addEventListener('drop', event => {
    if (event.dataTransfer?.files.length) { event.preventDefault(); void add(event.dataTransfer.files); }
  });
  document.addEventListener('blog-admin-change', update);
  document.addEventListener('blog-draft-state', update);
  new MutationObserver(update).observe(body, { attributes: true, attributeFilter: ['disabled'] });
  window.BlogImages = {
    get busy() { return busy; },
    async release(text) {
      // Only remove attachments from a discarded/replaced draft, and only when
      // no retained draft or current editor still references them.
      try {
        for (const id of references(text)) {
          const marker = 'blog-image/' + id;
          if (body.value.includes(marker)) continue;
          let used = false;
          for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key?.startsWith('blog-draft:v1:PYeonju/PYeonju.github.io:') && localStorage.getItem(key)?.includes(marker)) used = true;
          }
          if (!used) {
            await stored('delete', id);
            if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
            urls.delete(id);
          }
        }
      } catch { /* A failed cleanup must never interrupt saving text. */ }
    },
    async preview(root) {
      for (const image of root.querySelectorAll('img')) {
        const src = image.getAttribute('src');
        const id = references(src || '')[0];
        if (!id || src !== 'blog-image/' + id) continue;
        const file = await stored('get', id);
        if (!file) throw new Error('보관된 이미지를 찾을 수 없습니다. 이미지를 다시 넣어 주세요.');
        if (!urls.has(id)) urls.set(id, URL.createObjectURL(file));
        image.src = urls.get(id);
      }
    },
    async prepare(text) {
      const files = [];
      for (const id of references(text)) {
        const file = await stored('get', id);
        if (!file) throw new Error('보관된 이미지를 찾을 수 없습니다. 이미지를 다시 넣어 주세요.');
        const path = 'assets/images/uploads/' + id;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        files.push({ path, content: btoa(binary) });
        text = text.replaceAll('blog-image/' + id, '/' + path);
      }
      return { text, files };
    }
  };
  window.addEventListener('pagehide', () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); });
  update();
}());
