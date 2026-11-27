# Champions, Kits, Skills & Visuals (v6.1)

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Source of truth:** `shared/moba/champions.js` — 18 champions, 72 skills (plus stance variants), every skill with its own visual style (`SKILL_FX`).
**Status:** v6 (core systems) and v6.1 (new crowd control, delivery shapes, 86 visual recipes) are implemented. This file is the single reference; it
absorbed the former design documents `03_KIT_REDESIGN_V6.md` and `04_KIT_REDESIGN_V6_1.md`, which were deleted (their task lists and project notes are not
carried over; the contract text is folded in below). Sections that described the v5 kits (matchup tables, combo sheets, power spikes, lane playbooks,
kit audit, skill-type counts) were removed because they no longer match the game.

**Section map for code comments and cross-references.** Comments in the code and a few references inside the merged text cite the numbering of the two
deleted documents ("v6 numbering" / "v6.1 numbering"). Translate them with this table:

| Cited as | Now in this file |
| :--- | :--- |
| v6 section 2 (roster overview) | 1.1 |
| v6 section 3 (wire contract), 3.1 to 3.4 | 2, 2.1 to 2.4 |
| v6 section 4 (primitives), 4.1 to 4.11 | 2.5, 2.5.1 to 2.5.11 |
| v6 section 5 (kits in plain English) | 1.2 |
| v6 section 6 (bots) | 4 |
| v6 section 7 (VFX style names) | 6.1 |
| v6 section 10 (humor lines) | not carried over; the lines live in `server/data/kitFeed.js` |
| v6 section 11 (risks) | 9.1 |
| v6.1 section 2 (archetype catalogue) | 10 |
| v6.1 section 3 and 3.1 to 3.8 (contract) | 3, 3.1 to 3.8 (3.8 = bots) |
| v6.1 section 4 (champion changes) | 1.3 |
| v6.1 section 5 (interaction matrix) | 9 |
| v6.1 section 6 (humor lines) | not carried over; see `server/data/kitFeed.js` |
| v6.1 section 7 (visual recipes), 7.1 | 6.2, 6.3 |
| v6.1 section 9 (risks) | 9.2 |

**Contents**
1. Roster at a glance and kit summaries
2. Core systems and the wire contract (v6)
3. Crowd control, delivery shapes and states (v6.1)
4. Bots
5. Champion sheets (stats, passive, build, skills)
6. Visual recipes
7. Engine rules, damage channels, auto-aim, practice mode
8. Balance targets, stat progression, role benchmarks
9. Interaction matrix, counterplay and known risks
10. Archetype catalogue (design inspiration)

---

## 1. Roster at a glance and kit summaries

| ID | Champion | Role | Lane | Difficulty | Unique Passive | Kit state (`kit`) |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `pixel` | **Pixel** (the Frontend Wizard) | Mage | `mid` | 3/3 | Syntax Surge | N/A |
| `stack` | **Stack** (the Backend Tank) | Tank | `top` | 2/3 | Failover Armor | stance |
| `ops` | **Ops** (the DevOps Medic) | Support | `support` | 2/3 | Uptime Pulse | N/A |
| `tester` | **Tester** (the QA Sniper) | Marksman | `bot` | 3/3 | Regression Mark | N/A |
| `zero` | **Zero** (the Security Ninja) | Assassin | `jungle` | 3/3 | Zero-Day Strike | N/A |
| `model` | **Model** (the Data Sorcerer) | Controller | `mid` | 3/3 | Gradient Descent | res |
| `guard` | **Brick** (the Security Guard) | Tank | `top` | 2/3 | Firewall Plating | N/A |
| `cleaner` | **Mop** (the Night-Shift Cleaner) | Mage | `mid` | 2/3 | Clean Sweep | stance |
| `courier` | **Rush** (the Delivery Rider) | Jungler | `jungle` | 3/3 | Express Delivery | pkg |
| `embedded` | **Volt** (the Embedded Engineer) | Support | `support` | 3/3 | Servo EMP | N/A |
| `dev` | **Patch** (the Software Engineer) | Fighter | `top` | 3/3 | Hotfix Fury | stance |
| `appdev` | **Swipe** (the App Developer) | Marksman | `bot` | 3/3 | Swipe Combo | res |
| `sprint` | **Sprint** (the Scrum Master) | Jungler | `jungle` | 3/3 | Sprint Velocity | N/A |
| `cache` | **Cache** (the Data Engineer) | Marksman | `bot` | 3/3 | Cache Hit | N/A |
| `hr` | **Hira** (the People Partner) | Support | `support` | 2/3 | Culture Fit | N/A |
| `lint` | **Lint** (the Code Reviewer) | Controller | `mid` | 3/3 | Strict Audit | N/A |
| `barista` | **Brew** (the Office Barista) | Support | `support` | 3/3 | Espresso Shot | mix |
| `oncall` | **Pager** (the On-Call SRE) | Jungler | `jungle` | 3/3 | Incident Response | N/A |

### 1.1 Core system and what each key does (v6)

| Champion | Core system | Q | W | E | R |
|---|---|---|---|---|---|
| Pixel | Drawn laser wall + rewind | Laser Fence: drag a 2-point wall (4s) that hurts and marks Glitch | Flexbox Orbs: chain zap, +30% vs Glitch | Ctrl+Z: rewind own position 3s, cleanse | Framework Rewrite: delayed nuke, +25% vs Glitch |
| Stack | Portal pair | SQL Hook: pull + stun | Access Control: toggle portals everyone / allies only (+shield) | Portal Pair: place A, recast to place B, 9s | Database Lock: pull-in + stun |
| Ops | Heal tether + ally swap | Health Check: scan, slow, self heal | Hotfix Tether: channel link, heals ally per tick | Hot Swap: trade places with an ally, both get a shield and speed | Blue-Green Deploy: team heal + shield |
| Tester | Charge sniper + scout | Unit Test: HOLD to charge (range, dmg scale) | Scout Drone: flying vision unit that spots | Edge Case: vault + net | Regression Barrage: map-wide shot, +25% vs spotted |
| Zero | Shadow clone | Fork Process: place shadow | Context Switch: swap with shadow + stealth | Brute Force: slash at you AND shadow | Zero-Day: execute, leaves shadow at origin |
| Model | Data orbs (resource 0-3) | Gradient Descent: spend orbs for dmg/radius | Overfit: spend orbs for shield layers | Random Forest: spend orbs for root time | Big Data: spend orbs for dmg/stun |
| Brick | Charge bash + barricade | Shoulder Bash: HOLD, longer = farther/harder | Clipboard of Rules: shield + spell shield | Barricade: solid object with HP (max 2) | Building Lockdown: knockback ring |
| Mop | Two stances (mop / bucket) | Sweep (mop) / Bucket Toss (bucket) | Switch Gear: toggle stance | Mop Slide / Soap Bubble | Mop Up (self ring) / Flood (ranged) |
| Rush | Package delivery, tip by distance | Express Delivery: dash (distance counts) | Pick Up Order: load package | Deliver: rush to ally or tower, tip-scaled reward | Peak Hours: tips x2, W reset, speed |
| Volt | Turrets with heat | Deploy Turret (max 3, overheats and explodes) | Overclock: faster fire, faster heat | Coolant Vent: heat to 0 + slow cloud | Controlled Burst: detonate all, hotter = bigger |
| Patch | Git branch stances (main / hotfix / feature) | Refactor / Hotfix dash / Feature Creep aura | git checkout: cycle branch | Branch dash (recast) / Cherry-pick blink / Scope Creep pull | Merge Conflict / Force Push execute / Release team buff |
| Swipe | Magazine + timed reload | Push Notification: 1 ammo | Burst Update: 3 ammo fan | Swipe Left: step back + active reload | App Store Launch: dumps magazine for +dmg |
| Sprint | 4s timebox refunds cooldowns | Daily Stand-up | Sprint Planning: open timebox | Story Points leap | All Hands Sprint |
| Cache | Echo: stored copy of next skill | Batch Job: pierce, CD refund, Stale | Cache Line: arm echo | Failover blink | Full Table Scan |
| Hira | Damage-share link | Feedback Hook | Buddy System: link two allies, share 50% damage | Policy Update zone | Mandatory Meeting silence |
| Lint | Comment pins on the map | Nit Pin | Blocker Pin | Suggestion Pin (ally trigger) | Merge When Resolved: detonate all pins |
| Brew | Ingredient mix decides ult | Espresso Shot (+S) | Steamed Milk (+M) | Syrup Spill (+G) | Serve: 5 outcomes by mix |
| Pager | Team rewind | Ping: dash, +30% vs Paged | Page Everyone: pierce, Paged mark | Postmortem: slow ring | Rollback: team position + HP back 3s |

### 1.2 Kit descriptions (v6)

Exact data: `shared/moba/champions.js`. Costs are mana; cooldowns are seconds.
- Pixel: Q Laser Fence (60 mana, 9s) drag a wall up to 520 px, 4s, crossers take 50+ AP damage, 30% slow, Glitch mark; W chain zap (55, 9s); E Ctrl+Z (50, 16s) position rewind 3s and cleanse; R Framework Rewrite (100, 70s).
- Stack: Q hook (11s); W Access Control (0 mana, 1.5s) toggles portal filter and gives a 60+ shield; E Portal Pair (60, 16s) place A, press E within 6s to place B, 9s of teleport; R Database Lock (75s).
- Ops: Q scan (6s); W Hotfix Tether (50, 9s) 22+ heal per 0.5s for 5s, 40% back to Ops, Ops slowed 25%; E Hot Swap (55, 14s) swaps places with the ally nearest the aim within 650 px, both get a 2.5s shield and +30% MS; R Blue-Green Deploy (85s).
- Tester: Q Unit Test (50, 6s) hold 0.25-1.4s: damage x0.6-1.8, range 600-1500; W Scout Drone (40, 20s) 7s, 650 vision, Spotted 3s; E vault (11s); R Barrage (58s) +25% on spotted.
- Zero: Q Fork Process (30, 7s) shadow 6s; W Context Switch (25, 5s) swap + 0.9s stealth + 25% MS; E Brute Force (35, 6s) slash at both bodies, Vulnerable mark; R Zero-Day (90, 68s) execute behind target, shadow at origin.
- Model: orbs 3 max, +0.4/s. Q (45, 5s) +30% dmg and +8% radius per orb; W Overfit (40, 12s) 1-3 orbs, 45+ shield each; E (55, 11s) +0.25s root per orb; R (100, 80s) 1-3 orbs, +25% dmg, +0.25s stun per orb.
- Brick: Q Shoulder Bash hold 0.2-1.1s (40, 9s); W (13s); E Barricade (50, 14s) 260+ HP, 6s, max 2, solid; R Lockdown (78s), walls and barricades stun.
- Mop: W Switch Gear (0 mana, 3s). Mop stance: Sweep 5-broom fan (360 range), Mop Slide with wet trail, Mop Up self ring 3.5s. Bucket stance: Bucket Toss lob (760), Soap Bubble (800), Flood (900, 4.5s).
- Rush: W Pick Up Order (30, 14s); E Deliver (40, 4s) needs package; reward 40-100% by tip (distance / 2600 px); Q dash counts distance; R Peak Hours (80, 72s) tips x2, W reset, +25% MS 6s.
- Volt: Q Deploy Turret (55, 8s) 140+ HP, range 520, 16+ dmg per shot / 0.7s, +6 heat per shot, explodes at 100 (230 radius); W Overclock (50, 12s) x2 rate and heat 4s; E Coolant Vent (45, 10s); R Controlled Burst (62s). Servo (pet) stays and is boosted by W.
- Patch: W git checkout (0 mana, 2.5s) cycles main, hotfix, feature. Main: Refactor spin, branch dash (recast), Merge Conflict stun. Hotfix: Hotfix dash (4s), Cherry-pick blink (8s), Force Push execute. Feature: Feature Creep aura (8s), Scope Creep pull (12s), Release team buff (80s).
- Swipe: ammo 6. Q 1 ammo (8 mana, 0.8s); W 2-3 ammo fan (20, 5s); E reload (0 mana): 1.7s, gold window at 40-60%, perfect = instant + AS/MS; jam = +0.5s; R dumps up to 6 ammo for +10% each (90, 62s).
- Sprint: W Sprint Planning (40, 16s) 4s timebox, 60% refund of Q and E cooldowns cast inside; Q (5.5s), E (10s, kill reset), R rally (75s).
- Cache: W Cache Line (40, 14s) arms 5s, copy of next Q or E 1.2s later at 60%; Q marks Stale and refunds cooldowns; E blink; R Table Scan with Stale detonation.
- Hira: W Buddy System (60, 14s) 6s link, 50% shared, breaks past 900 px; Q hook; E policy zone; R meeting with silence.
- Lint: pins max 5 total. Q Nit Pin (35, 4s) dmg + slow + Nit; W Blocker Pin (50, 9s) root 1.1s + Nit; E Suggestion Pin (45, 8s) ally heal 55+ and +25% MS; R Merge When Resolved (90, 70s) detonates all, +18% true per Nit.
- Brew: Q +S, W +M, E +G; R Serve (90, 60s): shot = 200+ AP blast + 0.8s stun; milk = 150+ heal and 90+ shield team; syrup = +35% MS and AS team 4s; mocha = heal + burn zone; plain = weak drip. Size 1/2/3 = 60/85/100%.
- Pager: R Rollback (100, 90s) team within 900 px, position and HP of 3s ago, cleansed; Q Ping, W Page (Paged mark), E Postmortem unchanged in role.

### 1.3 What v6.1 changed per champion

