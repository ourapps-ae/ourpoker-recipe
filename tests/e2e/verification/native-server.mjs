import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContext, requireOperations } from '../components/video-calls/verification/result.mjs';

const context = await readContext();
requireOperations(context, ['native-test']);
if (context.mode !== 'local') throw new Error('authorization-denied');
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port-invalid');
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const inspector = listener.address().port;
await new Promise(resolve => listener.close(resolve));
if (inspector === port) throw new Error('port-collision');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storage = path.join(path.dirname(process.env.AEPM_CONTEXT_FILE), 'native-server-' + context.runId);
await mkdir(storage);
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', storage], {
  cwd: path.join(root, 'server'), env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let text = '', ready = false, failed = false, closing = false;
worker.stdout.on('data', data => { text = (text + data).slice(-131072); ready ||= text.includes(`Ready on http://127.0.0.1:${port}`); });
worker.stderr.on('data', () => {});
worker.on('error', () => { failed = true; });
async function close() {
  if (closing) return;
  closing = true;
  if (worker.exitCode === null && worker.signalCode === null) {
    worker.kill('SIGTERM');
    const exited = new Promise(resolve => worker.once('exit', resolve));
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
    if (worker.exitCode === null && worker.signalCode === null) {
      worker.kill('SIGKILL');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
    }
  }
  process.exit(worker.exitCode !== null || worker.signalCode !== null ? 0 : 1);
}
process.stdin.resume();
process.stdin.on('end', close);
process.on('SIGTERM', close);
process.on('SIGINT', close);
try {
  const deadline = Date.now() + 45000;
  while (!ready) {
    if (failed || worker.exitCode !== null || Date.now() >= deadline) throw new Error('server-unavailable');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok || !(await response.json()).ok) throw new Error('server-unavailable');
  console.log(JSON.stringify({ ready: true, port }));
} catch { await close(); }
