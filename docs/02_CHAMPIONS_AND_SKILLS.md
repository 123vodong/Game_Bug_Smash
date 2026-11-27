# Champions, Unique Passives, Skill Combos & Matchups

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Source:** `shared/moba/champions.js` (18 champions, **72 LoL-inspired skills (v5 diversity rework: 6 new mechanics, see the Mechanic Ownership Matrix)**, **18/18 unique passives**, **18/18 recommended builds**)

## Champion Matchup & Counterplay Guide
| Archetype / Champion | Excels Against | Vulnerable To | Key Counter Mechanics |
| :--- | :--- | :--- | :--- |
| **Zero / Rush / Sprint / Pager** (Dive / Assassins) | `Tester`, `Cache`, `Pixel`, `Model` | `Stack`, `Brick`, `Lint` | Hard CC (`SQL Hook`, `Escort Out`, `Database Lock`), `freeze_frame` stasis, stealth reveal (`Wards`) |
| **Tester / Swipe / Cache** (Marksmen) | `Stack`, `Brick`, Structures | `Zero`, `Pager`, `Pixel` | Behind-target ambushes (`Pen Test`, `On My Way`), `Feedback Hook` drags, boomerang burst |
| **Stack / Brick / Patch** (Frontline Tanks) | `Zero`, `Pixel`, `Mop` | `Tester`, `Cache`, `armor_shredder` | `CSS Boomerang` return True Damage, `Nit` / `Stale` / `Paged` mark detonations, `Zero-Day` % missing-HP execute |
| **Pixel / Mop / Model / Lint** (Mages / Control) | Grouped teams, melee bruisers | `Zero`, `Sprint`, `git_revert` | `Spell Shield` (`Brick W`, `Hira W`), `Hibernate` stasis (`Model W`), `Hot Swap` rescues (`Ops E`), Silence (`Hira R`, `Lint E`), Cleanse (`Git Revert`) |
| **Ops / Volt / Hira / Brew** (Supports) | Poke lanes, long skirmishes | `grievous_linter`, `shield_breaker` | `Strict Linter` (-40% heal), `Escalate` (-50% heal), baiting `Spell Shield` before core CC |

| ID | Champion | Role | Lane | Unique Passive | Recommended Build |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `pixel` | **Pixel** (the Frontend Wizard) | Mage | `mid` | **Syntax Surge** | Yes (6 items) |
| `stack` | **Stack** (the Backend Tank) | Tank | `top` | **Failover Armor** | Yes (6 items) |
| `ops` | **Ops** (the DevOps Medic) | Support | `support` | **Uptime Pulse** | Yes (6 items) |
| `tester` | **Tester** (the QA Sniper) | Marksman | `bot` | **Regression Mark** | Yes (6 items) |
| `zero` | **Zero** (the Security Ninja) | Assassin | `jungle` | **Zero-Day Strike** | Yes (6 items) |
| `model` | **Model** (the Data Sorcerer) | Controller | `mid` | **Gradient Descent** | Yes (6 items) |
| `guard` | **Brick** (the Security Guard) | Tank | `top` | **Firewall Plating** | Yes (6 items) |
| `cleaner` | **Mop** (the Night-Shift Cleaner) | Mage | `mid` | **Clean Sweep** | Yes (6 items) |
| `courier` | **Rush** (the Delivery Rider) | Jungler | `jungle` | **Express Delivery** | Yes (6 items) |
| `embedded` | **Volt** (the Embedded Engineer) | Support | `support` | **Servo EMP** | Yes (6 items) |
| `dev` | **Patch** (the Software Engineer) | Fighter | `top` | **Hotfix Fury** | Yes (6 items) |
| `appdev` | **Swipe** (the App Developer) | Marksman | `bot` | **Swipe Combo** | Yes (6 items) |
| `sprint` | **Sprint** (the Scrum Master) | Jungler | `jungle` | **Sprint Velocity** | Yes (6 items) |
| `cache` | **Cache** (the Data Engineer) | Marksman | `bot` | **Cache Hit** | Yes (6 items) |
| `hr` | **Hira** (the People Partner) | Support | `support` | **Culture Fit** | Yes (6 items) |
| `lint` | **Lint** (the Code Reviewer) | Controller | `mid` | **Strict Audit** | Yes (6 items) |
| `barista` | **Brew** (the Office Barista) | Support | `support` | **Espresso Shot** | Yes (6 items) |
| `oncall` | **Pager** (the On-Call SRE) | Jungler | `jungle` | **Incident Response** | Yes (6 items) |

---

## Champion Balance Targets & Power Curve Matrix
- *Note:* Target win-rate bands and power-curve labels below are **design hypotheses**, not proven playtest results; rework TTK, hook pull distances, trap arm times, and kill-reset windows must be validated empirically across Lv 3/6/10/15.
- **Healthy Balance Window:** `48.0% – 52.0%` Win Rate (`< 46%` buff trigger, `> 54%` nerf trigger), Pick Rate `< 35%` *(no Ban phase yet)*, and normalized `damageDealt` / `damageTaken` parity by role.
- **Role Benchmarks at Lv 18 (Unitemized Base):** Tanks `2400–2650 HP / 114+ Armor / 68 MR`; Fighters/Junglers `2250–2300 HP / 98–101 Armor / 59 MR`; Marksmen/Mages/Supports `1938–2090 HP / 76–84 Armor / 50.4 MR`.

| Champion | Role | Lv1 / Lv18 HP | Lv18 Armor / MR | Dmg Channel | Hard CC Budget | Mobility | Power Curve (E / M / L) | Primary Balance Lever |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Pixel** (`pixel`) | Mage | 520 / 1982 | 77.8 / 50.4 | Magic + True Q Return / R | None | High (`E` 430 Blink + free snap-back recast) | Med / High / V.High | `Q` Boomerang return True Dmg, `W` Chain (2 bounces) & `E` 3s recast window |
| **Stack** (`stack`) | Tank | 650 / 2554 | 114.2 / 68.0 | Physical | High (`Q` Hook 0.6s + `R` PullIn 1.0s) | Low (none; `E` is a zone) | High / High / Med | `Q` 680 px Pull Hook, `E` 270 px Rate Limit zone (50% slow), `R` 170 px Vortex PullIn |
| **Ops** (`ops`) | Support | 540 / 2070 | 83.5 / 50.4 | Magic | None (`Q` 35% slow) | Med (`E` Hot Swap teleports both) | Med / High / V.High | `E` Hot Swap (650 px, shield + 30% MS on both) & `Q` per-champ healOnHit |
| **Tester** (`tester`) | Marksman | 560 / 2090 | 83.5 / 50.4 | Physical + True R | Med (`W` 1.2s Root Trap) | Med (`E` 400 Dash + Slow) | Low / High / V.High | `W` `Bug Trap` (`1.2s` root, max 3) & `Q` 1050 px pierce |
| **Zero** (`zero`) | Assassin | 580 / 2195 | 96.0 / 59.2 | Physical + True E | None | High (`Q` behind + `W` Stealth + `R` Blink) | Med / V.High / High | `W` `1.8s` Invis, `Q/R` behindTarget, `R` Kill Reset |
| **Model** (`model`) | Controller | 530 / 1992 | 77.8 / 50.4 | Magic | High (`E` 1.0s Root + `R` 210 PullIn) | Low (none) | Low / High / V.High | `W` Hibernate 1.5s stasis (+30% AP, empower), `E` Root zone, `R` 850 ms `Big Data` PullIn |
| **Brick** (`guard`) | Tank | 680 / 2635 | 119.6 / 68.0 | Physical | High (`E` 1.2s / `R` 1.0s Wall Stuns) | Med (`E` 420 toTarget Dash) | High / High / Med | `W` 2s Spell Shield & `E` 340 px Knockback Wall Pin |
| **Mop** (`cleaner`) | Mage | 510 / 1938 | 76.1 / 50.4 | Magic | Low (`Q` 150 px KB, 60-65% slows) | Med (`E` 460 Slide + trail) | High / High / High | `Q` 5-fan Sweep shove, `W` 60% slow bubble, `E` trail zone, `R` 420 px Flood |
| **Rush** (`courier`) | Jungler | 600 / 2266 | 96.0 / 59.2 | Physical | Med (`E` 160 KB + 0.8s Stun, `R` 50% slow) | High (`Q` CD-Refund Dash) | High / High / Med | `Q` `-1.5s` CD refund per champ hit & `R` 360 px Surge Pricing nuke |
| **Volt** (`embedded`) | Support | 540 / 2036 | 81.5 / 50.4 | Magic (Skills + Servo) | High (`Q` 0.7s + `E` 0.85s Trap + `R` 0.9s wall stun) | Low | Med / High / High | `Q` and `R` centered on Servo (pet positioning), `E` Watchdog Trap |
| **Patch** (`dev`) | Fighter | 600 / 2300 | 101.4 / 59.2 | Physical | Med (`R` 1.5s single-target stun) | High (`E` 380 dash x2 via recast) | Med / High / V.High | `Q` Heal-on-Hit, `E` double dash, `R` lock + heal |
| **Swipe** (`appdev`) | Marksman | 550 / 2046 | 79.8 / 50.4 | Physical | None (`Q` 20% slow) | High (`E` 390 Dash + `W` Stealth) | Med / High / V.High | `Q` 3-fan slow poke, `W` `1.2s` Stealth, `R` 7-fan Execute |
| **Sprint** (`sprint`) | Jungler | 610 / 2276 | 99.7 / 59.2 | Physical | Med (`E` 0.7s Stun, `Q` 35% slow) | High (`E` Kill Reset leap + Passive MS) | High / High / Med | `E` Kill Reset leap, `W` Burndown 30% DR, `R` team +40% MS / +15% AD / +20% AS rally |
| **Cache** (`cache`) | Marksman | 545 / 2024 | 79.8 / 50.4 | Physical + True R detonation | Low (`W` 45% Slow) | Med (`E` 400 Blink + Q Global CD Refund) | Low / High / V.High | `Q` `-1.0s` ALL-skill refund per champ, `W` Stale mark (x3), `R` +20% true dmg per stack |
| **Hira** (`hr`) | Support | 545 / 2058 | 82.5 / 50.4 | Magic | High (`Q` 380 Pull + Root, `R` 2.5s Silence + 40% slow) | Low (`W` +20% MS) | Med / High / High | `Q` Feedback Hook drag, `W` 2.5s Spell Shield, `R` 360 px Silence |
| **Lint** (`lint`) | Controller | 525 / 1970 | 78.8 / 50.4 | Magic + True R detonation | High (`W` 1.1s Root + `E` zone Silence) | Low (none) | Med / High / High | `Q` Nit stacks (x4), `E` Code Freeze silence zone, `R` +18% true per Nit |
| **Brew** (`barista`) | Support | 540 / 2036 | 79.8 / 50.4 | Magic | Med (`E` 1.05s Stun) | Low (`W` +15% MS) | Med / High / High | `Q` 3-stream cone (no self-heal), `W` AS/MS heal, `R` 4s Break Room heal/burn |
| **Pager** (`oncall`) | Jungler | 615 / 2264 | 98.0 / 59.2 | Physical + True R detonation | Med (`R` 1.0s Stun, `Q`/`E` slows) | High (`Q` toTarget dash + `R` 920 behindTarget) | High / High / Med | `W` 1400 px Paged mark, `Q` Ping dash, `E` Postmortem slow, `R` +35% true if Paged |

