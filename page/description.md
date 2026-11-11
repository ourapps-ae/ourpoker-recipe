# OurPoker

A complete Texas hold'em game for two to nine players at one table. People play on phones, tablets, computers or the web; a television or any shared screen shows the public table; players can see and hear each other by video; computer players can fill empty seats; play has decision clocks, rising blinds and rebuys; and the game speaks English, French, German and Spanish.

## Who it is for

A group that wants its own poker night without accounts or an app store: a book club, a club's league night, a poker league, a company event. The group's developer owns the accounts and the server; nothing runs on our platform.

## Devices

Web, iPhone and iPad, Android, Mac, Windows and Apple TV. Each is a switch; the devices question decides which are built. The television shows the public table only and cannot act or see private cards.

## House rules by default

Two to nine players at a table, 5,000 chips each, blind levels of 10 minutes that double after level 16, 30 seconds to act before the game checks or folds, one rebuy of 5,000 chips until level 3, side pots, no-limit betting.

## The questions

An agent answers them from your description and asks you only what it cannot infer; the server location is always asked. Fourteen are the main questions; ten follow-ups, most asked only when they apply (a web address, a bundle identifier, the video service address and the references to your video, hosting, store, Android and web deployment secrets, the store invitation).

1. Which devices? (any of web, ios, android, macos, windows, tvos)
2. How many people, and how often? (small, medium, large)
3. Which languages? (en, fr, de, es)
4. Which look? (night, lounge)
5. How many players per table? (2 to 9)
6. Starting chips? (5,000)
7. How long is each blind level? (600 seconds)
8. How many rebuys? (1, until level 3)
9. Decision time? (30 seconds, then check or fold)
10. Computer players? (none, on request, or fill empty seats; on request)
11. Video and audio between players? (yes)
12. Lessons for new players? (yes)
13. Where does the server run? (Cloudflare or your own hardware)
14. Offer updates through ourapps.app? (no)

## What the answers choose

- Devices include or leave out the web, Apple, Android and Windows hosts.
- Lessons, video and updates each include or leave out their component. Computer players are in the design unless the answer is none; the answer sets their mode (on request or fill empty) and none leaves out computer-players and poker-strategy.
- The scale answer chooses, per job, the cheapest candidate whose declared load covers it: small and medium use Cloudflare's free tier and LiveKit's free plan; large uses the paid Cloudflare plan and LiveKit's Ship plan. Your own hardware is the other server choice.
- Chips, level length, rebuys, decision time and player count set the settings of the components that own them and the matching numbers of the house rules file, with no code change.

## What it needs from you

- A Cloudflare account, or a machine of your own, for the server.
- An Apple developer membership for iPhone, iPad, Mac and Apple TV builds.
- A LiveKit Cloud account if video is on.
- Signing and deployment keys for the targets you enable.

Secrets are given by reference only; no key is written into the recipe, the answers or the application.

## Components

39 components in five groups (delivery and hosts; rooms, people and sessions; turn-based game framework; poker; interface and presentation) plus the recipe's own application-specific component: screen flow, artwork, text in four languages, lessons and end-to-end tests. Thirty-five of the 39 have nothing to do with poker. The diagram names every component, grouped, with the connections of the default design; store-update is dashed because it is present only when updates is yes.

## Tested answer sets

The default answers, `book-club`, `poker-league`, `company-event`, `company-event-hosted`, `tv-only`, `browser-only-no-extras`, `large-paid-host`, `clinic` and `no-computers`; every combination of devices, video, lessons, updates, computer players, server and scale is checked to give a complete design.

## Status

Version 0.4.1 is a draft. The components are built and their interfaces match; the recipe has not been assembled or run, because the assembler (`aepm create`) is not yet available. The files of the application that import an optional component are installed only with it; the application's core imports some of them, so designs without video, lessons, updates or web are not buildable. The open items are in `INTEGRATION-GAPS.md`.
