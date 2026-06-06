# MOBA Skill System — Task Breakdown

Source proposal: [../ideas/Stickyman_Skill_System_MOBA_Proposal_v2.md](../ideas/Stickyman_Skill_System_MOBA_Proposal_v2.md)

**Status (2026-05-31):** Phases 1-5 all landed. **All 4 MOBA skills are mechanically complete.** Energy-only gating (no time CDs). Phase 6 (balance + design-doc fold-in) queued after playtest.

This doc is temporary — fold the surviving content into the design folder (`02_CORE_MECHANICS`, `07_UX_AND_CONTROLS`, `09_BALANCE`) once the system stabilises, then delete this file.

---

## Scope

The proposal **replaces** the current attack system (Punch/Kick/Parry/Jump) with a MOBA-style ability set:

- **Basic attack** (free, no cooldown) — bound to **SPACE** or left-click on enemy
- **Q — Bug Dash** (8 s CD) — dash forward, damage on contact
- **W — Laptop Shield** (12 s CD) — block next hit + reduce damage for ~3 s
- **E — Debug Roll** (10 s CD) — quick reposition + invulnerability for ~0.6 s
- **R — Deadline Break** (60 s CD) — AOE smash + knockback + 1.5 s stun

Punch / Kick / Parry / Jump as standalone actions go away. Their **SVG art assets are repurposed** into the new skills (see §Art reuse below).

---

## Ambiguities resolved

| # | Question | Decision |
|---|---|---|
| 1 | WASD vs W=Shield conflict | **Arrows + left-click for movement; WASD removed as movement keys.** W is freed for the Shield skill. Players who prefer keyboard can still use arrows; mouse users get LoL-style click-to-move. |
| 2 | What happens to Punch / Kick / Parry / Jump? | **Removed** as bindings. Their SVG art is **repurposed** into the new skill animations. |
| 3 | Basic attack — auto-attack or manual? | **Both.** SPACE = manual swing at nearest in-range enemy (no cooldown beyond the smash 220 ms anim cycle). Left-click on a bug/player = walk-into-range + auto-smash (existing behavior unchanged). |
| 4 | Cooldown UI placement | Overlay an **animated arc + greyscale tint** on each skill button + a small numeric remainder. Cooldown lives on the existing 4-button mobile grid layout. |
| 5 | Stun behavior — what's "stunned"? | Server flag `stunnedUntil: number`. Stunned players: can't move, can't cast, can't attack. Sprite shows spinning ⭐ above head. Cannot be re-stunned during the window. |
| 6 | Knockback — how far + against walls? | Push 120 px away from attacker. Clamp to arena bounds (no bounce). Server-authoritative; client gets the new position via schema sync. |
| 7 | Dash — through enemies or stop on contact? | **Pass through** bugs (damaging each one hit). Stops on player collision (small bump-back). |
| 8 | Shield — absorb 1 hit or reduce all hits? | Absorb **next 1 hit completely**, then expire. Visual disappears on consume. If no hit lands in 3 s, expires unused. |
| 9 | Roll — what does invulnerability cover? | Bug contact damage, PvP attacks, ult stun. Does NOT prevent broken state from existing energy depletion (you can still suicide-mash). |
| 10 | Cooldowns reset on broken? | **Yes** — all skill cooldowns reset to 0 when entering broken state (consistent with level/XP reset). |

---

## Final control scheme

| Input | Action |
|---|---|
| **Left-click ground** | Walk to point |
| **Left-click bug/player** | Chase + auto basic-attack in range |
| **Arrow keys ← → ↑ ↓** | Direct movement (cancels click target) |
| **SPACE** | Basic attack (smash nearest in-range) |
| **Q** | Bug Dash |
| **W** | Laptop Shield |
| **E** | Debug Roll |
| **R** | Deadline Break (ult) |
| **ESC** | Back to menu |
| **Mobile** | Virtual joystick (left half) + 5 action buttons (right): SMASH·Q·W·E·R |

---

## Art reuse plan

We've invested in 7 SVG poses. None go to waste — all become parts of new skills:

| Existing SVG | New role |
|---|---|
| `stick-smash.svg` | Basic attack (unchanged — SPACE swing) |
| `stick-punch.svg` | First frame of **Bug Dash** (lean-forward as the dash starts) |
| `stick-kick.svg` | **Deadline Break** ult pose — laptop crashes into the ground |
| `stick-parry.svg` | **Laptop Shield** pose (already the defensive shield pose) |
| `stick-jump.svg` | **Debug Roll** mid-air frame |
| `stick-run.svg` + `run2.svg` | Run cycle unchanged |
| `stick-idle.svg` | Idle unchanged |

So no new art is strictly required to ship Phase 1–5. Higher-fidelity multi-frame sprites can come later via the Mixamo atlas pipeline (see [MIXAMO_ATLAS_BREAKDOWN.md](./MIXAMO_ATLAS_BREAKDOWN.md)).

---

## Phase plan

Each phase is sized to ~1 focused session. Cooldown infrastructure lands in Phase 1 so every subsequent phase is mostly "add one skill + its mechanic".

### Phase 1 — Foundation ✅ LANDED 2026-05-30

Foundation work that enables every skill. Game **plays like before** except old keys are unbound and 4 new buttons sit on the action grid with placeholder behaviour.

- [x] **Server schema:** added `cdQ`/`cdW`/`cdE`/`cdR: number` per player (Date.now() timestamps when each skill is ready; `0` = ready immediately)
- [x] **Server:** new `'castSkill'` message handler — validates cooldown + energy + not-broken; sets new cooldown; broadcasts action + action_seq for the corresponding pose (dash→punch, shield→parry, roll→jump, ult→kick)
- [x] **Server:** added `shielded`, `invulnUntil`, `stunnedUntil` fields per player (used by Phases 3-5)
- [x] **Server:** broken state resets all 4 cooldowns + clears status flags
- [x] **Server:** energy costs per slot — Q:12 / W:8 / E:6 / R:20
- [x] **Client:** removed old W/E/R/SPACE bindings for punch/kick/parry/jump
- [x] **Client:** Q/W/E/R bound to `_castSkill(slot)`; SPACE bound to `_triggerAction('smash')` for basic
- [x] **Client:** action button grid rebuilt — 5 buttons (SMASH·DASH·SHIELD·ROLL·ULT) replacing the old 6
- [x] **Client:** cooldown arc overlay + remaining-seconds text on each skill button, updated per-frame in `_updateSkillCooldowns()`
- [x] **Client:** `_castSkill(slot)` checks server-known cooldown before sending; whiff plays uiClick
- [x] Updated hint text + task tracker

**Exit criteria met:** Q/W/E/R cast plays the matching pose animation and shows the cooldown arc. No actual unique mechanic yet — Phases 2-5 add dash impulse / shield damage absorb / roll invuln / ult AOE+stun.

### Phase 2 — Bug Dash (Q) ✅ LANDED 2026-05-30 · revised

**Design pivot 2026-05-30:** Q is now an **enemy-targeted strike**, not a free-aim dash. Requires a target (bug OR enemy player) within 360 px. Whiffs the cast if no enemy is nearby. Shorter than Roll (140 vs 180 px) so it's a "close the gap" move, not a "flee" move.

- [x] **Client:** scans bugs + remote players within 360 px search radius on Q press; whiff (uiClick) if none in range
- [x] **Client:** auto-aims direction toward the nearest enemy; no longer uses `_lastDirX/Y`
- [x] **Server:** `'castSkill'` with `{ slot: 'q', dirX, dirY }` → teleports player by 140 px in direction (clamped to arena bounds), scans bugs within 50 px of the dash line, damages each by `bugDamageForLevel(level) × 2`
- [x] **Server:** `_applyDashHit(p, bug, id, dmg)` mirrors `_applyHit` but with custom damage value; awards combo + xp + level-up on kill same as normal smash
- [x] **Server:** energy cost 20; broken players blocked
- [x] **Client:** local-position prediction — tweens `localPos` to destination over 180 ms to match the server's instant teleport
- [x] **Visual:** 3 ghost afterimage copies, blue-tinted, fading at staggered durations (280/340/400 ms); dust puff at launch position
- [x] **Audio:** `smashHit` cue on cast

### Tuning levers if it feels off