---

## Detailed Champion Roster

### Pixel — the Frontend Wizard (`pixel`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`460`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `520` (+86), Mana `420` (+42), AD `48` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.65` (+0.01), MS `330`
- **Unique Passive — Syntax Surge:** Casting a skill grants +12% move speed for 1.5s and restores 4% max mana on champion hit.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `frost_cache` (Cold Cache) -> `stackoverflow` (Stack Overflow Premium) -> `freeze_frame` (Debugger Breakpoint)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | CSS Boomerang | `projectile` | 45 | 5.5s | Dmg: 65 +14/lv +55% AP, Range 880, Pierce, Boomerang (True Return) | Fires a boomerang orb that pierces out and deals True Damage on return; marks targets (4s) for Framework Rewrite. |
| **W** | Flexbox Orbs | `target` | 60 | 10s | Dmg: 70 +16/lv +55% AP, Range 620, Chain 2 | Zaps an enemy and chains lightning to 2 nearby targets. |
| **E** | Hot Reload | `blink` | 65 | 12s | Range 430, Recast 3s (back) | Blinks nearby and empowers your next Q or R (+20%). Press E again within 3s to snap back to where you started. |
| **R** | Framework Rewrite | `circle` | 100 | 70s | Dmg: 250 +30/lv +90% AP, Range 950, Radius 320, Delay 700ms | After a short delay, rewrites an area for massive damage; detonates Q marks for +25% bonus true damage. |

### Stack — the Backend Tank (`stack`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `650` (+112), Mana `280` (+30), AD `62` (+4), Armor `36` (+4.6), MR `34` (+2.0), AS `0.66` (+0.01), MS `340`
- **Unique Passive — Failover Armor:** Taking damage grants +3 armor (stacks up to +15 for 4s).
- **Recommended Build (6 items):** `chair` (Ergonomic Chair) -> `sneakers` (Office Sneakers) -> `standing_desk` (Standing Desk) -> `thornmail_rack` (Thornmail Firewall) -> `server_rack` (Server Rack Armor) -> `guardian_backup` (Cloud Backup)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | SQL Hook | `projectile` | 55 | 11s | Dmg: 75 +15/lv +70% AD, Range 820, Pull 680 px, Stun 0.6s | Launches a query hook that yanks the first enemy hit right to you and stuns briefly. |
| **W** | Load Balancer | `self` | 50 | 13s | Shield: 100 +18/lv +8% HP, Duration 4s, +25 Armor | Gains a shield and +25 armor; if the shield breaks, releases an AoE shockwave (80 + 40% armor). |
| **E** | Rate Limit | `zone` | 55 | 12s | Dmg: 22 +4/lv +18% AD per tick, Radius 270, Duration 3s, Slow 50% | Throttles everything around you for 3s: enemies inside take damage every 0.5s and are heavily slowed. |
| **R** | Database Lock | `circle` | 100 | 75s | Dmg: 185 +20/lv +55% AD, Radius 350, PullIn 170 px, Stun 1s | Locks every table in range, pulling nearby enemies inward, damaging and stunning them. |

### Ops — the DevOps Medic (`ops`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`450`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `540` (+90), Mana `400` (+45), AD `46` (+2.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Uptime Pulse:** Healing or shielding an ally reduces your ultimate cooldown by 2s and grants +15% MS.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `rubber_duck` (Rubber Duck) -> `team_lunch` (Team Lunch) -> `headphones` (Noise-Cancelling Headphones) -> `stackoverflow` (Stack Overflow Premium)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Health Check | `circle` | 45 | 6s | Dmg: 65 +14/lv +55% AP, HealOnHit: 35 +8/lv +25% AP, Range 820, Radius 200, Delay 300ms, Slow 35% | Scans an area: slows enemies inside and heals you for each champion hit. |
| **W** | Auto-Heal | `allies` | 65 | 10s | Heal: 75 +16/lv +42% AP, Radius 500 | Restarts unhealthy containers: heals you and nearby allies. |
| **E** | Hot Swap | `swap` | 55 | 14s | Shield: 70 +14/lv +40% AP, Range 650, Duration 2.5s, +30% MS | Swaps places with the allied champion nearest your aim, rescuing them. Both gain a shield and +30% MS for 2.5s. |
| **R** | Blue-Green Deploy | `allies` | 110 | 85s | Heal: 185 +25/lv +60% AP, Shield: 155 +15/lv +40% AP, Radius 800, Duration 3s, 15% DR | Swaps the whole team to a fresh deployment: big heal, shield, and 15% damage reduction. |

### Tester — the QA Sniper (`tester`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `560` (+90), Mana `300` (+36), AD `60` (+3.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.68` (+0.025), MS `330`
- **Unique Passive — Regression Mark:** Every 3rd basic attack on a target detonates a bug report for +35% bonus physical damage.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `jetpack` (Jetpack Sneakers) -> `crit_compiler` (JIT Compiler) -> `grievous_linter` (Strict Linter) -> `ultrawide` (Ultrawide Monitor) -> `armor_shredder` (Root Sudo)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Unit Test | `projectile` | 45 | 7s | Dmg: 75 +16/lv +100% AD, Range 1050, Pierce | Fires a piercing sniper bolt through every enemy in a line. |
| **W** | Bug Trap | `circle` | 40 | 12s | Dmg: 60 +14/lv +70% AD, Range 720, Radius 95, Root 1.2s, Trap (max 3, 25s) | Deploys a hidden unit-test trap (max 3, 25s). Snaps shut to damage and root the first enemy stepping on it. |
| **E** | Edge Case | `dash` | 45 | 11s | Dmg: 45 +10/lv +50% AD, Range 400, Slow 40% | Vaults away and throws an edge-case net that damages and slows foes passed. |
| **R** | Regression Barrage | `projectile` | 100 | 58s | Dmg: 240 +30/lv +125% AD, Range 2400 | A map-wide sniper shot hitting the first champion; detonates Bug Detection stacks (0-4) for +12% true dmg/stack. |

