# 10 · Roadmap

Phased plan from the current state (May 2026) to a public-shippable multiplayer game. Conservative timelines, single engineer.

Status pulled from [../tasks/TASK_STATUS.md](../tasks/TASK_STATUS.md). When this disagrees with that file, TASK_STATUS wins.

---

## Where we are

✅ **Single-player campaign** — 12 levels, polished, ships as a 7.32 MB zip
✅ **Multiplayer arena alpha** — running locally with bug AI, rounds, scoring, combos, growth system, energy, broken state, PvP damage
✅ **Stickyman growth v0** — server-authoritative, live on local server
🟡 Playtest pending for several growth-system edge cases

---

## Phase 4 — Polish + first deploy (next 1–2 sessions)

Goal: get the MP arena to "anyone with the URL can play" status.

### Must-have

- [ ] **PvP knockback** if PvP feels too static after first multi-tab playtest
- [x] **AI bots** to fill empty rooms — AI coworkers, 2026-11-06 (see TASK_STATUS § Office Chaos)
- [ ] **Render free-tier deploy** of the Colyseus server ← the #1 thing between the game and real players
- [ ] **Update `BugSmashHunter.zip` build** to point at deployed server (or env-var toggle)
- [x] **Persist nickname** (+ hat, career, daily missions) via localStorage — mute was already persisted

### Nice-to-have

- [ ] Touch-control tuning on a real phone (Surface / iPad / Android)
- [ ] Background music (procedural bassline loop)
- [ ] Spatial audio (distance-based gain on bug kill SFX)

### Exit criteria

A non-developer friend can visit a single URL, see other players if any are online, play a complete round, level up to Lv3+ at least once, and lose progress via broken state at least once.

---

## Phase 5 — Persistence + identity (~1 session)

Goal: players have names that stick, and there's a leaderboard worth checking.

- [ ] **Lightweight anonymous accounts** (UUID stored in localStorage)
- [x] **Display name persistence**
- [ ] **Daily / weekly leaderboard** backed by SQLite or Supabase free tier
- [x] **Personal stats** — career: bugs, KOs, peak combo, best score/level, bosses, golden bugs (local, 2026-11-06)
- [x] **Cosmetic unlock plumbing** — 12 hats unlocked by career stats, synced as `Player.hat` (client-side unlocks; server allowlist)

---

## Phase 6 — Strategic depth (~2–3 sessions)

Goal: round-to-round variance via tools, not just numbers.

- [ ] **AI skill pickups in MP** (Sonnet, Opus, Haiku, Cursor, Copilot)
- [x] **Bug variety bump** — `bug-robot` charges (done earlier) + the CEO's golden bug
- [x] **World gimmicks** — 6 PM world events + the Deadline boss (2026-11-06)
- [ ] **Room codes** — replace single global room with create/join by 6-char code
- [x] **AI bot personalities** — 5 archetypes (grinder / brawler / coward / tryhard / chaos)

---

## Phase 7 — Modes + content (~2–3 sessions)

Goal: variety to keep players coming back.

- [ ] **Solo Infinite mode** — survival, leaderboard sync
- [x] **Team mode** — became a full 5v5 office MOBA, "Office Siege" (2026-11-07): champion select, 6 champions, lanes/towers/jungle/epics, item shop, bots fill every seat. Next: fog of war, more champions, ranked/MMR, real-player matchmaking across rooms.
- [x] **Boss Arena** — THE DEADLINE is a recurring co-op world boss in Personal Mode (truce, damage-share XP)
- [~] **Cosmetic visuals** — hats ✅; laptop skins, hair styles, aura colors still open
- [x] **Daily challenges** — 3 daily missions (same for everyone) + streaks, shown on the menu

---

## Phase 8 — Polish + distribution (~1–2 sessions)

Goal: ship to itch.io + mobile.

- [ ] **Itch.io HTML5 upload** (game + cover art + screenshots + trailer GIF)
- [ ] **Capacitor Android wrap**
- [ ] **Capacitor iOS wrap** (requires Apple Developer account — $99/yr)
- [ ] **Electron desktop wrap** for Steam / direct download
- [ ] **Soft-launch marketing**: 1–2 dev-community posts, observe metrics

---

## Stretch goals (no commitment)

| Stretch | Cost estimate | Why exciting |
|---|---|---|
| Pre-rendered Mixamo character pipeline | ~2 sessions | TankGank-quality "looks 3D" stickman |
| Mixamo bug menagerie | ~1 session per bug | Better bug variety than current SVG/PNG mix |
| Streaming-friendly spectator mode | ~1 session | Round in progress, viewer picks who to follow |
| Procedural arena themes | ~2 sessions | Office / coffee shop / co-working space / data center |
| Daily challenges with unique modifiers | ~1 session | "Today: kick costs no energy" / "Today: HP doubled" |

---

## Hard "no" list

- ❌ Pay-to-win mechanics
- ❌ Loot boxes
- ❌ Ad SDKs in the gameplay window
- ❌ Account linking that requires email
- ❌ Native engine rewrite (Unity / Godot) — we're committed to web-first browser-native

---

## Cadence

- Each phase ends with a **playtest with a real human other than the developer**.
- Each phase ends with an updated [../tasks/TASK_STATUS.md](../tasks/TASK_STATUS.md).
- Anything that goes more than 3 sessions over estimate gets a "kill, descope, or pivot" review.

---

## Open strategic questions

1. **Monetization?** Currently $0 plan. If MAU > 500 sustained, consider non-intrusive ad placement on results screen, OR cosmetics that are purely earnable.
2. **Vietnamese localization?** The developer's user base is Vietnamese-speaking; UI is currently English-only. Cheap to localize, big audience boost.
3. **Console version?** Out of scope, but the design works for Switch/Xbox arcade tier. Revisit only if Steam version succeeds.
