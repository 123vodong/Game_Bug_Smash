# Task Status

Updated: 2026-11-18

A running snapshot of what's done, what's in progress, and what's queued. Keep this honest — it's the file that future-you will read first.

---

## ✅ Done

### Team Mode — "Office Siege" 5v5 office MOBA (2026-11-07, ✅ reviewed)

**Review round (2 reviewers + playtester):** server — 0 critical, 4 minor fixed (slow stacking, passive gold
while dead, post-victory tick, spawn-slot reuse). Client — 2 major fixed (touchscreen laptops forced into
touch mode: auto-aim + stuck scoreboard), minor fixed: projectile speed = server, 🤖 tag on bot takeover,
old-room callbacks guarded by visit, offline deep link, cast FIFO, held keys reset on chat, key captures
released. Playtest: stable (0 errors over a full match + PLAY AGAIN), but early game is passive — tower HP
−~17 %, THE DEADLINE 6500 → 4500 HP (avg match 17.8 min). Also: rooms now ignore `debug` quietly when hooks
are off (Colyseus used to drop such clients). **Open:** bots play the early game too safely (first tower
~9 min, ~2 kills by 9:00) — bot aggression tuning next; label overlap in big fights; shop title wrap.

Original MOBA-genre mode (own map, champions and items — not a clone of any existing game):
🚀 **Startup** (blue) vs 🏢 **MegaCorp** (red) ship bug waves at each other's **Production Server**.
Built by the agent team in parallel against a frozen contract — [TEAM_MODE_BREAKDOWN.md](./TEAM_MODE_BREAKDOWN.md).

- ✅ **Shared data** ([shared/moba/](../../../shared/moba/)) — imported by BOTH server and browser: `rules.js` (economy, leveling 1–12, towers, minions, camps, epics), `map.js` (6000² "Open Office": 3 corridors, data-stream river, 4 legacy-code jungles, mirrored for fairness), `champions.js` (6 champions × 4 data-driven skills), `items.js` (17 office-gear items).
- ✅ **Champions** — 🎨 Pixel (Frontend mage) · 🗄️ Stack (Backend tank) · ⚙️ Ops (DevOps healer) · 🔍 Tester (QA marksman) · 🥷 Zero (Security assassin) · 📊 Model (Data-science controller). Skills = 7 generic types (skillshot, area, targeted, dash, blink, self, team) interpreted by one engine; R at Lv 6.
- ✅ **Server** ([TeamRoom.js](../../../server/rooms/TeamRoom.js) + [server/game/moba/](../../../server/game/moba/)) — lobby → playing → ended; minion waves, towers with an unlock chain + backdoor guard, jungle camps with leash, river epics (✨ golden bug → team gold; ⏰ THE DEADLINE → team buff), gold/XP/levels/items, shop + recall + fountain, server-authoritative movement, skill engine, **champion bots** (lane, last-hit, trade, retreat/recall, buy builds, jungle, siege, group for epics). Exploit suite: `tools/playtest/team_sim.mjs --exploits` (18/18).
- ✅ **Client** — [TeamLobbyScene](../../../src/scenes/TeamLobbyScene.js) (champion select), [TeamModeScene](../../../src/scenes/TeamModeScene.js) + [src/entities/moba/](../../../src/entities/moba/) (map, units, structures, champions, VFX, HUD, minimap, two cameras, offline mock `?offline=1`), [src/ui/moba/](../../../src/ui/moba/) (Office Supply Store shop with recommended builds, scoreboard, end screen). Menu TEAM button is live; deep links `?scene=lobby`, `?scene=team&champ=<id>`.
- ✅ **Coordinator fixes at integration** — tower range 440 → 600 (ranged champions out-ranged towers), golden bug 2:00/200 g → 3:00/150 g (early snowball), shared `ATK_PROJ_SPEED`, and **alternating per-tick processing order** (blue always acted first → red won 24/38 simulated matches; after the fix 20/38).
- Measured (fast-forward harness `tools/playtest/team_ff.mjs`, bots only): avg match ≈ 18 min (14–29), ~27–30 kills, ~8 structures, tick ≈ 0.3 ms, ~110 synced entities, ~7 KB/s per client.

### Office Chaos update — MP arena never empty, always something happening (2026-11-06)

Goal: a new player who opens the arena alone should see a lively office within seconds,
laugh at the chat, and have a reason to come back tomorrow. Team process for future work:
[develop_notes/AGENT_TEAM.md](../develop_notes/AGENT_TEAM.md) (agents in `.claude/agents/`,
harness in `tools/playtest/`).