| Symptom | Knob |
|---|---|
| Dash too short | Bump `DASH_DISTANCE` 140 → 180 (server) + matching 140 → 180 in client `_castSkill` (slot 'q') |
| Whiffs too easily | Bump client `SEARCH_RANGE` 360 → 500 |
| Misses fleeing bugs | Bump `DASH_HIT_RADIUS` 50 → 70 |
| Too powerful | Drop `DASH_BUG_DAMAGE_MUL` 2 → 1.5 |
| Visual snap | Increase tween duration 180 → 230 ms |

### Phase 3 — Laptop Shield (W) ✅ LANDED 2026-05-30

- [x] **Server:** on `castSkill { slot: 'w' }`, set `p.shielded = true`; setTimeout 3000 ms to auto-expire (no-op if already consumed)
- [x] **Server:** `_applyPvpHit` checks `other.shielded` first — if set, absorbs damage (no health loss) and consumes the shield
- [x] **Server:** `SHIELD_DURATION_MS = 3000`
- [x] **Client:** subscribes to `shielded` field; toggles a cyan disc around player on entry; plays a white-burst + 8 cyan crack streaks on exit (covers both consumed-early and natural expiry — visually identical)
- [x] **Client:** disc breathes at 5.5 Hz alpha pulse while active
- [x] **Sprite:** server already plays the `parry` action pose at cast (animMs 620) — disc persists past the pose for the full 3 s window
- [x] Energy cost 25 (already set in Phase 1)

### Tuning levers if it feels off

| Symptom | Knob |
|---|---|
| Shield too short | Bump `SHIELD_DURATION_MS` 3000 → 4000 |
| Too strong (always block first hit) | Lock out re-cast after consume; OR reduce damage 50% instead of full absorb |
| Disc visual too small | Bump `shieldDisc` radius 50 → 65 |

### Phase 4 — Debug Roll (E) ✅ LANDED 2026-05-30

- [x] **Server:** on `castSkill { slot: 'e', dirX, dirY }`, teleport player by 180 px in direction (clamped to arena), set `invulnUntil = now + 600`
- [x] **Server:** `_applyPvpHit` rejects damage when `now < invulnUntil` (skips even shield consumption)
- [x] **Sprite pose:** server plays the `jump` action pose at cast (already wired via Phase 1)
- [x] **Client visual:** 360° sprite spin in roll direction (250 ms), alpha blink 1.0 ↔ 0.35 × 2 yoyo cycles (matches invuln window feel), dust puff at start
- [x] **Client prediction:** same 250 ms position tween as dash, no damage path
- [x] Energy cost 15 (Phase 1 default; smallest of the four skills)

### Tuning levers

| Symptom | Knob |
|---|---|
| Too much invuln | Drop `ROLL_INVULN_MS` 600 → 400 |
| Too short distance | Bump `ROLL_DISTANCE` 180 → 220 |
| Spin reads wrong | Tweak `spinDir` logic in `_spawnRollVisual` |

### Phase 5 — Deadline Break ult (R) ✅ LANDED 2026-05-31

