# Experience Pass 1 — "First Day at the Office" · audit + breakdown + frozen contract

Status: 🔵 designed (2026-11-18) — branch `feat/experience-pass`. Coordinator owns this file, `shared/*`, `src/main.js`.
Three lanes, disjoint files: **server** (`server/`, `tools/playtest/`) · **client-team** (Team scenes, `src/entities/moba/`,
`src/ui/moba/`) · **client-core** (Menu, Hunt, MultiPlay, `src/core/`, `src/data/`, `src/ui/MPOverlay.js`, new `src/ui/*Panel.js`,
`index.html`). Contract (§3) is frozen; need a change → report it, don't improvise.

## 0. Status board (coordinator updates this)
**Final (2026-11-20):** all 23 tasks ✅ · code review: 2 major + 13 minor found and fixed · full playtest: no regressions ·
round 2 from the playtest ✅ (Personal dead-link watchdog, Team queue solo click→playing ≈ 10 s, earlier fights: first kill
median 2:26 / 9.2 kills by 9:00, first-tap on touch, invite → host's side + name prompt, PLAY AGAIN re-queues, onboarding
polish) · final checks: `exploits.mjs` 25/25, `team_sim --exploits` 117/117, `nav_check` ✅, harness smoke ✅.
Open: first-structure median 6:05 (target 6:00, within run noise); "≥ 4 tips in the first 6 min" reasoned not measured;
Personal chat send not re-verified this round (code path unchanged); real iOS Safari not tested.

| Task | Title | Lane | Status |
|---|---|---|---|
| EP-01 | Arena reconnect grace (20 s) | server-arena | ✅ built (exploits 25/25) |
| EP-02 | Broken time scales by level | server-arena | ✅ built |
| EP-03 | Team reconnect grace (60 s) | server-team | ✅ built |
| EP-04 | Rollback (concede) vote | server-team | ✅ built |
| EP-05 | Team early-game pacing | server-team | ✅ built (avg 14.5 min, 8.3 kills by 9:00; first tower 6:07) |
| EP-06 | Hats in Team Mode + monitor flag | server-arena / server-team | ✅ built |
| EP-07 | Team reconnect screen | client-team | ✅ built |
| EP-08 | Rollback vote UI | client-team | ✅ built |
| EP-09 | Team end-screen payoff | client-team | ✅ built |
| EP-10 | First-match coaching + calm HUD | client-team | ✅ built |
| EP-11 | Team hats + invite links | client-team | ✅ built |
| EP-12 | Settings panel + mute fix | client-meta | ✅ built |
| EP-13 | First-run welcome | client-meta | ✅ built |
| EP-14 | Campaign polish (coach, stars, level select) | client-meta / client-play | ✅ built |
| EP-15 | Personal pause menu + session summary | client-play | ✅ built |
| EP-16 | Personal reconnect + pinned Colyseus | client-play | ✅ built (5 s outage test kept level/score) |
| EP-17 | Progress core (save + missions + unlocks) | client-meta | ✅ landed (API live) |
| EP-18 | Career / profile panel | client-meta | ✅ built |
| EP-19 | Fast, role-balanced draft | server-team | ✅ built |
| EP-20 | Personal catch-up | server-arena | ✅ built (L2 at 60 XP, ×2 XP first 3 min) |
| EP-21 | First-buy nudge, Team sounds, calm death screen | client-team | ✅ built |
| EP-22 | Audio hooks + quick fixes | client-meta | ✅ built (+ new campaign background in progress) |
| EP-23 | Personal XP bar + fixes | client-play | ✅ built |

## 1. Goal
The game has a lot of systems (campaign, endless arena with events and a boss, a full 5v5 siege) but a new hire's first
10 minutes are rough. Nobody tells them how anything works, a network blip wipes their progress, the end of a session gives
them nothing back, and Team Mode adds nothing to their career. This pass makes the first session readable, makes every
session end with a payoff and a reason to come back tomorrow, and covers the basic polish we're missing (settings, mobile
exit, reconnect). It adds no new modes. The idea: everything you do in any mode moves your stickman's career forward.

