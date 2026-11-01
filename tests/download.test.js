import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadBlob } from '../src/lib/download.js';

function makeEnvironment({ supportsDownload = true, share = false, popup = true } = {}) {
  const calls = { clicked: 0, opened: 0, revoked: 0, shared: 0, appended: 0, removed: 0 };
  const anchor = {
    href: '',
    download: '',
    rel: '',
    style: {},
    click() { calls.clicked += 1; },
    remove() { calls.removed += 1; },
  };
  if (!supportsDownload) delete anchor.download;
  const env = {
    Blob,
    File: class MockFile { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; } },
    document: {
      body: { append() { calls.appended += 1; } },
      createElement() { return anchor; },
    },
    URL: {
      createObjectURL() { return 'blob:skillsprint-test'; },
      revokeObjectURL() { calls.revoked += 1; },
    },
    navigator: share ? {
      canShare() { return true; },
      async share() { calls.shared += 1; },
    } : {},
    window: { open() { calls.opened += 1; return popup ? {} : null; } },
    setTimeout(callback) { callback(); },
  };
  return { env, calls, anchor };
}

test('downloads a Blob with a stable filename on browsers supporting the download attribute', async () => {
  const { env, calls, anchor } = makeEnvironment();
  const result = await downloadBlob(new Blob(['hello'], { type: 'text/plain' }), 'hello.txt', env);
  assert.deepEqual(result, { method: 'download' });
  assert.equal(anchor.download, 'hello.txt');
  assert.equal(calls.clicked, 1);
  assert.equal(calls.appended, 1);
  assert.equal(calls.revoked, 1);
});

test('uses the device share sheet when file sharing is available', async () => {
  const { env, calls } = makeEnvironment({ share: true });
  const result = await downloadBlob(new Blob(['hello'], { type: 'text/plain' }), 'hello.txt', env);
  assert.deepEqual(result, { method: 'share' });
  assert.equal(calls.shared, 1);
  assert.equal(calls.clicked, 0);
});

test('opens a saveable file tab when the download attribute is unavailable', async () => {
  const { env, calls } = makeEnvironment({ supportsDownload: false });
  const result = await downloadBlob(new Blob(['hello']), 'hello.html', env);
  assert.deepEqual(result, { method: 'open' });
  assert.equal(calls.opened, 1);
  assert.equal(calls.revoked, 1);
});

test('reports a clear error when both download and fallback pop-up are blocked', async () => {
  const { env, calls } = makeEnvironment({ supportsDownload: false, popup: false });
  await assert.rejects(() => downloadBlob(new Blob(['hello']), 'hello.html', env), /blocked the file preview/i);
  assert.equal(calls.revoked, 1);
});
