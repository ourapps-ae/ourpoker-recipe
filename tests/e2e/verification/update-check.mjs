import { updateUrlFor } from '../components/store-update/server/store.ts';
import { normalizeStoreUpdate } from '../web/src/store-response.ts';

export const updateAssertions = ['delivery-origin-allowed', 'invitation-whole-segment', 'no-install', 'platform-selection', 'response-valid', 'version-match'];
const loopback = url => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

export async function checkUpdate(context, { readSecrets, fetcher = fetch, now = Date.now }) {
  const records = Object.fromEntries(context.assertions.map(id => [id, { id, passed: false, actual: null }]));
  const mark = (id, passed) => { if (!(id in records)) throw new Error('assertion-set'); records[id] = { id, passed, actual: passed }; };
  try {
    if (!context.operations.includes('update-get') || !['simulation', 'live'].includes(context.mode) || !updateAssertions.every(id => id in records)) throw new Error('authorization-denied');
    const settings = context.settings;
    const hasPublic = typeof settings.updateUrl === 'string';
    const hasPrivate = Boolean(context.secrets.updateInvitation);
    if (hasPublic === hasPrivate) throw new Error('invitation-selection');
    const invitation = hasPublic ? settings.updateUrl : (await readSecrets()).updateInvitation;
    const input = new URL(invitation);
    const derived = updateUrlFor(invitation);
    const endpoint = derived === null ? null : new URL(derived);
    const pieces = input.pathname.split('/');
    const whole = pieces.length === 3 && pieces[1] === 'l' && pieces[2].length > 0 && !/%(?:2f|5c)/i.test(pieces[2]) && !input.username && !input.password && endpoint !== null && endpoint.origin === input.origin && endpoint.pathname.endsWith('/' + pieces[2] + '/latest') && !endpoint.search && !endpoint.hash;
    mark('invitation-whole-segment', whole);
    if (!whole) throw new Error('invitation-invalid');
    if (endpoint.origin !== settings.updateReadOrigin || !context.origins.includes(endpoint.origin) || !context.origins.includes(settings.updateDeliveryOrigin)) throw new Error('origin-denied');
    if (context.mode === 'live' && endpoint.protocol !== 'https:' || context.mode === 'simulation' && !loopback(endpoint)) throw new Error('endpoint-denied');
    const response = await fetcher(endpoint.href, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(Math.min(settings.maximumSeconds ?? 30, 900) * 1000) });
    if (!response.ok || response.redirected) { mark('response-valid', false); throw new Error('response-invalid'); }
    const value = await response.json();
    const valid = Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.version === 'string';
    mark('response-valid', valid);
    if (!valid) throw new Error('response-invalid');
    const selected = normalizeStoreUpdate(value, {
      platform: settings.updatePlatform === 'browser' ? 'web' : settings.updatePlatform,
      channel: settings.updateChannel, origins: [settings.updateDeliveryOrigin],
      architecture: settings.updateArchitecture, osVersion: settings.updateSystemVersion,
      allowLoopback: context.mode === 'simulation',
    }, now());
    mark('platform-selection', selected !== null);
    mark('version-match', selected !== null && selected.version === settings.expectedUpdateVersion);
    mark('delivery-origin-allowed', selected !== null && new URL(selected.url).origin === settings.updateDeliveryOrigin);
    mark('no-install', true);
  } catch {
    // Only closed assertion records leave this helper.
  }
  return { format: 1, runId: context.runId, package: context.package, id: context.id,
    assertions: Object.values(records).sort((a, b) => a.id.localeCompare(b.id)), artifacts: [], resources: [],
    cleanup: { required: false, attempted: false, completed: true, reason: '' } };
}
