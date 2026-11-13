// A web client in headless Chrome, through the page's own controls only: built and served on this machine, or deployed.
// It loads the page, checks the page head, waits for the room list from the server, gives a name, sits at an empty table,
// adds a computer player, starts, waits for its own two cards, checks the table fits the window at 1280x800 and at
// 390x844, and finds no script error. It then ends that game and leaves, so a deployed server keeps no test seat.
//
//   WEB_CHECK_URL=<page address> WEB_CHECK_SERVER=<server address> WEB_CHECK_OUT=<folder> node web/test/browser.mjs
//
// Both addresses may be any http or https address, for example https://ourpoker-web.<subdomain>.workers.dev/ and
// https://ourpoker-server.<subdomain>.workers.dev. CHROME names the browser (default: Google Chrome on a Mac).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";

const page = process.env.WEB_CHECK_URL;
const server = (process.env.WEB_CHECK_SERVER ?? "").replace(/\/$/, "");
const out = process.env.WEB_CHECK_OUT;
for (const [name, value] of [["WEB_CHECK_URL", page], ["WEB_CHECK_SERVER", server]]) {
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?(\/.*)?$/.test(value ?? "")) throw new Error(`Set ${name} to an http or https address`);
}
if (!out) throw new Error("Set WEB_CHECK_OUT to a folder for the screenshots and results");
await mkdir(out, { recursive: true });
const port = await new Promise((done) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => done(p)); }); });
const profile = await mkdtemp(`${out}/chrome-profile-`);
const chrome = spawn(process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--lang=en-US", "about:blank"], { stdio: "ignore" });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const name = `Check${Math.floor(1000 + Math.random() * 9000)}`;
const results = [];
const record = (text) => { results.push(text); console.log(text); };
let socket;
let seat = null;
try {
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await pause(100); }
  }
  if (!target) throw new Error("Chrome did not start");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let id = 0;
  const pending = new Map(), exceptions = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  };
  const command = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const wait = async (expression, what, ms = 30000) => {
    for (const until = Date.now() + ms; !(await evaluate(expression));) {
      if (Date.now() > until) throw new Error(`timed out: ${what}; page says ${JSON.stringify((await evaluate("document.body.innerText")).slice(0, 300))}; exceptions ${JSON.stringify(exceptions)}`);
      await pause(200);
    }
  };
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const rooms = async () => (await fetch(`${server}/rooms`)).json();
  const shoot = async (label, width, height) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await evaluate("document.querySelector('[data-install-banner],[data-ourapps-install]')?.remove(); window.dispatchEvent(new Event('resize'))");
    await pause(600);
    const shot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(`${out}/${label}.png`, Buffer.from(shot.data, "base64"));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label}: wider than the window`);
    const table = await evaluate("(() => { const t = document.querySelector('.table')?.getBoundingClientRect(); return t && t.top >= 0 && t.left >= 0 && t.right <= innerWidth + 1; })()");
    if (label.startsWith("table")) assert.ok(table, `${label}: the table is outside the window`);
  };

  await command("Runtime.enable"); await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: page });
  await wait("document.readyState === 'complete'", "page load");
  assert.equal(await evaluate("document.title"), "OurPoker");
  assert.ok(await evaluate("!!document.querySelector('meta[name=theme-color]') && !!document.querySelector('link[rel=manifest]')"), "web-host's page head");
  await wait("[...document.querySelectorAll('[data-guide=roomJoin]')].some((b) => !b.disabled)", "the room list from the server");
  const free = (await rooms()).find((room) => room.status === "lobby" && room.playerCount === 0);
  if (!free) throw new Error(`no empty table on ${server}: ${JSON.stringify(await rooms())}`);
  record(`PASS page ${page} loads with web-host's head and lists the rooms from ${server}`);
  await shoot("home", 1280, 800);

  // Choose the empty table, then sit: the first time asks for a name.
  await click(`[data-focus=room-${free.id}]`);
  await click("[data-guide=roomJoin]");
  await wait("!!document.querySelector('input')", "name entry");
  await evaluate(`const i = document.querySelector('input'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save').click()`);
  await evaluate("localStorage.setItem('beginner', 'false')");
  await wait("[...document.querySelectorAll('[data-guide=roomJoin]')].some((b) => !b.disabled)", "the room list after naming");
  await click(`[data-focus=room-${free.id}]`);
  await click("[data-guide=roomJoin]");
  for (const until = Date.now() + 30000; !(await rooms()).some((room) => room.id === free.id && room.names.includes(name));) {
    if (Date.now() > until) throw new Error(`${server} never listed ${name} at ${free.id}`);
    await pause(300);
  }
  seat = { room: free.id, token: await evaluate("localStorage.getItem('token')") };
  record(`PASS ${name} sat at ${free.id}; the server lists them`);
  await wait("!!document.querySelector('[data-guide=start]')", "the lobby");
  await shoot("lobby", 1280, 800);

  if (await evaluate("!!document.querySelector('[data-guide=addBot]')")) await click("[data-guide=addBot]");
  await wait("!document.querySelector('[data-guide=start]').disabled", "Start enabled");
  await click("[data-guide=start]");
  await wait("document.querySelectorAll('.mycards .handcard .card:not(.back)').length === 2", "own two cards dealt", 40000);
  await pause(1500);
  await shoot("table-1280", 1280, 800);
  await shoot("table-390", 390, 844);
  record(`PASS a hand dealt with ${await evaluate("document.querySelectorAll('.seatwrap').length")} at the table; the table fits 1280x800 and 390x844`);
  assert.deepEqual(exceptions, [], "script errors");
  record("PASS no script error");
} finally {
  // End the game and leave, through the server's own routes with this browser's seat.
  if (seat?.token) {
    for (const type of ["cancel", "leave"]) {
      try {
        const state = await (await fetch(`${server}/r/${seat.room}/state`, { headers: { authorization: `Bearer ${seat.token}` } })).json();
        await fetch(`${server}/r/${seat.room}/action`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${seat.token}` },
          body: JSON.stringify({ type, expectedVersion: state.version }) });
      } catch { /* the check's own result stands */ }
    }
  }
  await writeFile(`${out}/results.txt`, results.join("\n") + "\n");
  socket?.close();
  const exited = new Promise((done) => { if (chrome.exitCode !== null || chrome.signalCode !== null) done(); else chrome.once("exit", done); });
  chrome.kill();
  await exited;
  await rm(profile, { recursive: true, force: true });
}
