# screenRIG Scoreboard · prototype PWA

A working prototype of the **Multi-Sport Scoreboard PRD (draft v0.1, Oct 14 2026)**. Pick a sport, choose two teams, and run the game from a phone or iPad while a display shows the board. No server is required.

## Put it online

This repo serves the built app from `docs/` with GitHub Pages. Any other static host with HTTPS works too (service workers need HTTPS or `localhost`): publish the contents of `docs/` as-is.

- **Update the site:** edit `src/`, run `python3 build.py`, then `rm -rf docs && cp -r dist/pwa docs && touch docs/.nojekyll` and push.
- **Local test:** `cd docs && python3 -m http.server 8080`, then open http://localhost:8080.

## Install it

- **iPad and iPhone (Safari):** Share, then Add to Home Screen.
- **Android, Chrome, Edge:** use Install app on the home screen, or the browser menu.

## Run a game

1. On the display (a TV browser, a laptop on HDMI, or a screenRIG Player), open the site, choose **New game**, pick the sport, rules, teams and screen shape, then choose **Display**. The pregame screen shows a six-letter code and a QR code.
2. On the iPad, scan the QR code or choose **Join a game** and enter the code. Pick **Controller**.
3. For an unattended Player, point it straight at `https://YOUR-SITE/#display-CODE`. After a reboot it reopens the last game on its own.

Deep links: `#join-CODE` opens the join screen for a controller, `#display-CODE` opens the board.

## What is in the prototype

| PRD area | Covered |
| --- | --- |
| Sports | Basketball, volleyball, soccer (MVP); football, hockey, baseball/softball (v1) |
| Rulesets | Data-driven presets by level (NFHS, NCAA, NBA, FIBA, FIFA, NHL, MLB, youth/rec) with per-game overrides; versioned |
| Rules engine | Bonus and double bonus, foul-outs, set wins and caps, side switch at 8, innings flip, walk-offs, run rule, tiebreak runner, power-play releases, second-yellow reds, golden goal, shootouts |
| Branding | Team library with colours, short names and logos (PNG/SVG/JPG, resized, optional white-background removal), contrast check, alternate colours per game |
| Display | 16:9, 9:16, 4:3, 21:9, 32:9, ribbon and custom pixel sizes; reflowing layouts per class; safe-area margin; modern or LED-segment digits; tabular digits; 7:1 contrast on score and clock |
| Controller | Large touch targets, undo, restore, event log with before/after values, corrections with reasons, hold-to-confirm on destructive actions, roles (controller, clock only, viewer), optional PIN |
| Lifecycle | Pregame matchup with join code, period transitions with break countdowns, overtime and tiebreak flows, final screen with breakdown, history and shareable summary, CSV audit export |
| Reliability | Clocks run from timestamps; offline actions queue and replay with their original times; state restores after reload |

Not included: accounts and server-side roles, SSO, the screenRIG Player LAN fallback, horns and audio, sponsor zones, and the phase 2 sports. Rule defaults are common configurations and still need validation with governing bodies and pilot customers (PRD SP7).

## How sync works

- **The event log is the source of truth.** Every tap is an event with an id, device, timestamp and payload. Each device keeps the whole log and replays it through the rules engine. Undo is itself an event, so the audit trail is complete.
- **Merging:** points and fouls from two controllers both apply. State-setting actions such as setting the clock resolve by timestamp, last writer wins, and other controllers see a notice.
- **Same browser:** windows sync instantly over `BroadcastChannel`, even offline.
- **Between devices:** WebRTC data channels. Devices find each other through the public PeerJS broker (`0.peerjs.com`), then talk directly. This works best on the same Wi-Fi; some mobile carrier networks need a TURN server.
- **Offline:** each heartbeat carries a version vector, so a controller that drops off replays its queued actions when it reconnects, at the times they really happened.
- **Clocks:** devices estimate their offset to the device that created the game, so every screen shows the same time.

For production, replace the PeerJS hub in `sync.js` with screenRIG's real-time service. The message protocol (`hi`, `def`, `ev`, `ping`, `pong`) stays the same.

## Files

- `index.html`, `app.css`, `app.js`: the interface
- `engine.js`: rules engine, presets and reducer (pure functions, no DOM)
- `sync.js`: device sync and transports
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA shell
- `fonts/`: Big Shoulders Display, Barlow, Barlow Condensed, Oswald, Saira Condensed, IBM Plex Mono (SIL Open Font License)
- `vendor/`: qrcode-generator 1.4.4 and PeerJS 1.5.5 (MIT)

Tests: `node test/engine.test.js` (rules engine), `node test/sync.test.js` (sync protocol). Browser checks in `test/*.py` use Playwright.
