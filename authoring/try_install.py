#!/usr/bin/env python3
"""Install OurPoker designs with aepm and build and run what was installed, as INSTRUCTIONS.md "Build and run" says.

For the given answers it packs the 39 components and this recipe into a temporary store, creates disposable identities
(`python -m aepm.test_identities`), signs each release (aepm.trust.publish_release), reviews each package
(`aepm review --trusted --allow-network`) and signs the review (aepm.trust.publish_review) when its required-local suites
passed. Then, per answers: evaluates the design with aepm's evaluator (aepm.recipe), resolves and installs it (`aepm resolve`,
`aepm install`), and in the installed folder runs the documented local build:

  server  npm ci; tsc --noEmit; vitest run (the application's tests from tests/e2e/server); npm start (Node, own hardware)
  web     npm ci; tsc --noEmit; npm run build (pointed at the running server); vite preview
  desktop node scripts/build.cjs (Windows designs: the web client in desktop mode; Electron packaging needs Windows)
  apple   node generate-project.ts; xcodegen generate; xcodebuild for the iOS and tvOS simulators; only the answered languages
  android node generate-project.ts; only the answered languages' strings; Gradle build where ANDROID_HOME is set
  browser headless Chrome over the DevTools protocol: the page loads with web-host's head, the room list comes from the
          server, a player names themself and sits down, the server lists them, a computer player (or a second person) joins,
          the game starts and the player's two cards are dealt, the table fits a 1280x800 window; no script error; screenshots
          of home, lobby and table are kept beside the design

Usage (from the recipe folder; python 3.12, node 26.5.0, Chrome):
  PYTHONPATH=<aepm checkout> python3.12 -B authoring/try_install.py [ANSWERS ...] [--components DIR] [--work DIR] [--chrome PATH]
ANSWERS is an answer-set id of recipe.json (`default` for its default answers) or a path to an answers JSON file;
without ANSWERS: default, browser-only-no-extras, book-club and native-no-lessons. The work folder (default: a new temporary folder) keeps
the store, identities, installed applications and logs; report.json there holds every result. Exit status 0 when every step passed.
"""
import argparse
import base64
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

from aepm import recipe as E  # noqa: E402
import recipe_world  # noqa: E402
from aepm.trust import publish_release, publish_review  # noqa: E402
from aepm.io import load, write  # noqa: E402

DEFAULT_ANSWERS = ["default", "browser-only-no-extras", "book-club", "native-no-lessons"]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class Step(Exception):
    pass


def log_path(work, name):
    path = work / "logs" / (name + ".log")
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def run(argv, work, name, cwd=None, env=None, timeout=900, check=True):
    """Run a command, keep its output in logs/<name>.log, and return the output."""
    started = time.time()
    result = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    output = result.stdout + result.stderr
    log_path(work, name).write_text(f"$ {' '.join(map(str, argv))}\n(cwd {cwd}, exit {result.returncode}, {time.time() - started:.1f}s)\n\n{output}")
    if check and result.returncode:
        raise Step(f"{name}: exit {result.returncode}; see logs/{name}.log\n{output[-3000:]}")
    return output


def aepm(args, work, name, check=True, timeout=1800):
    output = run([sys.executable, "-B", "-m", "aepm", *args], work, name, env=python_env(), timeout=timeout, check=False)
    last = [line for line in output.splitlines() if line.startswith("{")]
    result = json.loads(last[-1]) if last else {"ok": False, "error": output[-2000:]}
    if check and not result.get("ok"):
        raise Step(f"{name}: {json.dumps(result)[:3000]}")
    return result


