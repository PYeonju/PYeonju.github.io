const assert = require('node:assert/strict');
const fs = require('node:fs');
const { deflateSync } = require('node:zlib');
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, -4)) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
}
module.exports = async function (browser, base) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const moves = JSON.parse(fs.readFileSync('_data/content_moves.json', 'utf8'));
  const oldPath = Object.keys(moves.posts)[0];
  const oldImage = Object.keys(moves.images)[0];
  const key = 'blog-draft:v1:PYeonju/PYeonju.github.io:main:' + oldPath;
  const newKey = 'blog-draft:v1:PYeonju/PYeonju.github.io:main:' + moves.posts[oldPath];
  await page.addInitScript(({ key, oldImage }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, values: ['제목', 'C++', '', '![캡처](' + oldImage + ')'], sha: 'old', savedAt: 1234567 }));
  }, { key, oldImage });
  await page.goto(base + '/admin/?edit=' + encodeURIComponent(oldPath));
  await page.waitForFunction(() => !!window.BlogContentPaths && !!window.BlogImageCompression);
  assert.equal(new URL(page.url()).searchParams.get('edit'), moves.posts[oldPath]);
  const migrated = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), newKey);
  assert.equal(migrated.savedAt, 1234567);
  assert.equal(migrated.values[3], '![캡처](' + moves.images[oldImage] + ')');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  // Uncompressed, opaque RGB pixels give a deterministic lossless compression fixture.
  const header = Buffer.alloc(13); header.writeUInt32BE(128, 0); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((128 * 3 + 1) * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    const offset = y * 385 + 1 + x * 3;
    raw[offset] = x % 8 ? 255 : 0; raw[offset + 1] = y % 8 ? 255 : 0; raw[offset + 2] = 100;
  }
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
  const result = await page.evaluate(async bytes => {
    const file = new File([new Uint8Array(bytes)], 'capture.png', { type: 'image/png' });
    const optimized = await BlogImageCompression.optimize(file);
    async function pixels(blob) {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      return { width: canvas.width, height: canvas.height, data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
    }
    return { before: file.size, after: optimized.file.size, original: await pixels(file), optimized: await pixels(optimized.file), type: optimized.file.type };
  }, [...png]);
  assert(result.after < result.before / 2);
  assert.equal(result.type, 'image/png');
  assert.deepEqual(result.original, result.optimized, 'PNG compression must preserve every pixel and dimensions');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Chromium: legacy edit/draft/image migration and pixel-identical PNG compression passed.');
};
