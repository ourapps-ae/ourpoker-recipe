# OurPoker

A complete Texas hold'em game with two tables of two to nine players each. People play on phones, tablets, computers or the web; a television or any shared screen shows the public table; players can see and hear each other by video; computer players can fill empty seats; play has decision clocks, rising blinds and rebuys; and the game speaks English, French, German and Spanish.

## Who it is for

A group that wants its own poker night without accounts or an app store: a book club, a club's league night, a poker league, a company event. The group's developer owns the accounts and the server; nothing runs on our platform.

## Devices

Web, iPhone and iPad, Android, Mac, Windows and Apple TV. Each is a switch; the devices question decides which are built. The television shows the public table only and cannot act or see private cards.

## House rules by default

Two to nine players at a table, 5,000 chips each, blind levels of 10 minutes that double after level 16, 30 seconds to act before the game checks or folds, one rebuy of 5,000 chips until level 3, side pots, no-limit betting.

## The questions

An agent answers them from your description and asks you only what it cannot infer; the server location is always asked. Fourteen are the main questions; fourteen follow-ups, most asked only when they apply (a web address, a bundle identifier, the server address after the first deploy, whether builds are published, the GitHub repository for the code, whether GitHub Actions build releases, the video service address, the store invitation, and the references to your hosting account and, only when publishing, your video, store, Android and web deployment secrets). Building and running it on your own machine needs no secret at all.

1. Which devices? (any of web, ios, android, macos, windows, tvos)
2. How many people play at the same time? (small: up to 10; medium: 11 to 100; large: 101 to 1,000)
3. Which languages? (en, fr, de, es)
4. Which look? (night: dark green felt and striped card backs; lounge: warm brown and plain card backs; for the whole application)
5. How many players per table? (2 to 9; there are always two tables, so at most 18 play at once and anyone else watches)
6. Starting chips? (5,000)
7. How long is each blind level? (600 seconds)
8. How many rebuys? (1, until level 3)
9. Decision time? (30 seconds, then check or fold)
10. Computer players? (none; on request; or fill empty seats, so one person can start alone; on request)
11. Video and audio between players? (yes)
12. Lessons for new players? (yes)
13. Where does the server run? (Cloudflare or your own hardware)
14. Offer updates through ourapps.app? (no)

## What the answers choose

- Devices include or leave out the web, Apple, Android and Windows hosts.
- Lessons, video and updates each include or leave out their component. Computer players are in the design unless the answer is none; the answer sets their mode (on request or fill empty) and none leaves out computer-players and poker-strategy.
- The scale answer chooses, per job, the cheapest candidate whose declared load covers it: small and medium use Cloudflare's free tier and LiveKit's free plan; large uses the paid Cloudflare plan and LiveKit's Ship plan. Your own hardware is the other server choice; with it the scale changes only the video plan.
- Chips, level length, rebuys, decision time and player count set the settings of the components that own them and the matching numbers of the house rules file, with no code change.

## What it needs from you

- A Cloudflare account, or a machine of your own, for the server.
- An Apple developer membership for iPhone, iPad, Mac and Apple TV builds.
- A LiveKit Cloud account if video is on.
- A GitHub account: the code goes to a private repository of yours.
- Signing and deployment keys for the targets you publish, kept as the repository's secrets.

Secrets are given by reference only; no key is written into the recipe, the answers or the application.

## Components

39 components in five groups (delivery and hosts; rooms, people and sessions; turn-based game framework; poker; interface and presentation) plus the recipe's own application-specific component: screen flow, artwork, text in four languages, lessons and end-to-end tests. Thirty-five of the 39 have nothing to do with poker. The diagram names every component, grouped, with the connections of the default design; store-update is dashed because it is present only when updates is yes.

Each component sits in a slot named after it: the slot's class is what the recipe relies on (the interfaces it connects and the settings it writes), and the component named is the one the recipe prefers. Any catalogue component of the same class can take its place: `aepm alternatives ourpoker@<version> <slot>` lists them and `aepm design ... --substitute <slot>=<name>@<version>` uses one. `ourapps-ae/theme-high-contrast`, for example, fills the `theme` slot with high-contrast night and lounge looks.

## Building it

With aepm and the published catalogue: `aepm fetch ourpoker@0.5.0 --with-dependencies --store STORE`, then read the recipe's INSTRUCTIONS.md from the fetched archive:

```
python3 -c 'import json,sys,tarfile; s,v=sys.argv[1:]; d=next(e["digest"] for e in json.load(open(s+"/catalogue.json"))["entries"] if e["name"]=="ourapps-ae/ourpoker" and e["version"]==v); sys.stdout.write(tarfile.open(f"{s}/objects/{d}.tar").extractfile("INSTRUCTIONS.md").read().decode())' STORE 0.5.0 > INSTRUCTIONS.md
```

It takes you through `aepm questions`, `aepm design`, `aepm resolve` and `aepm install`, then the build and run commands for each device.

### Repository and releases

The installed application goes to your GitHub repository (the agent proposes `<your login>/ourpoker`, made private):

```
git init -b main && git add -A && git commit -m "OurPoker from ourapps-ae/ourpoker <version>"
gh repo create <owner>/<name> --private --source . --push
```

When builds are published (or the releases answer is yes), the installation also holds GitHub Actions: checks of the server, web, Android and Windows parts on every push, and a release workflow. `git tag v0.1.0 && git push --tags` builds the web client, the Android APK and the Windows installer and publishes a GitHub Release with `my-app.json`, the file ourapps.app reads to offer the app. Signing and deployment keys are repository secrets you set yourself with `gh secret set`, named from your reference answers (INSTRUCTIONS.md lists every name); without them the Android build is signed with a temporary key, the Windows installer is unsigned and the web client is released as `web.zip`. Registering the app on ourapps.app is optional.

## Tested answer sets

The default answers, `book-club`, `poker-league`, `company-event`, `company-event-hosted`, `tv-only`, `browser-only-no-extras`, `large-paid-host`, `clinic`, `no-computers`, `web-own-hardware`, `native-no-lessons`, `local-web`, `fill-empty-own-hardware`, `lounge-web-ios` and `windows-only`; every combination of devices, video, lessons, updates, publishing, computer players, server and scale is checked to give a complete design.

## Status

Version 0.5.0. Installed with `aepm install` from signed packages and built and run: the default answers, `browser-only-no-extras`, `book-club`, `local-web` (web and a Node server, English, no video), `native-no-lessons`, `clinic` and `windows-only`. For each, the server and web code type-check, the server tests pass, the server runs on Node, and the web client loads in a browser, seats a player and deals a hand. The iPhone, iPad and Apple TV apps build for their simulators. Not run: Android builds (no Android SDK where the recipe is maintained; the Kotlin is type-checked in part), Windows packaging (needs Windows) and deploying to Cloudflare (needs an account). The open items are in `INTEGRATION-GAPS.md`.