def python_env():
    return {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": os.environ.get("PYTHONPATH", "")}


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def answers_for(world, item):
    sets = {"default": world.recipe["tests"]["defaultAnswers"], **{s["id"]: s["answers"] for s in world.recipe["tests"]["answerSets"]}}
    if item in sets:
        return item, sets[item]
    path = Path(item)
    return path.stem, json.loads(path.read_text())


# ---- store, identities, releases and reviews ----

def review(work, store, policy_path, ref, attempt):
    """One `aepm review`; returns the report, or None when aepm refused."""
    name = "review-" + ref["name"].split("/")[1] + ("" if attempt == 1 else f"-{attempt}")
    result = aepm(["review", ref["digest"], "--store", str(store), "--policy", str(policy_path), "--trusted", "--allow-network"], work, name, check=False)
    return result.get("result") if result.get("ok") else None


def prepare_store(work, components):
    """Pack, release, review and guardian-sign every package. A work folder that already has a store is reused when no package
    changed since (aepm refuses a second archive of the same name and version): only packages without a guardian statement
    are reviewed again."""
    store, identities = work / "store", work / "identities"
    if not (identities / "policy.json").is_file():
        run([sys.executable, "-B", "-m", "aepm.test_identities", str(identities)], work, "identities", env=python_env())
    policy_path = identities / "policy.json"
    sources = sorted(p for p in components.iterdir() if (p / "component.json").is_file()) + [ROOT]
    refs = []
    for source in sources:
        result = aepm(["pack", "--store", str(store), str(source)], work, "pack-" + source.name, check=False)
        if not result.get("ok"):
            if result.get("error", {}).get("code") == "identity-rebinding":
                raise Step(f"{source.name} changed since this work folder's store was made; use a new --work folder")
            raise Step(f"pack-{source.name}: {json.dumps(result)[:3000]}")
        refs.append(result["result"])
    policy = load(policy_path)
    policy["trustedExecution"] = sorted(ref["digest"] for ref in refs)
    write(policy_path, policy)
    reviews = {}
    for ref in refs:
        statements = store / "statements" / ref["digest"]
        statements.mkdir(parents=True, exist_ok=True)
        if (statements / "guardian.dsse.json").is_file():
            reviews[ref["name"]] = {"requiredLocal": "passed", "reused": True}
            continue
        if not (statements / "release.dsse.json").is_file():
            publish_release(store, ref, identities / "release.pem")
        report = review(work, store, policy_path, ref, 1)
        attempts = [report["summary"]["required-local"] if report else "refused"]
        if report is None or report["summary"]["required-local"] != "passed":
            # one more run: a suite whose private process could not be cleaned up fails without running its tests
            report = review(work, store, policy_path, ref, 2)
            attempts.append(report["summary"]["required-local"] if report else "refused")
        if report is None:
            reviews[ref["name"]] = {"requiredLocal": "refused", "attempts": attempts}
            continue
        suites = {s["id"]: s.get("status") for s in report["suites"]}
        reviews[ref["name"]] = {"requiredLocal": report["summary"]["required-local"], "summary": report["summary"], "suites": suites, "attempts": attempts}
        if report["summary"]["required-local"] == "passed":
            publish_review(store, ref, report, identities / "guardian.pem")
    blocked = {name: r for name, r in reviews.items() if r.get("requiredLocal") != "passed"}
    return store, policy_path, refs, reviews, blocked


# ---- one design ----

class Processes:
    def __init__(self):
        self.items = []

    def start(self, argv, cwd, env, log):
        handle = open(log, "w")
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=handle, stderr=subprocess.STDOUT, start_new_session=True)
        self.items.append((process, handle))
        return process

    def stop(self):
        for process, handle in self.items:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
            handle.close()
        self.items = []


def wait_for(text, log, process, seconds=60):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if text in Path(log).read_text(errors="ignore"):
            return
        if process.poll() is not None:
            raise Step(f"{Path(log).name}: exited {process.returncode} before '{text}'\n{Path(log).read_text()[-3000:]}")
        time.sleep(0.2)
    raise Step(f"{Path(log).name}: no '{text}' within {seconds}s")


def get_json(url, timeout=10):
    import urllib.request
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read())


def install(work, store, policy, world, name, answers):
    result = E.evaluate(world, answers)
    if not result["ok"]:
        raise Step(f"evaluate: {result['errors']}")
    folder = work / "designs" / name
    folder.mkdir(parents=True)
    definition, lock, app = folder / "definition.json", folder / "lock.json", folder / "app"
    definition.write_text(E.to_json(result["design"]))
    aepm(["resolve", str(definition), "--catalogue", str(store / "catalogue.json"), "--out", str(lock)], work, f"{name}-resolve")
    aepm(["install", str(definition), "--lock", str(lock), "--store", str(store), "--policy", str(policy), "--target", str(app)], work, f"{name}-install")
    return result["design"], app


def tree(app):
    top = sorted(p.name + ("/" if p.is_dir() else "") for p in app.iterdir())
    components = sorted(p.name for p in (app / "components").iterdir())
    return {"top": top, "components": components}


