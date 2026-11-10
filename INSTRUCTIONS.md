# OurPoker recipe: instructions

Package `ourapps-ae/ourpoker` 0.3.2. Part 1 is for the agent that answers the questions, part 2 for the developer who owns the accounts. `recipe.json` is the source of truth; this file explains how to use it.

## 1. For the agent

### Answering

Answer from the person's description whatever it settles. Ask the person only what the description leaves open and the table below marks "ask". Never invent a secret, an account name, an address or a hosting account. An answer must be an allowed option or inside the range given in `recipe.json`; the defaults are the paper's house rules. A question with `askWhen` is asked only when its condition holds; otherwise it takes its default and any answer given for it is ignored.

Ask in this order. A question only matters if the earlier ones left it open.

| # | id | type, allowed answers | asked when | default | infer from the request | ask the person when |
|---|---|---|---|---|---|---|
| 1 | `targets` | set of `web ios android macos windows tvos` | always | all six | "phones" is ios and android; "television" is tvos; "computers" is macos and windows; "browser" is web | no device is named |
| 2 | `webAddress` | text, an http or https address | `targets` contains `web` | `http://localhost:5173` | the developer's own address | the web version is to be served somewhere other than this machine |
| 3 | `bundleId` | text, for example `com.yourname.poker` | always | empty: the application derives `app.ourapps.ourpoker` | a name the developer gives | never |
| 4 | `scale` | `small` `medium` `large` | always | small | a dozen friends once a week is small; a club or a few dozen playing daily is medium; 100 or more playing continuously is large | the group size is not stated |
| 5 | `languages` | set of `en fr de es` | always | all four | the languages named | never |
| 6 | `look` | `night` `lounge` | always | night | dark or warm style words | never |
| 7 | `players` | integer 2 to 9 | always | 9 | the largest group at one table | never |
| 8 | `startingChips` | integer 100 to 1000000 | always | 5000 | the number named | never |
| 9 | `levelSeconds` | integer 60 to 3600 | always | 600 | minutes converted to seconds | never |
| 10 | `rebuys` | integer 0 to 5 | always | 1 (until level 3) | "no rebuys" is 0 | never |
| 11 | `decisionSeconds` | integer 5 to 300 | always | 30 (then check or fold) | a pace named | never |
| 12 | `computerPlayers` | `none` `on-request` `fill-empty` | always | on-request | "people only" is none; "full tables" is fill-empty | never |
| 13 | `video` | yes or no | always | yes | "no video", or everyone in one room, is no | never |
| 14 | `videoServiceUrl` | text, an address (empty to set it later) | `video` is yes | empty | the developer's LiveKit address | video is on |
| 15 | `videoKey` | secret reference name | `video` is yes | none | never a value | video is on |
| 16 | `videoSecret` | secret reference name | `video` is yes | none | never a value | video is on |
| 17 | `lessons` | yes or no | always | yes | "everyone already knows the game" is no | never |
| 18 | `server` | `cloudflare` `own-hardware` | always | none | nothing: ask | always, unless the person already named the provider |
| 19 | `hostingAccount` | secret reference name (lowercase letters, digits, hyphens) | `server` is `cloudflare` | none | never a value | a hosting provider is chosen |
| 20 | `updates` | yes or no | always | no | updates or keeping apps current is yes | never |
| 21 | `storeInvitation` | text, an address (empty to set it later) | `updates` is yes | empty | the developer's ourapps.app invitation | updates are on |
| 22 | `storeCredentials` | secret reference name | `updates` is yes, or `targets` contains `ios` | none | never a value | updates are on or an iPhone and iPad build is wanted (without it the release has no store call and no iOS job) |
| 23 | `androidSigning` | secret reference name | `targets` contains `android` | none | never a value | Android is a target |
| 24 | `webDeploy` | secret reference name | `targets` contains `web` | none | never a value | the web is a target |

### What each answer changes

An empty text answer writes nothing: the setting keeps its recipe value or default. A secret reference answer is a name, never a value; the design records `{"secretRef": name}` for a secret setting and the plain name for `server-host.accountReference`.

