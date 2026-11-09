import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkUpdate, updateAssertions } from './update-check.mjs';

const fixture = JSON.parse(readFileSync(new URL('../web/test/fixtures/store-latest.json', import.meta.url)));
const context = () => ({ format: 1, runId: '1'.repeat(64), package: '2'.repeat(64), id: 'update-provider', mode: 'simulation', simulationKind: 'fixture',
  settings: { updateUrl: 'https://localhost:9443/l/0123456789abcdef01234567', updateReadOrigin: 'https://localhost:9443', updateDeliveryOrigin: 'https://play.example', updatePlatform: 'browser', updateChannel: 'web', expectedUpdateVersion: '2.1.0' },
  operations: ['update-get'], origins: ['https://localhost:9443', 'https://play.example'], assertions: updateAssertions, secrets: {}, resources: [] });

test('fixture: production helper derivation and platform normalization yield only closed observations', async () => {
  let requests = 0;
  const result = await checkUpdate(context(), { fetcher: async (url, options) => {
    requests++;
    assert.equal(url, 'https://localhost:9443/api/public/links/0123456789abcdef01234567/latest');
    assert.equal(options.redirect, 'error');
    return Response.json(fixture);
  } });
  assert.equal(requests, 1);
  assert.ok(result.assertions.every(item => item.passed));
  assert.ok(!JSON.stringify(result).includes('play.example'));
});

test('fixture: missing grants, mismatched origins and malformed invitations prevent dispatch', async () => {
  for (const change of [c => { c.operations = []; }, c => { c.origins = []; }, c => { c.settings.updateReadOrigin = 'https://other.example'; }, c => { c.settings.updateUrl += '/trailing'; }]) {
    const c = context(); change(c);
    let requests = 0;
    const result = await checkUpdate(c, { fetcher: async () => { requests++; return Response.json(fixture); } });
    assert.ok(result.assertions.some(item => !item.passed));
    assert.equal(requests, 0);
  }
});

test('fixture: redirects, invalid response, wrong version and unavailable platform fail assertions', async () => {
  for (const fetcher of [async () => new Response('', { status: 302 }), async () => ({ ok: true, redirected: true }), async () => Response.json({}), async () => Response.json({ ...fixture, version: '2.0.0' }), async () => Response.json({ ...fixture, pwa: null })]) {
    const result = await checkUpdate(context(), { fetcher });
    assert.ok(result.assertions.some(item => !item.passed));
  }
});

test('fixture: referenced invitation values never appear in returned evidence', async () => {
  const c = context();
  delete c.settings.updateUrl;
  c.secrets = { updateInvitation: { secretRef: 'synthetic-invite', version: 'one' } };
  const result = await checkUpdate(c, { readSecrets: async () => ({ updateInvitation: 'https://localhost:9443/l/SecretFixture123' }), fetcher: async () => Response.json(fixture) });
  assert.ok(result.assertions.every(item => item.passed));
  assert.ok(!JSON.stringify(result).includes('SecretFixture123'));
});
