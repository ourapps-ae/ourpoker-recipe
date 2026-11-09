const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createPolicy } = require('../../components/windows-desktop/desktop/src/policy.cjs');

test('packaged layout resolves component and isolated web resources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ourpoker-resources-'));
  try {
    await writeFile(path.join(root, 'index.html'), '<title>OurPoker</title>');
    const policy = createPolicy({ scheme: 'ourpoker', serverOrigin: 'http://localhost:8788', externalOrigins: [] });
    const result = await policy.assetResponse(root, new Request('ourpoker://app/index.html'));
    assert.equal(result.status, 200);
    assert.equal(await result.text(), '<title>OurPoker</title>');
    assert.equal(await policy.assetPath(root, 'ourpoker://app/%2e%2e/secret'), null);
    assert.equal(policy.mediaAllowed({ page: 'ourpoker://app/index.html#board', origin: policy.ENTRY,
      permission: 'media', interacted: true, mainFrame: true, mediaTypes: ['video'] }), false);
  } finally { await rm(root, { recursive: true }); }
});
