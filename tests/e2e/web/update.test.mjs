import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeStoreUpdate } from '../src/store-response.ts';
import { checkStoreUpdate } from '../src/update.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/store-latest.json', import.meta.url)));
const web = { platform: 'web', channel: 'web', origins: ['https://play.example'] };
const select = (platform, channel) => ({ platform, channel, origins: ['https://delivery.example', 'https://testflight.apple.com'], architecture: platform === 'macos' ? 'arm64' : 'x64', osVersion: '15.0' });

test('fixture: explicit platforms select real response fields and TestFlight versions', () => {
  for (const [selection, expectedVersion, address] of [
    [web, '2.1.0', fixture.pwa], [select('android', 'direct'), '2.1.0', fixture.android.apkUrl],
    [select('ios', 'testflight'), '1.9.0', fixture.testflightUrl],
    [select('macos', 'testflight'), '1.8.0', fixture.apple.macos.testflightUrl],
    [select('tvos', 'testflight'), '1.7.0', fixture.apple.tvos.testflightUrl],
    [select('macos', 'direct'), '2.1.0', fixture.macos.packages[0].url],
    [select('windows', 'direct'), '2.1.0', fixture.windows.packages[0].url],
  ]) {
    const result = normalizeStoreUpdate(fixture, selection);
    assert.equal(result.version, expectedVersion);
    assert.equal(result.url, address);
  }
  assert.equal(normalizeStoreUpdate(fixture, select('macos', 'direct')).notarization, 'not-notarized');
});

test('fixture: unavailable, inconsistent, expired and malformed responses do not fall back', () => {
  for (const input of [null, [], {}, { ...fixture, pwa: null }, { ...fixture, version: 'bad' }, { ...fixture, linksExpireAt: 'bad' }, { ...fixture, linksExpireAt: '2000-01-01' }]) assert.equal(normalizeStoreUpdate(input, web), null);
  assert.equal(normalizeStoreUpdate({ ...fixture, apple: { ios: null } }, select('ios', 'testflight')), null);
  assert.equal(normalizeStoreUpdate({ ...fixture, testflightVersion: '2.1.0' }, select('ios', 'testflight')), null);
  assert.equal(normalizeStoreUpdate({ ...fixture, windows: null }, select('windows', 'direct')), null);
  assert.equal(normalizeStoreUpdate(fixture, select('android', 'testflight')), null);
});

test('fixture: desktop selection rejects incompatible and ambiguous packages', () => {
  const selection = select('windows', 'direct');
  assert.equal(normalizeStoreUpdate(fixture, { ...selection, architecture: 'arm64' }), null);
  assert.equal(normalizeStoreUpdate(fixture, { ...selection, osVersion: '6.1' }), null);
  const second = { ...fixture.windows.packages[0], url: 'https://delivery.example/second.exe' };
  const ambiguous = { ...fixture, windows: { ...fixture.windows, packages: [...fixture.windows.packages, second] } };
  assert.equal(normalizeStoreUpdate(ambiguous, selection), null);
  assert.equal(normalizeStoreUpdate(ambiguous, { ...selection, packageUrl: second.url }).url, second.url);
});

test('fixture: destination schemes, credentials and origins are constrained', () => {
  for (const pwa of ['javascript:alert(1)', 'data:text/plain,test', 'file:///tmp/test', 'ourpoker://app', 'http://play.example/', 'https://user:pass@play.example/', 'https://elsewhere.example/']) assert.equal(normalizeStoreUpdate({ ...fixture, pwa }, web), null);
  const local = { ...web, origins: ['http://127.0.0.1:8788'], allowLoopback: true };
  assert.equal(normalizeStoreUpdate({ ...fixture, pwa: 'http://127.0.0.1:8788/' }, local).url, 'http://127.0.0.1:8788/');
  assert.equal(normalizeStoreUpdate({ ...fixture, pwa: 'http://127.0.0.1:8788/' }, { ...local, allowLoopback: false }), null);
  assert.equal(normalizeStoreUpdate({ ...fixture, testflightUrl: 'https://testflight.apple.com/other', apple: {} }, select('ios', 'testflight')), null);
});

test('fixture: production check delegates versions, suppresses disabled/desktop requests and refuses redirects', async () => {
  let calls = 0;
  const fetcher = async (_input, options) => { calls++; assert.equal(options.redirect, 'error'); return Response.json(fixture); };
  assert.equal(await checkStoreUpdate('1.0.0', web, false, 'https://store.example/latest', fetcher), null);
  assert.equal(await checkStoreUpdate('1.0.0', null, true, 'https://store.example/latest', fetcher), null);
  assert.equal(calls, 0);
  assert.equal((await checkStoreUpdate('1.0.0', web, true, 'https://store.example/latest', fetcher)).version, '2.1.0');
  for (const current of ['2.1.0', '3.0.0', '0.0.0-dev']) assert.equal(await checkStoreUpdate(current, web, true, 'https://store.example/latest', fetcher), null);
  assert.equal(await checkStoreUpdate('1.0.0', select('ios', 'testflight'), true, 'https://store.example/latest', fetcher).then(r => r.version), '1.9.0');
  for (const failing of [async () => { throw new Error('offline'); }, async () => new Response('', { status: 503 }), async () => new Response('not json'), async () => ({ ok: true, redirected: true })]) assert.equal(await checkStoreUpdate('1.0.0', web, true, 'https://store.example/latest', failing), null);
});