| Champion | Slot | Change | New variety |
|---|---|---|---|
| Pixel | R | Framework Rewrite: circle (r320) becomes a `line` (1050 x 170, delay 700 ms), dmg 270+ | line shape |
| Stack | R | Database Lock: stun 1000 ms becomes `airborne` 900 ms (pull-in kept) | knock-up |
| Ops | R | Blue-Green Deploy: heal 160+, shield 130+, plus `reviveGuard` 3 s, 30% HP, 1 s untargetable | revive |
| Tester | R | Regression Barrage: `global` (range 5600, windup 450 ms, speed 2600), cd 65 | map-wide |
| Zero | R | Zero-Day: adds `suppress` 1000 ms with strike at the end, cancellable | suppress |
| Model | E | Random Forest: circle snare becomes a `barrier` wall 360 x 44, 3.5 s, plants dmg and root on overlap | wall |
| Brick | W | Clipboard of Rules: becomes a circle (r300, 200 ms) with `taunt` 1000 ms; the shield, armor, spell shield move to `self{}` | taunt |
| Mop | Q (mop) | Sweep: 5 projectiles become a `cone` 90 deg x 380, delay 120 ms | cone |
| Rush | Q | Express Delivery: adds `phase { maxWall: 200 }` | terrain dash |
| Volt | E | Coolant Vent: ring mist, inner 110 / outer 260, slow 50% | ring |
| Patch | Q (main) | Refactor: circle becomes an `arc` 200 deg, r330, inner 40, sweep 260 ms | arc |
| Hira | Q | Feedback Hook: pull+root becomes `charm` 1100 ms (no pull), cd 11 | charm |
| Lint | W | Blocker Pin: root 1100 ms becomes `disarm` 1800 ms | disarm |
| Brew | Q | Espresso Shot: slow 20% plus `blind` 1000 ms | blind |
| Pager | E | Postmortem: adds `fear` 800 ms, delay 150 ms, slow 40%, cd 16 | fear |
| Sprint | E | Story Points: adds `untarget` 350 ms (ghost leap) | untargetable |
| Cache | E | Failover: adds `untarget` 600 ms (ghost blink), cd 14 | untargetable |
| Swipe | none | unchanged in data (visual rework only) | none |
No two champions share a CC on the same shape: every new CC appears once and every new shape appears once; untargetable appears
twice but on a leap (single target) versus a blink (self). Hira charm is a skillshot, Brick taunt is a self circle, Pager fear is a
self circle with 150 ms telegraph and a different CC, Stack knock-up is a pull-in circle.

---

## 2. Core systems and the wire contract (v6)

### 2.1 Client to server: `cast` (extended, same message name)
`{ slot:'q'|'w'|'e'|'r', x, y, id?, x2?, y2?, ph?:'down'|'up'|'cancel' }` (all numbers world px, finite; server clamps to map).
- No `ph` = tap: legacy behaviour. A tap on an `input:'hold'` skill is a QUICK-CAST at charge fraction `hold.quick` (this is also what bots and touch fallback use).
- `input:'hold'`: client sends `ph:'down'` on key down, `ph:'up'` (with the aim at release) on key up, `ph:'cancel'` on Esc / stun / death / S. Server `down` validates exactly like a cast (alive, not stunned or silenced, rank, cooldown, mana >= spec.mana, spend gate) but spends nothing; stores `ch._hold = { slot, t0, aim }`; applies a self slow `hold.moveSlow` (refreshed every tick, 150 ms); sends fx `charge`. `up` computes `f = clamp((now - t0 - minMs) / (maxMs - minMs), 0, 1)` and runs the normal pipeline (mana, cooldown, spend are charged now) with the spec scaled by `hold.scale` (lerp of [a, b] by f for dmg, range, width, radius, knockback). The server auto-releases at `t0 + maxMs + KIT_TUNING.HOLD_GRACE_MS` with the `down` aim. Casting any other skill, stun, knockback or death cancels a hold at no cost. `up` and `cancel` are exempt from CAST_RATE_MS.
- `input:'drag'`: client records point A on key down and B on key up and sends ONE `cast` with `x,y` = A and `x2,y2` = B. Server: A clamped to `spec.range` from the caster; B clamped to `obj.len` from A. If B is missing or `|B-A| < DRAG_MIN_PX` the wall is centered on A, perpendicular to caster-to-A, length `obj.len * DRAG_DEFAULT_FRAC`.
- Ally targets (`targets:'ally'`): `id` = ally champion id (client sends the hovered / nearest ally; for `link` and `tether`). Server validates alive, same team, within `range + 40`; if `id` is empty it takes the ally nearest the aim within range; none = cast fails, nothing spent.
- Recast presses (`spec.recast`) are the same message; server decides by its own recast window (existing v5 rule). New recast modes: `'place2'` (Stack portal B, aim point within `obj.range2`), `'toObj'` (Ops: teleport to own beacon, consumes it). Tether (Ops W) and Reload (Swipe E) treat a second press as a state action (see 4.3, 4.11).
- No other new client-to-server message. Stances, resources and pickups are plain casts.

### 2.2 Synced state: buffs tag convention (no new schema field)
Tags are appended to `TeamChamp.buffs` AFTER the existing tags, in this fixed order, only when active. Grammar `kit:<key>:<value>` (value has no comma or colon):
`kit:stance:<name>` (always for champions with `kit.stance`) · `kit:orbs:<0-3>` · `kit:ammo:<0-6>` · `kit:mix:<letters S M G, oldest first>` · `kit:pkg:<tip pct, multiple of 5>` · `kit:shadow:1` · `kit:echo:1` (armed) · `kit:tbox:1` · `kit:tether:1` · `kit:link:<partner id>` · `kit:reload:1` · `kit:turrets:<n>` · `kit:pins:<n>`.
Parse with `parseKitTags(buffs)` from champions.js. Every generic buff-icon renderer must ignore tags starting with `kit:`. Resources are integers (fractional gain is kept server-side only). Turret heat is NOT per champion (see objects). Reason for no schema change: all of this changes at most a few times per second and rides the existing string; units reuse `state.units`.
Schema: NO change. Justification: `buffs` string + `fx` messages + existing `TeamUnit` cover everything.

### 2.3 Placed objects with HP use `state.units`
Barricade and turret = `TeamUnit` with `kind:'obj'`, `campId` = `'barricade'|'turret'`, `owner` = champion key, `team` = owner's team, `hp/maxHp`. They are targetable by order-attack and hit by skill areas (they sit in `room.units`), immune to CC / knockback / execute / marks, give no gold or xp, never auto-selected by minions or monsters except as last choice. Objects without HP (wall, portal, beacon, pin, shadow) are fx-only.

### 2.4 Server to client: new `fx` kinds (all `_fx` entries; ids are strings `ob_<n>` for objects)
| k | fields | meaning |
|---|---|---|
| `charge` | sid, slot, minMs, maxMs, color | caster started charging; client animates locally, `chargeEnd {sid}` on release/cancel |
| `obj` | oid, kind('wall','portal','beacon','pin'), sid, team, x, y, x2?, y2?, r?, thick?, ms, pair?, filter?, pin?, hidden?, color | object placed; `pin` objects set `hiddenAfterMs` and are hidden from the enemy team after it |
| `objUpd` | oid, filter | portal filter changed ('open' or 'allies') |
| `objEnd` | oid, boom? | object removed (expiry, consumed, destroyed); `boom` = exploded |
| `objHeat` | oid, h (0-10 tenths of heat) | turret heat changed by 1 or more tenths |
| `shot` | oid, x, y, tx, ty, color | turret hitscan shot |
| `tp` | id, x0, y0, x1, y1, via(oid) | someone used a portal |
| `tether` / `tetherEnd` | tid, sid, to, ms, color / tid | Ops heal link |
| `link` / `linkEnd` / `linkShare` | lid, a, b, ms, color / lid / a, b, amt | Hira shared damage (linkShare throttled to 4 per second per link) |
| `shadow` / `shadowEnd` | sid, x, y, ms / sid | Zero clone placed / removed |
| `rewind` | sid, slot, r, list:[{id,x0,y0,x1,y1}] (max 6), color | rewind applied (client plays reverse trails) |
| `timebox` / `timeboxEnd` | sid, ms / sid, refund:[slots] | Sprint timeline |
| `echo` / `echoFire` | sid, ms / sid, slot | Cache armed / copy launched; fx produced by an echoed cast carry `echo:true` |
| `reload` / `reloadEnd` | sid, ms, from, to (ms offsets of the perfect window) / sid, perfect, jam | Swipe |
| `pkg` | sid, on, tip | Rush package gained or lost |
| `deliver` | sid, id, x0, y0, x1, y1, tip(0-100), struct? | delivery completed |
| `serve` | sid, mix, outcome, x, y, r, color, fx | Brew serve (the inner effect also emits its own circle/zone/heal fx using the outcome `fx` style) |
| `stance` | sid, name | stance changed (also in the tag; fx is for the animation) |
| `pinBoom` | oid, r | a pin detonated |
Existing kinds (`proj`, `circle`, `zone`, `dash`, `blink`, `buff`, `heal`, `hit`, `knock`) are unchanged. Zero's swap and Pixel/Cache blinks keep using `blink` (swap adds `shadow:true`).
Offline: `OfflineSim.emit('fx', ...)` must emit the same kinds with the same fields. Each rule in section 4 is normative for BOTH the server and OfflineSim.

### 2.5 Primitive rules

Shared constants: `KIT_TUNING` in champions.js. Damage, heal and CC always go through the existing room helpers (`_dealDamage`, `_heal`, `_addShield`, `_addBuff`, `_applyCC`). Negative `msPct` buffs must be supported (verify the recalc clamps move speed to a floor).

#### 2.5.1 Skill resolution and stances (D)
`resolveSkill(def, slot, stance)`: a `stances[name]` spec FULLY replaces the base spec; base = default stance (`def.kit.stance.default`). Every consumer (server `_doCast`, OfflineSim `_cast`, `_tryCast`, HUD slot icon/name/tooltip, bots, VFX) must call it with the caster's current stance. `type:'stance'` skills set `ch._stance = nextStance(spec, cur)`, grant their optional `shield` / `buff` for `duration`, start their own short cooldown, clear any open recast window, emit fx `stance`. Cooldowns are per SLOT, not per stance. Reset to default on respawn. Stack's stance is not a skill override: Portal reads it live (`affectsSkills:false`).

#### 2.5.2 Resources (G) and spend
`kit.res = { key, max, start, gainPerSec, show }`: `ch._res[key]` starts at `start` (also on respawn), gains `gainPerSec` per second (fractional kept internally) up to `max`. `spend = { res, min, max, per }`: cast is denied (nothing spent, toast `kit.needRes`) if `res < min`; on success consume `u = min(res, max)` units. Per-unit effects (additive, u = units consumed): `per.dmg` (amount x (1 + dmg*u)), `per.radius`, `per.range` (area/dist x (1 + v*u)), `per.rootMs` / `per.stunMs` (adds to or creates the effect), `per.slowPct` (cap 0.9), `per.count` (extra projectiles), `per.shield` (amount spec x u shield on the caster for `spec.duration`). Consumed only when the cast succeeds. Swipe ammo is the same system with `gainPerSec:0`.

#### 2.5.3 Tether (C, H) and link
Tether (`type:'tether'`, `targets:'ally'`): one per champion. Every `tickMs` heal the target `amount(tether.heal)` and the caster `selfPct` of it; refresh a caster slow `casterSlow` (via `_applyCC` slow, ms 200) and a target msPct buff `allyMsPct`. Ends on `durationMs`, distance > `breakRange`, caster or target dead, caster stunned or knocked, target stasis, a new tether, or a second W press (`recastEnds`, free, no refund). fx `tether`/`tetherEnd`, tag `kit:tether:1`. Counts as healing for passives and augments (add `spec.tether || spec.link` to the `spec.heal || spec.shield` checks in `_doCast`).
Link (`type:'link'`): `a` = the ally from section 3.1 (caster if no ally id), `b` = nearest other living allied champion to `a` within `link.pairRange` (the caster counts); none = fail. One link per champion (new link replaces). While live and `dist(a,b) <= breakRange`: of every damage instance dealt to one end (after armor/shield, before hp loss) `sharePct` is redirected to the partner as already-mitigated damage, never lethal (partner hp floor 1), never re-shared (flag). Both are healed `amount(link.heal)` on cast. Ends on `ms`, distance, or either death. fx `link`/`linkEnd`/`linkShare`, tag `kit:link:<partner id>`.

#### 2.5.4 Hold / charge (A) and Heavy movement (H)
See 3.1. Scale arrays are multipliers at charge 0 and 1, applied to the resolved spec before `cast()`. Tester fully charged: range 1500, dmg x1.8; quick-cast: x0.35 charge. Brick bash: range 260..728, knockback 156..416. A charging champion still auto-attacks.

#### 2.5.5 Placed objects (B)
Placement: aim clamped to `spec.range` from the caster (range 0 = on the caster) and to the map; solid kinds (barricade, turret, portal) use `nearestFree`. Caps: `obj.maxActive` per champion per slot and `KIT_TUNING.MAX_OBJECTS_PER_TEAM` per team (oldest removed first, `objEnd`). `OBJ_TICK_MS` cadence for logic. Objects persist if the owner dies, except they are all removed at match end.
- wall (Pixel): segment A to B, thickness `thick`, lifetime `ms`. Does not block movement or projectiles. Every enemy champion or unit (not objs, not pets) within `thick/2 + radius` of the segment is hit with the skill's `dmg`, `slow`, `mark` once per `rehitMs`.
- portal (Stack): first cast places end A (`range`); within `recast.ms` the second press places end B (`obj.range2` from the caster); the pair lives `obj.ms` from B placement. If B is never placed, A is removed. Each `OBJ_TICK_MS`: every champion, minion and non-epic monster (not pets) within `r + PORTAL_ENTER_PAD` of an end whose per-unit lock `gapMs` has expired is moved to the other end (`nearestFree`, pushed `r+30` px outward), then locked `gapMs`. Filter: owner's live stance `allies` admits only the owner's team; `open` admits everyone (the deliberate risk: enemies can use it). fx `obj` x2 (with `pair`), `tp`, `objUpd` on stance toggle.
- barricade (Brick): unit `kind:'obj'`, solid circle `r`. Every tick, any champion, minion or monster overlapping is pushed out along the normal (`room._pushOutObjs`, same idea as `nav.pushOut`); dashes and knockbacks stop at its edge (`room._clipObjs`) and a knockback ended by a barricade counts as a WALL for `wallStun`. HP = `amount(obj.hp)` snapshot. Expires at `ms`. Death = `objEnd {boom:true}`.
- turret (Volt): unit `kind:'obj'`. Every `atkMs` (x `atkMul` while overclocked) hitscan the nearest visible enemy champion within `obj.range`, else nearest visible enemy minion or monster: `dmg` snapshot at placement, fx `shot`. Heat: `+perShot` (x `heatMul` while overclocked) per shot; after `coolDelayMs` without firing it cools `coolPerSec`; at `heat >= max` it EXPLODES (`explode.radius`, `explode.dmg`, `explode.stun`, kills itself). Turrets never hit structures. `objcmd`: `overclock` (all own turrets, `ms`), `vent` (heat 0 and slow `slow` on enemies within `radius` of each turret), `detonate` (explode now, damage x (1 + heat x heatMulPerPct)); none alive = cast fails. Heat is fx `objHeat` only (tenths, on change).
- beacon (no champion uses it since Ops E became Hot Swap; the engine support stays available): fx-only, `maxActive 1`, lifetime `ms`. While a live allied beacon exists, an allied champion's recall (B) takes `allyRecallMs` and ends at the beacon (`nearestFree`) instead of the fountain (no fountain heal); damage and movement cancel it as usual. Recast `'toObj'`: the owner teleports to it and consumes it.
- pin (Lint): fx-only, shared cap per `group` (5 total, oldest removed). Armed after `armMs`. `trigger:'enemy'`: first enemy champion or unit entering `r` triggers the stored spec (`dmg`, `slow`, `root`, `mark`) centered on the pin, then the pin is removed. `trigger:'ally'`: first allied champion (owner included) heals `heal` and gets `buff`. Hidden from the enemy team `hideAfterMs` after placement (suggestion pins stay visible); revealed 3s when triggered. `type:'resolve'`: needs at least one live pin in `group` or it fails; every pin triggers at once at radius x `radiusMul`, effects x `dmgMul`, and `resolve.detonate` cashes Nit stacks; fx `pinBoom` per pin. This replaces the old trap engine (no champion uses `trap` any more).

