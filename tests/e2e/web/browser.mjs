import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const server = process.env.WEB_CHECK_SERVER ?? "http://localhost:8791";
const website = process.env.WEB_CHECK_URL ?? "http://localhost:5177";
const out = process.env.WEB_CHECK_OUT;
if (!out || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(server)) throw new Error("Set WEB_CHECK_OUT and use an isolated local server");
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${out}/chrome-profile-`);
const chrome = spawn(process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9227", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--autoplay-policy=user-gesture-required", "about:blank"], { stdio: "ignore" });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let socket;
const staticServers = [];
const evidence = [];
const began = Date.now();
const record = (text) => { evidence.push(text); console.log(text); };
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = await (await fetch("http://localhost:9227/json/new?about:blank", { method: "PUT" })).json(); break; } catch { await pause(100); }
  }
  if (!target) throw new Error("Chrome did not start");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let id = 0;
  const pending = new Map();
  const requests = [];
  const frames = [];
  const boardTokens = new Set();
  const exceptions = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error))); else task?.resolve(message.result);
    }
    if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
    if (message.method === "Network.webSocketFrameSent") frames.push(message.params.response.payloadData);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
  };
  const command = (method, params = {}) => new Promise((resolve, reject) => { const current = ++id; pending.set(current, { resolve, reject }); socket.send(JSON.stringify({ id: current, method, params })); });
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, timeout = 15000) => {
    const until = Date.now() + timeout;
    do { if (await evaluate(expression)) return; await pause(100); } while (Date.now() < until);
    throw new Error(`Timed out: ${expression}; ${await evaluate("JSON.stringify({mode:window.pokerStore?.state.mode,active:document.activeElement?.outerHTML,body:document.body.innerText,errors:window.__errors})")}; exceptions=${JSON.stringify(exceptions)}`);
  };
  const capture = async (name, width = 1440, height = 1100) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await evaluate("window.dispatchEvent(new Event('resize')); window.pokerStore?.set({})");
    await pause(350);
    const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(`${out}/${name}.png`, Buffer.from(shot.data, "base64"));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${name}: horizontal overflow`);
    record(`PASS ${name}: ${width}x${height}, no horizontal overflow`);
  };
  const request = async (route, body, token) => {
    const response = await fetch(server + route, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.ok, true, `${route}: ${JSON.stringify(result)}`);
    return result;
  };
  const action = async (token, type, fields = {}) => {
    const current = await request("/r/home/state", null, token);
    return request("/r/home/action", { type, expectedVersion: current.version, ...fields }, token);
  };
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: website });
  await wait("window.pokerStore?.state.rooms?.length === 2");
  assert.equal(await evaluate("pokerStore.state.name"), "");
  await evaluate("document.querySelector('[data-focus=board]').focus()");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await command("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await wait("pokerStore.state.mode === 'board'");
  assert.equal(await evaluate("document.activeElement.dataset.focus"), "board");
  await evaluate("pokerStore.set({previewRoom:'home'}); document.querySelector('[data-guide=roomJoin]').click()");
  await wait("!!document.querySelector('.board-screen')");
  assert.equal(await evaluate("pokerStore.state.view.players.length"), 0);
  await capture("board-empty");
  const savedToken = await evaluate("pokerStore.state.token");
  boardTokens.add(savedToken);
  await command("Page.reload", { ignoreCache: true });
  await wait("!!document.querySelector('.board-screen')");
  assert.equal(await evaluate("pokerStore.state.token"), savedToken);
  assert.equal(requests.some((url) => /\/join(?:\?|$)/.test(url)), false);
  record("PASS unnamed Board entry, keyboard mode selection and reload reuse display token without Player join");

  const host = await request("/r/home/join", { name: "BrowserHost" });
  await wait("pokerStore.state.view.players.length === 1");
  await evaluate("document.querySelector('[data-focus=board-exit]').click()");
  await wait("!pokerStore.state.token");
  await evaluate("document.querySelector('[data-focus=player]').click(); pokerStore.set({previewRoom:'home'})");
  await wait("pokerStore.state.rooms?.length === 2");
  await evaluate("document.querySelector('[data-guide=roomJoin]').click()");
  await wait("pokerStore.state.editingName");
  await evaluate("document.querySelector('input').value = 'BrowserPlayer'; [...document.querySelectorAll('button')].find(b => b.textContent === 'Save').click()");
  await evaluate("localStorage.setItem('beginner','false')");
  await evaluate("document.querySelector('[data-guide=roomJoin]').click()");
  await wait("pokerStore.state.view?.players.length === 2");
  assert.equal(await evaluate("pokerStore.state.view.display"), false);
  await capture("player-two-lobby");
  await action(host.token, "start");
  await wait("pokerStore.state.view?.status === 'running'");
  await capture("player-two-running");
  await evaluate("pokerStore.joinBoard('home')");
  await wait("pokerStore.state.view?.display === true && pokerStore.state.view.players.length === 2");
  boardTokens.add(await evaluate("pokerStore.state.token"));
  await capture("board-two-running");
  await evaluate("pokerStore.selectMode('player'); pokerStore.join('home')");
  await wait("pokerStore.state.view?.display === false");
  await action(host.token, "cancel");
  await action(host.token, "newGame");
  await wait("pokerStore.state.view?.status === 'lobby'");
  for (let i = 0; i < 7; i++) await action(host.token, "addBot");
  await action(host.token, "start");
  await wait("pokerStore.state.view?.status === 'running'");
  await wait("pokerStore.state.view.players.find(p=>p.id===pokerStore.state.view.you)?.cards.some(Boolean)");
  await evaluate("localStorage.setItem('beginner','false'); pokerStore.set({})");
  await pause(4500);
  await capture("player-nine-wide");
  await capture("player-nine-phone", 378, 900);

  const rect = (selector) => `document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`;
  const inside = async (selector) => {
    const r = await evaluate(rect(selector));
    const size = await evaluate("[innerWidth, innerHeight]");
    assert.ok(r && r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= size[0] && r.bottom <= size[1], `${selector} outside ${size}: ${JSON.stringify(r)}`);
    return r;
  };
  const shoot = async (name, width, height, scroll = "0") => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await evaluate(`window.dispatchEvent(new Event('resize')); pokerStore.set({}); scrollTo(0, ${scroll})`);
    await pause(350);
    const shot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(`${out}/${name}.png`, Buffer.from(shot.data, "base64"));
  };
  await wait("pokerVideo.granted && pokerVideo.stalled", 60000);
  for (const [width, height] of [[390, 844], [1280, 720]]) {
    await shoot(`table-header-${width}`, width, height);
    const sound = await inside(".headtools [aria-label='Turn sounds off']");
    assert.ok(sound.top < 120, `sound toggle at ${sound.top}`);
    await inside(".headtools [aria-label='Reconnect video']");
    assert.equal(await evaluate("document.querySelectorAll('.controls .toggle, .controls .toggles').length"), 0);
    record(`PASS ${width}x${height}: header sound and video reconnect inside the viewport at the top, none in the controls row`);
  }
  await evaluate("document.querySelector(\".headtools [aria-label='Reconnect video']\").click()");
  assert.equal(await evaluate("pokerVideo.stalled"), false);
  await wait("pokerVideo.stalled", 60000);
  await evaluate("document.querySelector(\".headtools [aria-label='Turn sounds off']\").click()");
  assert.equal(await evaluate("localStorage.getItem('sound') === 'off' && !!document.querySelector(\".headtools [aria-label='Turn sounds on']\")"), true);
  await evaluate("document.querySelector(\".headtools [aria-label='Turn sounds on']\").click()");
  assert.equal(await evaluate("localStorage.getItem('sound')"), "on");
  record("PASS failed video connection retries from the header; sound toggle switches and is remembered");

  const myTurn = "(() => { const v = pokerStore.state.view; return v.phase === 'betting' && v.hand?.actorId === v.you && !!v.legal.bet && !pokerStore.state.busy; })()";
  for (const until = Date.now() + 120000; !(await evaluate(myTurn));) {
    assert.ok(Date.now() < until, "own turn with a raise never came");
    const hostView = await request("/r/home/state", null, host.token);
    if (hostView.hand?.actorId === hostView.you && hostView.phase === "betting") {
      await request("/r/home/action", { type: hostView.legal.check ? "check" : hostView.legal.call !== null ? "call" : "fold", expectedVersion: hostView.version }, host.token).catch(() => {});
    }
    await pause(300);
  }
  await pause(1500);
  // The website's install banner overlays the page bottom until dismissed; dismiss it as a player would.
  await evaluate("document.querySelector('[data-ourapps-install]')?.remove(); pokerStore.set({ betTo: pokerStore.state.view.legal.bet.min })");
  for (const [width, height] of [[390, 844], [1280, 720]]) {
    await shoot(`table-raise-${width}`, width, height);
    await inside(".betbar.pinned");
    await shoot(`table-raise-${width}-scrolled`, width, height, "document.documentElement.scrollHeight");
    const bar = await inside(".betbar.pinned");
    assert.equal(await evaluate("(() => { const b = [...document.querySelectorAll('.betbar.pinned .btn')].at(-1).getBoundingClientRect(); return !!document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.betbar.pinned'); })()"), true, "bet confirm button is covered");
    const cards = await evaluate(rect(".mycards"));
    assert.ok(cards && cards.bottom <= bar.top, `cards ${JSON.stringify(cards)} under the bet panel ${JSON.stringify(bar)}`);
    record(`PASS ${width}x${height}: pinned bet panel inside the viewport, cards reachable above it`);
  }
  await evaluate("pokerStore.set({ betTo: null }); scrollTo(0, 0)");
  const playerToken = await evaluate("pokerStore.state.token");
  const beforeBoard = requests.length;
  await evaluate("pokerStore.selectMode('board')");
  assert.equal(await evaluate("pokerStore.state.view === null && pokerStore.state.video === null && !document.querySelector('.mycards,.zoom,.fx,.guide')"), true);
  await evaluate("pokerStore.joinBoard('home')");
  await wait("pokerStore.state.view?.display === true && pokerStore.state.view.players.length === 9");
  assert.equal(await evaluate("pokerStore.state.view.you === '' && pokerStore.state.view.odds === null && pokerStore.state.view.players.every(p=>p.cards.every(c=>c===null))"), true);
  assert.equal(await evaluate("localStorage.getItem('token')"), playerToken);
  assert.equal(requests.slice(beforeBoard).some((url) => /\/join(?:\?|$)/.test(url)), false);
  await capture("board-nine-wide");
  await capture("board-nine-phone", 378, 900);
  const boardToken = await evaluate("pokerStore.state.token");
  boardTokens.add(boardToken);
  await request("/r/home/display/leave", {}, boardToken);
  await evaluate("pokerStore.sleep(); pokerStore.wake()");
  await wait(`pokerStore.state.token !== ${JSON.stringify(boardToken)} && pokerStore.state.view?.display === true`);
  boardTokens.add(await evaluate("pokerStore.state.token"));
  assert.equal(requests.slice(beforeBoard).some((url) => /\/join(?:\?|$)/.test(url)), false);
  assert.equal(await evaluate("pokerVideo.room === null && pokerVideo.connected === false"), true);
  const hellos = frames.filter((frame) => frame.startsWith("{")).map((frame) => JSON.parse(frame)).filter((frame) => frame.type === "hello" && boardTokens.has(frame.token));
  assert.ok(hellos.length >= 3);
  assert.ok(hellos.every((hello) => hello.odds === false && hello.hold === null));
  record("PASS full nine-seat Board preserves Player credentials, redacts hidden cards, disables odds/holds/media and recovers an expired display token");
  await action(host.token, "cancel");
  await wait("pokerStore.state.view?.status === 'cancelled'");
  await capture("board-cancelled");

  await evaluate("pokerStore.joinBoard('casino')");
  await wait("pokerStore.state.view?.roomId === 'casino'");
  await request("/r/casino/join", { name: "CasinoOne" });
  await request("/r/casino/join", { name: "CasinoTwo" });
  await wait("pokerStore.state.view?.players.length === 2");
  await capture("board-two-lobby");
  const fixtureRoot = new URL("../../server/fixtures/", import.meta.url);
  for (const [file, label] of [["showdownSeven.json", "board-showdown-seven"], ["completed.json", "board-completed"]]) {
    const fixture = JSON.parse(await readFile(new URL(file, fixtureRoot), "utf8"));
    fixture.display = true; fixture.you = ""; fixture.odds = null;
    await evaluate(`pokerStore.sleep(); pokerStore.set({view:${JSON.stringify(fixture)},viewAt:Date.now()})`);
    await capture(label);
    assert.equal(await evaluate("[...document.querySelectorAll('.board-seat')].every((a,i,all)=>all.slice(i+1).every(b=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect(); return x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top}))"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('.board-seat')].every(e=>getComputedStyle(e).transform==='none')"), true);
    record(`PASS ${label}: public fixture seat rectangles do not overlap and remain upright`);
  }
  await evaluate("pokerStore.leave()");
  const remaining = await request("/r/casino/display", {});
  assert.equal(remaining.view.players.length, 2);
  await request("/r/casino/display/leave", {}, remaining.token);
  record("PASS Board leave retains both casino Player seats");

  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".wav": "audio/wav" };
  for (const [folder, packaged] of [["dist-desktop", true], ["dist", false]]) {
    const root = fileURLToPath(new URL(`../${folder}/`, import.meta.url));
    const http = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
        if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
        response.setHeader("content-type", mime[path.extname(file)] ?? "application/octet-stream");
        response.end(await readFile(file));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((done) => http.listen(0, "127.0.0.1", done));
    staticServers.push(http);
    const start = requests.length;
    await command("Page.navigate", { url: `http://127.0.0.1:${http.address().port}/` });
    await wait(`window.ourpokerDesktop === ${packaged}`);
    await pause(1200);
    const workers = await evaluate("navigator.serviceWorker.getRegistrations().then(r=>r.length)");
    assert.equal(requests.slice(start).some((url) => url.endsWith("/install-banner.js")), !packaged);
    assert.equal(workers > 0, !packaged);
    assert.equal(await evaluate("Object.getOwnPropertyDescriptor(window,'ourpokerDesktop').writable"), false);
    record(`PASS ${folder}: desktop=${packaged}, banner request=${!packaged}, service worker=${!packaged}, read-only build marker`);
  }
  assert.deepEqual(exceptions, []);
  record("PASS no uncaught browser exceptions; browser checks do not establish Windows runtime support");
  for (const [room, name] of [["home", "BrowserHost"], ["home", "BrowserPlayer"], ["casino", "CasinoOne"], ["casino", "CasinoTwo"]]) {
    const player = await request(`/r/${room}/join`, { name });
    await request(`/r/${room}/action`, { type: "leave", expectedVersion: player.view.version }, player.token);
  }
  record(`PASS isolated test seats cleaned; elapsed ${Date.now() - began} ms`);
} finally {
  await writeFile(`${out}/results.txt`, evidence.join("\n") + "\n");
  socket?.close();
  for (const http of staticServers) http.closeAllConnections();
  for (const http of staticServers) http.close();
  const exited = new Promise((done) => { if (chrome.exitCode !== null || chrome.signalCode !== null) done(); else chrome.once("exit", done); });
  chrome.kill();
  await exited;
  await rm(profile, { recursive: true, force: true });
}
