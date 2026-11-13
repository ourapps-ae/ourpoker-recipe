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
  android node generate-project.ts; only the answered languages' strings; ./gradlew :app:assembleDebug where ANDROID_HOME is set
  browser headless Chrome over the DevTools protocol: the page loads with web-host's head, the room list comes from the
          server, a player names themself and sits down, the server lists them, a computer player (or a second person) joins,
          the game starts and the player's two cards are dealt, the table fits a 1280x800 window; no script error; screenshots
          of home, lobby and table are kept beside the design

With options, for designs that have the target:
  --android         the build points at a server of its own on this machine (-PserverUrl=http://10.0.2.2:PORT);
                    ./gradlew :app:testDebugUnitTest; the AVD --avd (default ourpoker) boots headless as emulator-5584, the APK
                    replaces any earlier install (its data too) with its permissions granted, and the app is played to a dealt hand:
                    name, seat, a computer player, start, the action buttons; the server lists the player; no crash;
                    android-table.png is kept. Needs ANDROID_HOME and the AVD (INSTRUCTIONS.md part 4, Android).
  --windows HOST    npm ci, npm run check and npm run package:win here (unsigned x64 NSIS installer, APP_VERSION the recipe version);
                    on HOST over ssh (PowerShell and Node): silent install, the installed exe played to a dealt hand over the DevTools
                    protocol with a loopback server address forwarded to a server of its own on this machine, silent uninstall; the
                    folder used on HOST is removed. windows-home.png and windows-table.png are kept.
  --cloudflare NAME the two-step deploy of INSTRUCTIONS.md part 4: the installed server deployed as worker NAME, the design installed
                    again with serverAddress and webAddress, the server deployed again, the web client built and deployed as the
                    static worker NAME-web, and the browser check run against them. Needs Wrangler logged in (`npx wrangler login`);
                    the workers stay deployed.
  --github REPO     INSTRUCTIONS.md part 4, Repository and releases, for a design with the release pipeline: a fresh install with
                    CHANGELOG.md committed and pushed to the private repository REPO (owner/name; made when missing, a new commit
                    on top when it exists), every workflow a push to main starts run to success (one a push leaves untouched is
                    started by hand), the tag --github-tag (default v0.1.0) pushed and the release run to success, then the
                    release checked: published, my-app.json valid and pointing at the APK and web.zip assets, the APK of that
                    version (played on the emulator with --android, its localhost server address forwarded to a server here),
                    the Windows installer an unsigned NSIS installer of the unsigned x64 application of that version, web.zip
                    served here and drawn in Chrome. Needs gh signed in; the repository stays.

Usage (from the recipe folder; python 3.12, node 26.5.0, Chrome):
  PYTHONPATH=<aepm checkout> python3.12 -B authoring/try_install.py [ANSWERS ...] [--components DIR] [--work DIR] [--chrome PATH]
                                         [--android [--avd NAME]] [--windows HOST] [--cloudflare NAME] [--github REPO [--github-tag TAG]]
                                         [--substitute SLOT=NAME@VERSION ...]
ANSWERS is an answer-set id of recipe.json (`default` for its default answers) or a path to an answers JSON file;
without ANSWERS: default, local-web, fill-empty-own-hardware and lounge-web-ios. The work folder (default: a new temporary folder) keeps
the store, identities, installed applications and logs; report.json there holds every result. Exit status 0 when every step passed.
"""
import argparse
import base64
import html
import json
import os
import re
import shutil
import signal
import socket
import struct
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

DEFAULT_ANSWERS = ["default", "local-web", "fill-empty-own-hardware", "lounge-web-ios"]
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


def install(work, store, policy, world, name, answers, substitutes=()):
    """`aepm design` (with each --substitute SLOT=NAME@VERSION), `aepm resolve` and `aepm install`, as INSTRUCTIONS.md part 3 says."""
    folder = work / "designs" / name
    folder.mkdir(parents=True)
    definition, lock, app = folder / "definition.json", folder / "lock.json", folder / "app"
    (folder / "answers.json").write_text(json.dumps(answers, indent=2) + "\n")
    recipe = world.recipe
    extra = [argument for item in substitutes for argument in ("--substitute", item)]
    result = aepm(["design", f"{recipe['name'].split('/')[1]}@{recipe['version']}", "--store", str(store), "--answers", str(folder / "answers.json"),
                   *extra, "--out", str(definition)], work, f"{name}-design", check=False)
    if not result.get("ok") or not definition.is_file():
        raise Step(f"design: {json.dumps(result)[:3000]}")
    design = json.loads(definition.read_text())
    aepm(["resolve", str(definition), "--catalogue", str(store / "catalogue.json"), "--out", str(lock)], work, f"{name}-resolve")
    aepm(["install", str(definition), "--lock", str(lock), "--store", str(store), "--policy", str(policy), "--target", str(app)], work, f"{name}-install")
    return design, app


def tree(app):
    top = sorted(p.name + ("/" if p.is_dir() else "") for p in app.iterdir())
    components = sorted(p.name for p in (app / "components").iterdir())
    return {"top": top, "components": components}


def build_and_run(work, name, app, options, results):
    processes = Processes()
    npm_env = {**os.environ, "NO_COLOR": "1", "npm_config_audit": "false", "npm_config_fund": "false", "npm_config_update_notifier": "false"}
    try:
        server, web = app / "server", app / "web"
        run(["npm", "ci"], work, f"{name}-server-npm-ci", cwd=server, env=npm_env)
        run(["npx", "tsc", "--noEmit"], work, f"{name}-server-tsc", cwd=server, env=npm_env)
        results["serverTsc"] = "passed"
        output = run(["npx", "vitest", "run"], work, f"{name}-server-tests", cwd=server, env=npm_env, timeout=600)
        results["serverTests"] = next((line.strip() for line in output.splitlines() if line.strip().startswith("Tests ")), "passed")

        def start_server(label):
            """One server process with its own room data, so each check starts from empty rooms; returns its port."""
            port = free_port()
            log = log_path(work, f"{name}-server-run{label}")
            process = processes.start(["npm", "start"], server, {**npm_env, "PORT": str(port), "DATA_DIRECTORY": str(work / "designs" / name / f"data{label}")}, log)
            wait_for("listening on", log, process)
            return port

        port = start_server("")
        address = f"http://127.0.0.1:{port}"
        health = get_json(address + "/health")
        results["serverRun"] = f"{address} health {json.dumps(health)}"
        native(work, name, app, results, start_server, options)
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
            if options.windows:
                results["windows"] = windows_run(work, name, app, start_server("-windows"), options.windows, npm_env)
        web_port = free_port()
        log = log_path(work, f"{name}-web-preview")
        process = processes.start(["npx", "vite", "preview", "--host", "127.0.0.1", "--port", str(web_port), "--strictPort"], web, npm_env, log)
        wait_for(str(web_port), log, process)
        results["browser"] = browser_smoke(work, name, options.chrome, f"http://127.0.0.1:{web_port}/", address, processes)
    finally:
        processes.stop()


# ---- the native projects ----

def native(work, name, app, results, start_server, options):
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
        if os.environ.get("ANDROID_HOME"):
            port = start_server("-android") if options.android else None
            extra = [f"-PserverUrl=http://10.0.2.2:{port}"] if options.android else []
            run(["./gradlew", ":app:assembleDebug", *extra], work, f"{name}-android-build", cwd=android, timeout=3600)
            results["android"] = f"built ({' '.join(folders)})"
            if options.android:
                output = run(["./gradlew", ":app:testDebugUnitTest"], work, f"{name}-android-unit-tests", cwd=android, timeout=1800)
                results["androidUnitTests"] = "passed" if "BUILD SUCCESSFUL" in output else output[-500:]
                package = re.search(r'applicationId = "([^"]+)"', (android / "app/build.gradle.kts").read_text()).group(1)
                results["androidRun"] = android_run(work, name, android / "app/build/outputs/apk/debug/app-debug.apk", package, port, options.avd)
        elif options.android:
            raise Step("--android needs ANDROID_HOME (INSTRUCTIONS.md part 4, Android)")
        else:
            results["android"] = f"generated ({' '.join(folders)}); not built (no ANDROID_HOME)"


# ---- the Android emulator (--android) ----

def android_run(work, name, apk, package, port, avd, reverse=None, shot="android-table.png"):
    """Installs apk on a new emulator of AVD avd and plays to a dealt hand against the local server on port. With reverse
    (a device port), the device's localhost:<reverse> reaches that server (for a build that calls localhost)."""
    sdk = Path(os.environ["ANDROID_HOME"])
    adb, serial = str(sdk / "platform-tools/adb"), "emulator-5584"
    shots = work / "designs" / name
    processes = Processes()
    log = log_path(work, f"{name}-android-emulator")
    emulator = processes.start([str(sdk / "emulator/emulator"), "-avd", avd, "-port", "5584", "-no-window", "-no-audio", "-no-snapshot",
                                "-no-boot-anim", "-crash-report-mode", "never"], work, os.environ.copy(), log)
    device = lambda *args, **kw: run([adb, "-s", serial, *args], work, f"{name}-android-adb", **kw)  # noqa: E731

    def screen():
        device("shell", "uiautomator", "dump", "/sdcard/ui.xml")
        found = {}
        for text, desc, bounds in re.findall(r'text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="([^"]*)"', device("exec-out", "cat", "/sdcard/ui.xml")):
            x1, y1, x2, y2 = map(int, re.findall(r"\d+", bounds))
            for key in (text, desc):
                if key:
                    found.setdefault(html.unescape(key), ((x1 + x2) // 2, (y1 + y2) // 2))
        return found

    def tap(label, until, seconds=60):
        """Tap `label` until `until` is on screen (a tap during an opening animation can be lost, so it is repeated)."""
        deadline, tapped = time.time() + seconds, 0.0
        while time.time() < deadline:
            found = screen()
            if until in found:
                return
            if label in found and time.time() - tapped > 3:
                device("shell", "input", "tap", *map(str, found[label]))
                tapped = time.time()
            time.sleep(1)
        raise Step(f"android: no '{until}' on screen within {seconds}s after '{label}'; saw {sorted(found)[:30]}")

    try:
        for _ in range(300):
            if emulator.poll() is not None:
                raise Step(f"android emulator exited {emulator.returncode}; see logs/{name}-android-emulator.log")
            if run([adb, "-s", serial, "shell", "getprop", "sys.boot_completed"], work, f"{name}-android-boot", check=False).strip().endswith("1"):
                break
            time.sleep(2)
        else:
            raise Step("android emulator did not boot within 600s")
        run([adb, "-s", serial, "uninstall", package], work, f"{name}-android-uninstall", check=False)
        device("install", "-g", str(apk), timeout=300)
        if reverse:
            device("reverse", f"tcp:{reverse}", f"tcp:{port}")
        device("logcat", "-c")
        device("shell", "am", "start", "-W", "-n", f"{package}/.MainActivity")
        tap("No, I know how to play", "Your name")
        for _ in range(3):  # the name field takes the text once it has the focus
            found = screen()
            if "Droid" in found:
                break
            if "Your name" in found:
                device("shell", "input", "tap", *map(str, found["Your name"]))
                time.sleep(1)
                device("shell", "input", "text", "Droid")
                time.sleep(1)
        device("shell", "input", "keyevent", "111")
        tap("Save", "Sit down")
        tap("Sit down", "Add a computer player")
        tap("Add a computer player", "Start the game")
        tap("Start the game", "Fold")
        deadline = time.time() + 60
        while not {"Fold", "Check", "Call"} & {label.split(" ")[0] for label in screen()}:
            if time.time() > deadline:
                raise Step("android: no Fold, Check or Call button after the game started")
            time.sleep(1)
        for _ in range(30):  # the room list catches up with the game within moments
            rooms = get_json(f"http://127.0.0.1:{port}/rooms")
            if any("Droid" in room["names"] for room in rooms):
                break
            time.sleep(1)
        else:
            raise Step(f"android: the server does not list the player: {rooms}")
        (shots / shot).write_bytes(subprocess.run([adb, "-s", serial, "exec-out", "screencap", "-p"], capture_output=True, timeout=60).stdout)
        crashes = device("logcat", "-d", "-b", "crash")
        if package in crashes:
            raise Step(f"android: the app crashed\n{crashes[-2000:]}")
        return f"passed on AVD {avd}: launched, player seated (server lists \"Droid\"), a computer player added, a hand dealt with the action buttons shown, no crash"
    finally:
        run([adb, "-s", serial, "emu", "kill"], work, f"{name}-android-stop", check=False)
        try:
            emulator.wait(60)
        except subprocess.TimeoutExpired:
            pass
        processes.stop()


# ---- Windows (--windows HOST) ----

def windows_run(work, name, app, port, host, npm_env):
    """Packages the unsigned installer here, then on host (ssh to PowerShell, with Node) installs it silently, plays to a dealt hand in
    the installed application over the DevTools protocol and uninstalls it. When Windows' application control (Smart App Control)
    refuses the unsigned installer, the unpacked application (the files the installer places) is copied and played instead, and the
    result says so. A loopback server address is forwarded to this machine's server. The folder used on host is removed, and the
    application's data folder too when the run created it."""
    desktop = app / "desktop"
    version = json.loads((ROOT / "recipe.json").read_text())["version"]
    run(["npm", "ci"], work, f"{name}-desktop-npm-ci", cwd=desktop, env=npm_env)
    run(["npm", "run", "check"], work, f"{name}-desktop-check", cwd=desktop, env=npm_env)
    run(["npm", "run", "package:win"], work, f"{name}-desktop-package", cwd=desktop,
        env={**npm_env, "APP_VERSION": version, "CSC_IDENTITY_AUTO_DISCOVERY": "false"}, timeout=1800)
    installer = next((desktop / "artifacts").glob("*-windows-x64-unsigned.exe"))
    configuration = (desktop / "src/configuration.cjs").read_text()
    app_name = re.search(r"appName: '([^']+)'", configuration).group(1)
    server = re.search(r"serverOrigin: '([^']+)'", configuration).group(1)
    folder = f"{app_name.lower()}-try-{time.strftime('%Y%m%d-%H%M%S')}"
    script, smoke = work / "windows-run.ps1", work / "desktop-smoke.mjs"
    script.write_text(WINDOWS_RUN.replace("{{applicationName}}", app_name).replace("{{server}}", server))
    smoke.write_text(DESKTOP_SMOKE)
    ssh = ["ssh", "-o", "BatchMode=yes", host]
    processes = Processes()
    loopback = re.match(r"http://(localhost|127\.0\.0\.1):(\d+)$", server)

    def remote(argument, label):
        output = run(ssh + [f"powershell -NoProfile -ExecutionPolicy Bypass -File {folder}\\windows-run.ps1 {argument}"],
                     work, f"{name}-windows-{label}", timeout=1800, check=False)
        return next((line[len("result: "):] for line in output.splitlines() if line.startswith("result: ")), "failed: no result line")

    try:
        run(ssh + [f"New-Item -ItemType Directory -Force {folder} | Out-Null"], work, f"{name}-windows-folder")
        run(["scp", "-q", "-o", "BatchMode=yes", str(installer), str(script), str(smoke), f"{host}:{folder}/"], work, f"{name}-windows-copy", timeout=1800)
        if loopback:
            processes.start(["ssh", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-N", "-R", f"127.0.0.1:{loopback.group(2)}:127.0.0.1:{port}", host],
                            work, os.environ.copy(), log_path(work, f"{name}-windows-tunnel"))
            time.sleep(3)
        result = remote(f"-Installer {installer.name}", "run")
        if result.startswith("blocked"):
            unpacked = work / "designs" / name / "windows-unpacked.tgz"
            run(["tar", "-czf", str(unpacked), "-C", str(desktop / "artifacts"), "win-unpacked"], work, f"{name}-windows-unpacked", env={**os.environ, "COPYFILE_DISABLE": "1"})
            run(["scp", "-q", "-o", "BatchMode=yes", str(unpacked), f"{host}:{folder}/"], work, f"{name}-windows-copy-unpacked", timeout=1800)
            result = remote(f"-Unpacked {unpacked.name}", "run-unpacked").replace("passed: ", f"passed: installer {result}; instead ", 1)
        for shot in ("home", "table"):
            run(["scp", "-q", "-o", "BatchMode=yes", f"{host}:{folder}/desktop-{shot}.png", str(work / "designs" / name / f"windows-{shot}.png")],
                work, f"{name}-windows-shots", check=False)
    finally:
        processes.stop()
        run(ssh + [f"Remove-Item -Recurse -Force {folder}"], work, f"{name}-windows-cleanup", check=False)
    if not result.startswith("passed"):
        raise Step(f"windows on {host}: {result}; see logs/{name}-windows-run*.log")
    return f"{installer.name} packaged here; on {host}: {result}"


WINDOWS_RUN = r"""param([string]$Installer, [string]$Unpacked)
$ErrorActionPreference = 'Continue'
$R = Split-Path -Parent $MyInvocation.MyCommand.Path
$I = "$R\installed"; $N = '{{applicationName}}'
$hadData = Test-Path "$env:APPDATA\$N"
$result = 'failed: nothing ran'
try {
  if ($Installer) {
    try { $p = Start-Process "$R\$Installer" -ArgumentList '/S', "/D=$I" -Wait -PassThru -ErrorAction Stop }
    catch { if ($_.Exception.Message -match 'Application Control') { "result: blocked by Smart App Control (unsigned)"; exit }; throw }
    if ($p.ExitCode -ne 0 -or -not (Test-Path "$I\$N.exe")) { throw "silent install exit $($p.ExitCode)" }
    $how = 'silent install'
  } else {
    New-Item -ItemType Directory -Force $I | Out-Null
    tar -xzf "$R\$Unpacked" -C $I --strip-components 1
    $how = 'the unpacked application'
  }
  $exe = Get-Item "$I\$N.exe"
  $info = "$N.exe $($exe.VersionInfo.ProductVersion) by $($exe.VersionInfo.CompanyName), $((Get-AuthenticodeSignature $exe.FullName).Status)"
  $info
  Start-Process $exe.FullName -ArgumentList '--remote-debugging-port=9333' -ErrorAction Stop | Out-Null
  $env:DEBUG_PORT = '9333'; $env:SERVER = '{{server}}'; $env:SHOT = "$R\desktop.png"
  $smoke = cmd /c "node `"$R\desktop-smoke.mjs`" 2>&1"
  $code = $LASTEXITCODE
  $smoke
  Get-Process $N -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep 2
  if ($code -ne 0) { throw "smoke: $(($smoke | Select-Object -Last 3) -join ' ')" }
  if ($Installer) {
    Start-Process "$I\Uninstall $N.exe" -ArgumentList '/S' -Wait -ErrorAction Stop
    Start-Sleep 5
    if (Test-Path "$I\$N.exe") { throw "uninstall left $N.exe" }
    $how += ', silent uninstall'
  }
  $result = "passed: $info; $how; $($smoke | Select-Object -Last 1)"
} catch { $result = "failed: $($_.Exception.Message)" }
finally {
  Get-Process $N -ErrorAction SilentlyContinue | Stop-Process -Force
  if (-not $hadData) { Start-Sleep 2; Remove-Item -Recurse -Force "$env:APPDATA\$N" -ErrorAction SilentlyContinue }
}
"result: $result"
"""

DESKTOP_SMOKE = r"""
import { writeFileSync } from "node:fs";
const port = process.env.DEBUG_PORT, server = process.env.SERVER, shot = process.env.SHOT;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let target;
for (let i = 0; i < 300 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page" && !t.url.startsWith("devtools")); } catch {}
  if (!target) await pause(100);
}
if (!target) throw new Error("no application window");
const socket = new WebSocket(target.webSocketDebuggerUrl);
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
const wait = async (expression, what, ms = 30000) => { const until = Date.now() + ms; while (!(await evaluate(expression))) { if (Date.now() > until) throw new Error(`timed out: ${what}; exceptions ${JSON.stringify(exceptions)}`); await pause(200); } };
const shoot = async (suffix) => { const s = await command("Page.captureScreenshot", { format: "png" }); writeFileSync(shot.replace(/\.png$/, `-${suffix}.png`), Buffer.from(s.data, "base64")); };
await command("Runtime.enable"); await command("Page.enable");
await wait("document.readyState === 'complete'", "page load");
const url = await evaluate("location.href");
if (await evaluate("!!document.querySelector('.mode-picker [data-focus=player]')")) await evaluate("document.querySelector('.mode-picker [data-focus=player]').click()");
await wait("[...document.querySelectorAll('[data-guide=roomJoin]')].some((b) => !b.disabled)", "room list from the server");
await shoot("home");
await evaluate("[...document.querySelectorAll('[data-guide=roomJoin]')].find((b) => !b.disabled).click()");
await wait("!!document.querySelector('input')", "name entry");
await evaluate("const i = document.querySelector('input'); i.value = 'Windows'; i.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save').click()");
await pause(300);
await evaluate("localStorage.setItem('beginner', 'false'); [...document.querySelectorAll('[data-guide=roomJoin]')].find((b) => !b.disabled)?.click()");
const seated = async () => (await (await fetch(`${server}/rooms`)).json()).some((room) => room.names.includes("Windows"));
for (const until = Date.now() + 30000; !(await seated());) { if (Date.now() > until) throw new Error(`the server never listed the player; exceptions ${JSON.stringify(exceptions)}`); await pause(200); }
await wait("!!document.querySelector('[data-guide=start]')", "the lobby");
await evaluate("document.querySelector('[data-guide=addBot]')?.click()");
await wait("!document.querySelector('[data-guide=start]').disabled", "start enabled");
await evaluate("document.querySelector('[data-guide=start]').click()");
await wait("document.querySelectorAll('.mycards .handcard .card:not(.back)').length === 2", "own cards dealt", 40000);
await pause(1500);
await shoot("table");
if (exceptions.length) throw new Error(`script errors: ${JSON.stringify(exceptions)}`);
socket.close();
console.log(`page ${url}, room list from ${server}, player seated (server lists "Windows"), a computer player added, a hand dealt with own two cards face up, no script error`);
process.exit(0);
"""


# ---- Cloudflare (--cloudflare NAME) ----

# INSTRUCTIONS.md part 4's command that writes web/wrangler.jsonc for the static web worker.
WEB_WRANGLER = ('const fs = require("fs"), d = fs.readFileSync("../components/server-host/server/wrangler.jsonc", "utf8").match(/"(\\w+_date)": "([^"]+)"/); '
                'fs.writeFileSync("wrangler.jsonc", JSON.stringify({ name: process.argv[1], [d[1]]: d[2], assets: { directory: "./dist" } }))')

def cloudflare_run(work, store, policy, world, name, answers, app, options):
    """The two-step deploy of INSTRUCTIONS.md part 4: deploys the installed server as worker NAME, installs the design again with
    serverAddress and webAddress (NAME-web on the same workers.dev subdomain), deploys the server again from that install, builds the
    web client, deploys it as the static worker NAME-web, and runs the browser check against the two. Both workers stay deployed."""
    if answers.get("server") != "cloudflare":
        raise Step("--cloudflare needs a design whose server answer is cloudflare")
    if f"node -e '{WEB_WRANGLER}' <name>" not in (ROOT / "INSTRUCTIONS.md").read_text():
        raise Step("INSTRUCTIONS.md part 4 differs from try_install's web wrangler.jsonc command; make them the same")
    worker, stamp = options.cloudflare, time.strftime("%Y%m%d%H%M%S")
    env = {**os.environ, "NO_COLOR": "1", "npm_config_audit": "false", "npm_config_fund": "false", "npm_config_update_notifier": "false"}

    def deploy(folder, label):
        output = run(["npm", "run", "deploy", "--", "--name", worker, "--var", f"CODE_VERSION:{stamp}-{label}"], work, f"{name}-cloudflare-deploy-{label}",
                     cwd=folder / "server", env=env, timeout=900)
        found = re.search(rf"https://{re.escape(worker)}\.([a-z0-9-]+)\.workers\.dev", output)
        if not found:
            raise Step(f"cloudflare: no workers.dev address in logs/{name}-cloudflare-deploy-{label}.log")
        return found.group(0), found.group(1)

    def answering(url, what):
        for _ in range(30):
            if run(["curl", "-fsS", "-o", "/dev/null", url], work, f"{name}-cloudflare-wait", check=False, timeout=30) == "":
                return
            time.sleep(2)
        raise Step(f"cloudflare: {what} {url} does not answer")

    address, subdomain = deploy(app, "first")
    answering(address + "/health", "server")
    web_address = f"https://{worker}-web.{subdomain}.workers.dev"
    second = f"{name}-cloudflare"
    _, app2 = install(work, store, policy, world, second, {**answers, "serverAddress": address, "webAddress": web_address})
    run(["npm", "ci"], work, f"{second}-server-npm-ci", cwd=app2 / "server", env=env)
    deploy(app2, "second")
    run(["npm", "ci"], work, f"{second}-web-npm-ci", cwd=app2 / "web", env=env)
    run(["npm", "run", "build"], work, f"{second}-web-build", cwd=app2 / "web", env=env)
    run(["node", "-e", WEB_WRANGLER, f"{worker}-web"], work, f"{second}-web-wrangler", cwd=app2 / "web")
    run([str(app2 / "server/node_modules/.bin/wrangler"), "deploy"], work, f"{second}-web-deploy", cwd=app2 / "web", env=env, timeout=900)
    answering(web_address + "/", "web client")
    processes = Processes()
    try:
        browser = browser_smoke(work, second, options.chrome, web_address + "/", address, processes)
    finally:
        processes.stop()
    return {"server": address, "web": web_address, "browser": browser}


# ---- GitHub (--github OWNER/NAME) ----

def github_env():
    """gh and git with the signed-in GitHub account, not a GITHUB_TOKEN from the environment."""
    return {key: value for key, value in os.environ.items() if key not in ("GITHUB_TOKEN", "GH_TOKEN")}


def gh(args, work, label, cwd=None, check=True, timeout=300):
    return run(["gh", *args], work, label, cwd=cwd, env=github_env(), check=check, timeout=timeout)


def git(args, work, label, cwd, check=True, timeout=600):
    # INSTRUCTIONS.md part 4 pushes with gh's credentials: credential.helper is reset, then gh's helper is the only one.
    return run(["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", *args], work, label, cwd=cwd, env=github_env(),
               check=check, timeout=timeout)


def workflow_names(app):
    """file -> the workflow's name, for every workflow of the installed application, and the files that run on a push to main."""
    names, on_push = {}, []
    for path in sorted((app / ".github/workflows").glob("*.yml")):
        text = path.read_text()
        names[path.name] = re.search(r"^name: (\S+)$", text, re.M).group(1)
        if re.search(r"^on:\n  push:\n    branches: \[main\]", text, re.M):
            on_push.append(path.name)
    return names, on_push


def succeeds(argv):
    return subprocess.run(argv, env=github_env(), capture_output=True, timeout=120).returncode == 0


def wait_runs(work, label, repo, query, expected, names, timeout):
    """file -> the latest run of each workflow file in `expected` that `query` (gh run list arguments) finds, once all completed."""
    wanted = {names[file]: file for file in expected}
    deadline = time.time() + timeout
    while True:
        listed = json.loads(gh(["run", "list", "--repo", repo, *query, "--limit", "50", "--json",
                                "databaseId,workflowName,status,conclusion,event,headBranch,headSha"], work, f"{label}-runs"))
        latest = {}
        for item in listed:
            file = wanted.get(item["workflowName"])
            if file and (file not in latest or item["databaseId"] > latest[file]["databaseId"]):
                latest[file] = item
        if set(latest) == set(expected) and all(item["status"] == "completed" for item in latest.values()):
            return latest
        if time.time() > deadline:
            raise Step(f"github: runs not complete within {timeout}s: {[(f, i['status']) for f, i in latest.items()]}, missing {sorted(set(expected) - set(latest))}")
        time.sleep(20)


def github_run(work, store, policy, world, name, answers, repo, options, server_app):
    """INSTRUCTIONS.md part 4, Repository and releases, for a fresh install of the design: CHANGELOG.md, git init and commit, the
    private repository made and pushed (a new commit on top when it exists), every workflow a push to main starts run to the
    end, the tag pushed and the release run to the end, then the release's assets downloaded and checked."""
    version = json.loads((ROOT / "recipe.json").read_text())["version"]
    tag = options.github_tag
    label = f"{name}-github"
    _, app = install(work, store, policy, world, label, answers)
    (app / "CHANGELOG.md").write_text(CHANGELOG.replace("<version>", tag[1:]))
    git(["init", "-q", "-b", "main"], work, f"{label}-git-init", app)
    git(["add", "-A"], work, f"{label}-git-add", app)
    git(["commit", "-q", "-m", f"OurPoker from ourapps-ae/ourpoker {version}"], work, f"{label}-git-commit", app)
    names, expected = workflow_names(app)
    results = {"repository": repo, "workflows": sorted(names)}
    if succeeds(["gh", "repo", "view", repo, "--json", "name"]):
        git(["remote", "add", "origin", f"https://github.com/{repo}.git"], work, f"{label}-git-remote", app)
        git(["fetch", "-q", "origin", "main"], work, f"{label}-git-fetch", app)
        git(["reset", "-q", "--soft", "origin/main"], work, f"{label}-git-reset", app)
        # main already holding this very tree needs no commit: its workflows are started by hand below
        if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=app).returncode == 1:
            git(["commit", "-q", "-m", f"OurPoker from ourapps-ae/ourpoker {version}"], work, f"{label}-git-commit-again", app)
            git(["push", "-q", "origin", "main"], work, f"{label}-git-push", app)
        results["created"] = False
    else:
        gh(["repo", "create", repo, "--private", "--source", ".", "--remote", "origin"], work, f"{label}-repo-create", cwd=app)
        git(["push", "-q", "-u", "origin", "main"], work, f"{label}-git-push", app)
        results["created"] = True
    sha = git(["rev-parse", "HEAD"], work, f"{label}-git-head", app).strip().splitlines()[-1]
    results["commit"] = sha
    time.sleep(30)
    started = {item["workflowName"] for item in json.loads(gh(["run", "list", "--repo", repo, "--commit", sha, "--json", "workflowName"], work, f"{label}-runs"))}
    for file in expected:
        # a push that leaves a workflow's paths unchanged starts no run of it; the run comes from its manual trigger instead
        if names[file] not in started:
            gh(["workflow", "run", file, "--repo", repo, "--ref", "main"], work, f"{label}-dispatch-{file}")
    ci = wait_runs(work, label, repo, ["--commit", sha], expected, names, timeout=3600)
    results["ci"] = {file: {"run": item["databaseId"], "event": item["event"], "conclusion": item["conclusion"]} for file, item in ci.items()}
    if any(item["conclusion"] != "success" for item in ci.values()):
        raise Step(f"github: a workflow failed: {results['ci']}")
    if succeeds(["gh", "api", f"repos/{repo}/git/refs/tags/{tag}"]):
        raise Step(f"github: {repo} already has the tag {tag}; remove the tag and its release, or give --github-tag")
    git(["tag", tag], work, f"{label}-git-tag", app)
    git(["push", "-q", "origin", tag], work, f"{label}-git-push-tag", app)
    time.sleep(20)
    release_run = wait_runs(work, label, repo, ["--workflow", "release.yml", "--branch", tag], ["release.yml"], names, timeout=5400)["release.yml"]
    results["release"] = {"run": release_run["databaseId"], "conclusion": release_run["conclusion"]}
    if release_run["conclusion"] != "success":
        raise Step(f"github: the release run failed: {results['release']}")
    view = json.loads(gh(["release", "view", tag, "--repo", repo, "--json", "tagName,isDraft,isPrerelease,name,assets"], work, f"{label}-release-view"))
    folder = work / "designs" / label / "release"
    folder.mkdir(parents=True, exist_ok=True)
    gh(["release", "download", tag, "--repo", repo, "--dir", str(folder)], work, f"{label}-release-download", timeout=1800)
    results["assets"] = sorted(asset["name"] for asset in view["assets"])
    results["checks"] = release_checks(work, label, folder, view, tag[1:], app, server_app, options)
    return results


CHANGELOG = "# Changelog\n\n## [<version>]\n\n### Added\n\n- OurPoker: Texas hold'em tournaments with friends, face to face.\n"


def release_checks(work, label, folder, view, version, app, server_app, options):
    """The release is published (not a draft or pre-release) with my-app.json valid by the ourapps contract, and each asset works:
    the APK installs on the emulator and plays a hand, the Windows installer is an unsigned x64 NSIS installer of this version, and
    web.zip serves the web client."""
    checks = {}
    if view["isDraft"] or view["isPrerelease"]:
        raise Step("github: the release is a draft or a pre-release")
    app_json = json.loads((app / "release/app.json").read_text())
    sys.path.insert(0, str(app / "components/ourapps-release/server/scripts"))
    import app_manifest  # noqa: E402  (the installed component's validator)
    manifest = json.loads((folder / "my-app.json").read_text())
    app_manifest.validate(manifest)
    urls = {asset["name"]: asset["apiUrl"] for asset in view["assets"]}
    if manifest["version"] != version or manifest["id"] != app_json["id"]:
        raise Step(f"github: my-app.json is {manifest['id']} {manifest['version']}")
    for field, asset in (("android", f"{app_json['id']}.apk"), ("pwa", "web.zip")):
        entry = manifest["install"].get(field)
        address = entry.get("apk") if isinstance(entry, dict) else entry
        if asset in urls and address != urls[asset]:
            raise Step(f"github: my-app.json install.{field} is {address}, not the {asset} asset {urls[asset]}")
    if any(name.endswith(".exe") for name in urls) and manifest["install"].get("windows"):
        raise Step("github: my-app.json offers the unsigned Windows installer")
    checks["my-app.json"] = f"valid (schema 1, {manifest['id']} {manifest['version']}); install: " + ", ".join(f"{k} {'set' if v else 'null'}" for k, v in manifest["install"].items())
    apk = folder / f"{app_json['id']}.apk"
    if apk.is_file():
        badging = run([str(next(Path(os.environ["ANDROID_HOME"]).glob("build-tools/*/aapt2"))), "dump", "badging", str(apk)], work, f"{label}-apk-badging")
        package = re.search(r"package: name='([^']+)'", badging).group(1)
        found = re.search(r"versionName='([^']+)'", badging).group(1)
        if found != version:
            raise Step(f"github: the APK is version {found}")
        if options.android:
            processes = Processes()
            try:
                port = free_port()
                log = log_path(work, f"{label}-apk-server")
                process = processes.start(["npm", "start"], server_app / "server", {**os.environ, "PORT": str(port), "DATA_DIRECTORY": str(work / "designs" / label / "apk-data")}, log)
                wait_for("listening on", log, process)
                served = re.match(r"http://(localhost|127\.0\.0\.1):(\d+)$", re.search(r'DEFAULT_SERVER = "([^"]+)"', (app / "web/src/api.ts").read_text()).group(1))
                checks["apk"] = f"{package} {found}; " + android_run(work, label, apk, package, port, options.avd, reverse=served.group(2) if served else None, shot="release-apk.png")
            finally:
                processes.stop()
        else:
            checks["apk"] = f"{package} {found} (not installed: no --android)"
    exes = sorted(folder.glob("*-windows-x64-unsigned.exe"))
    if exes:
        checks["windows"] = installer_check(work, label, exes[0], version, app_json["name"])
    if (folder / "web.zip").is_file():
        checks["web.zip"] = web_zip_check(work, label, folder / "web.zip", options.chrome)
    return checks


def installer_check(work, label, installer, version, name):
    """An NSIS installer with no Authenticode signature, carrying the x64 application of this version, also unsigned."""
    seven = shutil.which("7zz") or shutil.which("7z")
    if not seven:
        raise Step("github: the installer check needs 7-Zip (7zz)")
    listing = run([seven, "l", "-slt", str(installer)], work, f"{label}-exe-list")
    if "Type = Nsis" not in listing or "app-64.7z" not in listing:
        raise Step("github: the installer is not an NSIS installer of the x64 application")
    unpacked = work / "designs" / label / "exe"
    shutil.rmtree(unpacked, ignore_errors=True)
    run([seven, "e", "-y", f"-o{unpacked}", str(installer), "$PLUGINSDIR/app-64.7z"], work, f"{label}-exe-payload")
    run([seven, "e", "-y", f"-o{unpacked}", str(unpacked / "app-64.7z"), f"{name}.exe"], work, f"{label}-exe-app")
    run([seven, "x", "-y", f"-o{unpacked / 'resources'}", str(unpacked / f"{name}.exe"), ".rsrc/1033/version.txt"], work, f"{label}-exe-version")
    info = (unpacked / "resources/.rsrc/1033/version.txt").read_bytes().decode("utf-16-le", errors="ignore")
    product = re.search(r'VALUE "ProductVersion",\s+"([^"]+)"', info).group(1)
    if not product.startswith(version):
        raise Step(f"github: the application is version {product}")

    def header(path):
        data = path.read_bytes()
        offset = struct.unpack_from("<I", data, 0x3C)[0]
        machine = struct.unpack_from("<H", data, offset + 4)[0]
        optional = offset + 24
        directory = optional + (112 if struct.unpack_from("<H", data, optional)[0] == 0x20B else 96)
        return machine, struct.unpack_from("<I", data, directory + 4 * 8 + 4)[0]

    app_machine, app_signature = header(unpacked / f"{name}.exe")
    _, installer_signature = header(installer)
    if app_machine != 0x8664 or app_signature or installer_signature:
        raise Step(f"github: machine {app_machine:#x}, signature sizes {app_signature} and {installer_signature}")
    return f"{installer.name}: NSIS installer, unsigned; {name}.exe x64, unsigned, ProductVersion {product}"


def web_zip_check(work, label, zip_path, chrome):
    """web.zip unpacked and served from this machine: the page loads with web-host's head, every file it asks for is there, and it
    draws its first screen with no script error. Its calls to the design's server address are not part of this check."""
    import zipfile
    served = work / "designs" / label / "web"
    shutil.rmtree(served, ignore_errors=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(served)
        names = archive.namelist()
    if "index.html" not in names:
        raise Step("github: web.zip has no index.html at its root")
    processes = Processes()
    try:
        port = free_port()
        processes.start([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(served)], work, os.environ.copy(),
                        log_path(work, f"{label}-web-serve"))
        time.sleep(1)
        debug = free_port()
        profile = work / "designs" / label / "chrome-profile"
        processes.start([chrome, "--headless=new", f"--remote-debugging-port={debug}", f"--user-data-dir={profile}", "--no-first-run",
                         "--no-default-browser-check", "about:blank"], work, os.environ.copy(), log_path(work, f"{label}-web-chrome"))
        script = work / "web-zip-check.mjs"
        script.write_text(WEB_ZIP_CHECK)
        output = run(["node", str(script)], work, f"{label}-web-check", env={**os.environ, "DEBUG_PORT": str(debug), "PAGE": f"http://127.0.0.1:{port}/",
                                                                              "SHOT": str(work / "designs" / label / "web-zip.png")}, timeout=120)
    finally:
        processes.stop()
    return f"{len(names)} files; " + output.strip().splitlines()[-1]


WEB_ZIP_CHECK = r"""
const port = process.env.DEBUG_PORT, page = process.env.PAGE;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let target;
for (let i = 0; i < 100 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await pause(100); } }
if (!target) throw new Error("Chrome did not start");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
let id = 0;
const pending = new Map(), exceptions = [], missing = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method === "Network.responseReceived" && message.params.response.url.startsWith(page) && message.params.response.status >= 400) missing.push(message.params.response.url);
};
const command = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
await command("Runtime.enable"); await command("Network.enable"); await command("Page.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await command("Page.navigate", { url: page });
for (const until = Date.now() + 20000; !(await evaluate("document.readyState === 'complete' && document.body.innerText.includes('OurPoker')"));) { if (Date.now() > until) throw new Error(`the page did not draw; exceptions ${JSON.stringify(exceptions)}`); await pause(200); }
await pause(1500);
const title = await evaluate("document.title");
if (title !== "OurPoker") throw new Error(`title ${title}`);
if (!(await evaluate("!!document.querySelector('meta[name=theme-color]') && !!document.querySelector('link[rel=manifest]')"))) throw new Error("web-host head missing");
if (missing.length) throw new Error(`missing files: ${missing.join(", ")}`);
if (exceptions.length) throw new Error(`script errors: ${JSON.stringify(exceptions)}`);
const shot = await command("Page.captureScreenshot", { format: "png" });
(await import("node:fs")).writeFileSync(process.env.SHOT, Buffer.from(shot.data, "base64"));
const scripts = await evaluate("document.querySelectorAll('script[src]').length");
socket.close();
console.log(`served: title OurPoker, web-host head, ${scripts} script file(s) loaded, the first screen drawn, no missing file, no script error`);
process.exit(0);
"""


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
// A second player: none with fill-empty (Start is offered to one person and the computers fill the table), a computer player
// where the design has them, otherwise a person joining over the server's API.
let second;
if (await evaluate("!document.querySelector('[data-guide=start]').disabled")) {
  second = "computers filling the table when one person pressed Start";
} else if (await evaluate("!!document.querySelector('[data-guide=addBot]')")) {
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
const atTable = await evaluate("document.querySelectorAll('.seatwrap').length");
second += ` (${atTable} at the table)`;
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
    parser.add_argument("--android", action="store_true", help="build against this machine's server, run the unit tests, and play a hand on the emulator")
    parser.add_argument("--avd", default="ourpoker", help="the Android virtual device --android starts (default ourpoker)")
    parser.add_argument("--windows", metavar="HOST", help="package the Windows installer here, then install, play a hand and uninstall on HOST over ssh")
    parser.add_argument("--cloudflare", metavar="NAME", help="deploy the server as worker NAME and the web client as NAME-web, two-step, and check them")
    parser.add_argument("--github", metavar="REPO", help="push a fresh install to the private repository REPO (owner/name), run its workflows and its release, check the release")
    parser.add_argument("--github-tag", default="v0.1.0", help="the version tag --github pushes (default v0.1.0)")
    parser.add_argument("--substitute", action="append", default=[], metavar="SLOT=NAME@VERSION",
                        help="put that component in the slot (aepm design --substitute); its folder must be in --components")
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
            design, app = install(work, store, policy, world, name, answers, args.substitute)
            results["install"] = "passed"
            substituted = {slot: f"{s['component']}@{s['version']}" for slot, s in design.get("selections", {}).items() if s.get("reason") == "substituted"}
            if substituted:
                results["substituted"] = substituted
            results["components"] = len(design["components"])
            results["tree"] = tree(app)
            build_and_run(work, name, app, args, results)
            if args.cloudflare:
                results["cloudflare"] = cloudflare_run(work, store, policy, world, name, answers, app, args)
            if args.github:
                results["github"] = github_run(work, store, policy, world, name, answers, args.github, args, app)
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