## 2. Findings (evidence)
**Onboarding / FTUE**
- No first-run flow. PLAY drops you into 1-1 with no instructions, and it's not obvious that smash needs a **held** click
  (`HuntScene.js:194`). The DEV TIP card shows jokes, not tips (`data/tips.js` TIPS_DEFAULT).
- Name entry on the menu uses `window.prompt` (`MenuScene.js:198`). Personal and Team each have their own name UI.
- Arena tips show only while `sessions < 2` (`MultiPlayScene.js:3867`). Team Mode has no in-match coaching at all (only
  tooltips in `MobaHud`). Its first match is 18 minutes of a full 5v5 game.

**Core loop feel**
- Campaign: juice is strong (finale cinematic, PM/DEV dialogue). But PLAY always resumes the highest unlocked level
  (`MenuScene.js:574`): no level select, no stars, no "NEW BEST". There's no pause or exit button on touch (keyboard only).
- Personal: a lively loop (events, boss, crown). But **ESC quits instantly with no confirm** (`:842`). There's **no
  on-screen exit on mobile** (07_UX "planned: back button"). Broken lasts 20 s at every level, plus the score reset
  (`rules.js:177`). That's harsh for an Intern who has nothing to lose.
- Team: polished and stable, but avg match **17.8 min** (TASK_STATUS) vs the vision's ~10 min (`01_VISION.md:32`). The early
  game is passive (first tower ~7–9 min). There's no way to concede a hopeless game. Open v4 items: early toasts and
  nameplates overlap.

**Progression / meta (exists vs wired)**
- Career, 12 hats, daily missions and streaks exist, but are **arena-only**. `missions.js` has only arena metrics. No hat
  unlocks from `teamGames`/`teamWins` or the campaign (`data/cosmetics.js`). Team Mode has no hats at all (`TeamChamp` has
  no `hat`).
- `EndScreen.js:98` counts **offline practice** toward the siege W/L record.
- There's no screen to view career, the hat collection or progress. A 1-line career string sits bottom-left
  (`MenuScene.js:543`). Hats can only be picked inside the arena join box.
- Streaks give no reward. The menu panel says "DAILY MISSIONS · ONLINE".

**Rewards & feedback**
- Arena has no end-of-session payoff: you leave and nothing is summarized. The Team end screen has a table and MVP but no
  personal highlights, no career or mission progress, and no hat unlocks.
- Audio is synth SFX only. No music. **The volume control is mute-only.**

**Social hooks**
- Custom rooms copy a bare room code (`TeamCustomScene.js:789`), not a link. No deep link joins a room. No shareable
  result text, though the community lives in chat apps (Zalo/Messenger). Chat and the feed are good.

**Accessibility / settings**
- SETTINGS is a "coming soon" toast (`MenuScene.js:138`) and CREDITS is a toast.
- **Bug:** `MultiPlayScene.js:744` `AudioManager.setMuted(false)` ignores the saved mute. There's no M key in Personal or Team.
- No volume, screen-shake or flash toggle. The Team FX quality setting hides in its own localStorage key
  (`TeamModeScene.js:71`). No controls card outside the Team lobby and the SP guide image.

**Technical UX**
- **No reconnection anywhere.** Arena `onLeave` deletes the player (`ArenaRoom.js:1200`), and the client only shows
  "disconnected" in small text (`MultiPlayScene.js:1249`). In Team Mode a bot takes over for good (`TeamRoom.js:289`) and the
  client modal offers only MENU (`TeamModeScene.js:296`). A Wi-Fi blip ends an 18-min match.
- When the arena connection fails you get a small red status line with no RETRY.
- `index.html:99` loads `colyseus.js@^0.16.0` as a floating range from unpkg, so the client can drift from the server.
- `server/index.js:90` exposes the `/colyseus` monitor without auth in production. It can list and dispose rooms.
- TASK_STATUS "server-side smash logging" row is stale: no smash `console.log` is left in `ArenaRoom.js`. Close it.