### Zero — the Security Ninja (`zero`)
- **Role / Lane:** Assassin / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `580` (+95), Mana `300` (+35), AD `66` (+4.2), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `350`
- **Unique Passive — Zero-Day Strike:** First attack after leaving a bush or out-of-combat deals +30% bonus damage.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `armor_shredder` (Root Sudo) -> `crit_compiler` (JIT Compiler) -> `git_revert` (Git Revert Charm)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Pen Test | `dash` | 40 | 7s | Dmg: 70 +16/lv +90% AD, Range 520, toTarget, behindTarget | Dashes directly behind a target and applies Vulnerability (4s). |
| **W** | Encrypt | `self` | 50 | 14s | Duration 3s, Invis 1.8s, +35% MS, 20% DR | Vanishes into stealth for 1.8s with +35% move speed and 20% damage reduction. |
| **E** | Brute Force | `circle` | 35 | 5s | Dmg: 60 +15/lv +75% AD, Radius 240 | Slashes nearby enemies; consumes Q Vulnerability (+30% true dmg, -1.5s Q CD; basic attacks also consume it). |
| **R** | Zero-Day | `target` | 90 | 68s | Dmg: 145 +24/lv +100% AD, Range 520, behindTarget, Execute 38% missingHP, KillReset | Blinks behind an enemy champion to execute them (missing HP bonus). Killing the target resets R cooldown. |

### Model — the Data Sorcerer (`model`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`480`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `530` (+86), Mana `430` (+43), AD `46` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Gradient Descent:** Consecutive skill hits within 4s deal +10% escalating magic damage (up to +30%).
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `stackoverflow` (Stack Overflow Premium) -> `rubber_duck` (Rubber Duck) -> `firewall` (Firewall Appliance)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Gradient Descent | `circle` | 45 | 5.5s | Dmg: 70 +16/lv +60% AP, Range 850, Radius 230, Delay 350ms, Slow 40% | Collapses a data sphere on an area: damages and slows everything inside. |
| **W** | Hibernate | `self` | 60 | 16s | Duration 4.5s, Stasis 1.5s, +30% AP | Freezes your own process for 1.5s: you cannot act or be damaged. Wake up with +30% AP and your next Q or R within 4.5s deals +20%. |
| **E** | Random Forest | `circle` | 60 | 12s | Dmg: 55 +12/lv +45% AP, Range 880, Radius 220, Delay 450ms, Root 1s | Sprouts a snare zone that roots all enemies inside after a short delay. |
| **R** | Big Data | `circle` | 110 | 82s | Dmg: 290 +32/lv +95% AP, Range 1050, Radius 400, Delay 850ms, PullIn 210 px | Shockwave singularity: drags all enemies violently to the center for massive burst damage. |

