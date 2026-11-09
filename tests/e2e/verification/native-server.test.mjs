import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('fixture: native test backend binds its own port and terminates after its input closes', { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'native-server-fixture-'));
  let child;
  try {
    const context = { format: 1, runId: 'e'.repeat(64), package: 'f'.repeat(64), id: 'native-server-fixture', mode: 'local', simulationKind: null,
      operations: ['native-test'], settings: {}, resources: [], secrets: {}, origins: [], assertions: [] };
    const contextFile = path.join(root, 'context.json');
    await writeFile(contextFile, JSON.stringify(context));
    const reservation = createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    child = spawn(process.execPath, [fileURLToPath(new URL('./native-server.mjs', import.meta.url)), String(port)], {
      env: { ...process.env, AEPM_CONTEXT_FILE: contextFile }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.on('data', () => {});
    const exited = new Promise(resolve => child.once('exit', resolve));
    const ready = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('fixture-backend-timeout')), 45000);
      child.on('error', reject);
      child.on('exit', () => { clearTimeout(timer); reject(new Error('fixture-backend-exited')); });
      child.stdout.on('data', data => {
        text += data;
        if (text.length > 4096) { clearTimeout(timer); reject(new Error('fixture-output-limit')); }
        else if (text.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(text.trim())); }
      });
    });
    assert.deepEqual(ready, { ready: true, port });
    const rooms = await fetch(`http://127.0.0.1:${port}/rooms`, { signal: AbortSignal.timeout(3000) }).then(response => response.json());
    assert.deepEqual(rooms.map(room => room.id).sort(), ['casino', 'home']);
    child.stdin.end();
    assert.equal(await exited, 0);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  }
});