## 3. Contract (frozen)
### 3.1 Coordinator first (before the lanes start)
1. `shared/moba/rules.js` += `ROLLBACK_FROM_MS = 720000` (12:00), `ROLLBACK_VOTE_MS = 20000`,
   `ROLLBACK_COOLDOWN_MS = 180000`, `ROLLBACK_NEED = 4` (seats of 5).
2. `src/main.js` deep link `?room=<roomId>` → `scene.start('TeamCustomScene', { joinCode, name: saved name })`.
3. Mirror §3.2 numbers into `design/09_BALANCE.md`. Close the stale TASK_STATUS logging row.

### 3.2 Server state (append-only, at the END of each class)
- `server/game/schema.js` **Player**: `away: boolean` (disconnected, in grace) · `brokenUntil: number` (server epoch ms, 0 = not broken).
- `server/game/moba/schema.js` **TeamChamp**: `hat: string` · **TeamState**: `winReason: string` (`''|'core'|'rollback'`).
- Rules (`server/game/rules.js`): `RECONNECT_GRACE_S = 20`, `BROKEN_MS_BY_LEVEL = [8000,10000,12000,15000,18000,20000]`
  (replaces flat `BROKEN_DURATION_MS`). `server/game/moba/tuning.js`: `TEAM_RECONNECT_GRACE_S = 60`.

### 3.3 Messages / options
- `welcome` (arena + team) += `reconnectS: number`. Arena `brokenBy` += `ms: number`.
- Join options: `team` / `team_custom` accept `hat` (server sanitizes with the allowlist, same as the arena).
- **Reconnect protocol:** the client keeps `room.reconnectionToken`. On `onLeave(code)` with code ∉ {1000, 4000} (4000 =
  consented), not shutting down and phase ≠ `ended`: call `client.reconnect(token)` every 2 s until `reconnectS` runs out.
  On success, clear every view/sprite map, re-register handlers on the NEW room, and send `hello` again (it's a new Client
  object, so the server answers again). Arena server: a non-consented leave → `player.away = true` and
  `allowReconnection(client, RECONNECT_GRACE_S)`. Restore on success, remove on timeout. Team server: the bot adopts as
  today; on reconnect `ch.isBot = false` and the bot brain is released.
- **Rollback vote (Team):** c→s `vote { yes: boolean }`. A `yes` with no active vote starts one (≥ `ROLLBACK_FROM_MS`, not
  in cooldown, phase `playing`). s→team clients `vote { yes, no, need, endsAt, by }` · s→team `voteEnd { passed }` ·
  s→requester `voteDeny { reason: 'early'|'cooldown'|'active'|'phase' }`. A vote passes when yes ≥ `ROLLBACK_NEED` **and no
  human voted no**. Bots vote yes iff their team has lost more structures than the enemy, or trails by ≥ 10 kills. On pass:
  winner = other team, `winReason = 'rollback'`, `announce` banner. Offline practice: no vote (the button is hidden).

### 3.4 Client save + shared client API (client-core owns, client-team calls)
- SaveManager blob (`bugSmashHunter.save.v1`), new keys with defaults, never rename `muted`:
  `settings { volume:0.8, shake:true, flashes:true }` · `flags { welcomeSeen, coachCampaign, tipsArena, tipsSiege }` ·
  `levelStars { [levelId]: 0..3 }` · career += `teamPractice, teamTakedowns, bestStreak, campaignLevels, campaignStars`.
  API: `getSettings()/setSettings(patch)`, `getFlag(id)/setFlag(id,v)/clearFlags()`, `getLevelStars/setLevelStars`.
- `src/core/Progress.js`: `add(careerKey, n=1, {daily}={})` and `max(careerKey, value, {daily}={})`. Both return
  `{ missions: Mission[], hats: Hat[] }` (newly completed / unlocked), so callers can toast them.
