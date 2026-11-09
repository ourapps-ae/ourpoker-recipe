import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { updateAssertions } from './update-check.mjs';

test('fixture: all advertised public/private and direct-desktop routes write bound secret-free results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'recipe-update-fixture-'));
  try {
    for (const route of ['public', 'private', 'desktop-public', 'desktop-private']) {
      const desktop = route.startsWith('desktop-'), privateInput = route.endsWith('private');
      const context = { format: 1, runId: 'a'.repeat(64), package: 'b'.repeat(64), id: 'update-' + route,
        mode: 'simulation', simulationKind: 'fixture', operations: ['update-get'], resources: [], assertions: updateAssertions,
        settings: { updateReadOrigin: 'https://localhost:9443', updateDeliveryOrigin: desktop ? 'https://delivery.example' : 'https://play.example',
          updatePlatform: desktop ? 'windows' : 'browser', updateChannel: desktop ? 'direct' : 'web', expectedUpdateVersion: '2.1.0',
          ...(desktop ? { updateArchitecture: 'x64', updateSystemVersion: '10' } : {}),
          ...(privateInput ? {} : { updateUrl: 'https://localhost:9443/l/0123456789abcdef01234567' }) },
        secrets: privateInput ? { updateInvitation: { secretRef: 'fixture-invitation', version: 'one' } } : {},
        origins: ['https://localhost:9443', desktop ? 'https://delivery.example' : 'https://play.example'] };
      const input = path.join(root, route + '.json'), output = path.join(root, route + '-result.json'), secrets = path.join(root, route + '-secrets.json');
      await writeFile(input, JSON.stringify(context));
      await writeFile(secrets, JSON.stringify({ format: 1, runId: context.runId, package: context.package, id: context.id,
        values: { updateInvitation: { version: 'one', value: 'https://localhost:9443/l/SecretFixture123' } } }));
      const child = spawnSync(process.execPath, [fileURLToPath(new URL('./update-runner.mjs', import.meta.url)), route], {
        env: { ...process.env, AEPM_CONTEXT_FILE: input, AEPM_RESULT_FILE: output, AEPM_SECRETS_FILE: secrets }, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(child.status, 0, child.stderr);
      const text = await readFile(output, 'utf8');
      const result = JSON.parse(text);
      assert.equal(result.runId, context.runId);
      assert.equal(result.id, context.id);
      assert.deepEqual(result.assertions.map(item => item.id), updateAssertions);
      assert.ok(result.assertions.every(item => item.passed));
      assert.ok(!text.includes('SecretFixture123') && !child.stdout.includes('SecretFixture123') && !child.stderr.includes('SecretFixture123'));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