| Answer | Components included | Settings set |
|---|---|---|
| `targets` contains `web` / `ios`, `macos` or `tvos` / `android` / `windows` | `web-host` / `apple-host` / `android-host` / `windows-desktop` | `ourapps-release.targets` and `apple-host.targets` get the whole list joined by single spaces, lower case (apple-host reads `ios`, `macos` and `tvos` from the list and ignores the other devices) |
| `webAddress` | none | `web-host.webAddress`, `application.webAddress`, `server-host.allowedOrigins`, `invitations.inviteAddress` |
| `bundleId` | none | `apple-host.bundleIdentifier`, `android-host.packageId`, `ourapps-release.bundleIdentifier`, `application.packageId` (all `app.ourapps.ourpoker` when empty) |
| `scale` | none directly (see "Scale and profiles") | none |
| `languages` | none | `translations.languages`, the chosen languages joined by spaces (for example `en fr`) |
| `look` | none | `theme.themeName`; `card-graphics.backStyle` (night: stripes, lounge: plain) |
| `players` | none | `seating.maximumPlayers`, `holdem-rules.seats`, `chip-ledger.seats`, `room-directory.roomCapacity`, `application.maximumPlayers` |
| `startingChips` | none | `tournament.startingStack`, `tournament.rebuyStack`, `application.startingStack` (not chip-ledger's `startingStack`: the tournament issues the chips) |
| `levelSeconds` | none | `level-schedule.levelSeconds`, `application.levelSeconds` |
| `rebuys` | none | `tournament.rebuysPerPlayer`, `application.rebuysPerPlayer` (0 removes rebuy offers) |
| `decisionSeconds` | none | `game-clock.decisionSeconds`, `turn-engine.decisionSeconds`, `application.decisionSeconds` |
| `computerPlayers` | `none` leaves out `computer-players` and `poker-strategy` (turn-engine's requirement is optional) | `computer-players.mode`, `application.computerPlayers` |
| `video` yes | `video-calls` | none; `videoServiceUrl` sets `video-calls.serviceUrl`; `videoKey` and `videoSecret` set `video-calls.keyReference` and `video-calls.secretReference` |
| `lessons` yes | `guided-tour` | none |
| `server` | none | none directly: it restricts the `server` and `realtime` jobs (see "Scale and profiles"); `hostingAccount` sets `server-host.accountReference` |
| `updates` yes | `store-update` | `application.updatesEnabled`; `storeInvitation` sets `store-update.inviteAddress` and `application.inviteAddress` |
| `storeCredentials`, `androidSigning`, `webDeploy` | none | `ourapps-release.storeCredentials`, `.androidSigning`, `.webDeploy` |

A component is in the design only through its `includedWhen` in `recipe.json`; no question effect includes anything. `apple-host` is in when `targets` contains any of `ios`, `macos`, `tvos`. `computer-players` and `poker-strategy` are out when `computerPlayers` is `none` (turn-engine's `computer-players` requirement is optional, and `make_recipe.py` asserts it). The application's files that import an optional component carry `component: "ourapps-ae/<name>"` in `component.json` and are installed only with it (rule 25); files of the core that import those modules are not conditional (INTEGRATION-GAPS.md G10.4).

`application.<setting>` names a setting of the recipe's own component (`component.json`). The six that change the house rules (`maximumPlayers`, `startingStack`, `levelSeconds`, `rebuysPerPlayer`, `decisionSeconds`, `computerPlayers`) are written over `rules/texas-holdem-house-rules.json` by the server when it starts, and each component is built from the result; the rules file is the one source of those numbers, and `recipe.json` does not restate any number the rules file states (`rules-settings.rulesFile` is `texas-holdem-house-rules`). `guest-identity` keeps its own defaults, which the application uses too.

Forms of a `sets` value in `recipe.json` (the evaluation rules, component-standard.md): a literal; `"$answer"` (the answer; a set joined with spaces); `{"map": {...}}` (a choice answer to a value, covering every option); `{"fromScale": "<load key>"}`; `{"template": "prefix-{{answer}}"}`; `{"ref": "<secretRef question>"}`. This recipe uses `$answer`, `map` and `ref`. There is no `includes`, `$job`, `null` or `mapEach`.

### Scale and profiles

The `scale` answer picks a band; the band's load (`concurrentPeople`, `requestsPerDay`, `storedMegabytes`) is compared with the load each candidate profile declares in its component's `suitability.json`. Per job, the `server` answer first restricts the `server` and `realtime` candidates to the ones it names (`cloudflare` names `cloudflare-free` and `cloudflare-paid`, and realtime-rooms' Cloudflare profiles; `own-hardware` names the `own-hardware` profiles); then the lowest-cost candidate whose declared maxima cover the band is chosen (a missing maximum means no practical limit; none 0, free 1, paid 2, metered 3; ties go to the first). `server-host.provider` is written from the chosen profile. If none covers the band, report the uncovered job to the developer; do not pick a candidate that does not fit. A job whose component is left out (`video` when video is no) selects nothing.

| Band | People at once | Requests a day | Stored MB | `server` job (Cloudflare answered) | `realtime` job | `video` job |
|---|---|---|---|---|---|---|
| small | 10 | 2,000 | 100 | `cloudflare-free` | `free` | `free` |
| medium | 100 | 50,000 | 1,000 | `cloudflare-free` | `free` | `free` (covers 100 at once exactly) |
| large | 1,000 | 1,000,000 | 10,000 | `cloudflare-paid` | `paid` | `paid` (1,000 at once; `scale` covers 5,000) |

With `server` = `own-hardware` the `server` and `realtime` jobs resolve to the `own-hardware` profiles at every band (no cost, no declared limits).

Changing `scale` later swaps components that keep data with a migration (paper Section 3.11); do not rebuild from scratch.

### Settings fixed by the recipe

Names and identifiers fixed in `recipe.json`: application id `ourpoker`, bundle and package identifier `app.ourapps.ourpoker` unless `bundleId` is answered. No address is fixed: the web address, video service address and store invitation come from questions. `application.serverAddress` has its local default (`http://localhost:8788`): the server's address is known only after the first deploy. Never guess a domain.

## 2. For the developer

### Accounts and secrets, by reference only

Supply each secret to the tool that runs the build as a named reference, never as a value in the recipe, the answers or the design. The questions ask only for the reference name.

| Needed when | Account | Question that names the reference | Notes |
|---|---|---|---|
| `server` = `cloudflare` | A Cloudflare account | `hostingAccount` (a slug) | `realtime-rooms` and `server-host` run on Workers with SQLite-backed Durable Objects |
| `updates`, or an iPhone and iPad target | Apple developer membership (the one paid item the paper names for delivery) | `storeCredentials` | signing and TestFlight upload through `ourapps-release` |
| `android` | A signing key for the Android package | `androidSigning` | |
| `web` | A hosting account for the web files | `webDeploy` | |
| `video` yes | A LiveKit Cloud account | `videoKey`, `videoSecret` (the API key and secret); the service address is `videoServiceUrl` | the deployment resolves the references into `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| `server` = `own-hardware` | A machine that runs Node and a way to deploy to it | none | no account; the room code runs through `serveNode` |

### Free tiers and limits (from each component's `suitability.json`, checked 2026-11-09)

- `server-host` `cloudflare-free`: Workers Free, 100,000 requests a day (Error 1027 after that), 10 ms of processor time a request, 5 GB stored in Durable Objects. `cloudflare-paid`: metered, $5 a month minimum, no request limit, 10 GB per Durable Object. `own-hardware`: no provider limit; capacity depends on the machine, one process, no failover; no limit source is cited.
- `realtime-rooms` `free` and `paid`: the same Cloudflare limits.
- `video-calls` (LiveKit Cloud): `free` is the Build plan, 100 people connected at once, 5,000 participant minutes a month, 50 GB downstream, no card; `paid` is Ship, from $50 a month, 1,000 at once; `scale` is Scale, from $500 a month, 5,000 at once. Usage above the allowance is billed on the paid plans.
- `room-directory` declares 1,000 connections at once (its own default, not a provider limit), which covers the large band.
- Everything else is a pure library or a host with no hosted service: `any` profile, cost none.

A small group stays inside the free tiers: the small and medium bands both fit `cloudflare-free` and LiveKit `free`.

### Checking the result

From `recipes/ourpoker/` with node 26.5.0 and python 3.12.8 (`PY` is python3.12 with `PYTHONPATH=../../aepm`):

```
node --test tests/recipe.test.ts
node --test tests/portable.test.ts
PY -B tests/evaluate_recipe_test.py
PY -B tests/conditional_artefacts_test.py
PY -B authoring/check_conditional_artefacts.py -v
(cd ../../ourapps && node scripts/validate-recipe-file.ts ../recipes/ourpoker/recipe.json --components ../components)
PY -B scripts/make_component.py --render
PY -B authoring/make_recipe.py
PY -B authoring/draw_default_design.py
```

- `tests/recipe.test.ts` checks consistency only: the recipe passes the ourapps catalogue validator with the components' settings and profiles; every component exists at the named version in `components/`; every setting a question or the configuration sets exists with a matching type and grammar; no secret is in `configuration`; inclusion is by `includedWhen` only; every connection uses ports and types that exist and only optional requirements stay open; every job candidate profile exists; every answer in the answer sets is allowed; the recipe restates no number of the house rules file and sets the application's copy of each answer; the totals in `INTEGRATION-GAPS.md` match its table; the recipe's documents carry no history wording.
- `authoring/evaluate_recipe.py` is a reference evaluator of the evaluation rules in component-standard.md. It is used only by tests, to show the rules are complete: it turns answers into an aepm application definition and does not assemble, resolve, install or run anything. `tests/evaluate_recipe_test.py` runs it on each answer set, on every combination of the answers that change inclusion, asking and selection, and on each error code.
- `make_recipe.py` rewrites `recipe.json` from the components' manifests and the settings written in the script. `draw_default_design.py` evaluates the default answers and draws the result with aepm's generator.
- `INTEGRATION-GAPS.md` is the integration status: the open items between the components and the recipe, the decisions taken, and what is not built. Read it before assembling.

### What the test answer sets cover

| id | what differs from the defaults | covers |
|---|---|---|
| `default` | nothing: all six devices, small, four languages, 9 players, 5,000 chips, 600 s levels, one rebuy, 30 s decisions, computer players on request, video, lessons, Cloudflare, no updates | every component but `store-update` |
| `book-club` | `ios`, `android`, `tvos`; `en`, `fr`; no video; 3,000 chips; small | the paper's worked run: `web-host`, `windows-desktop`, `video-calls` and `store-update` out; free tiers |
| `poker-league` | medium; updates on, with an invitation and a web address | `store-update` in; medium load still on free tiers |
| `company-event` | large; `own-hardware`; updates on | `own-hardware` server and realtime profiles; paid video |
| `company-event-hosted` | large; Cloudflare; updates on | `cloudflare-paid`, realtime `paid`, video `paid`, with the Cloudflare account reference set |
| `tv-only` | `tvos` only; `en`; no video; no lessons | a single client target; `apple-host` only |
| `browser-only-no-extras` | `web` only; no rebuys; computer players none; no lessons, video or updates | the smallest design: every host but `web-host` out; computer players off |
| `large-paid-host` | large; Cloudflare; lounge look; 6 players; 3 rebuys; fill-empty; a bundle id; a video service address | the scale choosing the paid host; answers that set several components |
| `clinic` | `web` and `windows`; small; `own-hardware`; `en`, `es`; no video or lessons | own hardware for a small group with desktop and web |
| `no-computers` | `web` and `android`; computer players none | `computer-players.mode` none |

Other combinations of answers are allowed: `tests/evaluate_recipe_test.py` evaluates every combination of devices, video, lessons, updates, computer players, server and scale, and checks only that the design is complete (every non-optional requirement connected once), not what is built from it.