- `AudioManager.setVolume(0..1)`. Team FX quality stays at localStorage `bugsmash.team.fx` (`auto|high|low`). The settings
  panel writes it.
- New hat ids (client `data/cosmetics.js` + server allowlist): `badge` 🪪 (teamGames 1) · `captain` 🏆 (teamWins 5) ·
  `standup` 📅 (bestStreak 3) · `unicorn` 🦄 (bestStreak 7) · `broom` 🧹 (campaignLevels 12).
- Daily metrics, new ones: `teamGames`, `teamWins`, `teamTakedowns` (counters, practice counts), `campaignLevels` (counter),
  `campaignStars3` (counter). Mission entries get `mode: 'arena'|'team'|'campaign'`. Each day = 2 arena (distinct metrics) +
  1 from team ∪ campaign. Existing mission ids stay unchanged.

## 4. Tasks (≈ 1 agent session each; listed in recommended order per lane)
### Server lane (`server/`, `tools/playtest/`)
- **EP-01 Arena reconnect grace** — your level survives a Wi-Fi blip. Implements §3.3. An away player is frozen, bots and
  bugs ignore them, and they **can still be damaged by humans** (no escape-by-unplug). Feed lines are from §5.
  *Accept:* new `tools/playtest/reconnect.mjs` drops the socket at Lv3. Rejoining within 20 s keeps level, score and
  position. After 20 s the player is removed. `exploits.mjs` 9/9. Files: `ArenaRoom.js`, `schema.js`, `rules.js`,
  `data/feed.js`, `tools/playtest/reconnect.mjs`.
- **EP-02 Burnout scales with career** — Interns are back in 8 s, Super Seniors sit out 20 s (protects new players, makes
  big falls hurt). Uses `BROKEN_MS_BY_LEVEL` + `brokenUntil` + `brokenBy.ms`. *Accept:* sim shows Lv1 broken ≈ 8 s,
  Lv6 ≈ 20 s, `brokenUntil` synced. Files: `ArenaRoom.js`, `rules.js`, `schema.js`, `BotDirector.js` if it reads the duration.
- **EP-03 Team reconnect grace** — an 18-min match survives a drop. The bot plays during the 60 s grace, then hands the
  laptop back. Verify that `onAuth` isn't hit on reconnect and which close code `disconnect()` sends at match end.
  *Accept:* `team_sim` drop/rejoin at 5:00 → same sid, `isBot` false, items/gold kept, bot brain released, feed line.
  Files: `TeamRoom.js`, `game/moba/MobaBots.js`, `tuning.js`, `lines.js`, `tools/playtest/team_sim.mjs`.
- **EP-04 Rollback vote** — lets a hopeless game end with a laugh instead of a 25-min stomp. Per §3.3 + `winReason`.
  *Accept:* `team_sim --exploits` adds early vote, spam, an enemy voting, a vote after `ended`, and one human no → no pass
  (all must pass). A losing solo human + 4 bots passes. Files: `TeamRoom.js`, `moba/schema.js`, `MobaBots.js`, `lines.js`.
- **EP-05 Siege early-game pacing** — bots trade, gank and siege earlier (open item since v1). *Accept (team_ff, 20
  matches):* median first tower ≤ 6:00, ≥ 8 kills by 9:00, avg match ≤ 15 min, sides within 45–55 %. A passive human in
  `team_sim` dies ≤ 3× in the first 5 min. Files: `MobaBots.js`, `tuning.js`.
- **EP-06 Cosmetics + prod hygiene** — hats in sieges; close the open monitor. Add the 5 new ids to `data/cosmetics.js`
  allowlist, the `hat` join option → `TeamChamp.hat` (drafted slot through to the champion record), and gate `/colyseus`
  behind `BUG_SMASH_MONITOR=1`. *Accept:* join with `hat:'badge'` → synced. A bogus hat → ''. `/colyseus` returns 404 without
  the env. Files: `data/cosmetics.js`, `TeamRoom.js`, `moba/schema.js`, `index.js`.

