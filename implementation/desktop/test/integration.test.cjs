const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createPolicy } = require('../../components/windows-desktop/desktop/index.cjs');

test('every relative require of a packaged script is packaged', async () => {
  const { sources } = require('../scripts/package.cjs');
  const packaged = new Set(sources.map(([entry]) => entry));
  for (const [entry, source] of sources) {
    const text = await readFile(path.join(__dirname, '..', source), 'utf8');
    for (const [, specifier] of text.matchAll(/(?:require\(|from\s+)'(\.{1,2}\/[^']+)'/g)) {
      assert.ok(packaged.has(path.posix.join(path.posix.dirname(entry), specifier)), `${entry} needs ${specifier}`);
    }
  }
});

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