#### 2.5.6 Rewind (F)
Every champion records `{t, x, y, hp}` every `HIST_SAMPLE_MS`, kept `HIST_KEEP_MS` (history cleared on death and respawn). `type:'rewind'` finds the newest sample with `t <= now - lookbackMs` (else the oldest) for the caster (`radius 0`) or for the caster plus every living allied champion within `radius` (`allies:true`). For each: cleanse (stun, root, slow, silence, knock) when `cleanse`; if `pos` teleport to the sample (`nearestFree`, cancel path and recall); if `hp` set `hp = max(hp, sample.hp)` capped at `maxHp`. Shields, mana, cooldowns, dead champions and enemies are untouched. fx `rewind` with the list.

#### 2.5.7 Shadow (E)
`ch._shadow = { x, y, until }`, fx-only, untargetable, no collision, cleared on death. `shadow.mode:'place'`: place at aim within `range` (`nearestFree`), replaces the old one, lasts `shadow.ms`. `'swap'`: needs a shadow (else fail, nothing spent); exchange positions, shadow keeps its remaining time; apply `invisMs` and `buff` for `duration`; fx `blink` with `shadow:true`. `alsoAtShadow` (circle): resolve a second identical area at the shadow, each target hit at most once per cast. `shadowAt:'origin'` (target skill): after the cast a shadow is left where the caster stood (ms from the caster's Q `shadow.ms`). Tag `kit:shadow:1`.

#### 2.5.8 Echo, timebox, reload (Cache, Sprint, Swipe)
- echo: `type:'echo'` arms `ch._echo = { until: now + armMs }` (fx `echo`, tag). The next successful cast of a slot not in `exclude` disarms it and queues the same slot for `now + delayMs`: free (no mana, cooldown, rank checks), same direction and distance from the caster's NEW position, every amount x `mulPct`; skipped if the caster is stunned, silenced or dead at fire time; fx `echoFire`, then normal fx with `echo:true`. No passives, augments or marks-on-cast run for the copy.
- timebox: `type:'timebox'` starts `ch._tbox = { until, spent:{} }` and applies `buff` for `ms`. Each successful cast of a slot not in `exclude` records the cooldown length it started. At `until`: `cd[slot] -= refundPct x length` for each recorded slot (not below now); fx `timeboxEnd {refund:[slots]}`. Death cancels with no refund.
- reload: `type:'reload'`, allowed only when `ammo < max`. First press: starts `ch._reload` for `ms`, steps the caster `step` px opposite the aim (stops at walls), blocks Q W R while `lockCasts`; fx `reload` with perfect window `[from, to] = perfect x ms`. Second press while reloading (ignores cooldown and mana): inside the window = instant full ammo + `perfectBonus.buff` for `perfectBonus.ms`; outside = jam: `until += jamMs` once, further presses ignored. Natural completion refills ammo. Stun cancels (ammo unchanged). fx `reloadEnd`. Tag `kit:reload:1`.

#### 2.5.9 Package (Rush) and mix (Brew)
- pickup: fails if already carrying. `ch._pkg = { since, dist }`; every tick `dist += moved px` (ignore single steps over 700 such as teleports); expires after `kit.pkg.maxCarryMs` or on death (fx `pkg on:false`). `tip = clamp(dist / tipDist, tipMin, 1)`; tag `kit:pkg:<tip*100 rounded to 5>`; carrier gets `pickup.speedPct` ms.
- deliver (`targets:'ally'`, `toStruct`): needs a package. Target = ally champion (3.1) else the nearest live allied tower within `range + 40` of the aim. Dash onto it (walls stop it; if blocked short of contact within 140 px it still delivers). `m = (ch._tipMulUntil > now ? tipMul.mul : 1)`, `s = 0.4 + 0.6 x min(1, tip x m)`. Ally: `shield x s`, `buff` for `buffMs`. Tower: heals `structHealPct x maxHp x s`. Rush gains `goldBase + goldPerTip x min(1, tip x m)` gold. Clears the package. R: `resetOnCast` zeroes the named slot cooldowns, `tipMul` arms `ch._tipMulUntil`.
- mix: `addMix` appends a letter after a successful cast (max `kit.mix.max`, the oldest drops). The whole mix clears `expireMs` after the last add. `type:'serve'`: counts per letter; empty = `plain`; otherwise the letter with the highest count (S=`shot`, M=`milk`, G=`syrup`), ties = `mocha`. Amounts (dmg, heal, shield) x `sizeMul[size-1]`. Circle and zone outcomes aim at the cast point within `serve.range`; allies outcomes are centered on the caster. The mix clears. fx `serve`.

#### 2.5.10 Summon (J)
`type:'summon'` (Scout Drone) spawns a `TeamUnit` `kind:'pet'`, `owner:'tester'`; the champion's `pet.summonOnly:true` means it never auto-spawns, follows or attacks, and `_petOf` must ignore it. It flies in a straight line (over walls) to the aim (clamped to `range`) at `speed`, then hovers, and expires at `ms` (only one; a new cast replaces it; it persists if the owner dies). Untargetable and invulnerable like all pets. Team vision radius `vision` around it (treat it like a moving ward, including bush reveal); every 500 ms each enemy champion inside gets `summon.mark`. Client renders it from the unit (emoji from `def.pet`).

#### 2.5.11 Auto-aim and HUD rules
`autoAimsAtEnemy` already returns false for every new type and for `targets:'ally'`. Client auto-aim for `targets:'ally'` = nearest living allied champion within `range` (never self) like the `swap` branch; for `place` = point `min(range, 350)` ahead (stick / last move / facing). Hold and drag skills work on touch: pointer down on the skill button = key down; pointer up = key up; drag uses the pointer position.

---

## 3. Crowd control, delivery shapes and states (v6.1)

### 3.1 New CC spec keys (all optional on any spec that already accepts `slow`/`root`/`stun`)
`airborne{ms}` `charm{ms}` `fear{ms}` `taunt{ms}` `blind{ms}` `disarm{ms}` `suppress{ms, strikeAtEnd, breakDist, cancelCdPct}`.
Each = one `CC_HANDLERS` entry plus its key appended to `CC_KEYS`. NEW SIGNATURE: handlers become
`(room, target, ccSpec, now, src)` where `src` is the casting champion (or the object owner), possibly null; the call site in
`_applyHit` passes it. Charm, fear, taunt and suppress need `src`. Zones, trails, pins and obj triggers pass their owner.

Server-only unit fields (no schema change): `airUntil charmUntil fearUntil tauntUntil blindUntil disarmUntil suppressUntil
_ccSrc{type:id} _untargetUntil _reviveUntil _reviveCfg _suppressing{tid,until}`.

| Type | Class | Rule (ms from `CC_TUNING.MAX_MS`) | Cleanse | Counterplay |
|---|---|---|---|---|
| airborne | hard (DR) | lifted in place: cannot move, act, cast, attack; still targetable and still displaceable; max 1200 | no | dodge telegraph, spell shield, DR, stasis before it lands |
| charm | hard | cannot cast skills or attack; walks toward `src` at its own move speed, stops at `CHARM_STOP_PX` (95); wall-clipped; max 1500 | yes | cleanse, kill or CC the source, spell shield, barriers block the walk |
| fear | hard | cannot cast or attack; flees `src` at `FEAR_MS_MUL` x speed, direction jitter `FEAR_JITTER_DEG` re-rolled every `FEAR_REROLL_MS`; if `src` is dead flees from the cast point; max 1500 | yes | cleanse, DR, run into allies |
| taunt | hard | cannot cast skills; moves toward `src` and may basic attack ONLY `src`; ends if `src` dies, turns untargetable or leaves vision; max 1500 | yes | cleanse, kill the source, Brick pays with a shield and armor |
| blind | soft | basic attacks deal 0 and apply no on-hit; skills unaffected; floating text MISS (throttled `MISS_TEXT_THROTTLE_MS`); max 3000 | yes | cleanse, skills still work, casters barely care |
| disarm | soft | no basic attacks; skills and movement work; max 2500 | yes | cleanse, play a skill build |
| suppress | hard (floor 60% of base) | target cannot move, act, cast, attack, recall or use summoner spells; not displaceable by enemies; the CASTER is also locked (channel) for the same time; max 2000 | no | see 3.4 |

Summoner spells (flash/D/F) and items stay usable under charm, fear, taunt, silence, disarm and blind; never under stun, airborne
or suppress. Soft CC: no diminishing returns and no immunity window; hard CC all go through `applyHardCcDuration` (shared chain:
1, 0.5, 0.25, immune after the third within 4s). Suppress uses it too but never below `SUPPRESS_MIN_FRAC` of base.
Priority when several are active (what the unit does this tick): suppress > airborne > stun > (charm | fear | taunt) > root > normal.
Charm, fear and taunt replace one another (the latest wins, the old timer is cleared). Hard CC cancels recall, hold, tether and
channels; taunt also cancels recall and hold.

### 3.2 Application pipeline (`_applyCC`, in this order)
1. Immunity: `etype 'structure'`, Epic monsters, `kind 'obj'`, `kind 'pet'`: all new CC ignored. Regular minions and non-epic monsters
   take all new CC (no DR) except suppress (immune), so Zero cannot suppress camps.
2. Stasis or untargetable target: ignored (hit tests already skip them; keep a guard).
3. Spell shield (existing, consumes on the first skill instance): blocked, fx `ccBlock` `why:'shield'`. A blocked suppress fizzles:
   no channel, mana spent (no refund).
4. `_ccImmuneUntil` active: blocked, fx `ccBlock` `why:'immune'`.
5. `ms = min(MAX_MS[type], hard ? applyHardCcDuration(...) : base)`; suppress `ms >= base * SUPPRESS_MIN_FRAC`.
6. Set `<type>Until`, `_ccSrc[type] = src.id`, cancel recall and channels, emit fx `cc`.
Cleanse effects (Ctrl+Z, Rollback, items) clear exactly the types with `CC_TYPES[t].cleanse === true` plus the old list
(stun, root, slow, silence, knock). Airborne and suppress are never cleansed. `rewind` with `pos:true` teleporting a suppressed
ally BREAKS the suppress (Pager Rollback is the designed counter).

### 3.3 Synced representation (no schema change)
- Tags: `cc:<tag>` appended to `TeamChamp.buffs` AFTER `silenced` and BEFORE every `kit:` tag, in `CC_PRIORITY` order, only while
  active: `cc:suppress cc:air cc:charm cc:fear cc:taunt cc:disarm cc:blind cc:untarget cc:revive`. Parse with
  `parseCcTags(buffs)` (champions.js; returns CC_TYPES keys, most important first). Stun, root and silence keep their existing
  fields (`stunnedUntil`, `rootedUntil`, `silenced` tag). Generic buff-icon renderers must ignore tags starting with `cc:` as they
  already do for `kit:`.
- `cc:untarget` and `cc:revive` are visible to everyone (revive is public information on purpose: burst it after 3s or wait).
- fx messages (new kinds, all through the existing `fx` channel; OfflineSim emits identical fields):

| k | fields | meaning |
|---|---|---|
| `cc` | id, type (CC_TYPES key), ms, sid, x, y | a CC was applied (after DR); `sid` = source champion id; drives the apply VFX and the HUD timer ring |
| `ccBlock` | id, type, why ('shield'\|'immune'), x, y | blocked; client shows BLOCKED or TENACITY text |
| `ccBreak` | id, type, why ('cleanse'\|'src_dead'\|'cancel'\|'revive'\|'teleport') | ended early; plays the break animation |
| `miss` | id, x, y | a blinded auto attack missed (throttled server side) |
| `suppress` / `suppressEnd` | sid, tid, ms / tid, why ('done'\|'cancel') | Zero channel chains start / end |
| `revive` | id, x, y, color | a revive guard triggered |
| `untarget` | id, ms, x, y | untargetable window started |
| `area` | shape ('cone'\|'line'\|'arc'), sid, slot, x, y, a, len, w?, ang?, inner?, delay, sweep?, color, fx | telegraph and hit moment of a v6.1 shape (see 3.5) |
| `gping` | sid, x0, y0, x1, y1, ms | global shot warning line (sent to BOTH teams at cast, lifetime `GLOBAL_WARN_MS`) |
Existing kinds change only in these ways: `circle` gains optional `inner` (px, donut); `dash` and `blink` gain optional
`phase:1` (crossed terrain) and `ghost:1` (untargetable travel); `obj` gains `kind:'barrier'` with fields x, y, x2, y2, thick, ms.

### 3.4 Suppress (Zero R) exact rules
Cast: normal `target` rules, then blink behind the target (existing), then a channel starts: `ch._suppressing = { tid, until }`,
target gets `suppressUntil`, both are locked, fx `suppress`. At `until`: apply the spec's `dmg`, `execute`, `detonate` as one hit
(`strikeAtEnd:true`), `killReset` applies, shadow left at origin as before (placed at cast start). The strike is CANCELLED
(fx `suppressEnd cancel`, `ccBreak`, no damage, R cooldown set to `cancelCdPct` x cd remaining) if: Zero dies or receives any hard
CC (stun, airborne, charm, fear, taunt, suppress; silence alone does not cancel); the target dies; the target is displaced more than
`breakDist` (420) from Zero; the target turns untargetable or is teleported by `rewind pos`; a revive guard triggers. Damage does
not cancel it. Towers may keep hitting the target.

### 3.5 Delivery shapes (new `type`s in TYPE_HANDLERS; `circle`/`zone` gain `inner`)
Common: `delay` (ms, telegraph; aim and origin are locked at cast), all damage/CC keys and `knockback` (pushed from the origin),
`self{...}` (below). Hit uses unit position + unit radius; targets hit once per cast; same filters as `circle` (enemies, no objs,
no pets, structures take damage but no CC).
- `cone {range, angle, delay}`: origin = caster position at resolve; hit if `dist <= range + r` and the angle between the locked
  direction and the target is `<= angle/2` (units within 50 px of the origin are always hit). Instant at `delay`.
- `line {range, width, delay}`: oriented box from the caster along the locked direction: hit if the perpendicular distance to the
  segment `<= width/2 + r` and projection `0..range`. Not blocked by units or terrain, does not travel.
- `arc {range, inner, angle, sweepMs, delay}`: annular sector, `inner <= dist <= range + r`, angle `<= angle/2`. Hits are staggered:
  a target at angular position `f` (0 = first edge, 1 = last edge of the sweep) is hit at `delay + f * sweepMs` (the sweep runs
  from the caster's left to right). Cosmetic sweep = real timing.
- `inner` on `circle`/`zone`/`objcmd vent`: only `inner <= dist <= radius + r` is hit; the centre is safe.
- `place` + `obj.kind 'barrier'` `{len, thick, ms, orient:'perp'|'drag', maxActive}`: a SOLID segment for every unit (champions,
  minions, monsters); units overlapping at placement are pushed out along the normal; dashes and blinks stop at it (`_clipObjs`,
  segment version); projectiles pass. `orient:'perp'` = centred on the aim point (clamped to `range`), perpendicular to the cast
  direction, length `len`. The spec's `dmg` and CC keys hit enemies overlapping the segment ONCE at placement. `spend.per.radius`
  scales `len`, `per.rootMs` adds to the root. Counts toward `MAX_OBJECTS_PER_TEAM`. `nearestFree` is used for the centre.
- `self{ shield?, heal?, buff?, spellShieldMs?, duration? }` on circle/zone/cone/line/arc: applied to the caster at CAST START
  (before `delay`), same code path as `type:'self'`. Counts as a shield for passives and augments.
- `phase { maxWall }` on `dash`: the path is sampled every `PHASE_STEP_PX`; a contiguous blocked run is allowed when its length
  is `<= maxWall` and the landing cell is free (`nearestFree` within `PHASE_LAND_SEARCH_PX`; otherwise shorten to the last free
  point before the first blocked run that is too thick). Barriers and barricades may be crossed too. `hitRadius` only applies on
  free samples. fx `dash` carries `phase:1`.
- `untarget { ms }` on any caster skill: `ch._untargetUntil = now + ms` (for `dash`/`blink`/leap skills the window starts when the
  movement STARTS and `ms` is added after it ends, so total = travel + ms). While active: not selected by auto-aim, projectiles,
  circles, cones, lines, arcs, zones, towers, minions or auto attacks; takes no damage and no CC; can still move and cast
  (unlike stasis). Max `MAX_MS.untarget`. Tag `cc:untarget`, fx `untarget`.
- `reviveGuard { ms, hpPct, untargetMs }` on `allies`/`self` specs: each affected champion gets `_reviveUntil = now + ms`. If a damage
  instance would kill it while armed: hp = ceil(maxHp * hpPct), all CC cleared (including suppress and airborne), untargetable for
  `untargetMs`, guard consumed, fx `revive` and `ccBreak revive`. Works against execute and true damage. Epic monsters and structures
  never use it. Cleared by `Kits.reset`/`onDeath`. Tag `cc:revive` while armed.
- Global (`global:true`, `range` up to 5600, `windupMs`, projectile only): client aim may come from the minimap (cast flag `mm:1`).
  Server on cast: validates like a normal cast, clamps the aim to the map and `range`, sends `gping` to both teams, locks the caster
  (`moveSlow 0.5` and no other cast) for `windupMs`, then launches the projectile (champOnly, first champion hit). A stun during the
  windup cancels the shot at no cost beyond mana.

### 3.6 Client to server
Only change: `cast` gains optional `mm` (truthy = x,y came from a minimap click; the server skips any on-screen sanity check, still
clamps to the map). Everything else (`ph`, `x2,y2`, `id`) is unchanged. No other message, no schema field.

### 3.7 Auto-aim and aim preview (client draws, data-driven off the spec)
Auto-aim: `autoAimsAtEnemy` already returns true for cone/line/arc (range > 0). For `global` skills, auto-aim picks, in order: the
nearest `spotted` enemy champion, else the lowest-HP% visible enemy champion within `spec.range`, else the facing direction; and
`autoAimReach` returns `spec.range`. Server auto-aim set `AUTO_AIM_SKILLS` gains `cone`, `line`, `arc`.
Preview shapes (alpha 0.18 fill, 0.6 outline, colour `spec.color`; enemies see the same shape in red during `delay`):
cone = wedge (`range`, `angle`); line = rectangle (`range` x `width`); arc = crescent sector (`inner`..`range`, `angle`) with a
sweep line; ring = donut (`inner`..`radius`); barrier = segment preview centred on the aim, perpendicular, length `len`; global = thin
line from caster to aim (full `range`) and a dot on the minimap; phase dash = lane with the wall-crossable stretches drawn dashed;
taunt/charm/fear circles = normal radius ring. Pointer on the minimap while a global skill is held aims it (`mm:1`).

### 3.8 Bots (SkillEngine.classifySkill flags: `cc` (list), `shape`, `global`, `phase`, `untarget`, `revive`, `suppress`, `self`)
- cone/line/arc: cast at the target enemy champion when within `range` and (cone, arc) the target is inside the angle. line: when
  the target is within `range * 0.9` and not moving away.
- global: cast when a spotted or visible enemy champion within `range` has HP < 55% (or any champion is in a 2v1 fight); aim at it.
- suppress (Zero R): only on an enemy champion with HP < 60% and no other enemy champion within 500 px of it.
- taunt (Brick W): when 2 or more enemies are within 300 px, or an allied champion below 40% HP is within 450 px of Brick.
- charm (Hira Q), blind (Brew Q), disarm pin (Lint W), airborne (Stack R): cast as their existing generic role (skillshot, opener, pin,
  ult) and Stack R only with 2+ enemies inside 350 px.
- fear (Pager E): when an enemy champion is within 270 px and Pager is below 70% HP or 2+ enemies are within 270 px.
- reviveGuard (Ops R, `bot:'self'`): when 2+ allied champions are within 800 px below 60% HP and an enemy champion is within 900 px.
- untarget skills (Sprint E, Cache E): generic dash and blink behaviour, no change.
- Bots under charm, fear, taunt, suppress or airborne follow the forced movement of the engine (their AI input is overridden); bots
  never use summoner spells while CC'd.

---

## 4. Bots

Bots still cast generically. Rules: `classifySkill` gains flags `hold, drag, place, objKind, stance, tether, link, rewind, shadow, summon, echo, timebox, reload, pickup, deliver, serve, resolve, objcmd, spend, hint (spec.bot)`. Behaviour:
- `spec.bot:'skip'` slots are never cast by bots (portal, shadow place, drone, pickup, deliver, Suggestion Pin, stance toggles unless botPref).
- hold: bots tap-cast (quick-cast, `ph` absent). drag: bots send no `x2,y2`. place with `dmg` (wall, barricade as opener, pins): cast at the target enemy position when within range; barricade between self and the closest chaser when `hurt`.
- stance: `kit.stance.botPref`: every think tick pick `near` stance if the target enemy is within `dist`, else `far`; Patch uses `lowHp` below `lowHpPct` HP; toggle with the stance skill when current differs (ignore its cooldown spam: at most once per 2s).
- spend skills: cast only when `res >= spend.min`; Model prefers `res == max` for R; Swipe casts E (reload) when ammo 0 or when no enemy within 900 and ammo < 4 (taps only: no perfect timing, always natural reload); Brew casts Q/W/E to fill the mix then R when size >= 2 and an enemy champion or hurt ally exists; `serve` outcome is chosen by the engine.
- tether/link (`bot:'peel'`): ally champion with HP < 60% within range, lowest HP first. rewind (`bot:'escape'` Pixel: HP < 35% and being damaged; `bot:'self'` Pager R: 2 or more allies in radius below 55% HP or the team lost >25% HP in 3s). echo, timebox, objcmd, resolve, Peak Hours: `bot:'self'` cast when an enemy champion is within 700 and ready (resolve: when >= 2 pins are placed and an enemy is within 400 of one). Shadow swap `bot:'escape'`: HP < 35% and a shadow exists.
- Scout drone, portals, pickup and deliver are skipped (and Ops E Hot Swap, which is `bot: skip`), so Stack, Ops, Tester, Zero, Rush bots lose those skills but remain functional on their other keys.

---

## 5. Champion sheets (generated from `champions.js`)

### Pixel — the Frontend Wizard (`pixel`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`460`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `520` (+86), Mana `420` (+42), AD `48` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.65` (+0.01), MS `330`
- **Unique Passive — Syntax Surge:** Casting a skill grants +12% move speed for 1.5s and restores 4% max mana on champion hit.
- **Recommended Build (6 items):** `tech_book` -> `sneakers` -> `headphones` -> `frost_cache` -> `stackoverflow` -> `freeze_frame`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Laser Fence | `place` | 60 | 9s | Input: drag, Dmg: 50 +11/lv +45% AP, Range 700, Slow 30% | `laserFence` | Press Q at the start point, drag toward the other end and release: a laser fence (max 520 px) stands for 4s. Enemies crossing it take damage, slow and a Glitch mark. |
| **W** | Flexbox Orbs | `target` | 55 | 9s | Dmg: 70 +16/lv +55% AP, Range 620 | `pixelOrb` | Zaps an enemy and chains to 2 nearby targets. Glitch-marked targets take +30% true damage. |
| **E** | Ctrl+Z | `rewind` | 50 | 16s | N/A | `rewind` | Rewinds your position to where you stood 3s ago and cleanses stun, root and slow. |
| **R** | Framework Rewrite | `line` | 100 | 70s | Dmg: 270 +32/lv +95% AP, Range 1050, Delay 700ms | `pixelWipe` | Marks a long lane; after 0.7s a rewrite wipes everything in it for massive damage. Glitch-marked champions take +25% true damage. |

### Stack — the Backend Tank (`stack`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `650` (+112), Mana `280` (+30), AD `62` (+4), Armor `36` (+4.6), MR `34` (+2), AS `0.66` (+0.01), MS `340`
- **Unique Passive — Failover Armor:** Taking damage grants +3 armor (stacks up to +15 for 4s).
- **Recommended Build (6 items):** `chair` -> `sneakers` -> `standing_desk` -> `thornmail_rack` -> `server_rack` -> `guardian_backup`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | SQL Hook | `projectile` | 55 | 11s | Dmg: 75 +15/lv +70% AD, Range 820, Stun 0.6s | `hook` | Launches a query hook that yanks the first enemy hit right to you and stuns briefly. |
| **W** | Access Control | `stance` | 0 | 1.5s | Shield: 60 +10/lv +5% HP, Duration 2.5s | `accessToggle` | Toggles who your portals admit: everyone, or allies only. Switching grants a small shield. |
| **E** | Portal Pair | `place` | 60 | 16s | Range 600, Recast 6s (place2) | `portal` | Drops portal A, then press E again within 6s to drop portal B. Anyone who steps in one exits the other for 9s. |
| **R** | Database Lock | `circle` | 100 | 75s | Dmg: 185 +20/lv +55% AD, Radius 350, Airborne 0.9s | `rowLift` | Locks every table in range: nearby enemies are pulled inward, damaged and knocked into the air (0.9s). |

### Ops — the DevOps Medic (`ops`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`450`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `540` (+90), Mana `400` (+45), AD `46` (+2.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Uptime Pulse:** Healing or shielding an ally reduces your ultimate cooldown by 2s and grants +15% MS.
- **Recommended Build (6 items):** `power_bank` -> `sneakers` -> `rubber_duck` -> `team_lunch` -> `headphones` -> `stackoverflow`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Health Check | `circle` | 45 | 6s | Dmg: 65 +14/lv +55% AP, Range 820, Radius 200, Delay 300ms, Slow 35% | `scan` | Scans an area: slows enemies inside and heals you for each champion hit. |
| **W** | Hotfix Tether | `tether` | 50 | 9s | Range 600 | `tether` | Links to an ally for 5s: heals them every 0.5s (and you for 40% of it). You move 25% slower. Press W again to cut the link. |
| **E** | Hot Swap | `swap` | 55 | 14s | Range 650, Duration 2.5s, Shield: 70 +14/lv +40% AP | `swap` | Swaps places with the allied champion nearest your aim, pulling them out of danger. Both of you gain a shield and +30% MS for 2.5s. |
| **R** | Blue-Green Deploy | `allies` | 110 | 85s | Heal: 160 +22/lv +55% AP, Shield: 130 +13/lv +35% AP, Radius 800, Duration 3s, Revive guard 3s | `blueGreen` | Swaps the whole team to a fresh deployment: heal, shield, 15% damage reduction, and a Failover standby for 3s: a lethal hit instead reboots the ally at 30% HP (1s untargetable). Once per ally. |

### Tester — the QA Sniper (`tester`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `560` (+90), Mana `300` (+36), AD `60` (+3.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.68` (+0.025), MS `330`
- **Unique Passive — Regression Mark:** Every 3rd basic attack on a target detonates a bug report for +35% bonus physical damage.
- **Companion — Scout:** follows `0 px` behind, attacks within `0 px` every `0 ms` (summon-only: appears only when a skill summons it).
- **Recommended Build (6 items):** `mouse` -> `jetpack` -> `crit_compiler` -> `grievous_linter` -> `ultrawide` -> `armor_shredder`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Unit Test | `projectile` | 50 | 6s | Input: hold, Dmg: 75 +16/lv +100% AD, Range 1000, Hold 0.25s-1.4s | `sniperCharge` | Hold to charge a piercing sniper bolt (up to 1.4s): more range and damage the longer you hold. +20% vs spotted targets. |
| **W** | Scout Drone | `summon` | 40 | 20s | Range 900 | `drone` | Flies a drone toward the aim for 7s. It sees through bushes and spots enemies (3s) so your shots hit harder. |
| **E** | Edge Case | `dash` | 45 | 11s | Dmg: 45 +10/lv +50% AD, Range 400, Slow 40% | `vault` | Vaults away and throws an edge-case net that damages and slows foes passed. |
| **R** | Regression Barrage | `projectile` | 100 | 65s | Dmg: 240 +30/lv +125% AD, Range 5600 (global) | `snipeGlobal` | Aim anywhere (click the minimap, or auto-target a spotted champion). After a 0.45s windup, a map-wide shot hits the first champion; enemies see a warning line. +25% true damage on spotted targets. |

### Zero — the Security Ninja (`zero`)
- **Role / Lane:** Assassin / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `580` (+95), Mana `300` (+35), AD `66` (+4.2), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `350`
- **Unique Passive — Zero-Day Strike:** First attack after leaving a bush or out-of-combat deals +30% bonus damage.
- **Recommended Build (6 items):** `red_pen` -> `sneakers` -> `gauntlet` -> `armor_shredder` -> `crit_compiler` -> `git_revert`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Fork Process | `shadow` | 30 | 7s | Range 650 | `shadowCast` | Forks a shadow clone to the aimed spot for 6s. It cannot be hit; it is your second body. |
| **W** | Context Switch | `shadow` | 25 | 5s | Duration 1.5s | `shadowSwap` | Instantly swap places with your shadow, vanish for 0.9s and gain +25% move speed. |
| **E** | Brute Force | `circle` | 35 | 6s | Dmg: 60 +15/lv +75% AD, Radius 240 | `bladeSpin` | Slashes around you AND around your shadow at once. Hit champions are marked Vulnerable (4s) for Zero-Day. |
| **R** | Zero-Day | `target` | 90 | 68s | Dmg: 145 +24/lv +100% AD, Range 520, Suppress 1s | `suppressStrike` | Blinks behind an enemy champion and suppresses them for 1s, then executes them, leaving a shadow where you stood. If you are stunned, knocked or killed first, the strike is cancelled. Vulnerable targets take +30% true damage. A kill resets R. |

### Model — the Data Sorcerer (`model`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`480`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `530` (+86), Mana `430` (+43), AD `46` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Gradient Descent:** Consecutive skill hits within 4s deal +10% escalating magic damage (up to +30%).
- **Recommended Build (6 items):** `tech_book` -> `sneakers` -> `headphones` -> `stackoverflow` -> `rubber_duck` -> `firewall`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Gradient Descent | `circle` | 45 | 5s | Dmg: 65 +15/lv +60% AP, Range 850, Radius 200, Delay 350ms, Slow 40%, Spends orbs | `dataSphere` | Collapses a data sphere. Spend 0-3 orbs: each adds +30% damage and a wider sphere. |
| **W** | Overfit | `self` | 40 | 12s | Duration 3.5s, Spends orbs | `orbShield` | Spend 1-3 orbs to wrap yourself in them: each orb is a shield layer. Also +15% move speed. |
| **E** | Random Forest | `place` | 55 | 11s | Dmg: 50 +11/lv +42% AP, Range 880, Root 0.7s, Spends orbs | `forestWall` | Plants a tree line across the aim (3.5s): a solid wall nobody can walk through. Enemies overlapping it when it sprouts are damaged and rooted. Spend 0-3 orbs: each adds +0.25s root and a longer wall. |
| **R** | Big Data | `circle` | 100 | 80s | Dmg: 230 +28/lv +90% AP, Range 1050, Radius 340, Delay 850ms, Spends orbs | `singularity` | Singularity that drags enemies to the center. Spends 1-3 orbs: each adds +25% damage, +0.25s stun and range. |

### Brick — the Security Guard (`guard`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `680` (+115), Mana `280` (+30), AD `58` (+3.6), Armor `38` (+4.8), MR `34` (+2), AS `0.64` (+0.01), MS `335`
- **Unique Passive — Firewall Plating:** Standing near an allied tower or champion reduces incoming damage by 10%.
- **Recommended Build (6 items):** `chair` -> `sneakers` -> `standing_desk` -> `hoodie` -> `kanban` -> `server_rack`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Shoulder Bash | `dash` | 40 | 9s | Input: hold, Dmg: 55 +14/lv +70% AD +3% HP, Range 520, Hold 0.2s-1.1s | `bashCharge` | Hold to charge (up to 1.1s, you move slower), release to bash forward: longer charge means a longer rush, harder hit and bigger shove. Walls stun. |
| **W** | Clipboard of Rules | `circle` | 50 | 13s | Radius 300, Delay 200ms, Taunt 1s | `badgeCheck` | Reads out the rules: you instantly gain a max-HP shield, +20 armor and a 2s Spell Shield; after 0.2s every enemy within 300 px is TAUNTED for 1s and must attack you. |
| **E** | Barricade | `place` | 50 | 14s | Range 380 | `barricade` | Drops a solid barricade (max 2, 6s) that blocks movement for everyone until it is destroyed. |
| **R** | Building Lockdown | `circle` | 100 | 78s | Dmg: 165 +22/lv +6% HP, Radius 390, Delay 250ms, Slow 35% | `lockdown` | Locks down the floor: every enemy nearby is damaged, slowed and blasted outward. Walls and barricades stun. |

### Mop — the Night-Shift Cleaner (`cleaner`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`450`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `510` (+84), Mana `440` (+44), AD `46` (+2.8), Armor `20` (+3.3), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Clean Sweep:** Killing a minion or monster restores 25 HP and 20 mana instantly.
- **Recommended Build (6 items):** `tech_book` -> `sneakers` -> `headphones` -> `midnight_oil` -> `stackoverflow` -> `pomodoro`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Sweep | `cone` | 35 | 5s | Dmg: 55 +12/lv +45% AP, Range 380, Angle 90, Delay 120ms, Stances: bucket | `broomCone` | Mop stance: sweeps a 90 degree cone in front of you after 0.12s and shoves every enemy hit back. |
| ↳ *bucket* | Bucket Toss | `circle` | 45 | 5.5s | Dmg: 60 +13/lv +50% AP, Range 760, Radius 190, Delay 450ms, Slow 30% | `bucketToss` | Bucket stance: lobs a bucket of dirty water; it splashes after 0.45s, damaging and slowing. |
| **W** | Switch Gear | `stance` | 0 | 3s | Duration 1.5s | `gearSwitch` | Swaps between Mop stance (melee: sweep, slide, mop-up) and Bucket stance (ranged: toss, bubble, flood). |
| **E** | Mop Slide | `dash` | 45 | 12s | Dmg: 45 +10/lv +40% AP, Range 460, Slow 25%, Stances: bucket | `skid / puddle` | Mop stance: slides forward splashing enemies and leaves a Wet Floor that slows and burns for 3s. |
| ↳ *bucket* | Soap Bubble | `circle` | 55 | 11s | Dmg: 60 +14/lv +50% AP, Range 800, Radius 200, Delay 700ms, Slow 60% | `bubble` | Bucket stance: a giant soap bubble pops after 0.7s, damaging and slowing 60%. |
| **R** | Mop Up | `zone` | 100 | 70s | Dmg: 34 +6/lv +12% AP per tick, Radius 380, Duration 3.5s, Slow 60%, Stances: bucket | `mopSpin` | Mop stance: spins the mop around you for 3.5s: a big wet ring that slows 60% and burns. |
| ↳ *bucket* | Flood | `zone` | 110 | 82s | Dmg: 40 +6/lv +14% AP per tick, Range 900, Radius 420, Duration 4.5s, Slow 65% | `flood` | Bucket stance: floods a huge faraway area for 4.5s; everything inside crawls and is scalded. |

### Rush — the Delivery Rider (`courier`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `600` (+98), Mana `300` (+34), AD `64` (+4), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `355`
- **Unique Passive — Express Delivery:** Moving continuously builds momentum: next basic attack deals +25% bonus damage and slows 15%.
- **Recommended Build (6 items):** `mouse` -> `sneakers` -> `gauntlet` -> `kanban` -> `rgb_keyboard` -> `ultrawide`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Express Delivery | `dash` | 45 | 8s | Dmg: 70 +16/lv +80% AD, Range 620, Phase | `tirePhase` | Revs through a line, damaging every enemy and refunding 1.5s Q cooldown per champion hit. Cuts through thin walls (up to 200 px) like a shortcut. Distance counts toward your tip. |
| **W** | Pick Up Order | `pickup` | 30 | 14s | N/A | `pickup` | Grabs a package (lost after 25s or on death). The farther you travel with it, the bigger the tip when you deliver. |
| **E** | Deliver | `deliver` | 40 | 4s | Range 700 | `deliver` | Needs a package. Rushes to an ally (shield, +30% MS, +20% AS) or an allied tower (heals it) and hands it over. Longer trips pay more: tip scales the reward and gives you gold. |
| **R** | Peak Hours | `self` | 80 | 72s | Duration 6s | `rushHour` | Surge pricing for 6s: +25% move speed, tips are doubled, and Pick Up Order is ready again. |

### Volt — the Embedded Engineer (`embedded`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`470`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `44` (+2.6), Armor `22` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Servo EMP:** Every 4th basic attack discharges a pulse through your pet for +40 bonus magic damage.
- **Companion — Servo:** follows `110 px` behind, attacks within `320 px` every `900 ms`.
- **Recommended Build (6 items):** `power_bank` -> `sneakers` -> `headphones` -> `rubber_duck` -> `firewall` -> `stackoverflow`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Deploy Turret | `place` | 55 | 8s | Range 650 | `turretDeploy` | Deploys a gun turret (max 3, 20s). It fires at the nearest enemy and heats up; at 100 heat it EXPLODES, hurting enemies nearby. |
| **W** | Overclock | `objcmd` | 50 | 12s | Duration 4s | `overclockTurrets` | All your turrets fire twice as fast for 4s but heat twice as fast. Servo gets +50% damage too. |
| **E** | Coolant Vent | `objcmd` | 45 | 10s | N/A | `ventRing` | Vents every turret: heat drops to 0 and a ring of coolant mist (110-260 px from each turret) slows enemies 50%. The pocket right next to a turret stays clear. |
| **R** | Controlled Burst | `objcmd` | 100 | 62s | N/A | `chainBlast` | Detonates all your turrets at once. Each blast deals more damage the hotter that turret is (up to double) and stuns. |

### Patch — the Software Engineer (`dev`)
- **Role / Lane:** Fighter / `top` · **Range:** Melee (`150`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `600` (+100), Mana `300` (+34), AD `62` (+4), Armor `30` (+4.2), MR `32` (+1.6), AS `0.66` (+0.012), MS `340`
- **Unique Passive — Hotfix Fury:** Below 50% HP, gain +12% attack damage and +12% lifesteal.
- **Recommended Build (6 items):** `mouse` -> `sneakers` -> `gauntlet` -> `kanban` -> `standing_desk` -> `server_rack`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Refactor | `arc` | 35 | 5.5s | Dmg: 70 +16/lv +85% AD, Range 330, Angle 200, Delay 80ms, Stances: hotfix / feature | `arcSwing` | Main branch: swings the keyboard in a 200 degree arc in front of you (sweeping left to right in 0.26s), cleaving enemies and healing you for each champion hit. |
| ↳ *hotfix* | Hotfix | `dash` | 30 | 4s | Dmg: 60 +14/lv +90% AD, Range 300, Slow 25% | `hotfixSlash` | Hotfix branch: a quick slashing dash through enemies. Short cooldown. |
| ↳ *feature* | Feature Creep | `zone` | 45 | 8s | Dmg: 22 +5/lv +25% AD per tick, Radius 280, Duration 2.5s, Slow 35% | `featureAura` | Feature branch: a spreading aura for 2.5s that burns and slows everyone nearby. |
| **W** | git checkout | `stance` | 0 | 2.5s | Duration 3s | `checkout` | Cycles your branch: main (balanced), hotfix (fast, mobile, execute) or feature (tanky, area, team buffs). Q, E and R change with it. |
| **E** | git checkout -b | `dash` | 50 | 11s | Dmg: 50 +12/lv +60% AD, Range 380, Recast 3s (again), Stances: hotfix / feature | `branch` | Main branch: branches off in a dash that damages enemies in your path. Press E again within 3s for a second dash. |
| ↳ *hotfix* | Cherry-pick | `blink` | 40 | 8s | Range 450 | `cherryPick` | Hotfix branch: blinks 450 px instantly. |
| ↳ *feature* | Scope Creep | `circle` | 55 | 12s | Dmg: 55 +12/lv +60% AD, Range 500, Radius 260, Delay 500ms | `scopeCreep` | Feature branch: the scope grows. After 0.5s an area drags enemies inward and damages them. |
| **R** | Merge Conflict | `target` | 100 | 72s | Dmg: 150 +22/lv +90% AD, Range 420, Stun 1.5s, Stances: hotfix / feature | `mergeLock` | Main branch: locks an enemy champion in a merge conflict: heavy damage, a 1.5s stun, and you heal from the fight. |
| ↳ *hotfix* | Force Push | `target` | 90 | 60s | Dmg: 140 +22/lv +90% AD, Range 520 | `forcePush` | Hotfix branch: force-pushes an enemy champion for heavy damage that grows with their missing HP. |
| ↳ *feature* | Release | `allies` | 110 | 80s | Heal: 110 +16/lv +30% AD, Shield: 100 +14/lv +30% AD, Radius 800, Duration 5s | `release` | Feature branch: ships a release to the team: heal, shield and +20% AD for 5s. |

### Swipe — the App Developer (`appdev`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `550` (+88), Mana `300` (+36), AD `60` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.025), MS `330`
- **Unique Passive — Swipe Combo:** Alternating a skill and a basic attack empowers the attack with +28% bonus damage.
- **Recommended Build (6 items):** `caffeine` -> `jetpack` -> `rgb_keyboard` -> `gauntlet` -> `ultrawide` -> `standing_desk`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Push Notification | `projectile` | 8 | 0.8s | Dmg: 48 +10/lv +62% AD, Range 840, Slow 15%, Spends ammo | `notif` | Fires one phone (1 ammo). Fast and cheap, but the magazine holds only 6. |
| **W** | Burst Update | `projectile` | 20 | 5s | Dmg: 62 +14/lv +75% AD, Range 760, Slow 25%, Spends ammo | `burstUpdate` | Fans out 3 phones (needs 2 ammo, spends up to 3) with a slow. |
| **E** | Swipe Left | `reload` | 0 | 1.5s | N/A | `swipeReload` | Flicks back 220 px and reloads (1.7s). Press E again inside the gold window for an instant reload and +35% AS, +20% MS for 3s. Miss it and the gun jams. |
| **R** | App Store Launch | `projectile` | 90 | 62s | Dmg: 160 +22/lv +90% AD, Range 1200, Spends ammo | `storeLaunch` | Launches a 7-phone barrage and dumps the magazine: +10% damage per ammo spent (needs 1+). Bonus damage from missing HP. |

### Sprint — the Scrum Master (`sprint`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `610` (+98), Mana `300` (+34), AD `63` (+4), Armor `30` (+4.1), MR `32` (+1.6), AS `0.67` (+0.012), MS `350`
- **Unique Passive — Sprint Velocity:** Takedowns and camp kills grant +25% move speed for 2.5s and heal 45 HP.
- **Recommended Build (6 items):** `red_pen` -> `sneakers` -> `gauntlet` -> `second_monitor` -> `standing_desk` -> `letter_opener`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Daily Stand-up | `circle` | 35 | 5.5s | Dmg: 65 +15/lv +85% AD, Radius 260, Slow 35% | `standup` | Calls a stand-up: slams nearby foes and slows them. |
| **W** | Sprint Planning | `timebox` | 40 | 16s | N/A | `timebox` | Opens a 4s timebox (+12% AD, +15% AS). When it ends, 60% of the cooldown of every Q and E you cast inside it is refunded. |
| **E** | Story Points | `dash` | 45 | 10s | Dmg: 65 +15/lv +80% AD, Range 520, Stun 0.7s, Untargetable 0.35s | `leapGhost` | Leaps onto a target to damage and stun (0.7s). You cannot be targeted while in the air. Killing a champion resets E cooldown. |
| **R** | All Hands Sprint | `allies` | 100 | 75s | Radius 750, Duration 5s | `rally` | Rallies the team for a 5s sprint: allies within range get +40% MS, +15% AD and +20% AS. |

### Cache — the Data Engineer (`cache`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`520`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `545` (+87), Mana `310` (+36), AD `59` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.024), MS `330`
- **Unique Passive — Cache Hit:** Attacking the same target repeatedly grants +6% bonus damage per hit (up to +24%).
- **Recommended Build (6 items):** `mouse` -> `jetpack` -> `rgb_keyboard` -> `energy_crate` -> `ultrawide` -> `letter_opener`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Batch Job | `projectile` | 40 | 6s | Dmg: 68 +15/lv +90% AD, Range 960 | `batch` | Fires a piercing batch bolt; hitting a champion refunds 1s off ALL cooldowns and adds a Stale stack (max 3, 6s). |
| **W** | Cache Line | `echo` | 40 | 14s | N/A | `echoArm` | Stores your next Q or E (within 5s). It fires a free copy of itself 1.2s later at 60% power, aimed the same way. |
| **E** | Failover | `blink` | 50 | 14s | Range 400, Untargetable 0.6s | `failoverBlink` | Instantly blinks to a standby position and stays untargetable for 0.6s while the failover completes. Storable by Cache Line: the copy blinks too. |
| **R** | Full Table Scan | `projectile` | 100 | 68s | Dmg: 210 +28/lv +115% AD, Range 2100 | `tableScan` | Fires a lane-wide beam through every enemy; each Stale stack on a champion adds +20% of the hit as true damage. |

### Hira — the People Partner (`hr`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`460`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `545` (+89), Mana `420` (+43), AD `44` (+2.6), Armor `23` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Culture Fit:** Nearby allied champions grant +10% shield/heal power and +12% move speed when assisting.
- **Recommended Build (6 items):** `power_bank` -> `sneakers` -> `rubber_duck` -> `team_lunch` -> `cloud_credits` -> `vpn_hoodie`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Feedback Hook | `projectile` | 55 | 11s | Dmg: 60 +14/lv +50% AP, Range 880, Charm 1.1s | `charmInvite` | Sends a flirty meeting invite: the first enemy hit is CHARMED for 1.1s and walks toward you, unable to attack or cast. |
| **W** | Buddy System | `link` | 60 | 14s | Range 700 | `buddyLink` | Links an ally with the teammate nearest to them (you count). For 6s each takes only half of the damage dealt to either; the rest is shared. Breaks beyond 900 px. |
| **E** | Policy Update | `zone` | 55 | 10s | Dmg: 14 +3/lv +10% AP per tick, Range 750, Radius 225, Duration 3s, Slow 45% | `policy` | Spreads a 3s policy puddle that slows and burns everyone standing inside. |
| **R** | Mandatory Meeting | `circle` | 110 | 82s | Dmg: 150 +20/lv +60% AP, Range 800, Radius 360, Delay 650ms, Silence 2.5s, Slow 40% | `allHands` | Calls an all-hands: after 0.65s enemies in the area are damaged, slowed 40% and SILENCED for 2.5s. |

### Lint — the Code Reviewer (`lint`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`470`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `525` (+85), Mana `430` (+43), AD `46` (+2.9), Armor `21` (+3.4), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Strict Audit:** Skills apply a 2s mark reducing enemy armor by 15%.
- **Recommended Build (6 items):** `tech_book` -> `smartwatch` -> `headphones` -> `cloud_credits` -> `stackoverflow` -> `vpn_hoodie`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Nit Pin | `place` | 35 | 4s | Dmg: 55 +12/lv +45% AP, Range 700, Slow 30% | `pinNit` | Pins a comment on the map (max 5 pins total, 30s). The first enemy to touch it takes damage, a slow and a Nit stack. |
| **W** | Blocker Pin | `place` | 50 | 9s | Dmg: 50 +11/lv +45% AP, Range 700, Disarm 1.8s | `pinBlock` | Pins a Request Changes blocker: the first enemy to touch it is damaged and DISARMED (1.8s: no basic attacks, skills still work) and gains a Nit stack. |
| **E** | Suggestion Pin | `place` | 45 | 8s | Heal: 55 +11/lv +35% AP, Range 700, Duration 1.8s | `pinSuggest` | Pins a friendly suggestion: the first ALLY to touch it is healed and gets +25% move speed. Enemies see it and avoid it. |
| **R** | Merge When Resolved | `resolve` | 90 | 70s | N/A | `resolveBurst` | Resolves every thread: ALL your pins detonate at once with a 1.5x radius and normal effects. Each Nit stack on a champion adds +18% true damage. Needs at least one pin. |

### Brew — the Office Barista (`barista`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`480`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `45` (+2.7), Armor `22` (+3.4), MR `30` (+1.2), AS `0.63` (+0.011), MS `330`
- **Unique Passive — Espresso Shot:** Every 2nd skill cast brews a shot that restores 6% max HP to you and the nearest ally.
- **Recommended Build (6 items):** `power_bank` -> `sneakers` -> `team_lunch` -> `headphones` -> `firewall` -> `midnight_oil`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Espresso Shot | `projectile` | 35 | 5s | Dmg: 45 +10/lv +38% AP, Range 700, Blind 1s, Slow 20% | `espressoSpray` | Sprays three streams of scalding coffee that burn, slow and BLIND (1s: basic attacks miss). Adds a SHOT to your mix. |
| **W** | Steamed Milk | `allies` | 40 | 8s | Heal: 40 +9/lv +28% AP, Radius 450, Duration 3s | `milkSteam` | Steams a round of milk: heals nearby allies and speeds them up. Adds MILK to your mix. |
| **E** | Syrup Spill | `circle` | 40 | 8s | Dmg: 35 +8/lv +30% AP, Range 700, Radius 190, Delay 400ms, Slow 50% | `syrup` | Spills sticky syrup: a small blast that slows 50%. Adds SYRUP to your mix. |
| **R** | Serve | `serve` | 90 | 60s | N/A | `serve` | Serves your mix (up to 3 ingredients, 15s). Mostly SHOT: stunning blast. Mostly MILK: team heal+shield. Mostly SYRUP: team speed. A tie or all three: Mocha zone. Empty: a weak drip. Fewer ingredients, weaker serve. |

### Pager — the On-Call SRE (`oncall`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`140`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `615` (+97), Mana `300` (+34), AD `64` (+4.1), Armor `30` (+4), MR `32` (+1.6), AS `0.67` (+0.012), MS `345`
- **Unique Passive — Incident Response:** Deal +25% bonus damage to jungle monsters/epics and gain +15% MS toward low-HP enemies.
- **Recommended Build (6 items):** `red_pen` -> `sneakers` -> `gauntlet` -> `kanban` -> `rgb_keyboard` -> `standing_desk`

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Visual style | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **Q** | Ping | `dash` | 35 | 6s | Dmg: 60 +14/lv +70% AD, Range 560, Slow 40% | `pingHop` | Pings a target and rushes onto it, slowing them 40%; +30% true damage if they are Paged. Works on monsters to hop between camps. |
| **W** | Page Everyone | `projectile` | 50 | 12s | Dmg: 45 +10/lv +45% AD, Range 1400, Slow 30% | `pageWave` | Sends a long-range alert through every champion in a line: damage, slow, and a Paged mark that Ping cashes in. |
| **E** | Postmortem | `circle` | 55 | 16s | Dmg: 55 +12/lv +50% AD, Radius 270, Delay 150ms, Fear 0.8s, Slow 40% | `postmortem` | Reads the incident report out loud: after 0.15s enemies nearby take damage, FLEE in fear for 0.8s, then stay slowed 40% for 1.5s. |
| **R** | Rollback | `rewind` | 100 | 90s | N/A | `rollback` | Rolls the whole team back 3s: you and every ally within 900 px return to where they stood and regain the HP they had (never lose HP), and are cleansed. |

---

## 6. Visual recipes

### 6.1 Style names introduced in v6

Use `assets/moba/vfx` (Kenney particles) and `assets/moba/fb` (flipbooks, see `FB` in SkillFx.js). No new art. All styles receive the fx fields in 3.4 plus `color`.
- laserFence: two glowing posts (`flare_01`) joined by a flickering line (`trace_03` tiled + `spark_05`), brightens on each hit, fades last 400 ms.
- rewind: ghost silhouettes (low-alpha champion tint) sliding back along `list` trails, reverse `twirl_01` spiral at the end point, white flash on cleanse.
- accessToggle: hex lock ring (`circle_03`) flips green (open) to amber (allies) around Stack. portal: two pulsing `twirl_02` rings with `ringBlue.webp`, a faint dotted line between ends when both exist, `tp` = streak plus pop at the exit; allies-only tint cyan.
- tether: animated beam between the two bodies with `+` particles flowing toward the ally, thickens each heal tick (`tetherEnd` fades). beacon (engine only, unused by the roster): tall light pillar (`light_01` stretched) + expanding `ringGold.webp` pulses; arrival = gold burst.
- sniperCharge: red laser sight line from caster growing with charge, converging ring (`circle_05`) at the muzzle (locally driven by `charge`); release = bolt thickness and brightness scale with the charge fraction. drone: small hovering drone sprite from the unit view with a rotating scan cone and a ring at `vision` radius; spotted enemies get a `crosshair.webp` for 3s.
- shadowCast: dark silhouette thrown to the spot, lands as a translucent purple clone (outline `smoke_07`) that persists until `shadowEnd`. shadowSwap: two smoke puffs plus a purple streak linking both ends. bladeSpin plays at both bodies when `alsoAtShadow`.
- orbShield: orbs (`magic_01`) orbiting the body, one layer per shield orb, shatter on break. ChampionView must also draw the 0-3 orbiting orbs from `kit:orbs`. dataSphere radius and spark count scale with the orbs spent (fx carries `r`).
- bashCharge: dust (`dirt_02`) and growing shoulder glow while charging, ground cracks (`scratch_01`) and a star burst (`star_08`) at impact. barricade: `assets/moba/barricade.png` drops in with `dirt_01` dust and a hit shake; it is a unit view, so UnitView needs a `kind:'obj'` renderer (turret procedural body with a heat bar tinted yellow to red by `objHeat`).
- gearSwitch: bucket and mop icons swap in a spinning ring above the head. bucketToss: arcing bucket, splash `impactWater.webp`. mopSpin: rotating wet ring (`ringBlue.webp` + `waterDots.webp`) for the zone.
- pickup: box pops over the head with sparkles; ChampionView draws a carried box while `kit:pkg`. deliver: dash trail with box and coin burst (`star_06`) on arrival, tip text. rushHour: speed lines and an orange afterimage aura.
- turretDeploy: turret drops from above with smoke (`smoke_04`) and spark ring. overclockTurrets: red glow plus sparks on every turret. vent: white steam ring (`smoke_03`) and frost tint. chainBlast: lightning arcs between turrets (`zap`) and `burstFire.webp` at each, size by heat.
- checkout: three branch nodes (main blue, hotfix pink, feature green) with the active one lit; the player body gets a tint matching the stance (via `kit:stance`). hotfixSlash, cherryPick (blink), featureAura (green spreading ring), scopeCreep (inward pull rings), forcePush (long beam), release (green burst up).
- burstUpdate: 3 phones fan (reuse notif). notif: single phone bolt. swipeReload: ring around the caster filling over `ms`, gold arc at `[from, to]`, click flash on perfect, red jam sparks on jam. storeLaunch: 7-phone barrage.
- timebox: clock ring around Sprint draining over `ms`; on `timeboxEnd` the refunded slot icons fly back to the HUD. echoArm: ghost duplicate outline behind the caster with data bits; `echoFire` and any fx with `echo:true` render at alpha 0.6 with a cyan tint.
- buddyLink: lanyard rope between the two linked allies with small handshake icons, pulses on `linkShare`. pinNit / pinBlock / pinSuggest: map comment-bubble pin (orange with exclamation, red stop sign, green check), fade for enemies after `hideAfterMs`. resolveBurst: all pins pop in a chain with connecting lines and a checkmark burst (`pinBoom`).
- coffee / milkSteam (steam cloud) / syrup (amber splash). serveShot (espresso blast), serveMilk (white wave plus shield), serveSugar (pink sparkle aura), serveMocha (brown zone with hearts), servePlain (small drip). Brew's HUD shows the mix; ChampionView shows a cup with colored layers.
- rollback: clock ring with hands spinning backwards, ghost trails for every entry in `list`, blue pulse on arrival.
- Unchanged styles keep their current implementation: pixelOrb, rune, hook, vortex, scan, deploy, vault, rail, execute, roots, singularity, shieldPlate, lockdown, skid, puddle, bubble, flood, tire, standup, leap, rally, batch, failover, tableScan, invite, policy, allHands, ping, pageWave, postmortem, branch, keyboardSpin, mergeLock, bladeSpin. Styles that existed but no longer appear in SKILL_FX (hexDome, plusRain, swap, dataSphere kept, hourglass, glitch, smoke, parcelDrop, priceTag, stale, stopSign, freeze, hardReset, sleepZ, darkMode, overclock, pair, burndown, cheer, espresso, noodles, tesla, emp, charge, onMyWay, nitpick, crescent, broomSweep kept) may be deleted or left dead. Missing style names fall back to the generic MobaFx look.

### 6.2 The 86-row recipe table (v6.1, normative)

Rules: assets only from `assets/moba/vfx` (Kenney) and `assets/moba/fb`. Helpers are `SHAPES.*` in SkillFx.js. Each skill's signature
(helper + primary sheet + motion) is unique; colour is never the only difference. All 22 vf* sheets are used (vfDitheredFire: Pixel R;
vfWorm: Stack Q; vfBlood: Zero R; vfKabooms: Swipe R). Telegraph column: what the CASTER and enemies see before the hit. `tint` =
colour logic; default tint = `spec.color`. Sprite names without extension are Kenney particles.

| Skill | Style | Recipe | Motion | Telegraph |
|---|---|---|---|---|
| pixel.q | laserFence | wall; flare_01 posts, trace_03 line; vfPixelFire at posts; cyan, pink flash on hit | posts drop in, line flickers 12 Hz, pulse per hit | dashed segment while dragging |
| pixel.w | pixelOrb | chain; magic_03 orb; vfSmallHit per hop; pale blue, white on Glitch | hops 80 ms apart | range ring on hover |
| pixel.e | rewind | twirl_01 reverse, spark_06 streaks, vfWheel reversed; white flash on cleanse | ghost slides back along the trail | ghost marker at the landing spot |
| pixel.r | pixelWipe | line; vfDitheredFire strip, trace_06 scanline, symbol_01 burst at the end; violet to white | scanline wipes outward over 300 ms | rectangle fills with scanlines over 700 ms |
| stack.q | hook | line trace_04 chain; vfWorm head as the query worm; green | extends then retracts, worm wiggles | thin lane preview |
| stack.w | accessToggle | ring circle_03 hex lock; vfWheel; green open, amber allies | flips 180 degrees | none |
| stack.e | portal | twirl_02 pair, ringBlue; dotted line (line, trace_04); cyan if allies only | rings pulse, line marches | ghost A and range ring for B |
| stack.r | rowLift | vfEldenRing contracting 2.6r to 0.4r; window_01 panes rising; dirt_03 debris; lime | pull in, then panes rise and fall | contracting ring outline radius 350 |
| ops.q | scan | arc rotating wedge slash_03; ringGold; light_02; yellow | wedge sweeps 360 degrees over the delay | circle outline with sweep |
| ops.w | tether | beam trace_06; symbol_01 plus signs flowing; vfAnima pulse on ally; green | particles flow, beam thickens per tick | link line preview on hover |
| ops.e | swap | twirl_03 pair curving between the two bodies; ringWhite at both ends; sparkGold at the arrival | beams cross, rings flash at both ends | none |
| ops.r | blueGreen | ringBlue then ringGreen swap; vfElectricShield dome on each ally; revive halo ring | blue expands, green replaces 200 ms later | faint radius 800 ring on cast |
| tester.q | sniperCharge | red laser line growing; circle_05 converging; vfCharged at muzzle; thickness by charge | line lengthens with charge | laser sight (enemies see it above 50% charge) |
| tester.w | drone | drone unit sprite; cone (slash_04) rotating scan; ringDots at vision radius; crosshair on spotted | scan cone rotates | range ring |
| tester.e | vault | smoke_09 puffs; arc hop; trace_06 X net; spark_07; white, orange net | arcs up, net unfolds | direction arrow |
| tester.r | snipeGlobal | beam trace_07 across the path; muzzle_04; vfHyperspeed streaks; vfExplosion2 plus crosshair at impact; red | red lane grows 450 ms then bolt | red lane (width 40), `gping` on the minimap |
| zero.q | shadowCast | smoke_07 outline silhouette thrown; vfPuffStars on landing; purple | parabolic throw, lands and stays | landing ring and ghost |
| zero.w | shadowSwap | smoke FB dark puffs; vfPuffStars; line trace_04 between ends; purple | instant, streak fades 250 ms | none |
| zero.e | bladeSpin | arc x3 slash_01/02/03 spinning; scratch_01 marks at both bodies; lavender | 360 degree spin 300 ms | ring r240 at body and shadow |
| zero.r | suppressStrike | blink streak; window_04 padlock; trace_06 X chains on target; vfBlood plus bloodSlash plus burstBlood strike; magenta and black | lock pulses, chains tighten, red slash at end | crosshair FB on target, chain lines |
| model.q | dataSphere | chaosCloud shrinking; orbit magic_02 sparks = orbs spent; vfSmallHit pop; teal | collapse then pop | circle grows with orbs |
| model.w | orbShield | orbit magic_01 n = orbs; vfElectricShield dome; star_08 shatter; teal | orbs circle, shatter on break | none |
| model.e | forestWall | impactLeaf plus vfTentacles row growing along the segment; dirt_01 base; green | grows from the centre outward 350 ms | dashed perpendicular segment at aim |
| model.r | singularity | vfVortex; blackHole; twirl_03 inward; light_03 core; teal and black | inward spiral | ring with inward arrows |
| guard.q | bashCharge | dirt_02 ring; shoulder glow; scratch_01 cracks; star_08; vfBigHit; yellow and red | dust builds, rush streak, impact | charge fan |
| guard.w | badgeCheck | ringGold expanding; window_03 clipboard panes fanned; symbol_01 red bubble over taunted; circle_02 shield plate; gold and blue | ring out 250 ms, then plate rotates | red ring radius 300 during the 200 ms |
| guard.e | barricade | barricade.png drop; dirt_01 dust; shake on hit; blue | falls from above, shakes | footprint ring |
| guard.r | lockdown | ringGold; impactAir; vfWheel; light_02 siren red/blue spinning | shockwave expands | radius 390 ring fills |
| cleaner.q | broomCone | cone slash_04 x5 bristle strokes; dirt_03 dust; vfPuffStars; tan | strokes stagger 70 ms | 90 degree wedge |
| cleaner.q.bucket | bucketToss | arcing bucket sprite; impactWater; vfSmallHit; light blue | lob arc, splash | landing ring |
| cleaner.w | gearSwitch | orbit of two icons; magic_05; blue | spin and swap | none |
| cleaner.e | skid | waterDots plus smoke_03 trail; trace_03 skid marks; pale blue | slide, wet trail lingers | lane |
| cleaner.e.bucket | bubble | circle_01 sphere inflating; airCloud pop; light blue | inflate 0.7 s with wobble | ring grows |
| cleaner.r | mopSpin | ringBlue; vfWheel rotating; waterDots; blue | rotates for the zone | radius ring |
| cleaner.r.bucket | flood | line wipes x3 (trace_06) rolling in; waterDots; impactWater; teal | waves roll across the zone | huge ring, far |
| courier.q | tirePhase | scorch_03 tracks; smoke_04 burnout; trace_04 speed lines; window_04 flashes at wall entry and exit, 35% alpha ghost while phasing; orange | streak with wheelie, ghosts through walls | lane, crossable stretches dashed |
| courier.w | pickup | box pop; star_06 plus sparkGold; brown | pop and bob | none |
| courier.e | deliver | dash trail; coin spray arcs star_06; impactGold; tip text; gold | coins arc out | lane to the ally or tower |
| courier.r | rushHour | burstOrange; vfHyperspeed; afterimage aura; orange | speed lines, aura | none |
| embedded.q | turretDeploy | smoke_04 drop; spark_01 ring; circle_02; cyan | falls and bounces | footprint ring |
| embedded.w | overclockTurrets | flameB flicker on each turret; spark_05; red-orange | pulsing glow | none |
| embedded.e | ventRing | ring donut: smoke_03 steam; iceBolt shards; white-cyan | ring expands to the outer radius leaving the centre clear | donut outline, inner dashed |
| embedded.r | chainBlast | zap arcs between turrets; vfExplosion plus fireCloud sized by heat; cyan to orange | sequential pops 70 ms apart | turret heat glow |
| dev.q | arcSwing | arc x3 slash_03 sweeping 200 degrees; star_04 keycaps flying; vfImpact; purple | crescent sweeps in 260 ms | crescent sector outline with sweep line |
| dev.q.hotfix | hotfixSlash | triple slash_01 along the dash; scratch_01; vfSmallHit; pink | three quick cuts | lane |
| dev.q.feature | featureAura | ringGreen; vfAnima spreading; leaf particles; green | spreads for the duration | radius ring |
| dev.w | checkout | three branch nodes; vfConstellation; active node lit | cycle highlight | none |
| dev.e | branch | line forks x2 at 20 degrees; trail; purple to pink | fork then merge on recast | lane |
| dev.e.hotfix | cherryPick | star_06 x2 red dots; vfSmallHit; pink | instant pop pair | landing dot |
| dev.e.feature | scopeCreep | ringGreen; vfVortex green; window_01 hammer stamp | inward pull rings | radius ring |
| dev.r | mergeLock | line x2 forming an X over the target; pentagram lock; stun stars; red | lines converge and lock | target highlight |
| dev.r.hotfix | forcePush | vfPowerChords long beam; burstFire; red | beam fires 500 ms | target highlight |
| dev.r.feature | release | burstGreen; vfEldenRing; light_01 rocket rising; green | rocket rises, burst | radius ring |
| appdev.q | notif | muzzle_02; spark_06 trail; bell bubble; pink | single fast bolt | none |
| appdev.w | burstUpdate | 3 phones fan; sparkTrail; circle_03 pulse; magenta | fans out | fan outline |
| appdev.e | swipeReload | ring filling; gold arc; click flash; red jam sparks | ring fills over ms | gold window |
| appdev.r | storeLaunch | 7-phone barrage; vfKabooms at impacts; burstOrange; pink to orange | barrage staggered 40 ms | fan outline |
| sprint.q | standup | ringOrange shock; dirt_03; star_09; orange | shockwave 220 ms | radius ring |
| sprint.w | timebox | ring clock draining with symbol hands; yellow | drains over ms | none |
| sprint.e | leapGhost | caster alpha 0.35 parabola; smoke_10 ground shadow growing; impactAir plus scorch_01 crater plus vfImpact on landing; white | ghost arc, crater on landing | target highlight |
| sprint.r | rally | light_02 rays upward; ringOrange x2; star_06 confetti; orange | rays rise, two pulses | radius ring |
| cache.q | batch | window_01 data blocks stream; trace_06 trail; symbol_01 stale mark; blue | blocks stream and tile | lane |
| cache.w | echoArm | ghost outline; spark_07 binary bits rising; light blue | bits rise | none |
| cache.e | failoverBlink | origin: spark_07 dissolve x12; destination: line x5 scanlines collapsing; window_04 rebooting bars; ghost 0.6 s; white-blue | dissolve then scanline reassembly | landing ghost |
| cache.r | tableScan | beam wide; trace_03 crosshatch rows ticking along; vfExplosion on each Stale; red | rows tick down the beam | lane outline |
| hr.q | charmInvite | magic_03 heart plane; sine-wave flight; star_06 pink hearts rising; vfPuffStars; salmon pink; hearts orbit the victim | wobbles along a sine path | lane |
| hr.w | buddyLink | lanyard rope; handshake icons; pulse on share; green | rope sags and pulses | link preview |
| hr.e | policy | window_03 pages falling and flipping; circle_01 cream pool; cream | pages drift for the duration | radius ring |
| hr.r | allHands | ringPurple x3 pulses 200 ms apart; vfWheel; symbol_01 mute marks; red | three pulses | clock wedge fills radius 360 |
| lint.q | pinNit | window_04 orange comment bubble; symbol_01 exclamation; orange | pin drops, arming ring flickers | ring r90 |
| lint.w | pinBlock | red octagon (circle_05 plus star_04); drop with shake; disarm icon on hit; red | drops with shake | ring r100 |
| lint.e | pinSuggest | green check bubble; sparkGold; green | bobs gently | ring r100 |
| lint.r | resolveBurst | chain pop pin to pin; connecting lines; check burst; orange | pop wave | all pins glow |
| barista.q | espressoSpray | three hoses of smoke_03 steam plus spark_02 droplets; smoke_10 eye veil on victims; brown | spray fans 3 streams | 28 degree fan |
| barista.w | milkSteam | airCloud plus divineCloud; rising wisps; cream | steam rises | radius ring |
| barista.e | syrup | impactGold; vfPuffStars; trace_04 sticky strings; amber | splat, strings stretch | circle |
| barista.r | serve | bell ding ring; star_08 sparkle; cup layers fly out | ring pulses once | circle at range |
| serve.shot | serveShot | burstOrange; vfExplosion2; brown | blast | wide ring 450 ms |
| serve.milk | serveMilk | ringWhite; vfWheel; cream | wave outward | radius ring |
| serve.syrup | serveSugar | orbit sparks; vfConstellation pink; pink | sparkle aura | none |
| serve.mocha | serveMocha | smoke tinted; vfMagma; hearts; brown | zone simmer | radius ring |
| serve.plain | servePlain | impactWater small; brown | single drip | small ring |
| oncall.q | pingHop | circle_03 sonar x3; trace_07 signal bars rising; crosshair flash; red | rings expand from target | target highlight |
| oncall.w | pageWave | line wave of ringDots expanding along the path; orange | rings march | lane 90 wide |
| oncall.e | postmortem | chaosSpike burst; burst star_09 spikes; ringWhite; white and dark purple | spikes shoot out 250 ms | red ring r270 for 150 ms |
| oncall.r | rollback | clock ring with hands backwards; ghost trails; blue pulse | hands spin back, trails slide | radius 900 ring |

Count: 72 base slots + 9 stance variants + 5 serve outcomes = 86 distinct recipes (each has a unique helper + primary sheet + motion signature; the VFX developer must flag any collision found while implementing).

### 6.3 Generic impact and status visuals per CC type (ChampionView and MobaFx)
| Type | Apply impact | Overhead / status look | End |
|---|---|---|---|
| airborne | impactAir plus dirt_01 under the victim | sprite lifted `AIR_LIFT_PX`, shadow shrinks, spin stars star_04 | thud puff on landing |
| charm | pink pull streak from the source, vfPuffStars | pink hearts orbit the head, pink tint, thin line to the source | hearts pop |
| fear | dark chaosSpike flash | 4 px shake, sweat drops symbol_01, purple tint | tint fades |
| taunt | red flare at the victim | red anger mark over the head, thin red trace_04 line to the source | line snaps |
| blind | smoke_10 puff on the eyes | dark visor over the face, MISS text on a missed attack | puff |
| disarm | scratch_01 cross | crossed-out fist icon | none |
| suppress | trace_06 X chains slam in, window_04 padlock | chains around the victim, grey desaturated sprite, padlock | chains shatter (star_08) on `suppressEnd`; red on cancel |
| untarget | ringDots flash | sprite alpha 0.3 with a dotted outline | alpha restores |
| revive | vfAnima halo burst | divineCloud halo ring above the head while armed | burst on `revive` |
HUD status row: up to 4 icons (from `CC_TYPES.icon` text glyphs rendered as in the current buff chips) in priority order for the local
player, above the skill bar; ring timer from the last `cc` fx `ms` (fallback `typMs`); localized label `cc.<type>`. ChampionView draws the
highest-priority icon above the HP bar (28 px) for every visible champion plus the type-specific look above.

---

## 7. Engine rules, damage channels, auto-aim, practice mode

- **Damage Channels (`skillDamageType`):** Skills with pure AP scaling (`apRatio > 0 && !adRatio`) and `Servo` companion attacks deal **Magic Damage** (mitigated by `MR` and `MR Pen`). Auto-attacks and AD/HP-scaling skills deal **Physical Damage** (mitigated by `Armor` and `Armor Pen`). Boomerang return orbs (`Pixel Q`, `Mop Q` with `returnTrueDmg: true`) and combo mark detonations (`Pixel R`, `Zero E`, `Tester R` Bug Stacks) deal **True Damage**.
- **Auto-Aim Policy (`autoAimsAtEnemy`, `autoAimReach`):**
  - Point-and-click skills (`target`, `toTarget` dashes) search within `range + 30 px` (`TARGET_CAST_SLACK`).
  - Skillshots/circles search within `range + 150 px` (`AUTO_AIM_SLACK`), aiming at the nearest visible enemy champion first, then nearest visible unit.
  - Directional dashes (`Tester E`, `Mop E`, `Patch E`, `Swipe E`, `Rush Q`), blinks (`Pixel E`, `Cache E`) and `swap` (`Ops E`, which targets the nearest ally instead) **never** auto-aim at enemies — they fire strictly along the player's movement stick or cursor facing direction (`MIN_AIM_DIST = 24 px`).
- **Volt (`Servo`) Rules:** Targets the owner's current basic-attack target, else the last enemy champion hit by Volt within `3.0s`. Follows `110 px` behind at `1.15x` owner MS, is untargetable/invulnerable, scales cadence with `Overclock` (`+100%`) and `Servo Overdrive` Epic Augment, ignores walls via `nearestFree`, and despawns immediately on Volt's death.
- **Starting Ranks, Practice Mode & Mid-Match Swap:** Standard matches spawn at Level 3 with `Q/W/E = Rank 1`, `R = Rank 0` (`ULT_UNLOCK_LEVEL = 6`). Main Menu **TEST CHAMPS** (`TeamModeScene` offline sandbox) and `preview.bat` expose live practice toggles (`0s CD`, `NO MANA`, `NO DMG`, `+LV`, `+5000g`, `SWAP CHAMP`) on both the pinned HUD bar and `ESC` menu; `_switchChamp` clears active death/CC/stealth/spellShield flags so swapping works from any state.

---

---

## 8. Balance targets, stat progression, role benchmarks

- *Note:* Target win-rate bands and power-curve labels below are **design hypotheses**, not proven playtest results; rework TTK, hook pull distances, trap arm times, and kill-reset windows must be validated empirically across Lv 3/6/10/15.
- **Healthy Balance Window:** `48.0% – 52.0%` Win Rate (`< 46%` buff trigger, `> 54%` nerf trigger), Pick Rate `< 35%` *(no Ban phase yet)*, and normalized `damageDealt` / `damageTaken` parity by role.
- **Role Benchmarks at Lv 18 (Unitemized Base):** Tanks `2400–2650 HP / 114+ Armor / 68 MR`; Fighters/Junglers `2250–2300 HP / 98–101 Armor / 59 MR`; Marksmen/Mages/Supports `1938–2090 HP / 76–84 Armor / 50.4 MR`.

| Champion | Role | Lv1 / Lv18 HP | Lv18 Armor / MR | Dmg Channel | Hard CC Budget | Mobility | Power Curve (E / M / L) | Primary Balance Lever |

### 8.1 Role-by-Role Stat Benchmarks Across the 18-Champion Roster

The table below summarizes exact min–max stat bands across each champion role at Level 1 and Level 18 (`shared/moba/champions.js`):

| Role (Count) | Champions | Lv 1 HP Band | Lv 18 HP Band | Lv 18 Armor Band | Lv 18 MR | Base MS | Attack Range |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tank** (`2`) | `Stack`, `Brick` | `650 – 680` | `2,554 – 2,635` | `114.2 – 119.6` | `68.0` | `335 – 340` | `125 px` |
| **Fighter** (`1`) | `Patch` | `600` | `2,300` | `101.4` | `59.2` | `340` | `150 px` |
| **Assassin** (`1`) | `Zero` | `580` | `2,195` | `96.0` | `59.2` | `350` | `125 px` |
| **Jungler** (`3`) | `Rush`, `Sprint`, `Pager` | `600 – 615` | `2,264 – 2,276` | `96.0 – 99.7` | `59.2` | `345 – 355` | `125 – 140 px` |
| **Marksman** (`3`) | `Tester`, `Swipe`, `Cache` | `545 – 560` | `2,024 – 2,090` | `79.8 – 83.5` | `50.4` | `330` | `500 – 520 px` |
| **Mage** (`2`) | `Pixel`, `Mop` | `510 – 520` | `1,938 – 1,982` | `76.1 – 77.8` | `50.4` | `330` | `450 – 460 px` |
| **Controller** (`2`) | `Model`, `Lint` | `525 – 530` | `1,970 – 1,992` | `77.8 – 78.8` | `50.4` | `330` | `470 – 480 px` |
| **Support** (`4`) | `Ops`, `Volt`, `Hira`, `Brew` | `540 – 545` | `2,036 – 2,070` | `79.8 – 83.5` | `50.4` | `330` | `450 – 480 px` |

---

### 8.2 Lv 1 vs. Lv 18 Unitemized Stat Progression (`statAt`)
| Champion | Lv 1 HP -> Lv 18 HP | Lv 1 Mana -> Lv 18 Mana | Lv 1 AD -> Lv 18 AD | Lv 1 Armor -> Lv 18 Armor | Lv 1 MR -> Lv 18 MR | Lv 1 AS -> Lv 18 AS | Range / MS |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Pixel** | `520 -> 1982` | `420 -> 1134` | `48 -> 99` | `20 -> 77.8` | `30 -> 50.4` | `0.65 -> 0.82` | `460 / 330` |
| **Stack** | `650 -> 2554` | `280 -> 790` | `62 -> 130` | `36 -> 114.2` | `34 -> 68.0` | `0.66 -> 0.83` | `125 / 340` |
| **Ops** | `540 -> 2070` | `400 -> 1165` | `46 -> 90.2` | `24 -> 83.5` | `30 -> 50.4` | `0.62 -> 0.79` | `450 / 330` |
| **Tester** | `560 -> 2090` | `300 -> 912` | `60 -> 121.2` | `24 -> 83.5` | `30 -> 50.4` | `0.68 -> 1.105` | `500 / 330` |
| **Zero** | `580 -> 2195` | `300 -> 895` | `66 -> 137.4` | `28 -> 96.0` | `32 -> 59.2` | `0.68 -> 0.884` | `125 / 350` |
| **Model** | `530 -> 1992` | `430 -> 1161` | `46 -> 97` | `20 -> 77.8` | `30 -> 50.4` | `0.62 -> 0.79` | `480 / 330` |
| **Brick** | `680 -> 2635` | `280 -> 790` | `58 -> 119.2` | `38 -> 119.6` | `34 -> 68.0` | `0.64 -> 0.81` | `125 / 335` |
| **Mop** | `510 -> 1938` | `440 -> 1188` | `46 -> 93.6` | `20 -> 76.1` | `30 -> 50.4` | `0.63 -> 0.80` | `450 / 330` |
| **Rush** | `600 -> 2266` | `300 -> 878` | `64 -> 132` | `28 -> 96.0` | `32 -> 59.2` | `0.68 -> 0.884` | `125 / 355` |
| **Volt** | `540 -> 2036` | `410 -> 1124` | `44 -> 88.2` | `22 -> 81.5` | `30 -> 50.4` | `0.62 -> 0.79` | `470 / 330` |
| **Patch** | `600 -> 2300` | `300 -> 878` | `62 -> 130` | `30 -> 101.4` | `32 -> 59.2` | `0.66 -> 0.864` | `150 / 340` |
| **Swipe** | `550 -> 2046` | `300 -> 912` | `60 -> 119.5` | `22 -> 79.8` | `30 -> 50.4` | `0.67 -> 1.095` | `500 / 330` |
| **Sprint** | `610 -> 2276` | `300 -> 878` | `63 -> 131` | `30 -> 99.7` | `32 -> 59.2` | `0.67 -> 0.874` | `125 / 350` |
| **Cache** | `545 -> 2024` | `310 -> 922` | `59 -> 118.5` | `22 -> 79.8` | `30 -> 50.4` | `0.67 -> 1.078` | `520 / 330` |
| **Hira** | `545 -> 2058` | `420 -> 1151` | `44 -> 88.2` | `23 -> 82.5` | `30 -> 50.4` | `0.62 -> 0.79` | `460 / 330` |
| **Lint** | `525 -> 1970` | `430 -> 1161` | `46 -> 95.3` | `21 -> 78.8` | `30 -> 50.4` | `0.63 -> 0.80` | `470 / 330` |
| **Brew** | `540 -> 2036` | `410 -> 1124` | `45 -> 90.9` | `22 -> 79.8` | `30 -> 50.4` | `0.63 -> 0.817` | `480 / 330` |
| **Pager** | `615 -> 2264` | `300 -> 878` | `64 -> 133.7` | `30 -> 98.0` | `32 -> 59.2` | `0.67 -> 0.874` | `140 / 345` |

---

---

## 9. Interaction matrix, counterplay and known risks

| | spell shield | stasis / untarget | cleanse | DR (hard) | Epic / structure |
|---|---|---|---|---|---|
| airborne, charm, fear, taunt | blocked | ignored | charm, fear, taunt yes; airborne no | yes | immune |
| blind, disarm | blocked | ignored | yes | no | immune |
| suppress | blocked (fizzles) | ignored | no (teleport or kill the caster) | yes, floor 60% | immune |
| untarget | n/a | n/a | n/a | n/a | n/a |
| reviveGuard | n/a | revive grants untarget | n/a | n/a | never |
Existing rules unchanged: knockback and wallStun immunity of Epics and structures, the 2 s immunity after the third hard CC, and
Brick R wallStun. Taunt pairs with Brick's shield by design; charm and fear never stack with taunt (latest wins).

### 9.1 Risks (v6)

- Balance: Hira link plus Pager rollback are the strongest team tools; both are capped (shared damage never kills, rollback never reduces HP, 90s cooldown). Portal `open` lets enemies exploit it by design; `gapMs` prevents ping-pong abuse. Echo excludes W and R; timebox excludes W and R.
- New players (Interns): every system has a readable tap fallback (quick-cast hold, default wall, auto ally); no kit requires a drag or perfect timing to be useful; Swipe's perfect reload is a bonus only.
- Sync and performance: no schema change; objects with HP add at most 5 units per champion (max about 50 per match, under the 14 per team cap for live ones); fx-only objects are bounded by `MAX_OBJECTS_PER_TEAM`; history is 20 samples per champion; `kit:` tags change a few times per second per champion. Turret hitscan and portal checks run at `OBJ_TICK_MS` only.
- Fairness: hidden pins revealed on trigger, drone vision capped at 7s, hold slows the caster so it is a visible commit, charge cancels on stun. Offline and online must match; the shared rules in section 4 plus `resolveSkill` are the single source.
- Implementation risk: `resolveSkill` must be used everywhere that read `def.skills[slot]` (cooldown display, tooltips, bot classification). Grep for `.skills[` and `.skills?.[` in server and src.

### 9.2 Risks (v6.1)

- Balance: Stack knock-up plus Pager fear plus Hira charm are the strongest peels; all hard CC share the 4 s DR chain and cannot chain past the third. Taunt on Brick is
  soaked by his own shield. Revive guard is once per ally with a 3 s window and 85 s cooldown (heal and shield were reduced to pay for it). Global R has a 450 ms windup,
  a public warning line, and cd 65. Suppress is the most committal: killable or CC-able Zero cancels it (cd refund 50%), and Pager Rollback frees allies.
- Interns: every new CC shows an icon, a label and a timer; blind and disarm are soft and never DR-locked; cone/line/arc previews match the hit exactly; global auto-aims.
- Performance: no schema change; `cc:` tags are short strings that change only on application and expiry; `area` fx and `gping` are one message per cast; barrier objects
  count in the 14-per-team cap; suppress chains are a single persistent VFX keyed by `tid`. Phase dash samples at most 31 points per cast.
- Fairness: offline and online share section 3 as normative; charm, fear and taunt never override summoner spells; Epic monsters, structures, pets and objects are immune; bugs remain
  killable (no CC makes a unit unkillable except the explicit untarget and revive windows, 0.35 to 1 s).
- Implementation risk: `CC_HANDLERS` signature change touches every call site (grep `CC_KEYS`); `inner` on `circle` must be honoured by `zone` and `objcmd`; keep `resolveSkill` use for all
  spec reads so stance variants stay correct. champions.js was syntax-checked by reading only (no shell available to the designer): run
  `node -e "import('./shared/moba/champions.js')"` first.

---

## 10. Archetype catalogue (design inspiration)

| # | Archetype (original name) | Mechanic | Status |
|---|---|---|---|
| 1 | Bolt | straight skillshot, first hit | v1 |
| 2 | Lance | piercing skillshot | v1 |
| 3 | Volley | fan of N shots, one hit per target | v2 |
| 4 | Lock-on | point and click target | v1 |
| 5 | Delayed blast | ground circle with telegraph | v1 |
| 6 | Nova | circle centered on self | v1 |
| 7 | Pool | persistent ticking zone | v1 |
| 8 | Wedge | instant cone with narrow angle | NEW (Mop Q) |
| 9 | Lane wipe | long telegraphed rectangle | NEW (Pixel R) |
| 10 | Crescent swing | wide arc that sweeps over time | NEW (Patch Q main) |
| 11 | Donut mist | ring with a safe centre | NEW (Volt E) |
| 12 | Drawn wall | drag a 2-point segment | v6 (Pixel Q) |
| 13 | Barrier | solid terrain segment for everyone | NEW (Model E) |
| 14 | Blocker | solid object with HP | v6 (Brick E) |
| 15 | Charge release | hold to scale range/damage | v6 |
| 16 | Turret / pin / portal | placed world objects | v6 |
| 17 | Map-wide shot | aim anywhere, minimap click | NEW (Tester R) |
| 18 | Scout | summoned vision pet | v6 |
| 19 | Dash strike | move and hit | v1 |
| 20 | Phase dash | dash that crosses thin terrain | NEW (Rush Q) |
| 21 | Blink | instant teleport | v1 |
| 22 | Ghost leap / ghost blink | untargetable while moving | NEW (Sprint E, Cache E) |
| 23 | Rewind / swap | time or position exchange | v6 |
| 24 | Pull | drag target to caster | v5 |
| 25 | Shove + wall slam | knockback with wallStun | v2 |
| 26 | Knock-up | airborne, lifted in place | NEW (Stack R) |
| 27 | Charm | victim walks to the caster | NEW (Hira Q) |
| 28 | Fear | victim flees | NEW (Pager E) |
| 29 | Taunt | victim must attack the caster | NEW (Brick W) |
| 30 | Blind | basic attacks miss | NEW (Brew Q) |
| 31 | Disarm | no basic attacks, skills fine | NEW (Lint W) |
| 32 | Suppress execute | held, caster channels, strike at end | NEW (Zero R) |
| 33 | Silence / stun / root / slow | base CC | v1/v5 |
| 34 | Revive guard | lethal hit becomes a reboot | NEW (Ops R) |
| 35 | Spell shield / stasis | block next skill / self freeze | v2/v5 |
| 36 | Stance | skills change with a mode | v6 |
| 37 | Recast | second press of the same key | v5 |
| 38 | Resource spender / ammo | spend orbs or bullets for scaling | v6 |
| 39 | Tether / link channel | ally heal link, shared damage | v6 |
| 40 | Echo / mark / execute | copy next cast, stack and cash in | v5/v6 |