### Client-team lane (Team scenes, `src/entities/moba/`, `src/ui/moba/`)
- **EP-07 Siege reconnect UX** — `_connLost` → "📶 Reconnecting… Ns" modal with a countdown, then the §3.3 protocol, then
  `_adoptRoom(newRoom)` after clearing `views`. Fallback modal: PRACTICE / MENU. *Accept:* kill the server socket mid-match
  (DevTools offline for 5 s) → you're back in control with no duplicate sprites. Offline > 60 s → clear message.
  Files: `TeamModeScene.js`, `MobaHud.js`.
- **EP-08 Rollback vote UI** — a 🏳 HUD button (visible from 12:00, hidden offline) plus a chat shortcut `/rollback`. Team
  vote panel with yes/no and a timer. `voteDeny` toasts. EndScreen subtitle for `winReason === 'rollback'`. *Accept:* the
  2-browser vote flow works, and the panel never blocks skill buttons. Files: `MobaHud.js`, `TeamModeScene.js`,
  `ui/moba/EndScreen.js`.
- **EP-09 Siege payoff** — EndScreen gains a "YOUR SHIFT" strip: up to 3 personal highlights (first blood, most CS on team,
  most takedowns, fewest deaths…), plus `Progress.add` for teamGames/teamWins/teamTakedowns and toasts for completed
  missions and new hats. **Practice → `teamPractice`, not the W/L record.** Adds 📋 COPY RESULT (§5 text).
  *Accept:* online win → record +1W and a mission toast. Practice → record unchanged. Copied text pastes cleanly.
  Files: `ui/moba/EndScreen.js`, `ui/moba/uiKit.js`.
- **EP-10 First-siege coaching + calm HUD** — while `!getFlag('tipsSiege')`, show contextual tips (§5) triggered by
  situations (at the fountain with gold, near an enemy tower with no minions, Lv6, low HP). Max 1 tip per 20 s; set the flag
  after 2 matches. Fix the v4 open item where early-match toasts overlap: queue them. Respect `settings.shake/flashes` in
  MobaFx/StructureView/ChampionView/UnitView. *Accept:* fresh profile → ≥ 4 tips in the first 6 min, never overlapping.
  Shake off → no camera shake. Files: `MobaHud.js`, `TeamModeScene.js`, `MobaFx.js`, `StructureView.js`, `ChampionView.js`,
  `UnitView.js`.
- **EP-11 Siege hats + invite links** — send `hat` (saved) in the join options (Lobby, Custom, deep link). Render the emoji
  over the champion (ChampionView) and on draft/loading cards. Custom room "🔗 COPY INVITE" copies `<origin>/?room=<id>`.
  TeamCustomScene handles `init({ joinCode })` → join. *Accept:* friend opens the link → lands in the room. The hat shows for
  both teams. Files: `TeamLobbyScene.js`, `TeamCustomScene.js`, `TeamSelectScene.js`, `ChampionView.js`.

### Client-core lane (Menu, Hunt, MultiPlay, `src/core`, `src/data`, `src/ui` non-moba, `index.html`)
- **EP-17 Progress core (do first)** — all of §3.4: SaveManager keys and API, `Progress.js`, missions v2 (mode slots and the
  new metrics), hats v2. The menu missions panel shows a mode icon per mission. *Accept:* `node --check`. Old saves load.
  Today's arena missions keep their ids. A team or campaign mission appears daily. Files: `core/SaveManager.js`,
  `core/Progress.js`, `data/missions.js`, `data/cosmetics.js`.
- **EP-12 Settings & controls panel** — SETTINGS opens a panel with volume slider, mute, screen shake, flashes, Team FX
  (auto/high/low), "replay tutorials" (`clearFlags`), and a controls card per mode. CREDITS → About with credits. Fixes:
  remove `setMuted(false)` in MultiPlay, add the M key in Personal. *Accept:* volume persists across scenes and reload.
  Shake off → no shake in Hunt and Personal. Files: `ui/SettingsPanel.js`, `MenuScene.js`, `core/AudioManager.js`,
  `MultiPlayScene.js`, `effects/Effects.js`.