**Server refactor** — tunables moved to [server/game/rules.js](../../../server/game/rules.js), synced
state to [server/game/schema.js](../../../server/game/schema.js), content to `server/data/`. Message
handlers became `_doMove/_doSmash/_doAction/_doCastSkill(sid, msg)` so bots and humans share
one validated code path. Kill rewards unified in `_awardBugKill/_grantXP` (fixes: dash/ult kills
didn't top up HP/energy on level-up). `move` rejects NaN; smash can't target yourself.

- ✅ **AI coworkers** ([BotDirector.js](../../../server/game/BotDirector.js), [data/bots.js](../../../server/data/bots.js)) — keep humans+bots ≈ 9 (max 8 bots); the first human finds 4 "warm" bots already playing; bots trickle in/out with feed lines ("🏠 LegacyLarry went to lunch"). 5 archetypes (grinder/brawler/coward/tryhard/chaos) → hunt, heal, flee, fight, raid the boss, chase the golden bug, use Q/W/E/R. Fairness: never pick fights with human Interns, ≤2 bots per human, forgive a newbie's first 2 accidental hits, no ult splash on bystander humans. Chat jokes (EN + some Vietnamese), replies to human chat ("are you bots?" → "I'm not a bot, I'm a contractor"). Shown with 🤖 + "N AI coworkers" in the HUD.
- ✅ **PM world events** ([EventDirector.js](../../../server/game/EventDirector.js), [data/events.js](../../../server/data/events.js)) — first at 25 s, then every 38–55 s; PM announces over the PA (ding-dong) + nags in chat between events. 🚨 Prod Down (bug surge, ×1.5 XP) · ☕ Coffee Break (pickup rain, slow bugs) · 🧊 Code Freeze (bugs frozen, no bites) · 🚀 Friday Deploy (×2 XP, faster bugs) · 🍕 Hackathon (skills cost 0) · ✨ CEO's golden bug (240 HP, flees, spawns near a human, 10 s human head start, +400 XP to whoever did the most damage, minimap + off-screen arrow).
- ✅ **THE DEADLINE boss** (every 3rd event) — co-op **truce** (no PvP, +4 s grace after), HP 1200+950/player (~27–36 s raid), telegraphed slams (first after 4.2 s; 1.1 s windup, 150 px, 16% of max HP, knockback; double slam in phase 2), light minions, "PM ordered pizza" heal drops, tramples code obstacles. Win → 1500 XP by damage share + 100 participation + 300 last hit + MVP banner. Timeout → "DEADLINE MISSED" stun + bug wave. Sprite: [assets/boss/deadline.png](../../../assets/boss/deadline.png) (cropped from the parked boss art).
- ✅ **Drama** — kill feed with joke KO lines ([data/feed.js](../../../server/data/feed.js)), PvP streaks (3/5/8/12) + **shutdown** bonus, 👑 **Tech Lead crown** on the top scorer (≥200) with a bounty (100 + 25% of score) paid to whoever breaks them, combo milestones, promotions ≥Lv3, 3 s spawn protection (join + after repair).
- ✅ **Client** — [MPOverlay.js](../../../src/ui/MPOverlay.js) (feed, queued banners, event HUD + countdown + edge tint, toasts, first-session tips), [MPBossView.js](../../../src/entities/MPBossView.js) (sprite, HP bar, telegraphs, win/fail), golden bug look, +XP popups, leaderboard (top 8 + you, crown, bounty, 🤖), server-clock sync for stun/invuln, Hackathon "FREE" buttons, boss click/SPACE/Q targeting, chat colors (PM orange, bots gray-blue).
- ✅ **Retention** — 12 cosmetic **hats** ([src/data/cosmetics.js](../../../src/data/cosmetics.js)) unlocked by career stats (picker in the join box; server allowlist); **career stats** + **daily missions** (3/day, same for everyone, streaks) in [SaveManager](../../../src/core/SaveManager.js) / [missions.js](../../../src/data/missions.js); main menu shows the real missions, a live "● N devs online" badge (`GET /api/stats`) and a career line.
- Dev-only `debug` message forces events (`tools/playtest/sim.mjs … golden_bug@5`); exists only when the server runs with `BUG_SMASH_DEBUG=1`.

#### Team review + fixes (2026-11-07) — first run of the [agent pipeline](../develop_notes/AGENT_TEAM.md)
Two `code-reviewer`s + one `playtester` in parallel; every finding verified by the coordinator before fixing. Regression: `tools/playtest/exploits.mjs` (9/9), sim + browser passes clean.

- **Security (server)** — fixed: `castSkill` with an ±Infinity aim gave a NaN position that bypassed every range check · `smash {kind:'constructor'}` turned energy into NaN (free skills) · no server rate limit on smash/skills (Hackathon = infinite ults) · `move` could teleport across the map (pre-existing) · `debug` with an inherited key crashed the whole process → own-keys + opt-in env var + `onUncaughtException` safety net · `hello` answered once (memory DoS).
- **Client** — fixed: rejoining MP in the same page showed an empty arena (stale `_shuttingDown`, pre-existing) · stun ⭐ never appeared (epoch ms `| 0` overflow, pre-existing) · your own client ignored server knockback/stun → now adopts server corrections + mirrors obstacle collision locally · post-boss truce grace on the client · midnight rollover for dailies/streaks · leaderboard 💻✖ refresh · boss entrance drop · boss damage numbers batched · event banners pre-empt the queue · menu text overlap.
- **Fairness / balance** — fixed: golden bug always went to bots (bot hunters didn't exclude it + last-hit stealing → damage-share winner, human head start) · boss too short (~20 s) and broke Interns while bots survived (HP ×1.8, %-HP slams, first-slam delay, participation XP) · bot Q dashes KO'd passive Interns (bystander check) · bots stomped humans 2+ levels below · crown ping-pong (hysteresis) · Prod Down overshot to 151 bugs and stripped obstacles (hard cap 150, eat pause) · empty first seconds (welcome bugs, closer bot spawns) · dead join greetings · no bot churn in solo rooms · golden bug orphaned on 'replaced' end · newer boss deleted by an old fight's timer · shield re-cast stripped by an old timer · stuck-inside-obstacle (bots trapped 80 s).
- **Intentional rule change** — Shield / roll i-frames now block the whole ult (damage, knockback, stun). Documented in 09_BALANCE.
- **Harness lesson** — the headless "human" stepped from its 12.5 Hz synced position (~150 px/s) and couldn't catch anything; `sim.mjs` now predicts its own position like the real client.

### Single-player 2D campaign — shippable

- **All 8 dev milestones** complete (movement, bug AI, timer/win-lose, skills, levels, UI, audio, balancing)
- 12 levels across 4 worlds tuned, kill-time / deadline ratios documented in [overview_levels.md](../overview_levels.md)
- End-game dialog system (DEV ↔ PM comic bubbles, 5s auto-cycle, branches by win/loss kill ratio)
- Slow-motion finale cinematic (~3.7s, 7 phases) on the last-bug kill
- VS Code workspace background image
- Click-to-smash gating (no passive smash on hover)
- Distribution: **`BugSmashHunter.zip` (7.32 MB)** — see [README.txt](../../../README.txt)
- Asset cleanup: 49 MB → 7.3 MB. Unused files parked in `.claude/context/recycle_bin/`

### Multiplayer arena (alpha) — playable end-to-end

- **Server** (Colyseus 0.16) at [server/](../../../server/) — `npm install` done, runs locally on port 2567
- **Client scene** [src/scenes/MultiPlayScene.js](../../../src/scenes/MultiPlayScene.js) — accessible via "multiplayer (alpha) ▶" link on the menu
- Up to **32 players** per room (single shared `arena` room; no room codes yet)
- **6000 × 3375 world** with camera follow + checkerboard floor + cyan arena border
- **Top-left minimap** (200px wide) showing bugs (pink), players (palette colors), viewport rect
- **90s rounds** + 8s results screen, server-driven phase state machine, winner announcement
- **Bug AI** (server-authoritative): flee within 220px, wander otherwise, smooth heading lerp, bounce off walls
- **Score + combo** ladder (×1.5 / ×2 / ×3 at 3/5/10 hits), 1.5s decay
- **Bug death** tween + audio
- **Lock-on attack target**: click a bug → red selection ring → auto-chase + auto-smash, target ID locked so we don't accidentally hit other bugs
- **Selection ring** follows live target position, pulses + auto-hides on death/hide/leave/cancel
- **5 attack poses + idle bob**: idle, run, run2, smash, punch, kick, jump, parry — all hand-drawn SVGs
- **Action keys** Q (smash) / W (punch) / E (kick AOE) / R (parry) / SPACE (jump)
- **Movement priority** keyboard arrows > joystick > click target
- **Mobile-ready**: 6 on-screen action buttons (bottom-right 2×3 grid) + virtual joystick on touch devices only
- **Audio** (smashHit, bugKill, combo, etc.) ported from SP — WebAudio synth, no files
- **Smash range buffered** server-side (96 vs client 96) so latency doesn't cause ghost-out-of-range rejections; chase hugs target at 28px to stay well inside the cone

### Platformer prototype (sealed Phase 0)

- [src/scenes/PlatformerScene.js](../../../src/scenes/PlatformerScene.js) — isolated proof of concept
- Player + Arcade physics + horizontal camera + stable + bug-eaten platforms
- WASD/arrows + jump with coyote time + jump buffering
- Section 1 + 2 of Level 01, ends at x=3000 with "PROTOTYPE END" overlay
- Not merged anywhere — stays as a separate scene until/unless we decide to expand

### Planning docs

- [plan/3D_MP_PHASES.md](../plan/3D_MP_PHASES.md) — multiplayer pivot plan (pivoted from full 3D Babylon to 2D + multiplayer + pre-rendered sprite path)
- [plan/bug_smash_deadline_hunter_development_plan.md](../plan/bug_smash_deadline_hunter_development_plan.md) — original dev plan for the single-player campaign
- [plan/LEVEL_01_CODE_RUNNER.md](../plan/LEVEL_01_CODE_RUNNER.md), [LEVEL_02_VERTICAL_SCROLL.md](../plan/LEVEL_02_VERTICAL_SCROLL.md), [LEVEL_03_MIXED_SCROLL.md](../plan/LEVEL_03_MIXED_SCROLL.md) — platformer levels (deferred)

### Proposals + raw ideas

- [ideas/PREVENT_BOREDOM_PROPOSAL.md](../ideas/PREVENT_BOREDOM_PROPOSAL.md) — first "prevent boredom" proposal, drove the MP pivot
- [ideas/MULTIPLAYER_3D_PROPOSAL.md](../ideas/MULTIPLAYER_3D_PROPOSAL.md) — "Hate the World" 3D MP proposal, deferred
- [ideas/STICKYMAN_GROWTH_SYSTEM.md](../ideas/STICKYMAN_GROWTH_SYSTEM.md) — growth system proposal (implemented in v0)

---

## 🟡 In progress

| Item | State | Next step |
|---|---|---|
| **Experience Pass 1** — full-game review → improve fun, onboarding, progression, polish (branch `feat/experience-pass`; tasks in [EXPERIENCE_PASS_BREAKDOWN.md](EXPERIENCE_PASS_BREAKDOWN.md)) | ✅ all 23 tasks built · code review (2 major + 13 minor) fixed · playtest ✅ · round-2 fixes ✅ · final check ✅ (exploits 25/25, team_sim 117/117, nav ✅) | commit when asked · next ideas in the breakdown §7 |
| **Pass 2** — ranked (quick play + custom rooms), one tab per player, rejoin a running match, sell items, LoL camera, longer queue + READY, +4 champions, +8 items (branch `feat/ranked-pass`; tasks in [PASS2_BREAKDOWN.md](PASS2_BREAKDOWN.md)) | ✅ RP-01…RP-15 built · pass2_check 36/36 · pass2_ui 15/15 (0 page errors) · team_sim 118/118 · exploits 25/25 · team_ff 12 matches (0 stuck, queue self-test ok) · nav ✅ | commit when asked · Render: ranks need a persistent disk (BUG_SMASH_DATA_DIR) |
| **Team Mode v2 — "Walls & New Hires"** ([breakdown](TEAM_MODE_V2_BREAKDOWN.md)) | ✅ built + reviewed + playtested + integrated (see breakdown "Results") | polish: Wet Floor puddle visual, bots aiming knockbacks at walls, faster early game |
| **Team Mode v3 — "Draft Day"** ([breakdown](TEAM_MODE_V3_BREAKDOWN.md)): thin bordering walls, queue → champion select → loading, summoner spells (D/F), info panel (C), Crunch Time | ✅ built + reviewed + playtested + integrated (2026-11-08) | open items in the breakdown "Results" |
| **Team Mode v4 — "Custom Rooms, Bushes & Smooth Play"** ([breakdown](TEAM_MODE_V4_BREAKDOWN.md)) | ✅ built + reviewed + playtested + integrated (2026-11-08) | open items in the breakdown "Results" |

---

## ⏸️ Queued / nice-to-have

In rough priority order. None are committed yet — pick before implementing.

### Personal + Team Mode (in progress)

Decisions captured + phased plan in [MP_MODES_BREAKDOWN.md](./MP_MODES_BREAKDOWN.md).
- ✅ **Phase A** — name persistence + bug drop on defeat + friendly-fire flag (landed 2026-05-30)
- ✅ **Phase B** — health pickups: 5-pool green plus icons, +40 energy each, +5s respawn, broken players excluded (landed 2026-05-30)
- ✅ **Personal Mode = infinite** — removed round timer + results screen; world runs forever. HUD shows `∞ · PERSONAL MODE · N online` (landed 2026-05-30)
- ✅ **Steepened XP curve** — `[0, 12, 40, 100, 230, 500]` (was `[0, 8, 22, 45, 80, 140]`). Lv6 = ~50 kills no combo / ~17 with ×3 combo. Super Senior is now a real achievement (landed 2026-05-30)
- ✅ **Performance pass** (landed 2026-05-30) — cached per-frame render work (level/energy/banner only update on transition), throttled minimap to 15 Hz, reduced `MAX_BUGS` 160 → 100, slowed server patch rate 50 ms → 80 ms (12.5 Hz broadcast while AI sim stays 20 Hz), tuned client lerp factors to match the slower patch rate
- ✅ **Mixamo atlas scaffolding** (landed 2026-05-30) — Phase C1: client now auto-detects `assets/characters/atlas/devstick.{png,json}` and switches to 8-direction rendered frames; falls back to SVG poses if absent. Blender batch render script + step-by-step Mixamo guide ready in [tasks/MIXAMO_ATLAS_BREAKDOWN.md](./MIXAMO_ATLAS_BREAKDOWN.md). Awaiting Phase C2 (user runs pipeline, hands over atlas files).

### MOBA Skill System (in progress — full conversion committed, ~4 sessions)

Decisions captured + phased plan in [MOBA_SKILLS_BREAKDOWN.md](./MOBA_SKILLS_BREAKDOWN.md).

- ✅ **Phase 1** — key remap (Q/W/E/R skills + SPACE basic) + 5-button action grid; placeholder skill behavior (animations only, no mechanics yet). **Design pivot 2026-05-30**: removed time-based cooldowns; skills are gated by **energy cost only** (Q:20 / W:25 / E:15 / R:40) to preserve the hyper-casual rhythm. Buttons dim when unaffordable instead of showing a cooldown arc.
- ✅ **Health system** (landed 2026-05-30) — split health from energy. New schema `health` / `maxHealth` per player; per-level table `[80, 100, 130, 170, 220, 280]`. PvP damage hits **health**, pickups restore **health**, energy is cast-only and no longer triggers broken at 0. Defeat trigger is `health === 0`. Thin dual bars in bottom-center HUD + above each head — **green tiered** health on top (yellow/red at low %), **blue** flat energy below.
- ✅ **Phase 2 Bug Dash** (landed 2026-05-30, revised same day) — Q: **enemy-targeted strike**. Auto-aims at the nearest bug/player within 360 px; whiffs if no enemy nearby. Shorter than Roll (140 px vs 180 px) — Q is the "close-the-gap" strike, E is the "flee" mobility. Damages every bug within 50 px of the dash line for `bugDamage × 2`. Client predicts position locally (180 ms tween) + 3 blue afterimages + dust puff. Energy cost 20.
- ✅ **Phase 3 Laptop Shield** (landed 2026-05-30) — W: 3-second cyan barrier that absorbs the next PvP hit completely. Server tracks `shielded: boolean`; `_applyPvpHit` checks shield first → if set, consume and no damage. Auto-expires after 3 s if not consumed. Client renders a breathing cyan disc around the player; on exit (consume or expire) plays a white burst + 8 cyan crack streaks. Energy cost 25.
- ✅ **Phase 4 Debug Roll** (landed 2026-05-30) — E: 180 px instant teleport (shorter than dash) + 600 ms invulnerability. Server sets `invulnUntil` timestamp; `_applyPvpHit` rejects all damage during the window. Client predicts position over 250 ms + spins sprite 360° in roll direction + alpha-blinks 1.0↔0.35 × 2 to signal i-frames + dust puff. Energy cost 15 (cheapest skill).
- ✅ **Phase 5 Deadline Break ult** (landed 2026-05-31) — R: AOE within 200 px → bug damage `× 4`, player health damage `min(level × 20, 100)`, knockback 120 px from caster, **stun 1.5 s** on enemy players. Stun gates `move`/`castSkill`/`smash` server-side. Roll-invuln + Shield both intercept the ult hit. Client: dual expanding shockwave (white + cyan), camera shake 0.018 × 400 ms, yellow ⭐ spinning above stunned heads + gray tint. Energy cost 40 (most expensive — 1 ult/Intern bar, 5/Super Senior bar). **All MOBA skills mechanically complete.**

### Post-MOBA feedback pass (2026-05-31)

- ✅ **Energy economy rework** — passive regen disabled; basic smash is FREE; skill costs lowered (Q:10 / W:15 / E:8 / R:25); pickups now restore both **+40 health + 25 energy**. Effect: players spam basic smash, save energy for tactical skills, must seek pickups for refills.
- ✅ **Q dash now damages enemy players** along the line (Point 2) — Q is fully offensive vs both bugs and players, consistent with PvP rules (respects shield + roll-invuln via existing `_applyPvpHit`).
- ✅ **R now plays the kick pose locally for the caster** (Point 4) — same fix benefits Q/W/E (all 4 skills now correctly animate the caster's own stickman, not just remote players').
- ✅ **PvP basic smash auto-targets nearest enemy player** when no bug is closer (Point 6 audit) — pressing SPACE / SMASH button near an enemy player damages them; previously you had to click them first.

### Deferred (breakdowns ready)

- ✅ **Map obstacles + E pass-through** (Point 3, 2026-05-31) — 14 static AABB obstacles (code-blocks, desks, whiteboards) seeded across the arena. Server clamps players + bugs with slide-along collision. Q dash + E jump get a 350ms pass-through window during cast — they leap over obstacles cleanly with a dust-puff effect at the midpoint. Pickups + bugs avoid spawning inside obstacles. Obstacles render on the minimap as gray rectangles. Breakdown tracker retired.

### Late-session feature wave (2026-05-31)

- ✅ **Destructible code-snippet obstacles** — obstacles dropped the rectangular "block" look and now render as **floating real code text** (no panel, no border): each obstacle picks deterministically from a **57-snippet pool** of hand-written, satirical JS / Python / C / Rust / Go / SQL / Bash / CSS / Regex / PHP / YAML jokes ("// deploy_friday → panic()", "import Claude from '@anthropic/savior'", "while bugs.length > 0 { fix(); cry(); }", "Bug* b = malloc(...); // TODO: free(b)", etc.). Tokens are individually colored using VS Code dark-theme syntax palette (keyword blue, fn yellow, type teal, string orange, comment green, etc.).
- ✅ **Smash to destroy obstacles** — each obstacle has 4 HP. Player smash within ~110 px deals 1 HP per hit (token red flash + scale punch + paper-scrap particles + crack overlay accumulating). At 0 HP: pop burst (white ring + 10 code-scrap rectangles + dust puff + audio) and **2–4 bugs spawn from the wreckage** (bug nest cracked open).
- ✅ **Bugs eat code** — every 1500 ms server scans: each bug within 80 px of an obstacle deals **1 HP/tick (2 for ladybug)**, capped at 4/tick. Same red flash + crack + destruction at 0 HP. Client distinguishes via proximity: if bug nearby → **`◣ ◢` chomp marks + `+1` floater above the bug + 4 colored code crumbs sucked from obstacle into bug**. If no bug nearby → player smash effect.
- ✅ **Dynamic obstacle respawn** — server maintains `OBSTACLE_TARGET = 26` (initial layout has 22 + dynamic refill from 8-variant pool). Every 3500 ms if `obstacles.size < 26`, spawn one at a random world position (12 placement attempts, rejects overlap + within 220 px of any player). New obstacle picks its snippet deterministically from its new position, so it gets a fresh joke.
- ✅ **Ladybug swarm rebalance** — ladybug spawn weight **3 → 7** (now ~39% of all spawns), bumped `null/race/beetle/toxic/scarab/robot` HP by 1 each, eat radius 70 → 80 px, eat interval 2500 → 1500 ms. Beetle: 320 px aggro / 6 dmg / 0.9 s cooldown. Robot: 420 px aggro / 12 dmg / 1.8 s cooldown / 1.4× chase. Toxic cloud: 70 px / 10 dmg / 0.45 s tick / 1.8 s lifetime.
- ✅ **Bug hit feedback** — Bug schema gained `hit_seq` field, bumped on every hit. Client listens → red flash on bug body + scale punch + 2 yellow sparks per non-fatal hit. Multi-HP bugs (beetle/toxic/scarab/robot) now have clear "I hit you!" feedback.
- ✅ **Bug corpse persistence** — `_spawnBugCorpse(kind, x, y)` spawns an independent `bug-dead.png` sprite (50×50, slight random tilt) at death position. **Stays for 4 s solid + 1 s fade = 5 s total** regardless of how fast server removes the bug entity.
- ✅ **Harsher leveling + intern fragility** — XP curve `[0, 12, 40, 100, 230, 500]` → **`[0, 150, 600, 1800, 4500, 10000]`** (~20× harder to reach Lv 6). Intern stats: HP 80 → **50**, energy 60 → **40**, scale 0.85 → **0.70** (visibly small). Higher levels mostly preserved.
- ✅ **Defeat as a major event** — broken duration **8 s → 20 s** (player kneels with cracked-laptop pose, can't act). Bug drop on defeat now scales with **score** instead of level: `min(16, 2 + floor(score / 50))` — high-score players splat 16 bugs on defeat. **Score resets to 0** on defeat (Personal Mode only; Team Mode would preserve score). Death is now a real strategic event.
- ✅ **Procedural stickman renderer scaffolded then disabled** — built [src/render/StickmanRenderer.js](../../../src/render/StickmanRenderer.js) (~400 lines, 8 keyframed-animation states, joint interpolation, broken state with cracked red laptop). User preferred the SVG path; toggle `USE_PROCEDURAL_STICKMAN = false` in MultiPlayScene. Kept available behind the flag for future revisit. Added `idle-broken.svg`, `run-broken.svg`, `run2-broken.svg` (worried face + sweat drop + cracked-red laptop) for the SVG path.
- ✅ **Fan button layout** — bottom-right corner moved from 2×3 grid to **MOBA fan**: SMASH big in corner (r=40), 4 skills (Q/W/E/R) at 30° intervals on a 130 px arc upper-left of SMASH. Renamed `ROLL` → `JUMP` (E is now a vertical hop, not a tumble).
- ✅ **Movement polish** — footstep dust puffs every 260 ms during run (at feet, container.y+14), smooth XP-based size scaling (`smoothScale(level, xp)` interpolates between `LEVEL_SCALES` per XP point, not just at level-up).
- ✅ **VS Code background** — world floor renders as a long fake source file: monospace `Consolas` Text objects tiled in 720×760 chunks across the 6000×3375 world, dimmed to 18% alpha, with dark gutter bars + tiny line-number ticks on left/right edges. Familiar to developers, doesn't compete with gameplay.
- ✅ **Mobile fullscreen + landscape lock** — index.html shows a "▶ TAP TO PLAY" splash on touch devices that enters fullscreen + attempts `screen.orientation.lock('landscape')` (Android Chrome/Firefox; iOS Safari refuses silently, falls back to the rotate-phone overlay). Added `touch-action: none`, `user-scalable=no`, transparent tap-highlight. Game tested LAN on `http://192.168.1.x:8000` from phone, client auto-detects WebSocket hostname.
- ✅ **Cosmetic cleanup** — removed shadow ellipse under feet, removed colored ground ring (player ID now via name+title color above head), 404 console noise suppressed (removed devstick atlas detection, added inline favicon data URI).

### Balance + UX pass (2026-06-02)

- ✅ **Ult rebalance** — radius 200→160, bug damage ×4→×3, player damage `lv×20`/cap 100 → `lv×12`/cap 70, stun 1500→1000 ms. No longer one-shots above Intern; still strong opener/finisher. Energy cost stays 25.
- ✅ **Energy bump** — `LEVEL_MAX_ENERGY` bumped +10–20 per tier: `[40,70,100,130,160,200]` → `[50,90,120,150,180,220]`. Intern can comfortably fit 2 ults or 1 ult + 1 small skill.
- ✅ **Toxic cloud softened** — `10 HP / 450 ms` → `6 HP / 600 ms`. Intern TTD inside cloud 2.3 s → 5 s. Cloud is still threatening but no longer an instakill zone.
- ✅ **PvP damage scaling softened** — `PVP_DAMAGE_PER_LEVEL` 15 → 12. Lv 6 vs Junior is now 72 dmg (survives w/ 18 HP) instead of 90 (instakill).
- ✅ **Bug-drop cap lowered** — `min(16, ...)` → `min(10, ...)`. Less catastrophic death-spiral.
- ✅ **Robot HP nudged** — 7 → 6. Intern now needs 6 smashes (was 7), Mid+ unchanged.
- ✅ **MOBA-style XP-progress badge on each character** — small circle to the left of health/energy bars showing current Lv number + a clockwise progress arc that fills as the player gains XP. Tier-colored number, gold solid ring at Lv 6 cap.
- ✅ **Single shared MP room** — `gameServer.define('arena', ArenaRoom).filterBy([])` so all Personal-Mode players land in the same arena instance (until 32-player cap).
- ✅ **Mobile fullscreen + landscape lock + 'TAP TO PLAY' splash** working on touch devices.
- ✅ **Menu MP launcher** — new framed "MULTIPLAYER" panel in main menu with PERSONAL (live) + TEAM (upcoming, dim with "SOON" badge) buttons. Distinct icons (infinity / crossed swords).
- ✅ **Tab-background crash hardened** — `'cut'` Phaser texture-frame error caught at multiple layers: try/catch around obstacle token color restore, scene-shutdown flag gating all Colyseus callbacks, `textures.exists()` guard before setTexture, plus a window-level error handler suppressing the specific transient `'cut'` error so the game survives tab focus changes.
- ✅ **Bug rebalance — full arc complete** (2026-05-31, Phases A–E) — per-kind HP/speed/score table, robot added, beetle + robot aggressive AI, toxic death cloud, per-kind kill effects. **Folded into design docs** ([09_BALANCE § Bugs](../design/09_BALANCE.md#bugs) + [05_CHARACTERS § Enemies](../design/05_CHARACTERS.md#enemies--bugs)). Breakdown tracker retired.
- 🔵 **Phase 2** — Bug Dash (Q): dash forward + damage on contact
- 🔵 **Phase 3** — Laptop Shield (W): absorb next hit + 3s window
- 🔵 **Phase 4** — Debug Roll (E): mobility + 0.6s invuln
- 🔵 **Phase 5** — Deadline Break (R) ult: AOE + knockback + 1.5s stun
- 🔵 **Phase 6** — balance + polish + design doc updates

The proposal **replaces** Punch/Kick/Parry/Jump bindings. Their SVG art is repurposed into the new skill animations.
- 🔵 **Phase C** (2 sessions): room codes + team selection lobby + friendly-fire-off + recovery zones
- 🔵 **Phase D** (1–2 sessions): multi-stage match + progressive respawn + MVP screen
- 🔵 **Phase E** (deferred): persistent leaderboard backend

### MP feature gaps (some folded into the breakdown above)

- **Skill pickups in MP** — port the 5 AI skills from SP, server-spawned every N seconds, client picks up on overlap, effects sync via schema.
- **AI bots** — server spawns NPC players when room has fewer than ~4 humans, so the arena feels populated for solo testing.
- **Internet hosting** — deploy server to Render or Fly.io free tier so LAN isn't required.

### Polish

- **Pre-rendered Mixamo sprite atlas** — replace the hand-drawn SVG stickman with rendered 3D-look top-down sprites. Pipeline: Mixamo → Blender → 8-direction render → atlas. Big visual upgrade, ~1–2 sessions.
- **Hide/respawn back on as a powerup** — re-enable the dive mechanic but make it a *bug-type-specific* trait (e.g. only the scarab dives), not a global 60% chance.
- **Sound design pass** — more distinct kick / punch / parry sounds; positional 3D audio in the big world.
- **Leaderboard persistence** — SQLite or Supabase free tier behind `/api/scores`.
- **Cosmetics** — laptop skins, character tints, unlocked via play time.

### Distribution

- **Capacitor mobile wrap** — bundle the web client as an Android (and iOS) app.
- **Electron desktop wrap** — same for Steam / itch.io downloads.
- **Itch.io soft launch** for the SP campaign (already zippable).

---

## 🐞 Known issues / behaviours to watch

- **Joystick on touch laptops**: the virtual joystick was wrongly intercepting mouse clicks on touch-capable laptops; fixed by filtering on `pointerType === 'touch'`. Still: regression-test on a real Surface / iPad before any release.
- **Smash range buffer**: server reach (96) is intentionally larger than the visual hit cone (was 56). If kills feel "auto-magnetic" from too far, dial server reach down toward 72 and confirm fast-fleeing bugs still register.
- **Chase hug distance (28px)** keeps you inside the smash cone but you sometimes overlap the bug sprite visually. That looks fine for arcade-feel; can tighten to 40 if it feels too cramped.
- **Action animation duration was overlap-stalling** — smash pose used to be 260ms over a 220ms cooldown, so the sprite never returned to idle between hits. Now smash + punch are 130ms so each hit reads distinctly. Don't increase past 220ms without also widening cooldown.
- **Pointermove drag → marker spam** (fixed) — pooled the move-target ring so rapid clicks don't allocate. Don't reintroduce per-click `add.circle()`.

---

## 📂 Where stuff lives

```
.claude/context/
├── design/                ← what the game IS (intent + reference, 11 files)
├── tasks/                 ← active work tracking
│   ├── TASK_STATUS.md     ← this file (overall status board)
│   ├── STICKYMAN_GROWTH_BREAKDOWN.md ← growth-system test pass
│   └── MP_MODES_BREAKDOWN.md         ← Personal + Team Mode plan
├── develop_notes/         ← stable references
│   └── RUN.md             ← run commands + zip distribution + hosting
├── overview_levels.md     ← SP level difficulty table (reference)
├── plan/                  ← phased plans being executed
├── ideas/                 ← raw proposals (some implemented, some deferred)
└── recycle_bin/           ← outdated docs + parked assets + abandoned scaffolds
    └── document/          ← docs superseded by the design/ set

server/
├── index.js              ← Colyseus boot
└── rooms/ArenaRoom.js    ← MP state schema + tick

src/
├── main.js               ← scene registration
├── core/                 ← AudioManager, SaveManager
├── data/                 ← levels, bugs, skills, talk, tips
├── effects/              ← screen shake, confetti, hit numbers
├── entities/             ← Hunter (SP), Bug, SkillPickup
├── systems/              ← BugSpawner, SkillManager
└── scenes/
    ├── MenuScene.js
    ├── HuntScene.js          ← SP campaign
    ├── PlatformerScene.js    ← prototype
    └── MultiPlayScene.js     ← MP arena
```

---

## Cadence

Update this file at the **end of any session that lands a feature or surfaces a problem**. Lines that go stale faster than two weeks are usually a sign that section should be split into its own doc.