def build_and_run(work, name, app, chrome, results):
    processes = Processes()
    npm_env = {**os.environ, "NO_COLOR": "1", "npm_config_audit": "false", "npm_config_fund": "false", "npm_config_update_notifier": "false"}
    try:
        server, web = app / "server", app / "web"
        run(["npm", "ci"], work, f"{name}-server-npm-ci", cwd=server, env=npm_env)
        run(["npx", "tsc", "--noEmit"], work, f"{name}-server-tsc", cwd=server, env=npm_env)
        results["serverTsc"] = "passed"
        output = run(["npx", "vitest", "run"], work, f"{name}-server-tests", cwd=server, env=npm_env, timeout=600)
        results["serverTests"] = next((line.strip() for line in output.splitlines() if line.strip().startswith("Tests ")), "passed")
        port = free_port()
        log = log_path(work, f"{name}-server-run")
        process = processes.start(["npm", "start"], server, {**npm_env, "PORT": str(port), "DATA_DIRECTORY": str(work / "designs" / name / "data")}, log)
        wait_for("listening on", log, process)
        address = f"http://127.0.0.1:{port}"
        health = get_json(address + "/health")
        results["serverRun"] = f"{address} health {json.dumps(health)}"
        native(work, name, app, results)
        if not (app / "web/vite.config.ts").exists():
            return  # no web or windows target: the web sources are installed, but the web project's build comes with web-host
        run(["npm", "ci"], work, f"{name}-web-npm-ci", cwd=web, env=npm_env)
        run(["npx", "tsc", "--noEmit"], work, f"{name}-web-tsc", cwd=web, env=npm_env)
        results["webTsc"] = "passed"
        run(["npm", "run", "build"], work, f"{name}-web-build", cwd=web, env={**npm_env, "VITE_SERVER": address})
        results["webBuild"] = "passed"
        if (app / "desktop/scripts/build.cjs").exists():
            # the Windows build's first step (windows-desktop's build of the web client in desktop mode) runs on any host
            run(["node", "scripts/build.cjs"], work, f"{name}-desktop-build", cwd=app / "desktop", env=npm_env)
            page = (app / "desktop/build/web/index.html").read_text()
            if "manifest" in page or not (app / "desktop/build/web/assets").is_dir():
                raise Step("desktop build: the desktop page links the manifest or has no assets")
            results["desktopWebBuild"] = "passed"
        web_port = free_port()
        log = log_path(work, f"{name}-web-preview")
        process = processes.start(["npx", "vite", "preview", "--host", "127.0.0.1", "--port", str(web_port), "--strictPort"], web, npm_env, log)
        wait_for(str(web_port), log, process)
        results["browser"] = browser_smoke(work, name, chrome, f"http://127.0.0.1:{web_port}/", address, processes)
    finally:
        processes.stop()


# ---- the native projects ----

def native(work, name, app, results):
    """Apple: generate the project and build each scheme for its simulator (needs Xcode and XcodeGen). Android: generate the
    project and check its string resources; build it with Gradle only where an Android SDK is set (ANDROID_HOME)."""
    languages = json.loads((app / ".aepm/definition.json").read_text())["configuration"].get("languages", "en fr de es").split()
    if (app / "ios/generate-project.ts").exists():
        ios = app / "ios"
        run(["node", "generate-project.ts"], work, f"{name}-ios-generate", cwd=ios)
        if not (shutil.which("xcodegen") and shutil.which("xcodebuild")):
            results["apple"] = "generated; not built (no Xcode or XcodeGen)"
        else:
            run(["xcodegen", "generate"], work, f"{name}-ios-xcodegen", cwd=ios)
            project = (ios / "project.yml").read_text()
            built = []
            for scheme, platform in (("OurPoker", "iOS"), ("OurPokerTV", "tvOS")):
                if f"\n  {scheme}:\n" not in project.split("schemes:")[1]:
                    continue
                derived = work / "designs" / name / "derived"
                run(["xcodebuild", "-project", "OurPoker.xcodeproj", "-scheme", scheme, "-destination", f"generic/platform={platform} Simulator",
                     "-derivedDataPath", str(derived), "CODE_SIGNING_ALLOWED=NO", "build"], work, f"{name}-xcodebuild-{platform}", cwd=ios, timeout=3600)
                bundle = next(derived.glob(f"Build/Products/*/{scheme}.app"))
                found = sorted(p.stem for p in bundle.glob("*.lproj"))
                if found != sorted(languages):
                    raise Step(f"{scheme}: the app carries {found}, the design's languages are {languages}")
                built.append(f"{platform} ({' '.join(found)})")
            results["apple"] = "built " + ", ".join(built)
    if (app / "android/generate-project.ts").exists():
        android = app / "android"
        run(["node", "generate-project.ts"], work, f"{name}-android-generate", cwd=android)
        folders = sorted(p.name for p in (android / "app/src/main/res").iterdir() if p.name.startswith("values"))
        wanted = sorted("values" if code == "en" else f"values-{code}" for code in languages)
        if folders != wanted:
            raise Step(f"android: string folders {folders}, the design's languages want {wanted}")
        if os.environ.get("ANDROID_HOME") and shutil.which("gradle"):
            run(["gradle", "wrapper", "--gradle-version", "9.4.0"], work, f"{name}-android-wrapper", cwd=android)
            run(["./gradlew", ":app:assembleDebug"], work, f"{name}-android-build", cwd=android, timeout=3600)
            results["android"] = f"built ({' '.join(folders)})"
        else:
            results["android"] = f"generated ({' '.join(folders)}); not built (no ANDROID_HOME)"


