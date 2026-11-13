# OurPoker recipe: instructions

Package `ourapps-ae/ourpoker` 0.5.2. Part 1 is for the agent that answers the questions, part 2 for the developer who owns the accounts, part 3 installs the application with aepm, part 4 builds and runs it, and part 5 is for maintainers of the recipe's own repository. `recipe.json` is the source of truth; this file explains how to use it.

## 1. For the agent

### Answering

Answer from the person's description whatever it settles. Ask the person only what the description leaves open and the table below marks "ask". Never invent a secret, an account name, an address or a hosting account. An answer must be an allowed option or inside the range given in `recipe.json`; the defaults are the recipe's house rules. A question with `askWhen` is asked only when its condition holds; otherwise it takes its default and any answer given for it is ignored. Conditions (`askWhen`, `includedWhen`) are CEL (Common Expression Language) expressions over the answers: each question id is a variable holding its answer, a set is a list of text, so `'web' in targets` is true when the web is a target. The "asked when" column gives each condition as written in `recipe.json`.

Ask in this order. A question only matters if the earlier ones left it open.

| # | id | type, allowed answers | asked when | default | infer from the request | ask the person when |
|---|---|---|---|---|---|---|
| 1 | `targets` | set of `web ios android macos windows tvos` | always | all six | "phones" is ios and android; "television" is tvos; "computers" is macos and windows; "browser" is web | no device is named |
| 2 | `webAddress` | text, an https address, or `http://localhost` with a port | `'web' in targets` | `http://localhost:5173` | the developer's own address | the web version is to be served somewhere other than this machine (the server refuses a plain http origin other than localhost) |
| 3 | `bundleId` | text, for example `com.yourname.poker` | always | empty: the application derives `app.ourapps.ourpoker` | a name the developer gives | never |
| 4 | `scale` | `small` `medium` `large` | always | small | the most people playing at the same time, not the seats at one table: up to 10 is small (9 friends); 11 to 100 is medium (a dozen or 15 friends, a club); 101 to 1,000 is large (a company event) | the group size is not stated; over 18 people, say that only 18 play at once (two tables of up to 9) and the rest watch |
| 5 | `languages` | set of `en fr de es` | always | all four | the languages named | never |
| 6 | `look` | `night` `lounge` | always | night | dark or warm style words: the look of the whole application on every device (both rooms, every screen, the felt and the card backs) | never |
| 7 | `players` | integer 2 to 9 | always | 9 | seats at one table; the game always has two tables (rooms Casino and Home), so at most twice this number play at once (18 with 9) and everyone else watches: the scale answer sizes the servers, not the tables; about a dozen is 9 (or 6 for two even tables) | never |
| 8 | `startingChips` | integer 100 to 1000000 | always | 5000 | the number named | never |
| 9 | `levelSeconds` | integer 60 to 3600 | always | 600 | minutes converted to seconds | never |
| 10 | `rebuys` | integer 0 to 5 | always | 1 (until level 3) | "no rebuys" is 0 | never |
| 11 | `decisionSeconds` | integer 5 to 300 | always | 30 (then check or fold) | a pace named | never |
| 12 | `computerPlayers` | `none` `on-request` `fill-empty` | always | on-request | "people only" is none; "full tables" or playing alone against the computer is fill-empty (one person presses Start and computers take every empty seat) | never |
| 13 | `video` | yes or no | always | yes | "no video", or everyone in one room, is no | never |
| 14 | `videoServiceUrl` | text, an address (empty to set it later) | `video` | empty | the developer's LiveKit address | video is on |
| 15 | `videoKey` | secret reference name | `video && publish` | none | never a value | video is on and builds are published (locally the server reads `LIVEKIT_*` from its environment) |
| 16 | `videoSecret` | secret reference name | `video && publish` | none | never a value | video is on and builds are published |
| 17 | `lessons` | yes or no | always | yes | "everyone already knows the game" is no | never |
| 18 | `server` | `cloudflare` `own-hardware` | always | none | nothing: ask | always, unless the person already named the provider |
| 19 | `hostingAccount` | reference name (lowercase letters, digits, hyphens) | `server == 'cloudflare'` | none | never a value | the server runs on Cloudflare. Deploying from this computer uses the wrangler login and never reads the name; the name only chooses the repository secrets (`<NAME>_API_TOKEN`, `<NAME>_ACCOUNT_ID`) the release workflow deploys the server with |
| 20 | `serverAddress` | text, an http or https address | always | `http://localhost:8788` | the deployed server's address, once known | after the first deploy (see "Two-step deploy") |
| 21 | `updates` | yes or no | always | no | updates or keeping apps current is yes | never |
| 22 | `publish` | yes or no | always | no | yes only when the request is to publish builds (web hosting, app stores, updates); GitHub builds and releases without store publishing is `releases` yes, `publish` no | the request asks for publishing |
| 23 | `repository` | text, `owner/name` (letters, digits, hyphens, underscores) | always | empty | a repository the developer names; otherwise propose `<login>/ourpoker`, the login from `gh api user -q .login` | to confirm the proposed repository (made private when it does not exist) |
| 24 | `releases` | yes or no | always | no (publishing sets up GitHub Actions whatever this answer) | yes when builds are published or GitHub should build, check and release each version: GitHub builds and releases without store publishing is `releases` yes, `publish` no | never |
| 25 | `storeInvitation` | text, an address (empty to set it later) | `updates` | empty | the developer's ourapps.app invitation | updates are on |
| 26 | `storeCredentials` | reference name (lowercase letters, digits, hyphens) | `publish && (updates \|\| 'ios' in targets)` | none | never a value | builds are published and updates are on or an iPhone and iPad build is wanted (without it the release has no store call and no iOS job) |
| 27 | `androidSigning` | reference name (lowercase letters, digits, hyphens) | `publish && 'android' in targets` | none | never a value | builds are published and Android is a target |
| 28 | `webDeploy` | reference name (lowercase letters, digits, hyphens) | `publish && 'web' in targets` | none | never a value | builds are published and the web is a target |

