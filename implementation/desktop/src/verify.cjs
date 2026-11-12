const assert = require('node:assert/strict');
const { readFileSync, lstatSync, realpathSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { app, session } = require('electron');
const { start } = require('../../components/windows-desktop/desktop/src/main.cjs');
const { desktopConfiguration } = require('./configuration.cjs');
const { validateContext, writeResult } = require('../../components/windows-desktop/verification/result.mjs');

async function waitFor(check, milliseconds = 10000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('assertion-timeout');
}

async function verify() {
  if (app.isReady()) throw new Error('verification-started-too-late');
  const contextPath = realpathSync(process.env.AEPM_CONTEXT_FILE);
  const context = validateContext(JSON.parse(readFileSync(contextPath, 'utf8')));
  if (context.mode !== 'local' || !context.operations.includes('windows-execute') || process.platform !== 'win32' || process.arch !== 'x64' || context.settings.windowsArchitecture !== 'x64') throw new Error('authorization-denied');
  const root = path.join(path.dirname(contextPath), 'profiles', 'desktop');
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory() || readdirSync(root).length !== 0) throw new Error('private-profile-invalid');
  const partition = `verification-${context.runId}`;
  const watchdog = setTimeout(() => {
    app.exit(1);
  }, 75000);
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.setPath('userData', root);
  app.setPath('sessionData', root);
  app.on('before-quit', event => event.preventDefault());
  app.on('ready', () => {
    session.fromPartition(partition).webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_request, callback) => callback({ cancel: true }),
    );
  });
  const records = Object.fromEntries(context.assertions.map(id => [id, { id, passed: false, actual: null }]));
  const mark = id => { if (!(id in records)) throw new Error('assertion-set'); records[id] = { id, passed: true, actual: true }; };
  let win, code = 1;
  let timer;
  try {
    await Promise.race([
      (async () => {
        assert.equal(app.isPackaged, true);
        const packaged = JSON.parse(readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
        assert.equal(packaged.main, 'desktop/src/main.cjs');
        readFileSync(path.join(app.getAppPath(), packaged.main));
        mark('entrypoint-present');
        const evidence = JSON.parse(readFileSync(path.resolve(path.dirname(process.execPath), '../package-evidence.json'), 'utf8'));
        const executable = readFileSync(process.execPath);
        assert.equal(createHash('sha256').update(executable).digest('hex'), evidence.executable.sha256);
        assert.equal(evidence.executable.machine, 0x8664);
        mark('executable-architecture');
        assert.equal(Object.keys(evidence.scriptDigests).length, 7);
        for (const [entry, expected] of Object.entries(evidence.scriptDigests)) {
          assert.ok(!path.isAbsolute(entry) && !entry.split('/').some(part => part === '..' || part === '.'));
          assert.equal(createHash('sha256').update(readFileSync(path.join(app.getAppPath(), entry))).digest('hex'), expected);
        }
        mark('component-present');
        mark('script-integrity');
        win = await start(desktopConfiguration(app, partition));
        assert.equal(win.isDestroyed(), false);
        const inspect = script => win.webContents.executeJavaScript(script);
        await waitFor(() => inspect('Boolean(document.querySelector(".mode-picker [data-focus=board]"))'));
        assert.equal(await inspect('document.documentElement.dataset.mode'), 'player');
        assert.equal(await inspect('location.hash'), '#player');
        assert.ok(await inspect('document.querySelector("h1").textContent.length > 0'));
        const preferences = win.webContents.getLastWebPreferences();
        assert.equal(preferences.sandbox, true);
        assert.equal(preferences.contextIsolation, true);
        assert.equal(preferences.nodeIntegration, false);
        assert.equal(await inspect('typeof require'), 'undefined');
        mark('window-live');
        assert.equal(await inspect(`Promise.all([...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(async node => (await fetch(node.src || node.href)).ok)).then(results => results.length > 0 && results.every(Boolean))`), true);
        mark('assets-loaded');
        mark('relocated-web');
        const interact = async mode => {
          win.focus();
          await waitFor(() => win.isFocused());
          const point = await inspect(`(() => { const rect = document.querySelector('.mode-picker [data-focus=${mode}]').getBoundingClientRect(); return {x:Math.floor(rect.x+rect.width/2),y:Math.floor(rect.y+rect.height/2)}; })()`);
          win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
          win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
          win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
          await waitFor(() => inspect('navigator.userActivation.hasBeenActive'));
        };
        await interact('player');
        const playerCapture = await inspect(`(async () => {
          const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:true});
          const tracks = stream.getTracks();
          const opened = tracks.some(track=>track.kind==='audio') && tracks.some(track=>track.kind==='video') && tracks.every(track=>track.readyState==='live');
          tracks.forEach(track=>track.stop());
          return {opened,stopped:tracks.every(track=>track.readyState==='ended')};
        })()`);
        assert.deepEqual(playerCapture, { opened: true, stopped: true });
        await interact('board');
        await waitFor(() => inspect('document.documentElement.dataset.mode === "board" && location.hash === "#board"'));
        mark('mode-transition');
        await interact('board');
        const capture = await inspect(`navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(stream => { stream.getTracks().forEach(track => track.stop()); return 'captured'; }, error => error.name)`);
        assert.equal(capture, 'NotAllowedError');
        mark('board-capture-denied');
        const before = win.webContents.getURL();
        let prevented = false;
        const observe = event => { prevented ||= event.defaultPrevented; };
        win.webContents.on('will-frame-navigate', observe);
        win.webContents.on('will-navigate', observe);
        await inspect('location.assign("https://blocked.example/")');
        await waitFor(() => prevented);
        assert.equal(win.webContents.getURL(), before);
        mark('navigation-denied');
      })(),
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('verification-timeout')), 60000); }),
    ]);
    assert.equal(Object.keys(records).length, 11);
    assert.ok(records['process-tree-terminated']);
    code = 0;
  } catch {
    code = 1;
  } finally {
    clearTimeout(timer);
    if (win && !win.isDestroyed()) win.destroy();
    await writeResult({ format: 1, runId: context.runId, package: context.package, id: context.id,
      assertions: Object.values(records).sort((a, b) => a.id.localeCompare(b.id)), artifacts: [], resources: [],
      cleanup: { required: true, attempted: true, completed: false, reason: '' } });
    clearTimeout(watchdog);
    app.exit(code);
  }
}

module.exports = { verify };
if (require.main === module) verify().catch(() => app.exit(1));
