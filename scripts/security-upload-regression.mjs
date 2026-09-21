import assert from 'node:assert/strict';
import http from 'node:http';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
});
const server = http.createServer((req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      res.writeHead(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: error.code || error.message }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ filename: req.file?.originalname, bytes: req.file?.size, note: req.body?.note }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
try {
  const good = new FormData();
  good.append('note', 'brand-isolated-upload');
  good.append('file', new Blob(['safe workbook fixture']), 'fixture.xlsx');
  const goodResponse = await fetch(url, { method: 'POST', body: good });
  assert.equal(goodResponse.status, 200);
  assert.deepEqual(await goodResponse.json(), { filename: 'fixture.xlsx', bytes: 21, note: 'brand-isolated-upload' });

  const tooLarge = new FormData();
  tooLarge.append('file', new Blob([Buffer.alloc(1024 * 1024 + 1)]), 'oversize.xlsx');
  const largeResponse = await fetch(url, { method: 'POST', body: tooLarge });
  assert.equal(largeResponse.status, 413);
  assert.equal((await largeResponse.json()).error, 'LIMIT_FILE_SIZE');

  const malformedResponse = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=broken' },
    body: '--broken\r\nincomplete',
  });
  assert.equal(malformedResponse.status, 400);
  console.log('upload regression passed: valid file, size rejection, malformed multipart rejection');
} finally {
  server.close();
}
