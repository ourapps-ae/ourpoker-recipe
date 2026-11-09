import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOwnedBrowser, startHand } from './local-application.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = () => new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
const serverPort = await port(), webPort = await port(), inspectorPort = await port();
const serverURL = `http://127.0.0.1:${serverPort}`;
const webURL = `http://127.0.0.1:${webPort}`;
const scratch = await mkdtemp(path.join(tmpdir(), 'ourpoker-browser-'));
const children = [];
let browser;
let ownedBrowser;
function launch(args, cwd, env = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => process.stdout.write(data));
  child.stderr.on('data', data => process.stderr.write(data));
  children.push(child);
}
async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local server did not start: ${url}`);
}
try {
  launch(['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', String(serverPort), '--inspector-port', String(inspectorPort), '--persist-to', scratch], path.join(root, 'server'));
  launch(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], path.join(root, 'web'), { VITE_SERVER: serverURL });
  await Promise.all([ready(serverURL + '/rooms'), ready(webURL)]);
  ownedBrowser = await openOwnedBrowser();
  browser = ownedBrowser.browser;
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  for (const context of contexts) { context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(15000); }
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of pages) {
    await page.goto(webURL);
    await page.waitForFunction(() => Boolean(window.pokerStore));
  }
  for (const [index, page] of pages.slice(0, 2).entries()) {
    await page.evaluate(async name => { localStorage.setItem('beginner', 'false'); window.pokerStore.setName(name); await window.pokerStore.join('casino'); }, `Player ${index + 1}`);
    await page.waitForFunction(() => Boolean(window.pokerStore.state.view?.you));
  }
  await pages[2].evaluate(() => window.pokerStore.joinBoard('casino'));
  await pages[2].waitForFunction(() => window.pokerStore.state.view?.display === true);
  await startHand(pages[0]);
  await pages[0].waitForFunction(() => window.pokerStore.state.view?.hand?.actorId);
  const view = page => page.evaluate(() => window.pokerStore.state.view);
  const views = await Promise.all(pages.map(view));
  for (const [index, value] of views.entries()) {
    for (const player of value.players) {
      if (index === 2 || player.id !== value.you) assert.ok(player.cards.every(card => card === null));
      else assert.equal(player.cards.filter(Boolean).length, 2);
    }
  }
  assert.equal(views[2].odds, null);
  assert.equal(await pages[2].evaluate(() => document.documentElement.dataset.mode), 'board');
  const stale = await pages[0].evaluate(async () => {
    const { token, roomId, view } = window.pokerStore.state;
    return { token, roomId, version: view.version };
  });
  const response = await fetch(`${serverURL}/r/casino/action`, { method: 'POST', headers: { authorization: `Bearer ${stale.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'fold', expectedVersion: 0 }) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'staleVersion');
  const reconnecting = pages[1].waitForEvent('websocket', socket => socket.url().endsWith('/r/casino/ws'))
    .then(socket => socket.waitForEvent('framereceived', frame => JSON.parse(String(frame.payload)).type === 'view'));
  await pages[1].evaluate(() => { window.pokerStore.sleep(); window.pokerStore.wake(); });
  await reconnecting;
  assert.equal((await view(pages[1])).you, views[1].you);
  const boardState = await pages[2].evaluate(() => ({ token: window.pokerStore.state.token, version: window.pokerStore.state.view.version }));
  const denied = await fetch(`${serverURL}/r/casino/action`, { method: 'POST', headers: { authorization: `Bearer ${boardState.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'fold', expectedVersion: boardState.version }) });
  assert.equal(denied.status, 422);
  assert.equal((await denied.json()).error, 'notAllowed');
  for (let step = 0; step < 120; step++) {
    const current = await Promise.all(pages.slice(0, 2).map(view));
    if (current.some(value => value.history.length > 0)) break;
    const actor = current.findIndex(value => value.you === value.hand?.actorId);
    if (actor >= 0 && current[actor].legal.fold) await pages[actor].evaluate(() => window.pokerStore.act('fold'));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok((await view(pages[0])).history.length > 0, 'complete hand');
  assert.equal(await pages[2].evaluate(() => window.pokerVideo.connected), false);
  await pages[0].evaluate(() => window.pokerStore.joinBoard('casino'));
  await pages[0].waitForFunction(() => window.pokerStore.state.view?.display === true);
  assert.equal(await pages[0].evaluate(() => window.pokerStore.state.video), null);
  console.log('Passed: two isolated players, public display, private cards, stale rejection, reconnect and complete hand.');
} finally {
  await ownedBrowser?.close();
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child => new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); })));
  await rm(scratch, { recursive: true, force: true });
}