- **EP-13 First-run welcome** — when `!welcomeSeen`: a welcome card with a DOM name input (IME-safe, replaces
  `window.prompt`), "▶ START TRAINING" (campaign 1-1) / "🌐 JUMP ONLINE" (Personal). DEV TIP mixes real tips with the
  jokes, 1:1. *Accept:* clean profile → welcome shows once, the name persists, the Vietnamese name "Đông" works.
  Files: `MenuScene.js`, `data/tips.js`.
- **EP-18 Profile panel** — a menu button "👤 CAREER" opens a panel with stats per mode, a hat grid with progress bars and
  EQUIP (`setHat`, used by both modes), streak, best streak, and today's missions. *Accept:* every one of the 17 hats shows
  its progress. Equipping on the menu shows up in Personal and Team. Files: `ui/ProfilePanel.js`, `MenuScene.js`.
- **EP-15 Personal session arc** — a ☰ button (works on touch) → pause card: Resume / Settings / Controls / Clock out. ESC
  opens the same "Clock out?" confirm. A collapsible mission tracker pill in the HUD. On clock-out, a **Shift Report**: bugs,
  peak title, KOs, burnouts, time, mission progress, "next hat: 🎧 82/100", 📋 COPY, verdict line (§5). Tips use flag
  `tipsArena`. *Accept:* phone can leave the arena. The report numbers match the session.
  Files: `MultiPlayScene.js`, `ui/MPOverlay.js`, `ui/ShiftReport.js`.
- **EP-16 Personal resilience** — reconnect UX per §3.3 (dimmed "📶 reconnecting" overlay with countdown, then a full
  resync). Render `away` (📶 over the head) and use `brokenUntil` for the FIXING countdown (drop the 20 s mirror). The broken
  toast uses `ms`. A connection-failed card with RETRY / PLAY CAMPAIGN. Pin `colyseus.js@0.16.19` in `index.html`.
  *Accept:* DevTools offline 5 s → same level and no duplicate sprites. Server down → card, RETRY works once it's up.
  Files: `MultiPlayScene.js`, `index.html`.
- **EP-14 Campaign polish** — 1-1 coach overlay (3 steps, timer starts at the first kill or after 6 s, flag
  `coachCampaign`). Stars per level (1 = clear, 2 = ≥ 25 % time left, 3 = ≥ 45 %, constants in `data/levels.js`). "NEW BEST!" on
  the win overlay. LEVELS picker on the menu. On-screen ⏸ for touch. After 1-3, a "PLAY ONLINE ▶" button. Feeds
  `Progress.add('campaignLevels')` / stars. *Accept:* fresh profile can't miss "hold to smash". Stars persist. Replaying
  1-1 is possible. Files: `HuntScene.js`, `MenuScene.js`, `data/levels.js`, `ui/LevelSelectPanel.js`.

### Added from the full-game playtest (coordinator, 2026-11-18)
- **EP-19 (server-team) Fast, sane draft** — bots draft ROLE-BALANCED teams (every team gets top/jungle/mid/bot/support from
  ROLE_PICKS; never 3 mids / 2 tanks — playtest saw both) and lock within the new `SELECT_BOT_PICK_MS` [1.5 s, 6 s]
  (coordinator already changed it); when all 10 are locked, loading starts within SELECT_ALL_LOCKED_MS. *Accept:* team_ff
  draft self-test asserts one champion per role per team; click→playing ≤ 15 s quick match.
- **EP-20 (server-arena) Personal catch-up** — a new player can climb: level 2 at ~60 XP (was 150) and ×2 XP for the first
  3 min of a session; warm bots start with lower scores; a knockout by the BOSS during its truce never resets your level.
  Files: `server/game/rules.js`, `server/game/BotDirector.js`, `server/rooms/ArenaRoom.js`. Mirror numbers to 09_BALANCE.