### What each answer changes

An empty text answer writes nothing: the setting keeps its recipe value or default. A secret reference answer is a name, never a value; the design records `{"secretRef": name}` for a secret setting and the plain name for `server-host.accountReference` and for the four reference settings of `ourapps-release`, because aepm renders those into `components/ourapps-release/server/release.json` (a template cannot render a secret setting) and the release workflow takes the repository secret names from there.

| Answer | Components included | Settings set |
|---|---|---|
| `targets` contains `web` or `windows` / `ios`, `macos` or `tvos` / `android` / `windows` | `web-host` (the Windows build packs the web client) / `apple-host` / `android-host` / `windows-desktop` | `ourapps-release.targets` and `apple-host.targets` get the whole list joined by single spaces, lower case (apple-host reads `ios`, `macos` and `tvos` from the list and ignores the other devices) |
| `webAddress` | none | `web-host.webAddress`, `application.webAddress`, `server-host.allowedOrigins`, `invitations.inviteAddress` |
| `bundleId` | none | `apple-host.bundleIdentifier`, `android-host.packageId`, `ourapps-release.bundleIdentifier`, `application.packageId` (all `app.ourapps.ourpoker` when empty) |
| `scale` | none directly (see "Scale and profiles") | none |
| `languages` | none | `translations.languages` and `application.languages`, the chosen languages joined by spaces (for example `en fr`): the web client offers only these, and the Apple and Android projects carry only these languages' text |
| `look` | none | `theme.themeName`, `application.look` (the theme of both rooms and every screen on every client); `card-graphics.backStyle`, `application.cardBack` (night: striped card backs, lounge: plain) |
| `players` | none | `seating.maximumPlayers`, `holdem-rules.seats`, `chip-ledger.seats`, `room-directory.roomCapacity`, `application.maximumPlayers` |
| `startingChips` | none | `tournament.startingStack`, `tournament.rebuyStack`, `application.startingStack` (not chip-ledger's `startingStack`: the tournament issues the chips) |
| `levelSeconds` | none | `level-schedule.levelSeconds`, `application.levelSeconds` |
| `rebuys` | none | `tournament.rebuysPerPlayer`, `application.rebuysPerPlayer` (0 removes rebuy offers) |
| `decisionSeconds` | none | `game-clock.decisionSeconds`, `turn-engine.decisionSeconds`, `application.decisionSeconds` |
| `computerPlayers` | `none` leaves out `computer-players` and `poker-strategy` (turn-engine's requirement is optional) | `computer-players.mode`, `application.computerPlayers`; with `fill-empty` one person may press Start alone and computers take every empty seat |
| `video` yes | `video-calls` | none; `videoServiceUrl` sets `video-calls.serviceUrl`; `videoKey` and `videoSecret` set `video-calls.keyReference` and `video-calls.secretReference` |
| `lessons` yes | `guided-tour` | none |
| `server` | none | none directly: it restricts the `server` and `realtime` jobs (see "Scale and profiles"); `hostingAccount` sets `server-host.accountReference` and `ourapps-release.hostingAccount` |
| `serverAddress` | none | `application.serverAddress`: the address the web, Apple, Android and Windows clients call |
| `updates` yes | `store-update` | `application.updatesEnabled`; `storeInvitation` sets `store-update.inviteAddress` and `application.inviteAddress` (until it is answered, `application.inviteAddress` is the local web address, which is no invitation and is never offered) |
| `publish` | yes: `ourapps-release` | none directly: it decides whether the signing and deployment references are asked |
| `repository` | none | `ourapps-release.repository` (`https://github.com/<owner>/<name>`) and `ourapps-release.manifestUrl` (`https://api.github.com/repos/<owner>/<name>/releases/latest`, the latest release, where ourapps.app reads `my-app.json`) |
| `releases` yes | `ourapps-release` (also with `publish` yes): GitHub Actions and releases (part 4, "Repository and releases") | none |
| `storeCredentials`, `androidSigning`, `webDeploy` | none | `ourapps-release.storeCredentials`, `.androidSigning`, `.webDeploy` (reference names; `none` when not asked) |

Each entry of `recipe.json` `components` is a slot: `id`, `class` (the interfaces the recipe takes from and feeds into it, and a JSON Schema of the settings it writes on it), `preferred` (the component the recipe was built and tested with) and `includedWhen`. Any component that fits the class may fill the slot (part 3, step 4). The application reaches each component only through the entry modules its interface documents declare (`components/<slot>/web/index.ts`, `server/index.ts`, `desktop/index.cjs`; the Swift and Kotlin public names), and aepm installs a slot's component at `components/<slot id>/`. A slot is in the design only through its `includedWhen`; no question effect includes anything. `web-host` is in when `'web' in targets || 'windows' in targets`; `apple-host` when `'ios' in targets || 'macos' in targets || 'tvos' in targets`. `computer-players` and `poker-strategy` are in when `computerPlayers != 'none'` (turn-engine's `computer-players` requirement is optional). `ourapps-release` is in when `publish || releases`. The application's files that use an optional component carry `component: "<slot id>"` in `component.json` and are installed only when that slot is filled. Each optional module the rest of the application uses has a stand-in at the same destination marked `withoutComponent: "<slot id>"`, installed when the design leaves the component out, so every design installs one of the two and every client compiles: server `video.ts`, `update-links.ts`, `computers.ts`; web `video.ts`, `shell.ts`, `guide.ts`, `guide-style.ts`, `update.ts` and the web package files (which declare `livekit-client`); Apple `Video.swift`, `SeatScreen.swift`, `Lessons.swift`, `Updates.swift`; Android `Video.kt`, `ui/SeatScreen.kt`, `ui/Lessons.kt`, `Updates.kt`. The repository files at the application root (`.github/workflows/*.yml`, `scripts/*`, `release/app.json`) are the recipe's own, because aepm installs a component's files only under `components/<slot id>/`; each carries `component: "ourapps-release"`, or a list such as `["ourapps-release", "web-host"]` for `ci-web.yml`, installed only when every slot in it is filled. `.gitignore` is installed in every design.

`application.<setting>` names a setting of the recipe's own component (`component.json`). The six that change the house rules (`maximumPlayers`, `startingStack`, `levelSeconds`, `rebuysPerPlayer`, `decisionSeconds`, `computerPlayers`) are written over `rules/texas-holdem-house-rules.json` by the server when it starts, and each component is built from the result; the rules file is the one source of those numbers, and `recipe.json` does not restate any number the rules file states (`rules-settings.rulesFile` is `texas-holdem-house-rules`). `guest-identity` keeps its own defaults, which the application uses too.

Forms of a `sets` value in `recipe.json` (aepm's recipe evaluation rules): a literal; `"$answer"` (the answer; a set joined with spaces); `{"map": {...}}` (a choice answer to a value, covering every option); `{"fromScale": "<load key>"}`; `{"template": "prefix-{{answer}}"}`; `{"ref": "<secretRef question>"}`. This recipe uses `$answer`, `map`, `template` and `ref`. There is no `includes`, `$job`, `null` or `mapEach`.

### Scale and profiles

The `scale` answer picks a band; the band's load (`concurrentPeople`, `requestsPerDay`, `storedMegabytes`) is compared with the load each candidate profile declares in its component's `suitability.json`. Per job, the `server` answer first restricts the `server` and `realtime` candidates to the ones it names (`cloudflare` names `cloudflare-free` and `cloudflare-paid`, and realtime-rooms' Cloudflare profiles; `own-hardware` names the `own-hardware` profiles); then the lowest-cost candidate whose declared maxima cover the band is chosen (a missing maximum means no practical limit; none 0, free 1, paid 2, metered 3; ties go to the first). `server-host.provider` is written from the chosen profile. If none covers the band, report the uncovered job to the developer; do not pick a candidate that does not fit. A job whose component is left out (`video` when video is no) selects nothing.

| Band | People at once | Requests a day | Stored MB | `server` job (Cloudflare answered) | `realtime` job | `video` job |
|---|---|---|---|---|---|---|
| small: up to 10 at the same time (9 friends) | 10 | 2,000 | 100 | `cloudflare-free` | `free` | `free` |
| medium: 11 to 100 (12 or 15 friends, a club) | 100 | 50,000 | 1,000 | `cloudflare-free` | `free` | `free` (covers 100 at once exactly) |
| large: 101 to 1,000 (a company event) | 1,000 | 1,000,000 | 10,000 | `cloudflare-paid` | `paid` | `paid` (1,000 at once; `scale` covers 5,000) |

With `server` = `own-hardware` the `server` and `realtime` jobs resolve to the `own-hardware` profiles at every band (no cost, no declared limits): the scale then changes only the video plan, or nothing but the record in the design when video is off.

Changing `scale` later swaps components that keep data with a migration (each such component's `migration.json`); do not rebuild from scratch.

### Settings fixed by the recipe

Names and identifiers fixed in `recipe.json`: application id `ourpoker`, bundle and package identifier `app.ourapps.ourpoker` unless `bundleId` is answered. No address is fixed: the web address, server address, video service address and store invitation come from questions. The server address is known only after the first deploy, so `serverAddress` keeps `http://localhost:8788` until then ("Two-step deploy" below). Never guess a domain.

## 2. For the developer

### Accounts and secrets, by reference only

Supply each secret to the tool that runs the build as a named reference, never as a value in the recipe, the answers or the design. The questions ask only for the reference name.

| Needed when | Account | Question that names the reference | Notes |
|---|---|---|---|
| `server` = `cloudflare` | A Cloudflare account | `hostingAccount` (a slug) | `realtime-rooms` and `server-host` run on Workers with SQLite-backed Durable Objects |
| `publish`, with `updates` or an iPhone and iPad target | Apple developer membership (the one paid item delivery needs) | `storeCredentials` | signing and TestFlight upload through `ourapps-release` |
| `publish` with `android` | A signing key for the Android package | `androidSigning` | |
| `publish` with `web` | A hosting account for the web files | `webDeploy` | |
| `video` yes | A LiveKit Cloud account | `videoKey`, `videoSecret` when `publish` (the API key and secret); the service address is `videoServiceUrl` | the deployment resolves the references into `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; a local run sets those three in the server's environment |
| `server` = `own-hardware` | A machine that runs Node and a way to deploy to it | none | no account; server-host's `start.ts` runs the worker module on Node |
| always | A GitHub account with the GitHub CLI signed in (`gh auth login`) | `repository` (owner/name, not a reference) | the code goes to a private repository; with `publish` or `releases` yes its GitHub Actions use the account's Actions minutes. The repository secrets each reference names are in part 4, "Repository and releases" |

### Free tiers and limits (from each component's `suitability.json`, checked 2026-11-09)

- `server-host` `cloudflare-free`: Workers Free, 100,000 requests a day (Error 1027 after that), 10 ms of processor time a request, 5 GB stored in Durable Objects. `cloudflare-paid`: metered, $5 a month minimum, no request limit, 10 GB per Durable Object. `own-hardware`: no provider limit; capacity depends on the machine, one process, no failover; no limit source is cited.
- `realtime-rooms` `free` and `paid`: the same Cloudflare limits.
- `video-calls` (LiveKit Cloud): `free` is the Build plan, 100 people connected at once, 5,000 participant minutes a month, 50 GB downstream, no card; `paid` is Ship, from $50 a month, 1,000 at once; `scale` is Scale, from $500 a month, 5,000 at once. Usage above the allowance is billed on the paid plans.
- `room-directory` declares 1,000 connections at once (its own default, not a provider limit), which covers the large band.
- Everything else is a pure library or a host with no hosted service: `any` profile, cost none.

A small group stays inside the free tiers: the small and medium bands both fit `cloudflare-free` and LiveKit `free`.

## 3. Install

Needs Python 3.12, Node 26.5 and git. aepm is the installer: `git clone https://github.com/ourapps-ae/aepm`, then define the command for this shell (bash or zsh):

```
AEPM="$PWD/aepm"
aepm() { PYTHONPATH="$AEPM" python3 -B -m aepm "$@"; }
```

STORE, POLICY and APP below are absolute paths of your choosing: STORE a folder for downloaded packages, POLICY the owner's policy file, APP the application folder `aepm install` creates (it must not exist yet). `<version>` is the recipe version the catalogue lists (this file belongs to 0.5.2).

1. Fetch the recipe and every component it names, with their release and guardian attestations, then read these instructions from the recipe's archive:
   ```
   aepm fetch ourpoker@<version> --with-dependencies --store STORE
   python3 -c 'import json,sys,tarfile; s,v=sys.argv[1:]; d=next(e["digest"] for e in json.load(open(s+"/catalogue.json"))["entries"] if e["name"]=="ourapps-ae/ourpoker" and e["version"]==v); sys.stdout.write(tarfile.open(f"{s}/objects/{d}.tar").extractfile("INSTRUCTIONS.md").read().decode())' STORE <version> > INSTRUCTIONS.md
   ```
2. Read the questions (id, wording, type, options or range, default, askWhen):
   ```
   aepm questions ourpoker@<version> --store STORE
   ```
3. Answer them as part 1 says and write `answers.json`, an object from question id to answer, for example:
   ```
   {"targets": ["web"], "server": "own-hardware", "languages": ["en"], "video": false}
   ```
   Unanswered questions take their defaults; `server` has none and must be answered. Secret reference questions have no default and are asked only when their condition holds: `hostingAccount` for a Cloudflare server, the others only when `publish` is yes. Answer each with a name in your secret store, never the secret.
4. Evaluate the design:
   ```
   aepm design ourpoker@<version> --store STORE --answers answers.json --out definition.json
   ```
   A refusal lists each error as `{code, path}` (for example `unanswered` with the question id); fix the answer and run it again.

   To put another component in a slot, list the catalogue components that fit it, fetch the one chosen into STORE, and name it in `--substitute` (repeat for several slots):
   ```
   aepm alternatives ourpoker@<version> theme --store STORE --from https://ourapps.app
   aepm fetch ourapps-ae/theme-high-contrast@0.1.0 --store STORE --from https://ourapps.app
   aepm design ourpoker@<version> --store STORE --answers answers.json --substitute theme=ourapps-ae/theme-high-contrast@0.1.0 --out definition.json
   ```
   `alternatives` prints `[{name, version, fits, reasons}]`. `design` refuses a component that does not fit (`unfit` with the reason) and records the choice in the design's `selections` as `{component, version, reason: "substituted"}`. A substitute in a job's slot (`server-host`, `realtime-rooms`, `video-calls`) replaces the job's selection.
5. Lock the exact packages:
   ```
   aepm resolve definition.json --catalogue STORE/catalogue.json --out lock.json
   ```
6. Make the owner's policy (once). The policy names whose signatures aepm accepts: Level N's public release and guardian keys, which sign every published package, and the owner's own key, which signs approvals of later updates. For trying the recipe, make a disposable owner key:
   ```
   PYTHONPATH="$AEPM" python3 -B -m aepm.test_identities "$PWD/identities"
   curl -fsSL https://ourapps.app/policy/levelnpolicy.json -o levelnpolicy.json
   python3 - <<'POLICY'
   import json
   level_n = json.load(open("levelnpolicy.json"))
   mine = json.load(open("identities/policy.json"))
   policy = {"format": 1, "keys": {"release": level_n["keys"]["release"], "guardian": level_n["keys"]["guardian"], "owner": mine["keys"]["owner"]}, "trustedExecution": []}
   json.dump(policy, open("policy.json", "w"), indent=2)
   POLICY
   ```
   `identities/` then holds three disposable private keys; keep `owner.pem` (it approves updates), delete the other two, and keep the folder outside STORE and APP. For an owner key you keep, make it with OpenSSL instead and put its public key in the policy's `owner` list: `openssl genpkey -algorithm ed25519 -out owner.pem` and `openssl pkey -in owner.pem -pubout` (the `publicKey` value is that PEM text). POLICY is the resulting `policy.json`.
7. Install:
   ```
   aepm install definition.json --lock lock.json --store STORE --policy POLICY --target APP
   ```
   aepm checks every package's release and guardian signatures against POLICY, places the files, renders each setting into the files that name it, and records the design in `APP/.aepm/`. It runs no package code. Then put the application in its repository and build and run it (part 4).

## 4. Build and run

What `aepm install` writes into the application folder. `web/`, `ios/` and `android/` hold their client's sources in every design; what builds them comes only with the target in brackets (web-host's `vite.config.ts`, apple-host's and android-host's `generate-project.ts`), so build only the clients the design targets. `desktop/` appears only with Windows.

```
server/       package.json, package-lock.json, tsconfig.json, vitest.config.ts, src/, test/, fixtures/
web/          package.json, package-lock.json, index.html, tsconfig.json, src/, public/, test/; vite.config.ts   (web or windows)
ios/          OurPoker/, OurPokerTV/, OurPokerTests/, OurPokerUITests/, VerificationSupport/, strings/; generate-project.ts  (ios, macos, tvos)
android/      app/, strings/; generate-project.ts                                                               (android)
desktop/      package.json, package-lock.json, src/, scripts/, test/                                          (windows)
rules/        the house rules file, its schema and text
resources/    strings.json, the text table the generated string files come from
verification/ end-to-end checks for the platforms
components/   one folder per component of the design; server-host's server/ holds wrangler.jsonc and start.ts
.aepm/        aepm's records: definition, lock, assembly, packages, receipts
.gitignore    what the repository leaves out (part 4, "Repository and releases")
.github/      workflows/: ci-server, release; ci-web (web), ci-android (android), platform-packages (windows),
              apple-testflight (ios, macos, tvos)                                         (publish or releases)
scripts/      build-windows.sh, inspect-windows.ps1 (windows); build-ipa.sh, build-apple-testflight.sh (ios, macos, tvos)
release/      app.json, what my-app.json says about the application                       (publish or releases)
```

Every value that depends on an answer is already in the installed files (aepm renders the templates), and the generated string files are shipped, so nothing has to be generated before the commands below; the Apple and Android `generate-project.ts` steps write the native projects from them. Tools: Node 26.5 with npm 11. Apple: Xcode 26 or later and XcodeGen. Android: JDK 17 or later and the Android SDK (platform 36); the project carries its Gradle wrapper. Windows: Node 26.5 on a Mac or on Windows to build the installer; Windows 10 or 11 (x64) to run it.

### Repository and releases

The application goes to the GitHub repository the `repository` answer names (the agent proposes `<login>/ourpoker`, with the login from `gh api user -q .login`). Needs git and the GitHub CLI signed in (`gh auth login`, then `gh auth setup-git` so git pushes with that sign-in). From the application folder, with `<owner>/<name>` the repository and `<version>` the recipe version:

```
printf '# Changelog\n\n## [0.1.0]\n\n### Added\n\n- First release.\n' > CHANGELOG.md
git init -b main && git add -A && git commit -m "OurPoker from ourapps-ae/ourpoker <version>"
gh repo create <owner>/<name> --private --source . --push
```

When the repository already exists, push to it instead: `git remote add origin https://github.com/<owner>/<name>.git && git push -u origin main`.

`.gitignore` leaves out dependencies, build outputs, signing keys and aepm's package copies and archives (`.aepm/packages/`, `.aepm/archives/`, 37 MB for the default design). aepm's records in `.aepm/` (definition, lock, assembly, receipts, evidence) are committed: they show which packages built the application. The machine that installed the application keeps the full `.aepm/` that `aepm verify` and updates need; aepm's update work folder (`.<name>.aepm-transaction/`) sits beside the application folder, outside the repository.

With `publish` or `releases` yes the application has GitHub Actions. A push to main runs `ci-server`, `ci-web`, `ci-android` and `platform-packages` (the unsigned Windows installer built, installed silently, started and uninstalled on Windows) for the parts that changed; each can also be started by hand (`gh workflow run ci-web.yml`). A version tag runs `release`: it builds the web client, the Android APK and the Windows installer the design has and publishes a GitHub Release (not a draft or pre-release) carrying `ourpoker.apk`, `web.zip`, the installer `ourpoker-<version>-windows-x64-unsigned.exe`, `icon.png`, `CHANGELOG.md` and, uploaded last, `my-app.json` for ourapps.app. The installer is attached but not offered in `my-app.json`: the ourapps contract lists a desktop package only after that package has passed download, install and start checks. `apple-platform-testflight` runs only when the store starts it for a Mac or Apple TV build.

The workflows read the secret names from `components/ourapps-release/server/release.json`, which aepm rendered from the reference answers: the reference in capitals, with hyphens as underscores, then a suffix. A secret that is not set is skipped, and that part stays unsigned or is not deployed:

| Answer (reference name) | Repository secrets, for the reference `ourpoker-...` shown | Without them |
|---|---|---|
| `androidSigning`: `ourpoker-android-signing` | `OURPOKER_ANDROID_SIGNING_KEYSTORE_BASE64` (the keystore file in base64), `OURPOKER_ANDROID_SIGNING_KEYSTORE_PASSWORD`, `OURPOKER_ANDROID_SIGNING_KEY_ALIAS`, `OURPOKER_ANDROID_SIGNING_KEY_PASSWORD` | the APK is signed with a debug key made for that run: it installs, but a later release installs only after the earlier one is removed |
| `webDeploy`: `ourpoker-web-deploy` | `OURPOKER_WEB_DEPLOY_API_TOKEN` (a Cloudflare token from the "Edit Cloudflare Workers" template), `OURPOKER_WEB_DEPLOY_ACCOUNT_ID` | the web client is released as `web.zip`, which ourapps.app serves |
| `hostingAccount`: `ourpoker-cloudflare-account` | `OURPOKER_CLOUDFLARE_ACCOUNT_API_TOKEN`, `OURPOKER_CLOUDFLARE_ACCOUNT_ACCOUNT_ID` | the release deploys no server |
| `storeCredentials`: `ourpoker-store-credentials` | `OURPOKER_STORE_CREDENTIALS_APP_ID`, `OURPOKER_STORE_CREDENTIALS_BUILD_TOKEN` (the app's id and build token from ourapps.app) | no store call: every target the release builds is on, and there is no iPhone, Mac or Apple TV TestFlight build |

The developer sets each secret; the agent never sees a value. `gh secret set OURPOKER_ANDROID_SIGNING_KEY_PASSWORD --repo <owner>/<name>` asks for the value; for the keystore, `base64 -i release.jks | gh secret set OURPOKER_ANDROID_SIGNING_KEYSTORE_BASE64 --repo <owner>/<name>`.

To offer the application on ourapps.app (optional), register it once: with the second prompt at https://ourapps.app/dev/agents, or `POST https://ourapps.app/api/dev/apps` with a developer key and `{"name": "OurPoker", "repo": "<owner>/<name>", "bundleId": "app.ourapps.ourpoker"}` (agents.md, Apps). Store the app id and the build token it returns as the two `storeCredentials` secrets, passing the values on standard input (`printf '%s' "$BUILD_TOKEN" | gh secret set OURPOKER_STORE_CREDENTIALS_BUILD_TOKEN --repo <owner>/<name>`). ourapps.app reads `my-app.json` from the repository's latest release, the address `ourapps-release.manifestUrl` holds.

Release a version:

```
git tag v0.1.0 && git push --tags
gh run watch
```

`gh run watch` follows the run (pick the release run). Each later version needs its own section in `CHANGELOG.md` (`## [0.1.1]`) before its tag; the release fails without one.

### Local: the server on Node and the web client in a browser (no account)

```
cd <application>/server
npm ci
npm run typecheck
npm test                 # the application's server tests: engine tests on Node, room tests in the local Workers runtime
npm start                # serves http://127.0.0.1:8788 (PORT, HOST and DATA_DIRECTORY change port, interface and room storage)
```

In a second terminal:

```
cd <application>/web
npm ci
npm run typecheck
npm run dev              # http://localhost:5173; or `npm run build` then `npx vite preview --port 5173`
```

Open the address Vite prints (`http://localhost:5173`, or the next free port when that one is taken); the server accepts the web client from any localhost or 127.0.0.1 port. The web client calls the design's `serverAddress` (default `http://localhost:8788`); `VITE_SERVER=<address> npm run build` builds it against another server. With video in the design the server reads `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from its environment (a LiveKit account); without them every other part works and video stays off.

### Own hardware

The local commands are the deployment: run `npm ci` and `npm start` in `server/` on the machine with `HOST=0.0.0.0`, a `PORT` and a `DATA_DIRECTORY` that is backed up, behind a proxy that terminates https. Build the web client with `npm run build` in `web/` and serve `web/dist/` at the `webAddress` answer. No account is needed.

### Cloudflare (needs a Cloudflare account)

```
cd <application>/server
npm ci
npx wrangler login       # once, in a browser (or export CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN); hostingAccount is not read here
npm run deploy           # wrangler deploy --config ../components/server-host/server/wrangler.jsonc
```

Wrangler prints the worker's address. The worker's name is the `name` in `components/server-host/server/wrangler.jsonc`, `<roomPrefix>server` (`ourpoker-server` for the default answers), so the address is `https://ourpoker-server.<your subdomain>.workers.dev`; with `npm run deploy -- --name <name>` the worker is `<name>` and the address `https://<name>.<your subdomain>.workers.dev`. `curl <address>/health` answers `{"ok":true,"app":"ourpoker"}`. `npm run dev` runs the same worker in the local Workers runtime with no account. Video needs the LiveKit values as Worker secrets: `npx wrangler secret put LIVEKIT_API_KEY --config ../components/server-host/server/wrangler.jsonc` and the same for `LIVEKIT_URL` and `LIVEKIT_API_SECRET`.

### Two-step deploy

The clients carry the server's address, which is known only after the server's first deploy:

1. Install with `serverAddress` left at its default, then deploy the server (Cloudflare above, or own hardware) and note its https address.
2. Add `serverAddress` with that address, and `webAddress` with the https address the web client will be served from, to `answers.json`. Run `aepm design`, `aepm resolve` and `aepm install` again into a new APP (part 3, steps 4, 5 and 7; or update the installed application with `aepm propose-update`, `aepm approve` and `aepm apply`).
3. Deploy the server again from the new APP: it accepts the web client only from `webAddress` (and from localhost). Then build the clients below.

For a web client run on localhost, `VITE_SERVER=<address> npm run build` alone points it at the deployed server without reinstalling.

Publishing the web client: copy `web/dist/` to the host at the `webAddress` answer (the account named by `webDeploy`). On Cloudflare, from `web/` after `npm run build`, with the server's Wrangler:

```
node -e 'const fs = require("fs"), d = fs.readFileSync("../components/server-host/server/wrangler.jsonc", "utf8").match(/"(\w+_date)": "([^"]+)"/); fs.writeFileSync("wrangler.jsonc", JSON.stringify({ name: process.argv[1], [d[1]]: d[2], assets: { directory: "./dist" } }))' <name>
../server/node_modules/.bin/wrangler deploy
```

The first line writes `web/wrangler.jsonc`: the worker name, the server's date setting and the `dist` folder as static files. It serves at `https://<name>.<your subdomain>.workers.dev`, the subdomain the server's deploy printed; answer `webAddress` with that address in step 2.

To check a web client in a browser, built and served here or deployed (headless Chrome; it sits at an empty table, plays to a dealt hand through the page's own controls, ends that game and leaves):

```
cd <application>/web
WEB_CHECK_URL=https://<web worker>.<your subdomain>.workers.dev/ WEB_CHECK_SERVER=https://<server worker>.<your subdomain>.workers.dev WEB_CHECK_OUT=/tmp/web-check node test/browser.mjs
```

It prints one `PASS` line per step and keeps screenshots of home, lobby and the table (1280x800 and 390x844) in `WEB_CHECK_OUT`. Any http or https addresses work, so the same command checks `npx vite preview` against the server on this machine.

### Apple (Xcode; an Apple developer membership only for devices and TestFlight)

```
cd <application>/ios
node generate-project.ts         # project.yml, the Info.plist files and the string catalogue of the design's languages (SERVER_ADDRESS=<address> overrides the address)
xcodegen generate
xcodebuild -project OurPoker.xcodeproj -scheme OurPoker -destination 'generic/platform=iOS Simulator' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -project OurPoker.xcodeproj -scheme OurPoker -destination 'generic/platform=macOS,variant=Mac Catalyst' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -project OurPoker.xcodeproj -scheme OurPokerTV -destination 'generic/platform=tvOS Simulator' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
```

The `OurPoker` scheme builds iPhone, iPad and Mac (Mac Catalyst); `OurPokerTV` exists when `tvos` is a target. Signed builds read the team and profile from `OURPOKER_TEAM` and `OURPOKER_PROFILE` (the prefix is the application's `signingEnvironmentPrefix`).

### Android (the Android SDK; a signing key only for release builds)

On a Mac with Homebrew, once:

```
brew install --cask temurin android-commandlinetools
export ANDROID_HOME=$(brew --prefix)/share/android-commandlinetools
export JAVA_HOME=$(/usr/libexec/java_home)
yes | sdkmanager --sdk_root=$ANDROID_HOME --licenses
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"
# for an emulator (on an Intel Mac, x86_64 in place of arm64-v8a):
sdkmanager --sdk_root=$ANDROID_HOME "emulator" "system-images;android-36;google_apis;arm64-v8a"
avdmanager create avd -n ourpoker -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_7
```

Build, test and run:

```
cd <application>/android
node generate-project.ts         # the Gradle files and wrapper, the manifest and the design's languages' strings
./gradlew :app:assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:testDebugUnitTest
$ANDROID_HOME/emulator/emulator -avd ourpoker &
$ANDROID_HOME/platform-tools/adb wait-for-device shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 1; done'
$ANDROID_HOME/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
$ANDROID_HOME/platform-tools/adb shell am start -n <packageId>/.MainActivity
```

The app calls the design's `serverAddress`; `./gradlew :app:assembleDebug -PserverUrl=<address>` builds it against another server. In the emulator `localhost` is the emulator itself: for the server running on the Mac, build with `-PserverUrl=http://10.0.2.2:8788`. `-PversionName=<version>` sets the version the app shows (local builds show `0.0.0-dev`). Release builds (`./gradlew :app:assembleRelease`) read the keystore from `OURPOKER_KEYSTORE`, `OURPOKER_KEYSTORE_PASSWORD`, `OURPOKER_KEY_ALIAS` and `OURPOKER_KEY_PASSWORD` (from the secret named by `androidSigning`).

### Windows (built on a Mac or on Windows)

```
cd <application>/web
npm ci
cd <application>/desktop
npm ci
npm run check            # the desktop tests
npm run build            # builds the web client in desktop mode into desktop/build/web
npm start                # runs the desktop application on this machine
APP_VERSION=<version> npm run package:win   # artifacts/<applicationId>-<version>-windows-x64-unsigned.exe, an unsigned x64 installer
```

On Windows use the same commands in PowerShell, with `$env:APP_VERSION='<version>'; npm run package:win`. On a Windows 10 or 11 machine, `<installer>.exe /S /D=<folder>` installs without questions (or run it and follow the installer); `<folder>\<applicationName>.exe` starts the application and `"<folder>\Uninstall <applicationName>.exe" /S` removes it. The installer is unsigned: a copy marked as downloaded from the internet meets SmartScreen's warning, and Smart App Control, where it is on, can refuse it. The application calls the design's `serverAddress`; for the Mac's own server, forward it to the Windows machine, for example `ssh -R 127.0.0.1:8788:localhost:8788 <windows machine>`. Building and packaging need no account.

### Versions

Every client shows the version it was built with; a build given none shows `dev` (web and Windows), `0.0.0-dev` (Android) or `0.0.0` (Apple). The release workflow sets them from the `v<version>` tag. For a local build:

| Client | How to give the version |
|---|---|
| Web | `VITE_APP_VERSION=<version> npm run build` in `web/` (`APP_VERSION` is read when `VITE_APP_VERSION` is not set) |
| Windows | `APP_VERSION=<version> npm run package:win` in `desktop/`: the installer, the executable and the page inside it |
| Android | `./gradlew :app:assembleDebug -PversionName=<version> -PversionCode=<number>` (the code is a whole number that rises with each release) |
| Apple | `xcodebuild ... -derivedDataPath build/DerivedData MARKETING_VERSION=<version> CURRENT_PROJECT_VERSION=<number> build` |

## 5. For maintainers of the recipe repository

Commands run from the root of the recipe's repository with Node 26.5 and Python 3.12. `PY` is `python3 -B` with an aepm checkout on `PYTHONPATH`. Set `OURPOKER_COMPONENTS` to a folder holding one checkout per component, each named as the component (`web-host`, `server-host`, ...), and `OURAPPS` to a checkout of the ourapps catalogue (its recipe validator).

```
node --test tests/recipe.test.ts
node --test tests/portable.test.ts
PY tests/evaluate_recipe_test.py
PY tests/conditional_artefacts_test.py
PY authoring/check_conditional_artefacts.py -v
PY authoring/try_install.py        (packs, signs, reviews and installs designs, then builds and runs them: parts 3 and 4)
node "$OURAPPS/scripts/validate-recipe-file.ts" recipe.json --components "$OURPOKER_COMPONENTS"
gradle -p authoring/kotlin-stand-ins compileKotlin   (type-checks the Kotlin stand-ins without the Android SDK)
npm install --prefix authoring        (once: @bufbuild/cel for the condition parity test)
PY scripts/make_component.py --render
PY scripts/make_source.py
PY authoring/make_recipe.py
PY authoring/draw_default_design.py
```

- `tests/recipe.test.ts` checks consistency only: the recipe passes the ourapps catalogue validator with the components' settings and profiles; every component exists at the named version in `components/`; every setting a question or the configuration sets exists with a matching type and grammar; no secret is in `configuration`; inclusion is by `includedWhen` only; every connection uses ports and types that exist and only optional requirements stay open; every job candidate profile exists; every answer in the answer sets is allowed; the recipe restates no number of the house rules file and sets the application's copy of each answer; the totals in `INTEGRATION-GAPS.md` match its table; the recipe's documents carry no history wording.
- `tests/evaluate_recipe_test.py` runs aepm's evaluator (`aepm.recipe`, the same code as `aepm design`) on each answer set, on every combination of the answers that change inclusion, asking and selection, and on each error code, and validates each design with aepm's definition validator. It evaluates every condition of `recipe.json` and a set of sample expressions for every answer set and every combination with aepm's CEL subset and compares each result with `@bufbuild/cel` (`authoring/cel_evaluate.mjs`, installed under `authoring/`, which is not packaged). `tests/recipe.test.ts` reads the ourapps validator from `OURAPPS`.
- `tests/conditional_artefacts_test.py` and `authoring/check_conditional_artefacts.py` check, for every answer set, that the files aepm installs reach no component the design leaves out, that every stand-in replaces a marked module at its destination, and that every relative import of an installed file is installed.
- `make_recipe.py` rewrites `recipe.json` from the components' manifests and the settings written in the script. `draw_default_design.py` evaluates the default answers and draws the result with aepm's generator.
- `authoring/try_install.py [ANSWERS ...]` proves parts 3 and 4 for answer sets (default: `default`, `local-web`, `fill-empty-own-hardware`, `lounge-web-ios`): it packs the 39 components and this recipe into a temporary store, signs releases and reviews with disposable identities, installs each design with `aepm install`, type-checks the server and web code, runs the server tests, starts the server on Node, checks in headless Chrome at 1280x800 that the built web client loads, lists the rooms from the server, seats a player and deals a hand with a computer player (or a second person) with the table inside the window, keeping screenshots of home, lobby and table, builds the Apple schemes for the iOS and tvOS simulators and checks that the app carries only the answered languages, and generates the Android project and checks its string folders (it builds it with `./gradlew` where `ANDROID_HOME` names an Android SDK). It needs Chrome (`--chrome` or `CHROME`), Xcode and XcodeGen for Apple designs, and network access for npm. Options, for designs with the target: `--android` builds against the local server, runs the unit tests and plays a hand on the emulator `--avd` (default `ourpoker`); `--windows HOST` packages the installer, then over ssh installs it silently on HOST, plays a hand in the installed application and uninstalls it (where Smart App Control refuses the unsigned installer, it plays the unpacked application instead and the result says so); `--cloudflare NAME` runs the two-step deploy as workers NAME and NAME-web and the browser check against them (Wrangler logged in; the workers stay deployed); `--github REPO` follows "Repository and releases" for a design with the release pipeline: it pushes a fresh install with `CHANGELOG.md` to the private repository REPO, waits for every workflow a push starts (starting by hand any the push left untouched), pushes the tag (`--github-tag`, default `v0.1.0`), waits for the release run, and checks the release: published, `my-app.json` valid and pointing at the APK and `web.zip`, the APK of that version played on the emulator with `--android`, the Windows installer an unsigned NSIS installer of the unsigned x64 application of that version, and `web.zip` served and drawn in Chrome (gh signed in; the repository stays).
- `INTEGRATION-GAPS.md` is the integration status: the open items between the components and the recipe, the decisions taken, and what is not built. 

### What the test answer sets cover

| id | what differs from the defaults | covers |
|---|---|---|
| `default` | nothing: all six devices, small, four languages, 9 players, 5,000 chips, 600 s levels, one rebuy, 30 s decisions, computer players on request, video, lessons, Cloudflare, no updates, not published | every component but `store-update` and `ourapps-release` (no GitHub Actions: not published, no releases answer); no signing or deployment reference |
| `book-club` | `ios`, `android`, `tvos`; `en`, `fr`; no video; 3,000 chips; small; published | the worked example: `web-host`, `windows-desktop`, `video-calls` and `store-update` out; free tiers; GitHub Actions with the Android and Apple workflows |
| `poker-league` | medium; published; updates on, with an invitation and a web address | `store-update` and `ourapps-release` in: every conditional component; medium load still on free tiers |
| `company-event` | large; `own-hardware`; updates on | `own-hardware` server and realtime profiles; paid video |
| `company-event-hosted` | large; Cloudflare; published; updates on | `cloudflare-paid`, realtime `paid`, video `paid`, with the Cloudflare account reference set |
| `tv-only` | `tvos` only; `en`; no video; no lessons | a single client target; `apple-host` only |
| `browser-only-no-extras` | `web` only; no rebuys; computer players none; no lessons, video or updates | the smallest design: every host but `web-host` out; computer players off |
| `large-paid-host` | large; Cloudflare; published; lounge look; 6 players; 3 rebuys; fill-empty; a bundle id; a video service address | the scale choosing the paid host; answers that set several components |
| `clinic` | `web` and `windows`; small; `own-hardware`; `en`, `es`; no video or lessons; an https web address | own hardware for a small group with desktop and web |
| `no-computers` | `web` and `android`; computer players none | `computer-players.mode` none |
| `web-own-hardware` | `web` only; `own-hardware`; `en`, `fr`; computer players none; no video or lessons | a web and Node server design with every optional module replaced by its stand-in |
| `native-no-lessons` | `ios`, `android`, `tvos`; `en`, `fr`; no lessons; updates on, with an invitation | native clients with video and updates and the lessons' stand-ins |
| `fill-empty-own-hardware` | `web`; `en`; no video or lessons; own hardware; fill-empty; 8 players | one person starts alone and computers fill the table |
| `lounge-web-ios` | `web`, `ios`; medium; `en`, `fr`; lounge; 8 players; fill-empty; no video; own hardware | the lounge look on web and iPhone |
| `local-web` | only `targets` `web`, `scale` small, `languages` `en`, `video` no, `server` `own-hardware` | the shortest answers for a local web and Node design: no reference is asked |
| `windows-only` | `windows` only; `own-hardware`; no video; a deployed server address | Windows alone keeps `web-host`, whose web project the Windows build packs |

Other combinations of answers are allowed: `tests/evaluate_recipe_test.py` evaluates every combination of devices, video, lessons, updates, publishing, computer players, server and scale, and checks only that the design is complete (every non-optional requirement connected once), not what is built from it.