- [x] **Server:** on `castSkill { slot: 'r' }`, scan all alive bugs + all alive enemy players within 200 px
- [x] **Server:** bugs lose `bugDamageForLevel(level) × 4` HP (Lv 6 = 16 dmg per bug — instakills almost anything)
- [x] **Server:** players lose `min(level × 20, 100)` health (Lv 6 cap 100 = 1-shot KO on Intern; capped so Lv 6 vs Lv 6 isn't unrecoverable)
- [x] **Server:** `_applyUltHit` respects roll-invuln + shield (consume on absorb)
- [x] **Server:** **knockback** — instant teleport 120 px away from caster, clamped to arena
- [x] **Server:** **stun** — `stunnedUntil = now + 1500` on each enemy hit
- [x] **Server:** stun gates added to `move`, `castSkill`, `smash` handlers (reject if `now < stunnedUntil`)
- [x] **Client:** dual expanding shockwaves (white inner @ 220 ms + cyan outer @ 500 ms) anchored to caster position
- [x] **Client:** camera shake 400 ms / amplitude 0.018
- [x] **Client:** stun visual — yellow ⭐ above each stunned player's head, slow spinning (clears when window ends)
- [x] **Client:** stunned players gray-tinted while stunned (cleared on exit; doesn't clobber broken-state tint)
- [x] **Audio:** `failure` (thud) + `combo(3)` (dramatic chime) layered on cast
- [x] **Sprite pose:** `kick` action set by server (Phase 1 mapping) for the slam frame
- [x] Energy cost 40 (most expensive skill; ~1 ult per Intern energy bar, ~5 per Super Senior)

### Tuning levers

| Symptom | Knob |
|---|---|
| Ult too weak | Bump `ULT_PLAYER_DMG_PER_LV` 20 → 30, or `ULT_BUG_DAMAGE_MUL` 4 → 6 |
| Ult one-shots whole lobby | Drop `ULT_PLAYER_DMG_CAP` 100 → 70 |
| Knockback too short | Bump `ULT_KNOCKBACK` 120 → 180 |
| Stun too long | Drop `ULT_STUN_MS` 1500 → 1000 |
| Radius too small | Bump `ULT_RADIUS` 200 → 260 |

---

### Phase 6 — Balance + polish (queued)

After playtesting Phases 2-5 together, tune the dials, then fold the surviving content into `design/02_CORE_MECHANICS.md`, `design/09_BALANCE.md`, and `design/07_UX_AND_CONTROLS.md`. Delete this temp tracker.

### Phase 6 — Balance + polish (~½ session)

- [ ] Playtest cooldowns. Initial values: 8 / 12 / 10 / 60 s per proposal. May need tuning.
- [ ] Tweak knockback distance + stun duration based on feel
- [ ] Cooldown UI: pick clearer color (currently dark arc — may need contrast)
- [ ] Add a "broken resets cooldowns" visual ping
- [ ] Update design docs: `02_CORE_MECHANICS` (combat verbs table), `09_BALANCE` (cooldown values), `07_UX_AND_CONTROLS` (control matrix)

---

## Open questions to resolve mid-implementation

| # | Question | When |
|---|---|---|
| 1 | Mobile cooldown UI — also show "press to ready" prompt or just the arc? | Phase 1 |
| 2 | Can you cast a skill while moving via arrow keys? (currently chase ignores Q press) | Phase 2 |
| 3 | Dash through walls / clamp to bounds? | Phase 2 |
| 4 | Shield blocks bug AOE (kick from another player) or only direct hits? | Phase 3 |
| 5 | Does Roll interrupt the player's current chase target? | Phase 4 |
| 6 | Ult radius scales with caster level, or fixed? | Phase 5 |
| 7 | Visible global ult cooldown indicator (so allies know your ult is ready)? | Phase 5 / Team Mode |

---

## Rollback per phase

| Phase | Hurts gameplay? | Rollback action |
|---|---|---|
| 1 — Foundation | New keys feel confusing | Revert key bindings; re-enable W/E/R for punch/kick/parry alongside new mappings (transitional period) |
| 2 — Dash | Too far / too short | Tune `DASH_DISTANCE_PX` (~220) and `DASH_DURATION_MS` (~200) |
| 3 — Shield | Too OP (always block first PvP hit) | Add a "lockout after consume" of 2 s; OR shield only blocks 50% damage instead of 100% |
| 4 — Roll | Invuln too forgiving | Drop invuln window 600 → 400 ms; OR drop roll distance |
| 5 — Ult | One-shots whole lobby | Cap damage at `min(level*20, 60)` + remove stun for Personal Mode (keep stun in Team Mode) |

---

## Tension flag — game identity

The proposal moves us from **spam-attack hyper-casual** toward **tactical-cooldown MOBA**. Both can work but they're different audiences. Key checkpoints to validate the design intent:

- **After Phase 1**: does pressing Q/W/E/R with placeholder behavior feel awkward, or natural?
- **After Phase 2 (Dash)**: does the mobility skill make the game feel more strategic, or just delay-y?
- **After Phase 5 (Ult)**: 60 s cooldown for the big AOE — does it create exciting "save it for the right moment" decisions, or feel oppressively rare?

If after any checkpoint the game feels worse, **stop and revisit** instead of continuing through the phases.