- **EP-21 (client-team) First-buy nudge + Siege sound + calm death screen** — in the break room with gold ≥ the next
  recommended item: pulse "🛒 Buy <item> (P)" (first 3 games: open the shop at 0:00); call the AudioManager team hooks
  (EP-22) for attacks / casts / deaths / towers / wall-stun / smite (replace the missing `AudioManager.hit`); stagger the
  death-screen texts (no stacking); OfflineSim epic timers count down like online; offline pick timer short (bots ≤ 3 s).
- **EP-22 (client-meta) Audio + quick fixes** — AudioManager gains `hit()` and team hooks `teamAttack(ranged)`,
  `teamCast(slot)`, `teamDeath(mine)`, `towerDown(ours)`, plus volume support for EP-12; Personal + menu server URL use
  the page host/port like `teamServerUrl()` (MultiPlayScene:27-35 → done by client-play, MenuScene:13-17 here); hide the
  platformer link from the menu (keep the scene reachable via `?scene=platformer` — coordinator adds in main.js later);
  rename AI-brand skill names/logos in the campaign guide to original office names (data + guide text).
- **EP-23 (client-play) Personal progress visibility + fixes** — XP bar "next promotion in N XP"; bug HP labels only when
  damaged/hovered; COMBO text only from ×2; hide the "connected · room …" debug line; save career `playMs` every 30 s
  (and on `pagehide`); Personal server URL from the page host/port.
- **Campaign fixes (client-play, part of EP-14):** HUD updates before `_win()` on the final kill; teach "hold to smash"
  in 1-1 (+ "[hold] smash" in the hint bar); ease 3-3 (`bugHpMul` 1.45 → 1.3).

### Lanes (5 parallel agents, disjoint files)
| Lane | Tasks | Files |
|---|---|---|
| **server-arena** | EP-01, EP-02, EP-20, EP-06 (cosmetics allowlist + monitor flag) | `server/rooms/ArenaRoom.js`, `server/game/{rules,schema,BotDirector,EventDirector}.js`, `server/data/*`, `server/index.js`, `tools/playtest/{sim,exploits}.mjs` |
| **server-team** | EP-03, EP-04, EP-05, EP-19, EP-06 (team hat via the allowlist) | `server/rooms/TeamRoom.js`, `server/game/moba/*`, `tools/playtest/{team_ff,team_sim,custom_rooms}.mjs` |
| **client-team** | EP-07, EP-08, EP-09, EP-10, EP-11, EP-21 | Team scenes, `src/entities/moba/*`, `src/ui/moba/*` |
| **client-meta** | EP-17 (first), EP-12, EP-13, EP-18, EP-22, EP-14 level select + stars UI in the menu | `src/scenes/MenuScene.js`, `src/core/*`, `src/data/{missions,cosmetics}.js`, new `src/ui/*` panels (non-moba), `index.html` |
| **client-play** | EP-15, EP-16, EP-23, EP-14 in-level parts + campaign fixes | `src/scenes/{MultiPlayScene,HuntScene,BossScene,LevelScene,PlatformerScene}.js`, `src/data/levels.js` + other gameplay data, `src/entities/*` (non-moba), `src/ui/MPOverlay.js` |
Cross-lane calls go through the §3.4 APIs (`Progress`, `SaveManager`, `AudioManager`) — guard with `?.` until they land.
`src/main.js` + `shared/*` stay coordinator-owned.

**Dependencies:** EP-07 ← EP-03 · EP-08 ← EP-04 · EP-11 ← EP-06 (renders '' until then) · EP-09/10 ← EP-17 API (code against
§3.4, guard with `?.`) · EP-16 ← EP-01/02.

## 5. Humor pass
- Reconnect: "📶 Wi-Fi went to lunch — reconnecting… {s}s" · "Mạng lag quá, đợi xíu…" · feed: "🔌 {a} is back — 'just restarting
  my router'" · "☕ {a} returned. The bot already pushed to main." · fail: "Connection lost. Your laptop now belongs to a bot."
