(function () {
  'use strict';
  const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function chunk(name, data) {
    const bytes = new Uint8Array(data.length + 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) bytes[4 + i] = name.charCodeAt(i);
    bytes.set(data, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < bytes.length - 4; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
    return bytes;
  }
  async function png(file) {
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') return file;
    const data = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(data.buffer);
    const chunks = [], idat = [];
    for (let offset = 8; offset + 12 <= data.length;) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > data.length) return file;
      const type = String.fromCharCode(...data.slice(offset + 4, offset + 8));
      if (type === 'acTL') return file; // Animated PNGs must remain animated.
      const bytes = data.slice(offset, offset + length + 12);
      chunks.push({ type, bytes });
      if (type === 'IDAT') idat.push(data.slice(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    if (!idat.length) return file;
    // Recompress the original PNG scanlines; never resize, quantize or redraw text.
    const stream = new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate')).pipeThrough(new CompressionStream('deflate'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    const parts = [data.slice(0, 8)];
    let inserted = false;
    for (const item of chunks) {
      if (item.type === 'IDAT') {
        if (!inserted) parts.push(chunk('IDAT', compressed));
        inserted = true;
      } else if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(item.type)) parts.push(item.bytes);
    }
    return new Blob(parts, { type: 'image/png' });
  }
  window.BlogImageCompression = {
    async optimize(file) {
      if (!types[file.type]) throw new Error('PNG, JPG, GIF, WebP 이미지를 선택해 주세요.');
      if (file.size > 10 * 1024 * 1024) throw new Error('이미지는 한 장당 10MB까지 넣을 수 있습니다.');
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 40000000) throw new Error('이미지 해상도가 너무 큽니다. 4천만 픽셀 이하로 줄여 주세요.');
        let candidate = file;
        try {
          if (file.type === 'image/png') candidate = await png(file);
          else if (file.type === 'image/jpeg') {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width; canvas.height = bitmap.height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0);
            candidate = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.92));
            canvas.width = canvas.height = 0;
          }
        } catch { candidate = file; } // Unsupported encoders must not lose the upload.
        const result = candidate && candidate.size < file.size ? candidate : file;
        return { file: result, extension: types[result.type], saved: file.size - result.size };
      } finally { bitmap.close(); }
    },
    async hash(file) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
  };
}());