### Brick — the Security Guard (`guard`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `680` (+115), Mana `280` (+30), AD `58` (+3.6), Armor `38` (+4.8), MR `34` (+2.0), AS `0.64` (+0.01), MS `335`
- **Unique Passive — Firewall Plating:** Standing near an allied tower or champion reduces incoming damage by 10%.
- **Recommended Build (6 items):** `chair` (Ergonomic Chair) -> `sneakers` (Office Sneakers) -> `standing_desk` (Standing Desk) -> `hoodie` (Company Hoodie) -> `kanban` (Kanban Board) -> `server_rack` (Server Rack Armor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | HALT! | `projectile` | 40 | 6.5s | Dmg: 65 +15/lv +60% AD +3% HP, Range 780, Pierce, Slow 40% | Sends a piercing security wave that damages and slows every enemy hit. |
| **W** | Clipboard of Rules | `self` | 50 | 13s | Shield: 95 +18/lv +7% HP, Duration 4s, Spell Shield 2s, +20 Armor | Hides behind the rules: max-HP shield, +20 armor, and a 2s Spell Shield blocking the next enemy skill. |
| **E** | Escort Out | `dash` | 55 | 11s | Dmg: 55 +14/lv +80% AD, Range 420, KB 340, WallStun 1.2s, toTarget | Charges an enemy and slams them far away. Pinning them into a WALL stuns for 1.2s. |
| **R** | Building Lockdown | `circle` | 100 | 78s | Dmg: 165 +22/lv +6% HP, Radius 390, Delay 250ms, KB 320, WallStun 1s, Slow 35% | Locks down the floor: every enemy nearby is damaged, slowed and blasted outward. Walls stun. |

### Mop — the Night-Shift Cleaner (`cleaner`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`450`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `510` (+84), Mana `440` (+44), AD `46` (+2.8), Armor `20` (+3.3), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Clean Sweep:** Killing a minion or monster restores 25 HP and 20 mana instantly.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `midnight_oil` (Midnight Oil) -> `stackoverflow` (Stack Overflow Premium) -> `pomodoro` (Pomodoro Timer)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Sweep | `projectile` | 45 | 6s | Dmg: 50 +12/lv +45% AP, Range 520, 5-Fan (80 deg), KB 150 | Sweeps a 5-broom fan in front of you that shoves every enemy hit back. |
| **W** | Soap Bubble | `circle` | 60 | 11s | Dmg: 60 +14/lv +50% AP, Range 800, Radius 200, Delay 700ms, Slow 60% | Drops a giant soap bubble that pops after 0.7s, damaging enemies and slowing them by 60% for 2s. |
| **E** | Mop Slide | `dash` | 45 | 12s | Dmg: 45 +10/lv +40% AP, Range 460, Slow 25%, Trail 3s | Slides forward splashing enemies and leaves a Wet Floor behind that slows and burns for 3s. |
| **R** | Flood | `zone` | 110 | 82s | Dmg: 40 +6/lv +14% AP per tick, Range 900, Radius 420, Duration 4.5s, Slow 65% | Floods a huge area for 4.5s: everything inside crawls at 35% speed and is scalded every 0.5s. |

### Rush — the Delivery Rider (`courier`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `600` (+98), Mana `300` (+34), AD `64` (+4), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `355`
- **Unique Passive — Express Delivery:** Moving continuously builds momentum: next basic attack deals +25% bonus damage and slows 15%.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `ultrawide` (Ultrawide Monitor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Express Delivery | `dash` | 45 | 8s | Dmg: 70 +16/lv +80% AD, Range 620, Refund 1.5s Q CD/champ | Revs through a line, damaging every enemy and refunding 1.5s Q cooldown per champion hit. |
| **W** | Hot Meal | `self` | 45 | 12s | Heal: 65 +14/lv +35% AD, Duration 4s, +20% MS, +35% AS | Eats a customer's order: heals and gains +35% attack speed and +20% move speed. |
| **E** | Package Drop | `circle` | 55 | 11s | Dmg: 65 +15/lv +75% AD, Range 650, Radius 220, Delay 500ms, KB 160, Stun 0.8s | Lobs a heavy parcel that explodes after 0.5s: AoE damage, knockback, and stun. |
| **R** | Surge Pricing | `circle` | 90 | 72s | Dmg: 190 +26/lv +90% AD, Range 900, Radius 360, Delay 600ms, Slow 50% | Triples the price on a huge area: after 0.6s enemies take heavy damage and are slowed 50% for 2s. |

### Volt — the Embedded Engineer (`embedded`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`470`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `44` (+2.6), Armor `22` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Servo EMP:** Every 4th basic attack discharges a pulse through your pet for +40 bonus magic damage.
- **Companion Pet — Servo:** Untargetable unit following `110 px` behind; attacks owner's target within `320 px` every `900 ms` for `20 +4/lv +15% AD +12% AP` (despawns on death).
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `rubber_duck` (Rubber Duck) -> `firewall` (Firewall Appliance) -> `stackoverflow` (Stack Overflow Premium)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Servo Zap | `circle` | 50 | 8s | Dmg: 65 +14/lv +55% AP, Radius 210, Delay 350ms, Stun 0.7s, at: 'pet' | Servo discharges around itself: enemies near Servo are damaged and stunned. Position your pet, then zap. |
| **W** | Overclock | `self` | 60 | 12s | Duration 4s, +35% AS, Pet +100% | Overclocks you and Servo: +35% attack speed; Servo attacks twice as fast and deals double damage. |
| **E** | Watchdog Trap | `circle` | 60 | 13s | Dmg: 55 +12/lv +45% AP, Range 700, Radius 110, Stun 0.85s, Trap (max 3, 25s) | Plants a Watchdog sensor trap (max 3, 25s). Shocks and stuns the first enemy to trigger it. |
| **R** | Servo EMP | `circle` | 110 | 68s | Dmg: 205 +26/lv +85% AP, Radius 390, Delay 650ms, KB 260, WallStun 0.9s, at: 'pet' | Servo overloads: blasts every enemy around SERVO outward. Pinning them into a wall stuns for 0.9s. |

### Patch — the Software Engineer (`dev`)
- **Role / Lane:** Fighter / `top` · **Range:** Melee (`150`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `600` (+100), Mana `300` (+34), AD `62` (+4), Armor `30` (+4.2), MR `32` (+1.6), AS `0.66` (+0.012), MS `340`
- **Unique Passive — Hotfix Fury:** Below 50% HP, gain +12% attack damage and +12% lifesteal.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `standing_desk` (Standing Desk) -> `server_rack` (Server Rack Armor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Refactor | `circle` | 35 | 5.5s | Dmg: 70 +16/lv +85% AD, HealOnHit: 45 +10/lv +4% HP, Radius 270 | Spins the keyboard in a wide arc, cleaving nearby enemies and healing you for each champion hit. |
| **W** | Pair Programming | `self` | 50 | 13s | Shield: 70 +14/lv +35% AD, Duration 4s, +30% AS, +20% AD | Gains a shield, +20% AD and +30% AS for 4s. |
| **E** | git checkout -b | `dash` | 50 | 11s | Dmg: 50 +12/lv +60% AD, Range 380, Recast 3s (again) | Branches off in a dash that damages enemies in your path. Press E again within 3s for a second dash. |
| **R** | Merge Conflict | `target` | 100 | 72s | Dmg: 150 +22/lv +90% AD, HealOnHit: 120 +20/lv +40% AD, Range 420, Stun 1.5s | Locks an enemy champion in a merge conflict: heavy damage, a 1.5s stun, and you heal from the fight. |

### Swipe — the App Developer (`appdev`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `550` (+88), Mana `300` (+36), AD `60` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.025), MS `330`
- **Unique Passive — Swipe Combo:** Alternating a skill and a basic attack empowers the attack with +28% bonus damage.
- **Recommended Build (6 items):** `caffeine` (Caffeine Pills) -> `jetpack` (Jetpack Sneakers) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `gauntlet` (Git Blame Gauntlet) -> `ultrawide` (Ultrawide Monitor) -> `standing_desk` (Standing Desk)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Push Notification | `projectile` | 45 | 5.5s | Dmg: 62 +14/lv +75% AD, Range 840, 3-Fan (24 deg), Slow 20% | Throws 3 phones in a fan that slow enemies hit by 20%. Cheap, fast poke. |
| **W** | Dark Mode | `self` | 45 | 12s | Duration 4s, Invis 1.2s, +25% MS, +35% AS | Enters Dark Mode: 1.2s stealth plus +25% move speed and +35% attack speed. |
| **E** | Swipe Left | `dash` | 35 | 7s | Range 390 | Quickly dashes in the aimed direction. |
| **R** | App Store Launch | `projectile` | 100 | 62s | Dmg: 175 +25/lv +100% AD, Range 1200, 7-Fan (50 deg), Execute 15% missingHP | Launches a 7-phone barrage dealing bonus damage based on enemy missing HP. |

### Sprint — the Scrum Master (`sprint`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `610` (+98), Mana `300` (+34), AD `63` (+4), Armor `30` (+4.1), MR `32` (+1.6), AS `0.67` (+0.012), MS `350`
- **Unique Passive — Sprint Velocity:** Takedowns and camp kills grant +25% move speed for 2.5s and heal 45 HP.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `second_monitor` (Second Monitor) -> `standing_desk` (Standing Desk) -> `letter_opener` (Letter Opener)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Daily Stand-up | `circle` | 35 | 5.5s | Dmg: 65 +15/lv +85% AD, Radius 260, Slow 35% | Calls a stand-up: slams nearby foes and slows them. |
| **W** | Burndown | `self` | 45 | 12s | Heal: 40 +9/lv +20% AD, Shield: 80 +16/lv +30% AD, Duration 3s, 30% DR | Burns down the backlog: heals, gains a shield and takes 30% less damage for 3s. |
| **E** | Story Points | `dash` | 45 | 10s | Dmg: 65 +15/lv +80% AD, Range 520, Stun 0.7s, toTarget, KillReset | Leaps onto a target to damage and stun (0.7s). Killing a champion resets E cooldown. |
| **R** | All Hands Sprint | `allies` | 100 | 75s | Radius 750, Duration 5s, +40% MS, +20% AS, +15% AD | Rallies the team for a 5s sprint: allies within range get +40% MS, +15% AD and +20% AS. |

### Cache — the Data Engineer (`cache`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`520`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `545` (+87), Mana `310` (+36), AD `59` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.024), MS `330`
- **Unique Passive — Cache Hit:** Attacking the same target repeatedly grants +6% bonus damage per hit (up to +24%).
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `jetpack` (Jetpack Sneakers) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `energy_crate` (Energy Drink Crate) -> `ultrawide` (Ultrawide Monitor) -> `letter_opener` (Letter Opener)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Batch Job | `projectile` | 40 | 6s | Dmg: 68 +15/lv +90% AD, Range 960, Pierce, Refund 1s ALL CDs/champ | Fires a piercing batch bolt; hitting a champion refunds 1s off ALL skill cooldowns. |
| **W** | Stale Data | `projectile` | 50 | 12s | Dmg: 55 +12/lv +60% AD, Range 900, Slow 45%, Mark stale (max 3) | Poisons the first champion hit with stale data: slow 45% and a Stale stack (max 3, 6s) that Full Table Scan cashes in. |
| **E** | Failover | `blink` | 50 | 13s | Range 400 | Instantly blinks to a standby position. |
| **R** | Full Table Scan | `projectile` | 100 | 68s | Dmg: 210 +28/lv +115% AD, Range 2100, Pierce, Detonate stale +20%/stack true | Fires a lane-wide beam through every enemy; each Stale stack on a champion adds +20% of the hit as true damage. |

### Hira — the People Partner (`hr`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`460`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `545` (+89), Mana `420` (+43), AD `44` (+2.6), Armor `23` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Culture Fit:** Nearby allied champions grant +10% shield/heal power and +12% move speed when assisting.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `rubber_duck` (Rubber Duck) -> `team_lunch` (Team Lunch) -> `cloud_credits` (Cloud Credits) -> `vpn_hoodie` (VPN Hoodie)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Feedback Hook | `projectile` | 55 | 10s | Dmg: 60 +14/lv +50% AP, Range 880, Pull 380 px, Root 1s | Lashes out a meeting invite that drags the first enemy toward you and roots them (1.0s). |
| **W** | Team Building | `allies` | 65 | 12s | Heal: 65 +14/lv +35% AP, Radius 520, Duration 3s, Spell Shield 2.5s, +20% MS | Heals nearby allies, grants +20% MS, and places a 2.5s Spell Shield blocking 1 enemy skill. |
| **E** | Policy Update | `zone` | 55 | 10s | Dmg: 14 +3/lv +10% AP per tick, Range 750, Radius 225, Duration 3s, Slow 45% | Spreads a 3s policy puddle that slows and burns everyone standing inside. |
| **R** | Mandatory Meeting | `circle` | 110 | 82s | Dmg: 150 +20/lv +60% AP, Range 800, Radius 360, Delay 650ms, Silence 2.5s, Slow 40% | Calls an all-hands: after 0.65s enemies in the area are damaged, slowed 40% and SILENCED for 2.5s. |

### Lint — the Code Reviewer (`lint`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`470`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `525` (+85), Mana `430` (+43), AD `46` (+2.9), Armor `21` (+3.4), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Strict Audit:** Skills apply a 2s mark reducing enemy armor by 15%.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `smartwatch` (Smartwatch) -> `headphones` (Noise-Cancelling Headphones) -> `cloud_credits` (Cloud Credits) -> `stackoverflow` (Stack Overflow Premium) -> `vpn_hoodie` (VPN Hoodie)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Nitpick | `target` | 40 | 5.5s | Dmg: 75 +16/lv +55% AP, Range 650, Slow 30%, Mark nit (max 4) | Flags an enemy with a nitpick: damage, slow, and a Nit stack (max 4, 6s) that Hard Reset cashes in. |
| **W** | Request Changes | `circle` | 60 | 11s | Dmg: 65 +14/lv +55% AP, Range 850, Radius 215, Delay 650ms, Root 1.1s | Blocks the merge: after a delay, enemies in the area are damaged and rooted. |
| **E** | Code Freeze | `zone` | 55 | 13s | Dmg: 12 +3/lv +8% AP per tick, Range 700, Radius 210, Duration 3s, Silence 0.7s, Slow 25% | Freezes the codebase in an area for 3s: enemies inside are SILENCED, slightly slowed, and take damage over time. |
| **R** | Hard Reset | `circle` | 110 | 78s | Dmg: 200 +26/lv +80% AP, Range 720, Radius 330, Delay 480ms, Detonate nit +18%/stack true | git reset --hard on an area for big damage; each Nit stack on a champion adds +18% of the hit as true damage. |

### Brew — the Office Barista (`barista`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`480`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `45` (+2.7), Armor `22` (+3.4), MR `30` (+1.2), AS `0.63` (+0.011), MS `330`
- **Unique Passive — Espresso Shot:** Every 2nd skill cast brews a shot that restores 6% max HP to you and the nearest ally.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `team_lunch` (Team Lunch) -> `headphones` (Noise-Cancelling Headphones) -> `firewall` (Firewall Appliance) -> `midnight_oil` (Midnight Oil)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Hot Pour | `projectile` | 50 | 7.5s | Dmg: 50 +11/lv +40% AP, Range 700, 3-Fan (28 deg), Slow 35% | Sprays three streams of scalding coffee in a cone that burn and slow whoever they hit. |
| **W** | Espresso Shot | `allies` | 60 | 13s | Heal: 45 +10/lv +30% AP, Radius 520, Duration 4s, +15% MS, +25% AS | Serves a double shot to nearby allies: heals + grants 25% attack speed and 15% move speed. |
| **E** | Decaf | `circle` | 60 | 12s | Dmg: 45 +11/lv +40% AP, Range 780, Radius 185, Delay 600ms, Stun 1.05s | Swaps an area's coffee for decaf. After 0.6s, enemies inside fall asleep (stun). |
| **R** | Break Room | `zone` | 110 | 82s | Dmg: 12 +3/lv +6% AP per tick, Heal: 16 +3/lv +8% AP, Range 700, Radius 330, Duration 4s, Slow 35% | Opens the break room for 4s: allies inside heal every 0.5s while enemies are slowed and scalded. |

### Pager — the On-Call SRE (`oncall`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`140`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `615` (+97), Mana `300` (+34), AD `64` (+4.1), Armor `30` (+4), MR `32` (+1.6), AS `0.67` (+0.012), MS `345`
- **Unique Passive — Incident Response:** Deal +25% bonus damage to jungle monsters/epics and gain +15% MS toward low-HP enemies.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `standing_desk` (Standing Desk)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Ping | `dash` | 35 | 6s | Dmg: 60 +14/lv +70% AD, Range 560, Slow 40%, toTarget | Pings a target and rushes onto it, slowing them 40%. Works on monsters to hop between camps. |
| **W** | Page Everyone | `projectile` | 50 | 12s | Dmg: 45 +10/lv +45% AD, Range 1400, Pierce, Slow 30%, Mark paged (max 1) | Sends a long-range alert through every champion in a line: damage, slow, and a Paged mark that On My Way cashes in. |
| **E** | Postmortem | `circle` | 55 | 14s | Dmg: 55 +12/lv +50% AD, Radius 270, Slow 50% | Holds a blameless postmortem around you: enemies nearby take damage and are slowed 50% for 1.5s. |
| **R** | On My Way | `dash` | 100 | 75s | Dmg: 175 +25/lv +95% AD, Range 920, Stun 1s, toTarget, behindTarget, Detonate paged +35%/stack true | Launches across long range straight behind an enemy champion: big damage + 1.0s stun, +35% true damage if Paged. |

---

## Mechanic Ownership Matrix (v5 Diversity Rework, 2026-11-27)
Design rule: **no mechanic is shared by more than a handful of skills.** v5 removed copy-paste clusters (6 Spell Shields, 7 pull-in vortexes, 6 stat-buff self casts, 4 stun dashes, 3 boomerangs, 3 chains, 3 traps, 3 refunds) and added 6 engine primitives (`silence`, `recast`, `swap`, `trail`, `mark`/`detonate`, `stasis`). Generated from `shared/moba/champions.js`.

| Mechanic | Skills | Owners |
| :--- | :---: | :--- |
| **Ally swap** (v5) | 1 | `Ops E` |
| **Dash trail zone** (v5) | 1 | `Mop E` |
| **Mark / detonate** (v5) | 6 | `Cache W`, `Cache R`, `Lint Q`, `Lint R`, `Pager W`, `Pager R` |
| **Recast** (v5) | 2 | `Pixel E`, `Patch E` |
| **Silence** (v5) | 2 | `Hira R`, `Lint E` |
| **Stasis** (v5) | 1 | `Model W` |
| Behind-target | 3 | `Zero Q`, `Zero R`, `Pager R` |
| Boomerang | 1 | `Pixel Q` |
| Chain lightning | 1 | `Pixel W` |
| Cooldown refund on hit | 2 | `Rush Q`, `Cache Q` |
| Ground trap | 2 | `Tester W`, `Volt E` |
| Heal on hit | 3 | `Ops Q`, `Patch Q`, `Patch R` |
| Hook (pull to caster) | 2 | `Stack Q`, `Hira Q` |
| Kill reset | 2 | `Zero R`, `Sprint E` |
| Knockback / wall stun | 5 | `Brick E`, `Brick R`, `Mop Q`, `Rush E`, `Volt R` |
| Missing-HP execute | 2 | `Zero R`, `Swipe R` |
| Pet-centered area | 2 | `Volt Q`, `Volt R` |
| Projectile fan | 4 | `Mop Q`, `Swipe Q`, `Swipe R`, `Brew Q` |
| Spell Shield | 2 | `Brick W`, `Hira W` |
| Stealth | 2 | `Zero W`, `Swipe W` |
| Vortex pull-in | 2 | `Stack R`, `Model R` |

---

## Edge-Case Mechanics, Skill Engine Rules & Damage Channels
- **Damage Channels (`skillDamageType`):** Skills with pure AP scaling (`apRatio > 0 && !adRatio`) and `Servo` companion attacks deal **Magic Damage** (mitigated by `MR` and `MR Pen`). Auto-attacks and AD/HP-scaling skills deal **Physical Damage** (mitigated by `Armor` and `Armor Pen`). Boomerang return orbs (`Pixel Q`, `Mop Q` with `returnTrueDmg: true`) and combo mark detonations (`Pixel R`, `Zero E`, `Tester R` Bug Stacks) deal **True Damage**.
- **Reworked LoL-Inspired Mechanics (`SkillEngine.js` & `OfflineSim.js`):**
  - `boomerang` (+ `returnTrueDmg`): Projectile flies out to `range`, flips into a return leg homing back onto the caster (`MobaFx.js` renders live return path), resets hit immunity once on turnaround, and deals True Damage on the way back (`Pixel Q` only).
  - `chain`: Bounces from the primary hit target across up to `N` nearby enemies within `range` with per-bounce damage `decay` and lightning arc VFX (`zap`) (`Pixel W` only).
  - `pull` & `pullIn`: Hook projectiles drag the first victim toward the caster (`Stack Q` `680 px`, `Hira Q` `380 px`), while AoE vortex circles/zones pull affected enemies toward center (`Stack R`, `Model R`).
  - `trap`: `circle` deployables persist up to `25s` (`maxActive: 3` per owner), arming after `armMs`, and despawning immediately via `trapEnd` upon triggering, eviction, expiry, or owner death. Traps placed out of enemy vision are invisible to enemies immediately; traps placed in front of enemy sight remain visible to enemies for `3.0s` before fading into stealth.
  - `behindTarget`: Teleports or dashes directly to the far side (`~75 px` behind enemy facing vector) so follow-up skillshots or wall-pins angle reliably (`Zero Q/R`, `Pager R`).
  - **v5 `silence { ms }`:** target cannot cast skills (basic attacks and movement still work). Applied by `_applyCC` (`TeamRoom`) / the `effects` hook (`OfflineSim`); checked in `_doCast` / `_cast` (`Hira R`, `Lint E` zone ticks).
  - **v5 `recast { ms, mode }`:** the first cast starts the cooldown and opens a window; the same key pressed again inside it is free (no mana, no cooldown). `mode: 'back'` returns to the first-cast origin (`Pixel E`), `mode: 'again'` repeats the dash at the new aim (`Patch E`). The client skips its own cooldown/mana check while the window is open (`TeamModeScene._tryCast`); the server stays authoritative.
  - **v5 `type: 'swap'`:** swaps places with the allied champion nearest the aim within `range`; shield and buff go to both (`Ops E`). Fails without cost when no ally is in range.
  - **v5 `trail`:** a dash spawns a persistent zone at the midpoint of its path (`Mop E`).
  - **v5 `mark { tag, ms, max }` / `detonate { tag, pctPerStack }`:** champion hits add stacks; a detonating hit consumes them for bonus true damage (`Lint Q -> R`, `Cache W -> R`, `Pager W -> R`).
  - **v5 `stasis { ms }`:** self-cast invulnerable + unable to act, reusing the existing `_stasisUntil` immunity (`Model W`).
  - `invisMs`: Grants stealth that breaks immediately on outgoing attacks/skills (`Zero W` `1.8s`, `Swipe W` `1.2s`).
  - `spellShieldMs`: Absorbs the next incoming hostile skill (negating damage and CC) with a brief shield-pop indicator (`Brick W`, `Hira W`).
  - `killReset`, `healOnHit`, `cdRefundOnHit`: `Zero R` and `Sprint E` refund their full cooldown on champion takedown; `Ops Q` and `Patch Q` / `Patch R` heal per champion struck; `Rush Q` and `Cache Q` reduce active skill cooldowns per champion hit.
- **Auto-Aim Policy (`autoAimsAtEnemy`, `autoAimReach`):**
  - Point-and-click skills (`target`, `toTarget` dashes) search within `range + 30 px` (`TARGET_CAST_SLACK`).
  - Skillshots/circles search within `range + 150 px` (`AUTO_AIM_SLACK`), aiming at the nearest visible enemy champion first, then nearest visible unit.
  - Directional dashes (`Tester E`, `Mop E`, `Patch E`, `Swipe E`, `Rush Q`), blinks (`Pixel E`, `Cache E`) and `swap` (`Ops E`, which targets the nearest ally instead) **never** auto-aim at enemies — they fire strictly along the player's movement stick or cursor facing direction (`MIN_AIM_DIST = 24 px`).
- **Volt (`Servo`) Rules:** Targets the owner's current basic-attack target, else the last enemy champion hit by Volt within `3.0s`. Follows `110 px` behind at `1.15x` owner MS, is untargetable/invulnerable, scales cadence with `Overclock` (`+100%`) and `Servo Overdrive` Epic Augment, ignores walls via `nearestFree`, and despawns immediately on Volt's death.
- **Starting Ranks, Practice Mode & Mid-Match Swap:** Standard matches spawn at Level 3 with `Q/W/E = Rank 1`, `R = Rank 0` (`ULT_UNLOCK_LEVEL = 6`). Main Menu **TEST CHAMPS** (`TeamModeScene` offline sandbox) and `preview.bat` expose live practice toggles (`0s CD`, `NO MANA`, `NO DMG`, `+LV`, `+5000g`, `SWAP CHAMP`) on both the pinned HUD bar and `ESC` menu; `_switchChamp` clears active death/CC/stealth/spellShield flags so swapping works from any state.

---

## Lv 1 vs. Lv 18 Unitemized Stat Progression (`statAt`)
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

## Optimal Skill Combos, Level-Up Order & Counterplay Cheat Sheet
| Champion | Skill Max Priority | Standard Combo Rotation | Primary Threat / Counterplay Rule |
| :--- | :---: | :--- | :--- |
| **Pixel** | `R > Q > W > E` | `E (Empower) -> Q (Boomerang+Mark) -> W (Chain) -> E (snap back) -> R` | Sidestep the return orbit of `CSS Boomerang`; punish the 3s window after `E`; `R` has `700 ms` delay |
| **Stack** | `R > Q > W > E` | `Q (SQL Hook) -> E (Rate Limit zone) -> W (Shield) -> R (PullIn)` | Dodge straight-line `SQL Hook` behind minions; walk out of the `270 px` `Rate Limit` zone; break `W` at range |
| **Ops** | `R > W > Q > E` | `Q (Heal/Slow) -> E (Hot Swap rescue) -> W / R (Reset)` | Burst the swapped ally before the shield matters; `Hot Swap` needs an ally within `650 px` |
| **Tester** | `R > Q > W > E` | `W (Bug Trap) -> Q (Pierce) -> 3x AA -> E (Slow) -> R` | Watch bush chokepoints for `Bug Trap` roots; dodge `Unit Test` line |
| **Zero** | `R > Q > E > W` | `W (Stealth) -> Q (Behind) -> E (Detonate) -> R (Execute)` | Ward flanks (`[4]`); deny reset kill with `Debugger Breakpoint` stasis |
| **Model** | `R > Q > E > W` | `Q (Slow) -> E (Root) -> W (Hibernate, empowers next Q/R) -> R (PullIn)` | Do not waste burst during `Hibernate` (1.5s invulnerable); dash out of the `850 ms` `Big Data` charge |
| **Brick** | `R > W > E > Q` | `W (Spell Shield) -> Q (Pierce Slow) -> E (Wall Pin) -> R` | Bait `Clipboard` 2s Spell Shield and avoid fighting beside corridor walls |
| **Mop** | `R > Q > W > E` | `E (Slide + trail) -> Q (5-fan shove) -> W (Bubble) -> R (Flood)` | Leave the `Wet Floor` trail; bubble pops after `700 ms`; exit the `420 px` `Flood` (65% slow) early |
| **Rush** | `R > Q > E > W` | `Q (Refund dash) -> E (Parcel stun) -> R (Surge Pricing) -> W` | `R` telegraphs `600 ms` over `360 px`; don't line up for `Express Delivery` refunds |
| **Volt** | `R > Q > W > E` | `E (Watchdog Trap) -> reposition Servo -> Q (Servo Zap) -> R (Servo blast)` | `Q` and `R` are centered on Servo, not Volt: read Servo's position and spread away from it |
| **Patch** | `R > Q > E > W` | `E (dash) -> E (recast dash) -> Q (Heal Cleave) -> W -> R (Lock + heal)` | After two dashes `E` is on `11s` CD; `R` is single-target (`420 px`) with a `1.5s` stun, so peel allies out of it; `Strict Linter` cuts heal |
| **Swipe** | `R > Q > W > E` | `W (Stealth) -> Q (3-fan slow) -> AA -> E -> R (Execute)` | `Q` is cheap poke: punish after `E` is spent; reveal stealth with wards |
| **Sprint** | `R > Q > E > W` | `R (team rally) -> E (Stun leap) -> Q -> W (Burndown)` | Deny takedowns so `Story Points` (`E`) does not chain-reset; split the team early vs `All Hands Sprint` |
| **Cache** | `R > Q > W > E` | `W (Stale x1-3) -> Q (All-CD Refund) -> AA x4 -> R (detonate)` | `Stale Data` is a champion-only skillshot: dodge it to deny the `+20%` true damage per stack on `R` |
| **Hira** | `R > Q > W > E` | `Q (Feedback Hook) -> E (Policy Zone) -> W (Spell Shield) -> R (Silence)` | Dodge `380 px` `Feedback Hook`; spread out of the `650 ms` `Mandatory Meeting` telegraph or you cannot cast for `2.5s` |
| **Lint** | `R > Q > W > E` | `Q x2-4 (Nit stacks) -> W (Root) -> E (Code Freeze) -> R (detonate)` | Each `Nit` adds `+18%` true damage to `R`; stay out of the `Code Freeze` silence zone; sidestep `650 ms` `W` |
| **Brew** | `R > Q > E > W` | `Q (Cone) -> E (Decaf Stun) -> W (AS/Heal) -> R` | `Hot Pour` no longer heals: sustain comes from `W`, `R` and the passive; anti-heal still halves `Break Room` |
| **Pager** | `R > W > Q > E` | `W (Paged mark) -> Q (Ping dash) -> E (Postmortem slow) -> R (920 px Behind +35%)` | Dodge the `1400 px` `Page Everyone` line; deny vision (`[4]` wards); `R` deals bonus true damage to Paged targets |

---

## Champion Archetypes, Team Compositions & Power-Spike Windows

### Role Ecosystem & Draft Synergy
| Archetype | Champions | Core Job in 5v5 | Ideal Pairings | Weakness if Unchecked |
| :--- | :--- | :--- | :--- | :--- |
| **Frontline Tanks** | `Stack`, `Brick` | Hook/pin priority carries, absorb tower fire, initiate with `PullIn` / `Lockdown` | Pair with hyper-carries (`Tester`, `Cache`) | Vulnerable to `Root Sudo`, `Strict Audit`, and Boomerang True Dmg |
| **Bruiser / Fighter** | `Patch` | Split-push side lanes, soak skillshots with `W` Spell Shield, execute frontliners | Pair with speed/peel (`Ops`, `Hira`) | Kited by `Cold Cache` slows and `Strict Linter` anti-heal |
| **Assassins & Dive** | `Zero`, `Rush`, `Sprint`, `Pager` | Flank with stealth/behindTarget, isolate backline carries, chain Kill Resets | Pair with global/chain follow-up (`Pixel`, `Cache`) | Shut down by `Bug Trap` / `Watchdog Trap` roots and `freeze_frame` |
| **Burst & Zone Mages** | `Pixel`, `Mop` | Fast waveclear, double-hit Boomerang True Damage, vortex area control | Pair with AoE PullIn (`Stack R`, `Hira R`) | Vulnerable when `E` mobility is on cooldown |
| **Controllers** | `Model`, `Lint` | Pull/root grouped fights around Epic pits, pop armor shred, peel with Spell Shield | Pair with frontline tanks to hold targets in `Big Data` | Mobile blink/stealth champions can dodge `650–850 ms` telegraphs |
| **Marksmen (ADC)** | `Tester`, `Swipe`, `Cache` | Control lane traps, abuse CD refunds (`Q`) and stealth repositioning (`W`), shred objectives | Pair with peel supports (`Ops`, `Volt`, `Hira`) | Fragile (`545–560 HP`); vulnerable when `W` traps / `E` dashes are spent |
| **Supports** | `Ops`, `Volt`, `Hira`, `Brew` | Protect carries with timed `Spell Shield`, zone traps/vortexes, sustain prolonged fights | Pair with scaling ADCs or dive bruisers | Dependent on mana early and vision control (`[4]` wards) |

### Power-Spike Timeline Across All 18 Champions
| Champion | Lv 1–4 Laning | Lv 5 Augment Spike | Lv 6 Ultimate Spike | 2-Item Core Spike | Lv 15 Late Game |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pixel** | `Q` Boomerang poke + `W` chain | `CSS Split-Bolt` waveclear | High (`Q -> R` true-dmg mark) | `Headphones` + `Cold Cache` | Very High (True Boomerang + Stasis) |
| **Stack** | `Q` SQL Hook catch threat | `Cluster Shield` | High (`Database Lock` PullIn + Stun) | `Standing Desk` + `Thornmail` | High (Pick hook + Rate Limit zone) |
| **Ops** | `Q` heal poke + `W` sustain | `Auto-Scaler Field` | Very High (`Blue-Green Deploy`) | `Rubber Duck` + `Team Lunch` | Very High (Hot Swap rescues + Reset) |
| **Tester** | Bush `W` traps + `Q` pierce CS | `CI/CD Pipeline` | High (Map-wide `R` execute) | `Jetpack` + `JIT Compiler` | Hyper-Carry (Crit + Trap Zoning) |
| **Zero** | Stealth flank + `Q` behind burst | `Exploit Chain` | Very High (`Zero-Day` Reset Execute) | `Gauntlet` + `Root Sudo` | High (Reset chain assassin) |
| **Model** | `Q` poke + `E` root zone | `Overfit Nova` | Very High (`Big Data` 210 PullIn) | `Headphones` + `Stack Overflow` | Hyper-Mage (Hibernate-empowered singularity) |
| **Brick** | `Q` pierce slow + `W` Spell Shield | `Cluster Shield` | High (`Building Lockdown` wall-pin) | `Standing Desk` + `Kanban` | High (Pick engage + Peel) |
| **Mop** | `Q` 5-fan shove waveclear | `Overfit Nova` | High (`Flood` 4.5s 65% slow) | `Headphones` + `Midnight Oil` | High (Trail + Flood zone control) |
| **Rush** | Fast Lv 2-3 `Q` ganks | `Turbo Deploy` | High (`Surge Pricing` nuke + slow) | `Gauntlet` + `Kanban` | Medium-High (Multi-hit Q skirmisher) |
| **Volt** | `Q` Servo Zap stun + `E` Watchdog Trap | `Servo Overdrive` | High (`Servo EMP` wall-stun blast) | `Headphones` + `Rubber Duck` | High (Double-speed Servo + Trap control) |
| **Patch** | `Q` heal trades + `E` double dash | `Merge Cleave` | High (`Merge Conflict` 1.5s lock + heal) | `Gauntlet` + `Kanban` | Very High (Dash-chain bruiser carry) |
| **Swipe** | `Q` fan poke + `W` stealth | `CI/CD Pipeline` | High (`App Store Launch` execute fan) | `Jetpack` + `RGB Keyboard` | Very High (Stealth kiting ADC) |
| **Sprint** | Early camp + `E` stun ganks | `Turbo Deploy` | High (`All Hands Sprint` team rally) | `Gauntlet` + `Second Monitor` | Medium-High (Reset skirmisher + team buff) |
| **Cache** | `520` AA range + `W` Stale poke | `Branch Predictor` | High (`Full Table Scan` 2100 px + stacks) | `Jetpack` + `RGB Keyboard` | Hyper-Carry (Spam Q CD refunds) |
| **Hira** | `Q` Feedback Hook + `W` Spell Shield | `Auto-Scaler Field` | Very High (`Mandatory Meeting` Silence) | `Rubber Duck` + `Team Lunch` | High (Hook engage + AoE silence) |
| **Lint** | `Q` Nit stacks + `W` root setup | `Overfit Nova` | High (`Hard Reset` detonation) | `Smartwatch` + `Headphones` | High (Mark shred + silence zone) |
| **Brew** | `Q` cone poke + `W` AS/heal | `Auto-Scaler Field` | High (`Break Room` 4s heal/burn) | `Team Lunch` + `Headphones` | High (Sustained teamfight aura) |
| **Pager** | Fast camp clear + `Q` Ping dash | `Exploit Chain` | Very High (`On My Way` 920 px behind, +35% if Paged) | `Gauntlet` + `Kanban` | Medium-High (Global pick) |

---

## Sample Recommended 5v5 Team Compositions
- **1. Wombo PullIn Vortex ("All-Hands Wipe"):** `Stack` (Top) + `Pager` (Jungle) + `Model` (Mid) + `Swipe` (Bot) + `Hira` (Support). Chain `Stack Q` / `Hira Q` hooks into `Hira R` (silence) -> `Model R` (`210 px` PullIn singularity) -> `Stack R`.
- **2. Spell-Shield Hypercarry ("Unstoppable Deploy"):** `Brick` (Top) + `Zero` (Jungle) + `Lint` (Mid) + `Tester` (Bot) + `Ops` (Support). Use `Ops E` Hot Swap to pull `Tester` out of dives, layer `Brick W` Spell Shield, and let `Lint E` Code Freeze silence divers around `Tester`'s `Bug Trap` perimeter while `Zero` hunts reset executes.
- **3. Pick & Boomerang Siege ("Zero-Downtime Push"):** `Patch` (Top) + `Rush` (Jungle) + `Pixel` (Mid) + `Cache` (Bot) + `Volt` (Support). `Volt E` traps and Servo-centered `Q` / `R` lock siege angles while `Cache W` Stale stacks set up `Cache R` and `Pixel Q` Boomerang True Damage shreds frontline tanks.

---

## Lane-by-Lane Playbook & Matchup Priorities

### Top Lane (`Stack`, `Brick`, `Patch`)
- **Role Identity:** Durable frontline duelists, hooks, and wall-brawlers (`1v1` island from `0:20` to `10:00`).
- **Lv 1–3 Priority:** `Brick` pressures with `HALT!` pierce slow and `W` Spell Shield blocks; `Stack` punishes extended positioning with `SQL Hook` tower pulls; `Patch` out-sustains melee trades with `Refactor` heal-on-hit and `< 50%` HP fury, and closes gaps with a double `E` dash.
- **Macro Transition:** Join `Golden Bug` (`3:00`) / `Deadline` (`6:00`) river fights once Tier-1 falls or after `10:00`.

### Jungle (`Zero`, `Rush`, `Sprint`, `Pager`)
- **First Clear & Gank Timing:** Start `small -> medium -> big` quadrant camp at `0:15` (`kill -9` Smite speeds `big` Legacy Mainframe and heals `8% max HP`). First gank window opens at `0:40–1:00` (`Lv 2–3`).
- **Style Split:**
  - `Rush` & `Sprint`: High-tempo gankers; `Rush Q` refunds cooldown across clustered bot lanes, `Sprint E` resets in river skirmishes, and `Sprint R` rallies the whole team.
  - `Zero`: Stealth-gank assassin (`W` `1.8s` invis -> `Q` behind target) with `Zero-Day` reset sweeps.
  - `Pager`: `Page Everyone` (`W`, `1400 px` mark) into `Ping` (`Q`) and `920 px` `On My Way` behind-target engage from fog.

### Mid Lane (`Pixel`, `Model`, `Mop`, `Lint`)
- **Role Identity:** Shortest lane (`320 px` corridor) granting immediate access to both river Epic Pits.
- **Wave Control:** `Mop` (`Q` 5-fan sweep + `W` bubble) and `Pixel` (`CSS Boomerang`) clear waves rapidly; `Model` and `Lint` control choke points with `Random Forest` roots and `Nitpick` / `Code Freeze` marks and silences.

### Bot Lane (`Tester`, `Swipe`, `Cache` + `Ops`, `Volt`, `Hira`, `Brew`)
- **2v2 Synergy:** Carries set up lane traps (`Tester W`, `Cache W`) or stealth/dash repositions (`Swipe W/Q/E`), paired with hook/trap/shield supports.
- **Key Bot Pairings:**
  - `Tester + Hira`: `Feedback Hook` drags victims straight into `Bug Trap` + `Regression Barrage`.
  - `Swipe + Brew`: `Espresso Shot` heal/AS fuels `Swipe Q -> AA` weave trades.
  - `Cache + Volt`: `Watchdog Trap` + Servo-centered `Q` stun create lane lockdown while `Stale Data` stacks charge `Full Table Scan`.

---

## Skill Engine Execution Rules by Skill Type (`SkillEngine.js` & `OfflineSim.js`)

| Skill `type` | Caster Movement Lock | Wall / Terrain Behavior | Target / Hitbox Validation |
| :--- | :--- | :--- | :--- |
| `projectile` | None (instant fire) | Flies **over** all walls; `boomerang` returns home cleanly | `width / 2` capsule; `pierce: true`; `boomerang` resets hit Set at apex; `pull` yanks first target; `chain` arcs lightning |
| `circle` | None | Ignored by walls; telegraphs draw over terrain | `delay` ms wind-up; `trap` persists up to `maxActive: 3` for `25s`; `pullIn` drags inward; `healOnHit` heals per champ |
| `target` | None | Requires `canSee(team, target)` | `range + 30 px`; supports `behindTarget` teleport, `chain` bounces, `execute` missing-HP bonus, and `killReset` |
| `dash` | Displaces caster over dash | Stops cleanly at walls (`nav.clipMove`) | `toTarget` homes onto visible target (`behindTarget` places behind); `cdRefundOnHit` / `killReset` / `wallStun` supported |
| `blink` | Instant teleport | Crosses walls, landing on `nav.nearestFree(x, y, 30)` | Blocked while `rooted`, `stunned`, or knocked back; optional `invisMs` on arrival (`Pager E`) |
| `self` | None | N/A | Applies instant heal, shield, `invisMs`, `spellShieldMs`, and/or `_addBuff` tags |
| `swap` | Teleports caster and ally | Positions are exchanged (no wall check needed, both spots were valid) | Allied champion nearest the aim within `range + 40 px`; fails (no cost) if none; shield + buff on both (`Ops E`) |
| `allies` | None | Ignored by walls | Heals/shields/buffs/Spell-Shields all living allied champions within `radius + 30 px` |
| `zone` | None | Ignored by walls | Persistent area ticking every `tickMs`; supports slows, `silence` per tick (`Lint E`), `trail` zones spawned by dashes (`Mop E`) and allied healing (`Brew R`) |

---

## Complete Skill-Type Distribution Across All 72 Champion Skills

Every champion has `4` active skills (`18 * 4 = 72` skills total). Below is the exact distribution by `SkillEngine` execution primitive:

| Skill Type | Count | Champions & Slots Using This Type |
| :--- | :---: | :--- |
| **`circle`** | **22** | `Pixel R`, `Stack R`, `Ops Q`, `Tester W`, `Zero E`, `Model Q`, `Model E`, `Model R`, `Brick R`, `Mop W`, `Rush E`, `Rush R`, `Volt Q`, `Volt E`, `Volt R`, `Patch Q`, `Sprint Q`, `Hira R`, `Lint W`, `Lint R`, `Brew E`, `Pager E` |
| **`projectile`** | **14** | `Pixel Q`, `Stack Q`, `Tester Q`, `Tester R`, `Brick Q`, `Mop Q`, `Swipe Q`, `Swipe R`, `Cache Q`, `Cache W`, `Cache R`, `Hira Q`, `Brew Q`, `Pager W` |
| **`dash`** | **10** | `Tester E`, `Zero Q`, `Brick E`, `Mop E`, `Rush Q`, `Patch E`, `Swipe E`, `Sprint E`, `Pager Q`, `Pager R` |
| **`self`** | **9** | `Stack W`, `Zero W`, `Model W`, `Brick W`, `Rush W`, `Volt W`, `Patch W`, `Swipe W`, `Sprint W` |
| **`allies`** | **5** | `Ops W`, `Ops R`, `Sprint R`, `Hira W`, `Brew W` |
| **`zone`** | **5** | `Stack E`, `Mop R`, `Hira E`, `Lint E`, `Brew R` |
| **`target`** | **4** | `Pixel W`, `Zero R`, `Patch R`, `Lint Q` |
| **`blink`** | **2** | `Pixel E`, `Cache E` |
| **`swap`** | **1** | `Ops E` |

*Sum Check:* `22 + 14 + 10 + 9 + 5 + 5 + 4 + 2 + 1 = 72` skills (`18 * 4`).

### Key Roster Mechanics Highlights
- **One signature mechanic per champion:** `Pixel E` recast snap-back, `Stack Q` hook, `Ops E` ally swap, `Model W` stasis, `Mop E` trail, `Volt` Servo-centered casts, `Patch E` double dash, `Sprint R` team rally, `Cache W/R` and `Lint Q/R` and `Pager W/R` mark detonations, `Hira R` / `Lint E` silence.
- **Reduced overlap:** pull-in vortexes 7 -> 2 (`Stack R`, `Model R`), Spell Shields 6 -> 2 (`Brick W`, `Hira W`), boomerang 3 -> 1, chain 3 -> 1, ground traps 3 -> 2 (`Tester W`, `Volt E`), CD refunds 3 -> 2, heal-on-hit 3 -> 2.
- **Traps (2), Behind-Target (3), Kill Resets (2):** `Tester W`, `Volt E` place persistent ground mines; `Zero Q/R`, `Pager R` land behind targets; `Zero R`, `Sprint E` reset on takedown.

---

## Role-by-Role Stat Benchmarks Across the 18-Champion Roster

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

## Kit Power-Budget & Counterplay Audit (18 Champions)

| Champion | Engage Reach | Burst Speed | Hard CC Budget | Escape Tools | Self Defense | Primary Vulnerability / Counterplay Window |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Pixel** | `880 px` (`Q`) | High (`Q` return + `R`) | None | `E` blink (`430 px`) + free snap-back within `3s` | None | Dodge `CSS Boomerang` return lane; punish after `E` snap-back; `R` has `700 ms` delay |
| **Stack** | `820 px` (`Q` Hook) | Low-Med | `1.6s` (`Q` stun + `R` `1.0s`) | None | `W` shield + Armor, `E` zone slow | Immobile once `Q` misses; leave `Rate Limit`; break `W` at range |
| **Ops** | `820 px` (`Q`) | Low | None (`Q` 35% slow) | `E` Hot Swap (swap with ally, `650 px`) | `Q` heal + `R` + `E` shield on both | Focus with anti-heal; kill the rescued ally, since `Hot Swap` only repositions |
| **Tester** | `1050 px` (`Q`) / `2400 R` | High (`3rd AA` + `R`) | `1.2s` Root (`W` Trap) | `E` `400 px` dash+slow | Trap zone peel | Fragile (`560 HP`); sweep chokepoints and punish `11s` `E` CD |
| **Zero** | `520 px` (`Q`/`R` behind) | V.High (Mark + `R` Reset) | None | `W` `1.8s` stealth (`+35% MS`) | `W` `20%` DR | True vision / stasis denies `Zero-Day` reset chain |
| **Model** | `880-1050 px` | V.High (`R` PullIn burst) | `1.0s` Root (`E`) + PullIn | `W` Hibernate (1.5s invulnerable, cannot act) | `W` stasis + `+30% AP` | Completely immobile outside `W`; flash/dash out of `850 ms` `Big Data` load; outlast Hibernate |
| **Brick** | `420 px` (`E` dash) | Low–Med | `1.2s` / `1.0s` wall stun | `E` dash | `W` HP shield + 2s Spell Shield | Fight away from walls and poke off `2s` Spell Shield first |
| **Mop** | `900 px` (`R`) | Sustained | `150 px` KB + slows (60-65%) | `E` `460 px` dash + trail | `Clean Sweep` sustain | Exit `Flood` and the `Wet Floor` trail; bubble has `700 ms` delay |
| **Rush** | `620 px` (`Q` dash) | Med-High (`R` nuke) | `0.8s` (`E` `500 ms` delay) + `R` 50% slow | `Q` CD-refund dash | `W` heal + MS/AS | Squishy if locked down; `R` has `600 ms` telegraph; don't clump for `Q` refunds |
| **Volt** | `860 px` (`Q`/`R` via Servo) | Sustained (`Servo`) | `2.45s` (`Q` `0.7s` + `E` `0.85s` + `R` `0.9s` wall stun) | None (`0` dash/blink) | `E` trap peel | No self-peel dash; zaps are centered on Servo, so kill or avoid Servo-adjacent spots |
| **Patch** | `380 px` (`E` x2) / `420 px` (`R`) | High (`R` lock + heal) | `1.5s` (`R` single target) | `E` double dash (recast) | `Q` heal + `W` shield | Kite outside `150 px` AA reach; cut heal-on-hit with `Strict Linter`; no wall-pin anymore |
| **Swipe** | `500 px` AA (`840 Q`) | High (`W` stealth + `R` exec) | None (`Q` 20% slow) | `E` `390 px` dash + `W` `1.2s` invis | Stealth reposition | Lock down when stealth breaks; `E` no longer refunds from `Q` |
| **Sprint** | `520 px` (`E` homing) | Med (`Q`/`E`) + team rally | `0.7s` (`E` stun) | `E` Kill Reset | `W` shield + `30%` DR | Deny kill resets; split vs `All Hands Sprint` (`750 px`, `5s`) |
| **Cache** | `520 px` AA (`2100 R`) | Ramping (`Q` refund + AA + Stale) | None (`W` 45% slow) | `E` `400 px` blink | Slow on `W` | Dodge `Stale Data` (champ-only line) to deny `R` bonus; dodge `Batch Job` to prevent `1s` all-CD refund |
| **Hira** | `880 px` (`Q` Hook) | Low-Med | `1.0s` Root (`Q`) + `2.5s` Silence (`R`) | None | `W` heal + 2.5s Spell Shield | Bait `Feedback Hook`; leave `Mandatory Meeting` area before `650 ms` ends |
| **Lint** | `650-850 px` | Med (`Q` stacks / `R` detonation) | `1.1s` root (`W`) + silence zone (`E`) | None | None | No defensive tool: dive `Lint` and stay out of `Code Freeze` |
| **Brew** | `700 px` (`Q` cone) | Low (`R` zone) | `1.05s` (`E` `600 ms` delay) | None | `W`/`R`/Passive heal | Anti-heal halves `Break Room` sustain; `Q` no longer heals Brew |
| **Pager** | `1400 px` (`W`) / `920 px` (`R` behind) | Med-High | `1.0s` (`R` Stun) + `Q`/`E` slows | `Q` toTarget dash + `R` behind | None | Requires vision for `R`; dodge `W` to avoid Paged bonus damage |