- Burnout toast: "💻 Laptop broken by {by} — IT says {s}s. IT is lying."
- Rollback: "🏳 ROLLBACK THE RELEASE? — {by} wants last Friday's build back ({yes}/{need})" · pass: "🔙 {team} rolled back.
  {other} ships unopposed." · fail: "Rollback rejected. The sprint continues 😩" · bots: "I voted no, I have stock options" ·
  "ok rollback đi, tôi muốn về nhà".
- Siege coaching: "🎯 Last hit pays. Everyone else just 'contributed'." · "🛒 {gold}g at the fountain — P to shop. Treat
  yourself." · "🗼 Towers hate you personally. Let the minions take the meeting first." · "⭐ Lv6: R unlocked — your
  reply-all." · "🏃 Low HP? B to recall. Heroics at 5 HP go in the post-mortem."
- Welcome: "Welcome, new hire! HR lost your paperwork, so just smash bugs." · coach: "Move the mouse — you follow it like a PM
  follows deadlines." · "HOLD click to smash. One click is a code review, not a fix." · "Glowing things are AI tools. Results may vary."
- Clock out: "Clock out already?" / "Your stickman stays at the office. Your score doesn't." [KEEP SMASHING] [CLOCK OUT]
- Shift report verdicts: "Promoted to 'person who fixes the printer'." · "HR would like a word about those {k} KOs." ·
  "Zero burnouts. Suspicious." · "Hôm nay chăm chỉ ghê, sếp thấy hết rồi." · share: "🐞 Bug Smash shift: {bugs} bugs ·
  peak {title} · {kos} KOs · 🔥{streak}-day streak — {url}"
- Server down: "Server's down. Classic Friday." [RETRY] [PLAY CAMPAIGN]
- New hats: 🪪 Badge Access · 🏆 Release Captain · 📅 Standup Regular · 🦄 Unicorn · 🧹 Backlog Zero.

## 6. Risks
- **Reconnect resync:** duplicate sprites or dangling listeners when state replays. Clear every map before re-subscribing
  and guard callbacks with the visit id (Team already does this). Token reuse after timeout must fail cleanly.
- **Unplug exploits:** arena away players stay damageable by humans, so you can't escape a fight by unplugging. Team: the
  bot holds the seat, so pulling the plug gives no advantage.
- **Rollback griefing:** "no human voted no" + bots vote by score state, so one player can't throw a close game.
  Cooldown stops spam.
- **Pacing tune (EP-05)** must not make bots farm human newcomers. Gate it on the passive-human metric.
- **Broken 8 s for Interns** → faster PvP cycles at the bottom. Spawn protection (3 s) and the bots' Intern rules still apply.
- **Missions v2** reshuffles the current day on deploy. Keep the ids. Team slot accepts practice so an 18-min match
  isn't mandatory.
- **Save migration:** additive keys only, defaults on read. `reset()` stays the one wipe.
- **Perf:** hats = one Text per champion (≤ 10). Progress writes reuse the existing per-kill localStorage write.
  Nothing new is synced per tick except 2 Player fields, which change rarely.

## 7. Later (bigger ideas)
- Weekly online leaderboard + anonymous UUID identity (roadmap Phase 5).
- EN/VI language toggle (roadmap open question; the core community is Vietnamese).
- Procedural office music loop + spatial SFX gain. Colorblind palette + text-size option.
- "Hotfix" 3v3 siege (~8 min) to fit the vision's session length. Party queue with friends. Ranked/MMR.
- Arena AI-tool pickups (port from SP). Daily modifiers ("Today: skills are free"). More campaign gimmicks / World 5.
- Cosmetic laptop skins, auras, champion outfits — earned, never sold for stats.
- Vendor Phaser/Colyseus locally + service-worker cache (CDN independence). Highlight GIF / spectator mode.
- Bots use bushes. A Team-side DEADLINE world event cameo.
