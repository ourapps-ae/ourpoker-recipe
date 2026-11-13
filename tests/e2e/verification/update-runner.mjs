import { readFile } from 'node:fs/promises';
import { readContext, writeResult } from '../components/video-calls/verification/index.mjs';
import { checkUpdate } from './update-check.mjs';

const context = await readContext();
const route = process.argv[2];
const desktop = ['macos', 'windows'].includes(context.settings.updatePlatform) && context.settings.updateChannel === 'direct';
if (!['public', 'private', 'desktop-public', 'desktop-private'].includes(route) || desktop !== route.startsWith('desktop-') || Boolean(context.secrets.updateInvitation) !== route.endsWith('private')) throw new Error('context-invalid');
const readSecrets = async () => {
  const document = JSON.parse(await readFile(process.env.AEPM_SECRETS_FILE, 'utf8'));
  if (document.runId !== context.runId || document.package !== context.package || document.id !== context.id) throw new Error('secret-binding');
  const value = document.values.updateInvitation;
  if (!value || value.version !== context.secrets.updateInvitation.version || typeof value.value !== 'string') throw new Error('secret-unavailable');
  return { updateInvitation: value.value };
};
let fetcher = fetch;
if (context.mode === 'simulation' && context.simulationKind === 'fixture') {
  const value = JSON.parse(await readFile(new URL('../web/test/fixtures/store-latest.json', import.meta.url), 'utf8'));
  fetcher = async () => Response.json(value);
}
const result = await checkUpdate(context, { readSecrets, fetcher });
await writeResult(result);
process.exitCode = result.assertions.every(item => item.passed) ? 0 : 1;