def kotlin_stand_ins(work):
    """The Kotlin stand-ins type-checked on the JVM (authoring/kotlin-stand-ins), when Gradle is installed."""
    if not shutil.which("gradle"):
        return "not run (no Gradle)"
    run(["gradle", "-q", "-p", str(HERE / "kotlin-stand-ins"), "compileKotlin"], work, "kotlin-stand-ins", timeout=1800)
    return "passed"


# ---- the browser check (Chrome DevTools protocol, no extra packages) ----

def browser_smoke(work, name, chrome, page, server, processes):
    port = free_port()
    profile = work / "designs" / name / "chrome-profile"
    profile.mkdir()
    log = log_path(work, f"{name}-chrome")
    process = processes.start([chrome, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "--no-first-run",
                               "--no-default-browser-check", "--lang=en-US", "about:blank"], work, os.environ.copy(), log)
    script = work / "browser-smoke.mjs"
    script.write_text(BROWSER_SMOKE)
    output = run(["node", str(script)], work, f"{name}-browser", env={**os.environ, "DEBUG_PORT": str(port), "PAGE": page, "SERVER": server,
                                                                    "SHOT": str(work / "designs" / name / "browser.png")}, timeout=180)
    del process
    return output.strip().splitlines()[-1]


BROWSER_SMOKE = r"""
const port = process.env.DEBUG_PORT, page = process.env.PAGE, server = process.env.SERVER;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let target;
for (let i = 0; i < 100 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await pause(100); } }
if (!target) throw new Error("Chrome did not start");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
let id = 0;
const pending = new Map(), exceptions = [], requests = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
};
const command = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const wait = async (expression, what, ms = 20000) => { const until = Date.now() + ms; while (!(await evaluate(expression))) { if (Date.now() > until) throw new Error(`timed out: ${what}; exceptions ${JSON.stringify(exceptions)}`); await pause(100); } };
await command("Runtime.enable"); await command("Network.enable"); await command("Page.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await command("Page.navigate", { url: page });
await wait("document.readyState === 'complete'", "page load");
const title = await evaluate("document.title");
if (title !== "OurPoker") throw new Error(`title ${title}`);
if (!(await evaluate("!!document.querySelector('meta[name=theme-color]') && !!document.querySelector('link[rel=manifest]')"))) throw new Error("web-host head missing");
await wait("[...document.querySelectorAll('[data-guide=roomJoin]')].some((b) => !b.disabled)", "room list from the server");
await pause(800);
const fsHome = await import("node:fs");
{ const s = await command("Page.captureScreenshot", { format: "png" }); fsHome.writeFileSync(process.env.SHOT.replace(/\.png$/, "-home.png"), Buffer.from(s.data, "base64")); }
await evaluate("[...document.querySelectorAll('[data-guide=roomJoin]')].find((b) => !b.disabled).click()");
await wait("!!document.querySelector('input')", "name entry");
await evaluate("const i = document.querySelector('input'); i.value = 'Smoke'; i.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save').click()");
await pause(300);
await evaluate("localStorage.setItem('beginner', 'false'); [...document.querySelectorAll('[data-guide=roomJoin]')].find((b) => !b.disabled)?.click()");
const seated = async () => (await (await fetch(`${server}/rooms`)).json()).some((room) => room.names.includes("Smoke"));
for (const until = Date.now() + 20000; !(await seated());) { if (Date.now() > until) throw new Error(`the server never listed the player; exceptions ${JSON.stringify(exceptions)}`); await pause(200); }
const fs = await import("node:fs");
const shoot = async (suffix) => { const s = await command("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(process.env.SHOT.replace(/\.png$/, `-${suffix}.png`), Buffer.from(s.data, "base64")); };
await wait("!!document.querySelector('[data-guide=start]')", "the lobby");
await evaluate("document.querySelector('[data-install-banner],[data-ourapps-install]')?.remove()");
await pause(500);
await shoot("lobby");
const lobbyPrompt = await evaluate("document.querySelector('[data-guide=start]').title");
// A second player: a computer player where the design has them, otherwise a person joining over the server's API.
let second;
if (await evaluate("!!document.querySelector('[data-guide=addBot]')")) {
  await evaluate("document.querySelector('[data-guide=addBot]').click()");
  second = "a computer player";
} else {
  const room = (await (await fetch(`${server}/rooms`)).json()).find((r) => r.names.includes("Smoke")).id;
  const joined = await fetch(`${server}/r/${room}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Second" }) });
  if (!joined.ok) throw new Error(`second player: ${joined.status}`);
  second = "a second person";
}
await wait("!!document.querySelector('[data-guide=start]') && !document.querySelector('[data-guide=start]').disabled", "start enabled");
await evaluate("document.querySelector('[data-guide=start]').click()");
// The hand is dealt when this browser's own two cards show face up.
await wait("document.querySelectorAll('.mycards .handcard .card:not(.back)').length === 2", "own cards dealt", 30000);
await pause(1500);
await evaluate("document.querySelector('[data-install-banner],[data-ourapps-install]')?.remove()");
await shoot("table");
// The table and this player's seat lie inside the window.
const fits = await evaluate("(() => { const t = document.querySelector('.table').getBoundingClientRect(); return t.bottom <= innerHeight + 1 && t.top >= 0; })()");
if (!fits) throw new Error("the table does not fit the window at 1280x800");
if (exceptions.length) throw new Error(`script errors: ${JSON.stringify(exceptions)}`);
const calls = requests.filter((url) => url.startsWith(server)).length;
socket.close();
console.log(`passed: title OurPoker, web-host head, room list from ${server}, player seated (server lists "Smoke"), lobby says "${lobbyPrompt}", a hand dealt with ${second}, the table fits 1280x800, ${calls} requests to the server, no script error`);
process.exit(0);
"""


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("answers", nargs="*", default=DEFAULT_ANSWERS)
    parser.add_argument("--components", type=Path, default=ROOT.parent.parent / "components")
    parser.add_argument("--work", type=Path)
    parser.add_argument("--chrome", default=os.environ.get("CHROME", CHROME))
    args = parser.parse_args(argv)
    work = (args.work or Path(tempfile.mkdtemp(prefix="ourpoker-install-", dir=os.path.realpath(tempfile.gettempdir())))).resolve()
    work.mkdir(parents=True, exist_ok=True)
    print(f"work folder {work}", flush=True)
    world = recipe_world.world(args.components)
    report = {"work": str(work), "designs": {}}
    try:
        store, policy, refs, reviews, blocked = prepare_store(work, args.components.resolve())
    except Step as error:
        print(f"store: {error}")
        return 1
    report["packages"] = len(refs)
    report["reviews"] = reviews
    print(f"packed and released {len(refs)} packages; required-local passed and guardian-signed: {len(refs) - len(blocked)}; not signed: {sorted(blocked) or 'none'}", flush=True)
    try:
        report["kotlinStandIns"] = kotlin_stand_ins(work)
    except Step as error:
        report["kotlinStandIns"] = str(error)
    print(f"Kotlin stand-ins type-check: {report['kotlinStandIns']}", flush=True)
    retried = {name: r["attempts"] for name, r in reviews.items() if len(r.get("attempts", [])) > 1}
    if retried:
        print(f"reviewed twice: {retried}", flush=True)
    ok = True
    for item in args.answers:
        name, answers = answers_for(world, item)
        results = report["designs"].setdefault(name, {})
        try:
            evaluated = E.evaluate(world, answers)
            needed = {c["name"] for c in evaluated["design"]["components"]} | {world.recipe["name"]} if evaluated["ok"] else set()
            if needed & set(blocked):
                raise Step(f"not installed: no guardian review for {sorted(needed & set(blocked))}")
            design, app = install(work, store, policy, world, name, answers)
            results["install"] = "passed"
            results["components"] = len(design["components"])
            results["tree"] = tree(app)
            build_and_run(work, name, app, args.chrome, results)
        except (Step, subprocess.TimeoutExpired) as error:
            ok = False
            results["error"] = str(error)
        except Exception as error:  # noqa: BLE001  a failed design is reported and the next one runs
            ok = False
            results["error"] = str(error)
        print(f"{name}: " + json.dumps({k: v for k, v in results.items() if k != "tree"}), flush=True)
    (work / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"report {work / 'report.json'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
