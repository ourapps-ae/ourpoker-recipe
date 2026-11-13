import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const freePort = () => new Promise(resolve => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

export async function startHand(page) {
  await page.waitForFunction(() => window.pokerStore.state.view?.players.length === 2, null, { polling: 50, timeout: 15000 });
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await page.evaluate(() => window.pokerStore.state.view?.phase === 'betting')) return;
    await page.evaluate(() => { if (window.pokerStore.state.view?.legal.start) void window.pokerStore.act('start'); });
    await page.waitForFunction(() => !window.pokerStore.state.busy, null, { polling: 50, timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('game-start-failed');
}

export async function openOwnedBrowser() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.verification-browser');
  if (!process.env.AEPM_PRIVATE_ROOT) throw new Error('private-root-required');
  const base = process.env.AEPM_CONTEXT_FILE ? path.dirname(process.env.AEPM_CONTEXT_FILE) : process.env.AEPM_PRIVATE_ROOT;
  const profileRoot = path.join(base, 'profiles', 'browser');
  await mkdir(profileRoot, { recursive: true, mode: 0o700 });
  const { launchOwnedBrowser } = await import('../../components/video-calls/verification/index.mjs');
  return await launchOwnedBrowser({ profileRoot, timeoutMilliseconds: 30000 });
}

export async function startLocalApplication(count = 4) {
  const ports = new Set();
  while (ports.size < 3) ports.add(await freePort());
  const [serverPort, webPort, inspectorPort] = [...ports];
  const serverURL = `http://127.0.0.1:${serverPort}`;
  const webURL = `http://127.0.0.1:${webPort}`;
  const scratch = await mkdtemp(path.join(tmpdir(), 'ourpoker-application-'));
  const children = [];
  let browser;
  let ownedBrowser;
  function launch(args, cwd, marker, extra = {}) {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', FORCE_COLOR: '0', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { child, ready: false, text: '' };
    child.stdout.on('data', data => { entry.text = (entry.text + data).slice(-131072); entry.ready ||= entry.text.includes(marker); });
    child.stderr.on('data', () => {});
    child.on('error', () => { entry.failed = true; });
    children.push(entry);
    return entry;
  }
  async function ready(entry, url) {
    for (let i = 0; i < 120; i++) {
      if (entry.failed || entry.child.exitCode !== null) throw new Error('local-process-failed');
      if (entry.ready) {
        try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('local-process-timeout');
  }
  async function close() {
    let failed = false;
    try { await ownedBrowser?.close(); } catch { failed = true; }
    for (const { child } of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      child.kill('SIGTERM');
      const exited = new Promise(resolve => child.once('exit', resolve));
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
      }
      if (child.exitCode === null && child.signalCode === null) failed = true;
    }
    await rm(scratch, { recursive: true, force: true });
    if (failed) throw new Error('cleanup-failed');
  }
  try {
    const worker = launch(['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', String(serverPort), '--inspector-port', String(inspectorPort), '--persist-to', scratch], path.join(root, 'server'), `Ready on ${serverURL}`);
    const web = launch(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], path.join(root, 'web'), `${webURL}/`, { VITE_SERVER: serverURL });
    await Promise.all([ready(worker, serverURL + '/rooms'), ready(web, webURL)]);
    ownedBrowser = await openOwnedBrowser();
    browser = ownedBrowser.browser;
    const pages = [];
    for (let i = 0; i < count; i++) {
      const context = await browser.newContext();
      context.setDefaultTimeout(15000);
      context.setDefaultNavigationTimeout(15000);
      const page = await context.newPage();
      await page.addInitScript(() => { localStorage.setItem('beginner', 'false'); localStorage.setItem('lang', 'en'); localStorage.setItem('handPanel', 'closed'); });
      await page.goto(webURL);
      await page.waitForFunction(() => Boolean(window.pokerStore && window.pokerVideo));
      pages.push(page);
    }
    return { pages, serverURL, webURL, close };
  } catch (error) {
    await close();
    throw error;
  }
}
