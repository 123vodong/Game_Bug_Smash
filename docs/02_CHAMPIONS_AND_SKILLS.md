# Champions, Unique Passives, Skill Combos & Matchups

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Source:** `shared/moba/champions.js` (18 champions, **72 reworked LoL-inspired skills**, **18/18 unique passives**, **18/18 recommended builds**)

## Champion Matchup & Counterplay Guide
| Archetype / Champion | Excels Against | Vulnerable To | Key Counter Mechanics |
| :--- | :--- | :--- | :--- |
| **Zero / Rush / Sprint / Pager** (Dive / Assassins) | `Tester`, `Cache`, `Pixel`, `Model` | `Stack`, `Brick`, `Lint` | Hard CC (`SQL Hook`, `Escort Out`, `Database Lock`), `freeze_frame` stasis, stealth reveal (`Wards`) |
| **Tester / Swipe / Cache** (Marksmen) | `Stack`, `Brick`, Structures | `Zero`, `Pager`, `Pixel` | Behind-target ambushes (`Pen Test`, `On My Way`), `Feedback Hook` drags, boomerang burst |
| **Stack / Brick / Patch** (Frontline Tanks) | `Zero`, `Pixel`, `Mop` | `Tester`, `Cache`, `armor_shredder` | `CSS Boomerang` / `Broom Boomerang` return True Damage, `Merge Conflict` % missing-HP execute |
| **Pixel / Mop / Model / Lint** (Mages / Control) | Grouped teams, melee bruisers | `Zero`, `Sprint`, `git_revert` | `Spell Shield` (`Ops E`, `Brick W`, `Patch W`, `Hira W`, `Lint E`, `Pager W`), Cleanse (`Git Revert`) |
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
| **Pixel** (`pixel`) | Mage | 520 / 1982 | 77.8 / 50.4 | Magic + True Q Return / R | None | High (`E` 430 Blink) | Med / High / V.High | `Q` Boomerang return True Dmg & `W` Chain (2 bounces) |
| **Stack** (`stack`) | Tank | 650 / 2554 | 114.2 / 68.0 | Physical | High (`Q` Hook + `E` 0.6s + `R` PullIn 1.0s) | Med (`E` 420 Dash) | High / High / Med | `Q` 680 px Pull Hook & `R` 170 px Vortex PullIn |
| **Ops** (`ops`) | Support | 540 / 2070 | 83.5 / 50.4 | Magic | None (`Q` 35% slow) | Low (`+30%` MS) | Med / High / V.High | `E` Team Spell Shield (`2.5s`) & `Q` per-champ healOnHit |
| **Tester** (`tester`) | Marksman | 560 / 2090 | 83.5 / 50.4 | Physical + True R | Med (`W` 1.2s Root Trap) | Med (`E` 400 Dash + Slow) | Low / High / V.High | `W` `Bug Trap` (`1.2s` root, max 3) & `Q` 1050 px pierce |
| **Zero** (`zero`) | Assassin | 580 / 2195 | 96.0 / 59.2 | Physical + True E | None | High (`Q` behind + `W` Stealth + `R` Blink) | Med / V.High / High | `W` `1.8s` Invis, `Q/R` behindTarget, `R` Kill Reset |
| **Model** (`model`) | Controller | 530 / 1992 | 77.8 / 50.4 | Magic | High (`E` PullIn + 1.0s Root + `R` 210 PullIn) | Low (`W` +15% MS) | Low / High / V.High | `E` / `R` AoE PullIn vortex & `850 ms` `Big Data` delay |
| **Brick** (`guard`) | Tank | 680 / 2635 | 119.6 / 68.0 | Physical | High (`E` 1.2s / `R` 1.0s Wall Stuns) | Med (`E` 420 toTarget Dash) | High / High / Med | `W` 2s Spell Shield & `E` 340 px Knockback Wall Pin |
| **Mop** (`cleaner`) | Mage | 510 / 1938 | 76.1 / 50.4 | Magic + True Q Return | Low (`Q` 80 px + `R` 85 px PullIn) | Med (`E` 460 Splash Dash) | High / High / High | `Q` Boomerang True Return & `R` 4s `Deep Clean Vortex` |
| **Rush** (`courier`) | Jungler | 600 / 2266 | 96.0 / 59.2 | Physical | Med (`E` 160 KB + 0.8s Stun) | High (`Q` CD-Refund Dash + `R` +60% MS) | High / High / Med | `Q` `-1.5s` CD refund per champ hit & `R` 5s throttle |
| **Volt** (`embedded`) | Support | 540 / 2036 | 81.5 / 50.4 | Magic (Skills + Servo) | High (`Q` 0.7s + `E` 0.85s Trap + `R` 1.0s) | Low | Med / High / High | `Q` Stun Chain (2 bounces), `E` Watchdog Trap, `R` Servo PullIn |
| **Patch** (`dev`) | Fighter | 600 / 2300 | 101.4 / 59.2 | Physical | High (`E` 0.9s Wall Stun) | Med (`E` 460 Dash) | Med / High / V.High | `Q` Heal-on-Hit, `W` 2s Spell Shield, `R` Execute Kill Reset |
| **Swipe** (`appdev`) | Marksman | 550 / 2046 | 79.8 / 50.4 | Physical | None | High (`E` 7s Dash + Q Refund + `W` Stealth) | Med / High / V.High | `Q` `-1.5s E` refund per champ, `W` `1.2s` Stealth, `R` Execute |
| **Sprint** (`sprint`) | Jungler | 610 / 2276 | 99.7 / 59.2 | Physical | High (`E` 0.7s Stun + `R` PullIn Vortex) | High (`E` Kill Reset + Passive MS) | High / High / Med | `E` Kill Reset dash & `R` 4s `Sprint Review` PullIn zone |
| **Cache** (`cache`) | Marksman | 545 / 2024 | 79.8 / 50.4 | Physical | Low (`W` 45% Slow Trap) | Med (`E` 400 Blink + Q Global CD Refund) | Low / High / V.High | `Q` `-1.0s` ALL-skill refund per champ & `W` cryo mines |
| **Hira** (`hr`) | Support | 545 / 2058 | 82.5 / 50.4 | Magic | High (`Q` 380 Pull + Root + `R` PullIn Stun) | Low (`W` +20% MS) | Med / High / High | `Q` Feedback Hook drag, `W` 2.5s Spell Shield, `R` PullIn |
| **Lint** (`lint`) | Controller | 525 / 1970 | 78.8 / 50.4 | Magic | High (`W` 1.1s Root + `R` 1.0s Wall Stun) | Low (`E` +25% MS) | Med / High / High | `Q` Chain Audit (`30%` slow), `E` 2s Spell Shield, `R` 300 KB |
| **Brew** (`barista`) | Support | 540 / 2036 | 79.8 / 50.4 | Magic | Med (`E` 1.05s Stun) | Low (`W` +15% MS) | Med / High / High | `Q` per-champ healOnHit & `R` 4s Break Room heal/burn |
| **Pager** (`oncall`) | Jungler | 615 / 2264 | 98.0 / 59.2 | Physical | High (`R` 1.0s Stun) | High (`E` Blink+Stealth + `R` 920 behindTarget) | High / High / Med | `Q` Boomerang, `W` 2s Spell Shield, `E` `1.2s` Invis, `R` 920 px |

---

## Detailed Champion Roster

### Pixel — the Frontend Wizard (`pixel`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`460`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `520` (+86), Mana `420` (+42), AD `48` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.65` (+0.01), MS `330`
- **Unique Passive — Syntax Surge:** Casting a skill grants +12% move speed for 1.5s and restores 4% max mana on champion hit.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `frost_cache` (Cold Cache) -> `stackoverflow` (Stack Overflow Premium) -> `freeze_frame` (Debugger Breakpoint)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | CSS Boomerang | `projectile` | 45 | 5.5s | Dmg: 65 +14/lv +55% AP, Pierce, Boomerang (True Return 100%) | Fires a boomerang orb that pierces out and deals True Damage on return; marks targets (4s) for Framework Rewrite. |
| **W** | Flexbox Orbs | `target` | 60 | 10s | Dmg: 70 +16/lv +55% AP, Chain 2 (`360 px`, `0.8x` decay) | Zaps an enemy and chains lightning to 2 nearby targets. |
| **E** | Hot Reload | `blink` | 65 | 12s | Range: 430 | Instantly blinks nearby and empowers your next Q or R within 3.5s by +20% damage. |
| **R** | Framework Rewrite | `circle` | 100 | 70s | Dmg: 250 +30/lv +90% AP, Radius 320, Delay 700ms | After a short delay, rewrites an area for massive damage; detonates Q marks for +25% bonus true damage. |

### Stack — the Backend Tank (`stack`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `650` (+112), Mana `280` (+30), AD `62` (+4), Armor `36` (+4.6), MR `34` (+2.0), AS `0.66` (+0.01), MS `340`
- **Unique Passive — Failover Armor:** Taking damage grants +3 armor (stacks up to +15 for 4s).
- **Recommended Build (6 items):** `chair` (Ergonomic Chair) -> `sneakers` (Office Sneakers) -> `standing_desk` (Standing Desk) -> `thornmail_rack` (Thornmail Firewall) -> `server_rack` (Server Rack Armor) -> `guardian_backup` (Cloud Backup)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | SQL Hook | `projectile` | 55 | 11s | Dmg: 75 +15/lv +70% AD, Pull 680 px, Stun 0.6s | Launches a query hook that yanks the first enemy hit right to you and stuns briefly. |
| **W** | Load Balancer | `self` | 50 | 13s | Shield: 100 +18/lv +8% HP, +25 Armor | Gains a shield and +25 armor; if the shield breaks, releases an AoE shockwave (80 + 40% armor). |
| **E** | Connection Pool | `dash` | 55 | 12s | Dmg: 60 +14/lv +60% AD, Range 420, Stun 0.6s | Charges forward and stuns the first enemy it connects to. |
| **R** | Database Lock | `circle` | 100 | 75s | Dmg: 185 +20/lv +55% AD, PullIn 170 px, Stun 1.0s | Locks every table in range, pulling nearby enemies inward, damaging and stunning them. |

### Ops — the DevOps Medic (`ops`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`450`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `540` (+90), Mana `400` (+45), AD `46` (+2.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Uptime Pulse:** Healing or shielding an ally reduces your ultimate cooldown by 2s and grants +15% MS.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `rubber_duck` (Rubber Duck) -> `team_lunch` (Team Lunch) -> `headphones` (Noise-Cancelling Headphones) -> `stackoverflow` (Stack Overflow Premium)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Health Check | `circle` | 45 | 6s | Dmg: 65 +14/lv +55% AP, Slow 35%, HealOnHit: 35 +8/lv +25% AP | Scans an area: slows enemies inside and heals you for each champion hit. |
| **W** | Auto-Heal | `allies` | 65 | 10s | Heal: 75 +16/lv +42% AP, Radius 500 | Restarts unhealthy containers: heals you and nearby allies. |
| **E** | Firewall Aegis | `allies` | 55 | 14s | +30% MS, Spell Shield 2.5s, Radius 480 | Ships an emergency shield: grants nearby allies +30% MS and a Spell Shield blocking the next enemy skill. |
| **R** | Blue-Green Deploy | `allies` | 110 | 85s | Heal: 185 +25/lv +60% AP, Shield: 155 +15/lv +40% AP, 15% DR | Swaps the whole team to a fresh deployment: big heal, shield, and 15% damage reduction. |

### Tester — the QA Sniper (`tester`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `560` (+90), Mana `300` (+36), AD `60` (+3.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.68` (+0.025), MS `330`
- **Unique Passive — Regression Mark:** Every 3rd basic attack on a target detonates a bug report for +35% bonus physical damage.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `jetpack` (Jetpack Sneakers) -> `crit_compiler` (JIT Compiler) -> `grievous_linter` (Strict Linter) -> `ultrawide` (Ultrawide Monitor) -> `armor_shredder` (Root Sudo)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Unit Test | `projectile` | 45 | 7s | Dmg: 75 +16/lv +100% AD, Range 1050, Pierce | Fires a piercing sniper bolt through every enemy in a line. |
| **W** | Bug Trap | `circle` | 40 | 12s | Dmg: 60 +14/lv +70% AD, Trap (max 3, 25s, arm 0.5s), Root 1.2s | Deploys a hidden unit-test trap (max 3, 25s). Snaps shut to damage and root the first enemy stepping on it. |
| **E** | Edge Case | `dash` | 45 | 11s | Dmg: 45 +10/lv +50% AD, Range 400, Slow 40% | Vaults away and throws an edge-case net that damages and slows foes passed. |
| **R** | Regression Barrage | `projectile` | 100 | 58s | Dmg: 240 +30/lv +125% AD, Range 2400, ChampOnly | A map-wide sniper shot hitting the first champion; detonates Bug Detection stacks (0-4) for +12% true dmg/stack. |

### Zero — the Security Ninja (`zero`)
- **Role / Lane:** Assassin / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `580` (+95), Mana `300` (+35), AD `66` (+4.2), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `350`
- **Unique Passive — Zero-Day Strike:** First attack after leaving a bush or out-of-combat deals +30% bonus damage.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `armor_shredder` (Root Sudo) -> `crit_compiler` (JIT Compiler) -> `git_revert` (Git Revert Charm)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Pen Test | `dash` | 40 | 7s | Dmg: 70 +16/lv +90% AD, toTarget, behindTarget | Dashes directly behind a target and applies Vulnerability (4s). |
| **W** | Encrypt | `self` | 50 | 14s | Invis 1.8s, +35% MS, 20% DR (3s) | Vanishes into stealth for 1.8s with +35% move speed and 20% damage reduction. |
| **E** | Brute Force | `circle` | 35 | 5s | Dmg: 60 +15/lv +75% AD, Radius 240 | Slashes nearby enemies; consumes Q Vulnerability (+30% true dmg, -1.5s Q CD; basic attacks also consume it). |
| **R** | Zero-Day | `target` | 90 | 68s | Dmg: 145 +24/lv +100% AD +38% missingHP, behindTarget, KillReset | Blinks behind an enemy champion to execute them (missing HP bonus). Killing the target resets R cooldown. |

### Model — the Data Sorcerer (`model`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`480`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `530` (+86), Mana `430` (+43), AD `46` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Gradient Descent:** Consecutive skill hits within 4s deal +10% escalating magic damage (up to +30%).
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `stackoverflow` (Stack Overflow Premium) -> `rubber_duck` (Rubber Duck) -> `firewall` (Firewall Appliance)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Gradient Descent | `circle` | 45 | 5.5s | Dmg: 70 +16/lv +60% AP, Slow 40%, Radius 230 | Collapses a data sphere on an area: damages and slows everything inside. |
| **W** | Overfit | `self` | 60 | 14s | +30% AP, +15% MS (4s), Empower Q/R +20% | Overfits: +30% AP, +15% move speed, and empowers your next Q or R within 4.5s by +20% damage. |
| **E** | Random Forest | `circle` | 60 | 12s | Dmg: 55 +12/lv +45% AP, PullIn 110 px, Root 1.0s | Sprouts a snare zone pulling foes slightly inward and rooting all inside. |
| **R** | Big Data | `circle` | 110 | 82s | Dmg: 290 +32/lv +95% AP, PullIn 210 px, Radius 400, Delay 850ms | Shockwave singularity: drags all enemies violently to the center for massive burst damage. |

### Brick — the Security Guard (`guard`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `680` (+115), Mana `280` (+30), AD `58` (+3.6), Armor `38` (+4.8), MR `34` (+2.0), AS `0.64` (+0.01), MS `335`
- **Unique Passive — Firewall Plating:** Standing near an allied tower or champion reduces incoming damage by 10%.
- **Recommended Build (6 items):** `chair` (Ergonomic Chair) -> `sneakers` (Office Sneakers) -> `standing_desk` (Standing Desk) -> `hoodie` (Company Hoodie) -> `kanban` (Kanban Board) -> `server_rack` (Server Rack Armor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | HALT! | `projectile` | 40 | 6.5s | Dmg: 65 +15/lv +60% AD +3% HP, Pierce, Slow 40% | Sends a piercing security wave that damages and slows every enemy hit. |
| **W** | Clipboard of Rules | `self` | 50 | 13s | Shield: 95 +18/lv +7% HP, +20 Armor, Spell Shield 2s | Hides behind the rules: max-HP shield, +20 armor, and a 2s Spell Shield blocking the next enemy skill. |
| **E** | Escort Out | `dash` | 55 | 11s | Dmg: 55 +14/lv +80% AD, toTarget 420, KB 340, WallStun 1.2s | Charges an enemy and slams them far away. Pinning them into a WALL stuns for 1.2s. |
| **R** | Building Lockdown | `circle` | 100 | 78s | Dmg: 165 +22/lv +6% HP, Slow 35%, KB 320, WallStun 1.0s | Locks down the floor: every enemy nearby is damaged, slowed and blasted outward. Walls stun. |

### Mop — the Night-Shift Cleaner (`cleaner`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`450`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `510` (+84), Mana `440` (+44), AD `46` (+2.8), Armor `20` (+3.3), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Clean Sweep:** Killing a minion or monster restores 25 HP and 20 mana instantly.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `midnight_oil` (Midnight Oil) -> `stackoverflow` (Stack Overflow Premium) -> `pomodoro` (Pomodoro Timer)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Broom Boomerang | `projectile` | 45 | 6s | Dmg: 58 +14/lv +50% AP, Pierce, Boomerang (True Return), KB 80 | Hurls a sweeping broom that nudges enemies out and deals True Damage returning to you. |
| **W** | Wet Floor | `zone` | 60 | 11s | Dmg: 14 +3/lv +9% AP (0.5s tick), Slow 45%, 3.5s | Mops an area for 3.5s. Enemies inside slip: heavily slowed and damaged every 0.5s. |
| **E** | Mop Slide | `dash` | 45 | 12s | Dmg: 45 +10/lv +40% AP, Range 460, Slow 25% | Slides through the floor she mopped, splashing enemies along the path. |
| **R** | Deep Clean Vortex | `zone` | 110 | 82s | Dmg: 45 +6/lv +14% AP (0.5s tick), PullIn 85 px, Slow 30%, 4s | Creates a soapy whirlpool for 4s that continuously pulls enemies inward, slows, and scalds every 0.5s. |

### Rush — the Delivery Rider (`courier`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `600` (+98), Mana `300` (+34), AD `64` (+4), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `355`
- **Unique Passive — Express Delivery:** Moving continuously builds momentum: next basic attack deals +25% bonus damage and slows 15%.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `ultrawide` (Ultrawide Monitor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Express Delivery | `dash` | 45 | 8s | Dmg: 70 +16/lv +80% AD, Range 620, Refund 1.5s Q CD/champ | Revs through a line, damaging every enemy and refunding 1.5s Q cooldown per champion hit. |
| **W** | Hot Meal | `self` | 45 | 12s | Heal: 65 +14/lv +35% AD, +35% AS, +20% MS | Eats a customer's order: heals and gains +35% attack speed and +20% move speed. |
| **E** | Package Drop | `circle` | 55 | 11s | Dmg: 65 +15/lv +75% AD, KB 160, Stun 0.8s, Delay 500ms | Lobs a heavy parcel that explodes after 0.5s: AoE damage, knockback, and stun. |
| **R** | Rush Hour | `self` | 90 | 72s | +60% MS, +30% AD (5s) | Full throttle for 5s: +60% move speed and +30% attack damage. |

### Volt — the Embedded Engineer (`embedded`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`470`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `44` (+2.6), Armor `22` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Servo EMP:** Every 4th basic attack discharges a pulse through your pet for +40 bonus magic damage.
- **Companion Pet — Servo:** Untargetable unit following `110 px` behind; attacks owner's target within `320 px` every `900 ms` for `20 +4/lv +15% AD +12% AP` (despawns on death).
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `rubber_duck` (Rubber Duck) -> `firewall` (Firewall Appliance) -> `stackoverflow` (Stack Overflow Premium)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Interrupt Chain | `projectile` | 50 | 8s | Dmg: 65 +14/lv +55% AP, Stun 0.7s, Chain 2 (`360 px`) | Fires an interrupt bolt that stuns and chains lightning to 2 nearby enemies. |
| **W** | Overclock | `self` | 60 | 12s | +35% AS, Servo double AS & double dmg (4s) | Overclocks you and Servo: +35% attack speed; Servo attacks twice as fast and deals double damage. |
| **E** | Watchdog Trap | `circle` | 60 | 13s | Dmg: 55 +12/lv +45% AP, Trap (max 3, 25s), Stun 0.85s | Plants a Watchdog sensor trap (max 3, 25s). Shocks and stuns the first enemy to trigger it. |
| **R** | Servo EMP | `circle` | 110 | 68s | Dmg: 205 +26/lv +85% AP, `at: 'pet'`, PullIn 160 px, Stun 1.0s | Servo overloads: pulls nearby enemies toward SERVO, blasting and stunning all around. |

### Patch — the Software Engineer (`dev`)
- **Role / Lane:** Fighter / `top` · **Range:** Melee (`150`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `600` (+100), Mana `300` (+34), AD `62` (+4), Armor `30` (+4.2), MR `32` (+1.6), AS `0.66` (+0.012), MS `340`
- **Unique Passive — Hotfix Fury:** Below 50% HP, gain +12% attack damage and +12% lifesteal.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `standing_desk` (Standing Desk) -> `server_rack` (Server Rack Armor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Refactor | `circle` | 35 | 5.5s | Dmg: 70 +16/lv +85% AD, HealOnHit: 45 +10/lv +4% HP | Spins the keyboard in a wide arc, cleaving nearby enemies and healing you for each champion hit. |
| **W** | Pair Programming | `self` | 50 | 13s | Shield: 70 +14/lv +35% AD, +20% AD, +30% AS, Spell Shield 2s | Gains a shield, +20% AD, +30% AS, and a 2s Spell Shield blocking the next enemy skill. |
| **E** | git push --force | `dash` | 50 | 11s | Dmg: 60 +14/lv +70% AD, KB 280, WallStun 0.9s | Force-pushes into the first enemy and shoves them back. Into a wall = stunned. |
| **R** | Merge Conflict | `target` | 100 | 72s | Dmg: 160 +24/lv +90% AD +32% missingHP, KillReset | Slams an enemy champion with missing-HP execute damage. Executing a champion resets R cooldown. |

### Swipe — the App Developer (`appdev`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `550` (+88), Mana `300` (+36), AD `60` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.025), MS `330`
- **Unique Passive — Swipe Combo:** Alternating a skill and a basic attack empowers the attack with +28% bonus damage.
- **Recommended Build (6 items):** `caffeine` (Caffeine Pills) -> `jetpack` (Jetpack Sneakers) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `gauntlet` (Git Blame Gauntlet) -> `ultrawide` (Ultrawide Monitor) -> `standing_desk` (Standing Desk)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Push Notification | `projectile` | 45 | 5.5s | Dmg: 62 +14/lv +75% AD, 3-Fan, Refund 1.5s E CD/champ | Throws 3 phones in a fan; hitting a champion refunds 1.5s on Swipe Left (E). |
| **W** | Dark Mode | `self` | 45 | 12s | Invis 1.2s, +25% MS, +35% AS (4s) | Enters Dark Mode: 1.2s stealth plus +25% move speed and +35% attack speed. |
| **E** | Swipe Left | `dash` | 35 | 7s | Range 390 | Quickly dashes away (CD reduced when Q hits champions). |
| **R** | App Store Launch | `projectile` | 100 | 62s | Dmg: 175 +25/lv +100% AD +15% missingHP, 7-Fan | Launches a 7-phone barrage dealing bonus damage based on enemy missing HP. |

### Sprint — the Scrum Master (`sprint`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `610` (+98), Mana `300` (+34), AD `63` (+4), Armor `30` (+4.1), MR `32` (+1.6), AS `0.67` (+0.012), MS `350`
- **Unique Passive — Sprint Velocity:** Takedowns and camp kills grant +25% move speed for 2.5s and heal 45 HP.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `second_monitor` (Second Monitor) -> `standing_desk` (Standing Desk) -> `letter_opener` (Letter Opener)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Daily Stand-up | `circle` | 35 | 5.5s | Dmg: 65 +15/lv +85% AD, Slow 35%, Radius 260 | Calls a stand-up: slams nearby foes and slows them. |
| **W** | Velocity | `self` | 45 | 12s | Heal: 55 +12/lv +28% AD, +35% AS, +25% MS | Supercharges sprint velocity: heals, +35% attack speed, and +25% move speed. |
| **E** | Story Points | `dash` | 45 | 10s | Dmg: 65 +15/lv +80% AD, toTarget 520, Stun 0.7s, KillReset | Leaps onto a target to damage and stun (0.7s). Killing a champion resets E cooldown. |
| **R** | Sprint Review | `zone` | 100 | 75s | Dmg: 38 +6/lv +22% AD (0.5s tick), PullIn 80 px, Slow 35%, 4s | Locks a 4s review arena around you that pulls enemies inward, slows, and damages every 0.5s. |

### Cache — the Data Engineer (`cache`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`520`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `545` (+87), Mana `310` (+36), AD `59` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.024), MS `330`
- **Unique Passive — Cache Hit:** Attacking the same target repeatedly grants +6% bonus damage per hit (up to +24%).
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `jetpack` (Jetpack Sneakers) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `energy_crate` (Energy Drink Crate) -> `ultrawide` (Ultrawide Monitor) -> `letter_opener` (Letter Opener)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Batch Job | `projectile` | 40 | 6s | Dmg: 68 +15/lv +90% AD, Pierce, Refund 1.0s ALL CDs/champ | Fires a piercing batch bolt; hitting a champion refunds 1s off ALL skill cooldowns. |
| **W** | Data Trap | `circle` | 50 | 12s | Dmg: 60 +13/lv +65% AD, Trap (max 3, 25s), Slow 45% (2s) | Plants a cryo-cache mine (max 3, 25s) that bursts to damage and heavily slow triggers. |
| **E** | Failover | `blink` | 50 | 13s | Range 400 | Instantly blinks to a standby position. |
| **R** | Full Table Scan | `projectile` | 100 | 68s | Dmg: 210 +28/lv +115% AD, Range 2100, Pierce | Fires a high-velocity beam across the lane hitting every enemy in its path. |

### Hira — the People Partner (`hr`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`460`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `545` (+89), Mana `420` (+43), AD `44` (+2.6), Armor `23` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Culture Fit:** Nearby allied champions grant +10% shield/heal power and +12% move speed when assisting.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `rubber_duck` (Rubber Duck) -> `team_lunch` (Team Lunch) -> `cloud_credits` (Cloud Credits) -> `vpn_hoodie` (VPN Hoodie)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Feedback Hook | `projectile` | 55 | 10s | Dmg: 60 +14/lv +50% AP, Pull 380 px, Root 1.0s | Lashes out a meeting invite that drags the first enemy toward you and roots them (1.0s). |
| **W** | Team Building | `allies` | 65 | 12s | Heal: 65 +14/lv +35% AP, +20% MS, Spell Shield 2.5s | Heals nearby allies, grants +20% MS, and places a 2.5s Spell Shield blocking 1 enemy skill. |
| **E** | Policy Update | `zone` | 55 | 10s | Dmg: 14 +3/lv +10% AP (0.5s tick), Slow 45%, 3s | Spreads a 3s policy puddle that slows and burns everyone standing inside. |
| **R** | Mandatory Meeting | `circle` | 110 | 82s | Dmg: 160 +20/lv +65% AP, PullIn 170 px, Stun 1.0s, Delay 550ms | Calls an all-hands: pulls all enemies in the zone to the center and stuns them. |

### Lint — the Code Reviewer (`lint`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`470`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `525` (+85), Mana `430` (+43), AD `46` (+2.9), Armor `21` (+3.4), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Strict Audit:** Skills apply a 2s mark reducing enemy armor by 15%.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `smartwatch` (Smartwatch) -> `headphones` (Noise-Cancelling Headphones) -> `cloud_credits` (Cloud Credits) -> `stackoverflow` (Stack Overflow Premium) -> `vpn_hoodie` (VPN Hoodie)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Nitpick Chain | `target` | 40 | 5.5s | Dmg: 75 +16/lv +55% AP, Slow 30%, Chain 2 (`380 px`) | Flags an enemy and bounces picky comments to 2 nearby enemies: damage + slow. |
| **W** | Request Changes | `circle` | 60 | 11s | Dmg: 65 +14/lv +55% AP, Root 1.1s, Delay 650ms | Blocks the merge: after a delay, enemies in the area are damaged and rooted. |
| **E** | Approved | `self` | 55 | 13s | Shield: 85 +18/lv +45% AP, +25% MS, Spell Shield 2s | Approves your own PR: shield, +25% move speed, and a 2s Spell Shield. |
| **R** | Hard Reset | `circle` | 110 | 78s | Dmg: 220 +28/lv +85% AP, KB 300, WallStun 1.0s | git reset --hard on an area: big damage and blasts enemies back. Into a wall = stunned. |

### Brew — the Office Barista (`barista`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`480`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `45` (+2.7), Armor `22` (+3.4), MR `30` (+1.2), AS `0.63` (+0.011), MS `330`
- **Unique Passive — Espresso Shot:** Every 2nd skill cast brews a shot that restores 6% max HP to you and the nearest ally.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `team_lunch` (Team Lunch) -> `headphones` (Noise-Cancelling Headphones) -> `firewall` (Firewall Appliance) -> `midnight_oil` (Midnight Oil)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Hot Pour | `projectile` | 50 | 7.5s | Dmg: 55 +12/lv +45% AP, Pierce, Slow 35%, HealOnHit: 30 +7/lv +20% AP | Pours scalding coffee through enemies (slowing them) and heals you per champion hit. |
| **W** | Espresso Shot | `allies` | 60 | 13s | Heal: 45 +10/lv +30% AP, +25% AS, +15% MS (4s) | Serves a double shot to nearby allies: heals + grants 25% attack speed and 15% move speed. |
| **E** | Decaf | `circle` | 60 | 12s | Dmg: 45 +11/lv +40% AP, Stun 1.05s, Delay 600ms | Swaps an area's coffee for decaf. After 0.6s, enemies inside fall asleep (stun). |
| **R** | Break Room | `zone` | 110 | 82s | Dmg: 12 +3/lv +6% AP, Heal: 16 +3/lv +8% AP (0.5s tick), Slow 35%, 4s | Opens the break room for 4s: allies inside heal every 0.5s while enemies are slowed and scalded. |

### Pager — the On-Call SRE (`oncall`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`140`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `615` (+97), Mana `300` (+34), AD `64` (+4.1), Armor `30` (+4), MR `32` (+1.6), AS `0.67` (+0.012), MS `345`
- **Unique Passive — Incident Response:** Deal +25% bonus damage to jungle monsters/epics and gain +15% MS toward low-HP enemies.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `standing_desk` (Standing Desk)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Ping Boomerang | `projectile` | 35 | 5.5s | Dmg: 70 +15/lv +80% AD, Pierce, Boomerang, Slow 35% | Fires an echoing alert wave that slows enemies out and boomerangs back. |
| **W** | Incident Mode | `self` | 50 | 13s | Shield: 75 +15/lv +30% AD, +20% MS, +30% AS, Spell Shield 2s | Declares an incident: shield, +20% MS, +30% AS, and a 2s Spell Shield. |
| **E** | Revert | `blink` | 55 | 16s | Range 360, Invis 1.2s | Blinks nearby and enters stealth for 1.2s. |
| **R** | On My Way | `dash` | 100 | 75s | Dmg: 175 +25/lv +95% AD, Range 920, toTarget, behindTarget, Stun 1.0s | Launches across long range straight behind an enemy champion: big damage + 1.0s stun. |

---

## Edge-Case Mechanics, Skill Engine Rules & Damage Channels
- **Damage Channels (`skillDamageType`):** Skills with pure AP scaling (`apRatio > 0 && !adRatio`) and `Servo` companion attacks deal **Magic Damage** (mitigated by `MR` and `MR Pen`). Auto-attacks and AD/HP-scaling skills deal **Physical Damage** (mitigated by `Armor` and `Armor Pen`). Boomerang return orbs (`Pixel Q`, `Mop Q` with `returnTrueDmg: true`) and combo mark detonations (`Pixel R`, `Zero E`, `Tester R` Bug Stacks) deal **True Damage**.
- **Reworked LoL-Inspired Mechanics (`SkillEngine.js` & `OfflineSim.js`):**
  - `boomerang` (+ `returnTrueDmg`): Projectile flies out to `range`, flips into a return leg homing back onto the caster (`MobaFx.js` renders live return path), resets hit immunity once on turnaround, and deals True Damage on the way back (`Pixel Q`, `Mop Q`, `Pager Q`).
  - `chain`: Bounces from the primary hit target across up to `N` nearby enemies within `range` with per-bounce damage `decay` and lightning arc VFX (`zap`) (`Pixel W`, `Volt Q`, `Lint Q`).
  - `pull` & `pullIn`: Hook projectiles drag the first victim toward the caster (`Stack Q` `680 px`, `Hira Q` `380 px`), while AoE vortex circles/zones pull affected enemies toward center (`Stack R`, `Model E/R`, `Mop R`, `Volt R`, `Sprint R`, `Hira R`).
  - `trap`: `circle` deployables persist invisible until stepped on after `armMs`, enforcing `maxActive: 3` per owner and `25s` lifetime (`Tester W` Root, `Volt E` Stun, `Cache W` Slow).
  - `behindTarget`: Teleports or dashes directly to the far side (`~75 px` behind enemy facing vector) so follow-up skillshots or wall-pins angle reliably (`Zero Q/R`, `Pager R`).
  - `invisMs`: Grants stealth that breaks immediately on outgoing attacks/skills (`Zero W` `1.8s`, `Swipe W` `1.2s`, `Pager E` `1.2s`).
  - `spellShieldMs`: Absorbs the next incoming hostile skill (negating damage and CC) with a brief shield-pop indicator (`Ops E`, `Brick W`, `Patch W`, `Hira W`, `Lint E`, `Pager W`).
  - `killReset`, `healOnHit`, `cdRefundOnHit`: `Zero R`, `Patch R`, and `Sprint E` refund their full cooldown on champion takedown; `Ops Q`, `Patch Q`, and `Brew Q` heal per champion struck; `Rush Q`, `Swipe Q`, and `Cache Q` reduce active skill cooldowns per champion hit.
- **Auto-Aim Policy (`autoAimsAtEnemy`, `autoAimReach`):**
  - Point-and-click skills (`target`, `toTarget` dashes) search within `range + 30 px` (`TARGET_CAST_SLACK`).
  - Skillshots/circles search within `range + 150 px` (`AUTO_AIM_SLACK`), aiming at the nearest visible enemy champion first, then nearest visible unit.
  - Directional dashes (`Tester E`, `Mop E`, `Swipe E`, `Rush Q`) and blinks (`Pixel E`, `Cache E`, `Pager E`) **never** auto-aim at enemies — they fire strictly along the player's movement stick or cursor facing direction (`MIN_AIM_DIST = 24 px`).
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
| **Pixel** | `R > Q > W > E` | `E (Empower) -> Q (Boomerang+Mark) -> W (Chain) -> R` | Sidestep return orbit of `CSS Boomerang` (`True Dmg`); `R` has `700 ms` delay |
| **Stack** | `R > Q > W > E` | `Q (SQL Hook) -> E (Stun) -> W (Shield) -> R (PullIn)` | Dodge straight-line `SQL Hook` behind minions; break `W` at range |
| **Ops** | `R > W > Q > E` | `E (Spell Shield) -> Q (Heal/Slow) -> W / R (Reset)` | Pop `Firewall Aegis` Spell Shield with poke before committing hard CC |
| **Tester** | `R > Q > W > E` | `W (Bug Trap) -> Q (Pierce) -> 3x AA -> E (Slow) -> R` | Watch bush chokepoints for `Bug Trap` roots; dodge `Unit Test` line |
| **Zero** | `R > Q > E > W` | `W (Stealth) -> Q (Behind) -> E (Detonate) -> R (Execute)` | Ward flanks (`[4]`); deny reset kill with `Debugger Breakpoint` stasis |
| **Model** | `R > W > Q > E` | `W (Empower) -> E (PullIn+Root) -> Q -> R (PullIn)` | Dash out during `850 ms` `Big Data` charge before the `210 px` PullIn snaps |
| **Brick** | `R > W > E > Q` | `W (Spell Shield) -> Q (Pierce Slow) -> E (Wall Pin) -> R` | Bait `Clipboard` 2s Spell Shield and avoid fighting beside corridor walls |
| **Mop** | `R > Q > W > E` | `W (Slow Zone) -> Q (Boomerang) -> R (Vortex) -> E` | Dodge return `Broom Boomerang` True Damage; dash out of `R` PullIn vortex |
| **Rush** | `R > Q > E > W` | `R (Throttle) -> Q (Multi-Hit Refund) -> E (Stun) -> W` | Don't line up for `Express Delivery` (`-1.5s` refund per champ hit) |
| **Volt** | `R > Q > W > E` | `E (Watchdog Trap) -> Q (Chain Stun) -> W -> R (Pet PullIn)` | Respect Servo's zone (`R` pulls `160 px` toward Servo) and spread out vs `Q` chain |
| **Patch** | `R > Q > E > W` | `E (Wall Pin) -> W (Spell Shield) -> Q (Heal Cleave) -> R` | Apply `Strict Linter` to cut `Refactor` heal-on-hit + `<50%` HP fury; kite melee |
| **Swipe** | `R > Q > W > E` | `W (Stealth) -> Q (Refund E) -> AA -> E -> R (Execute)` | Punish `Swipe` when `Q` misses (`E` stays on full `7s` CD) |
| **Sprint** | `R > Q > E > W` | `E (Stun) -> Q -> W -> R (4s Review PullIn)` | Deny takedowns so `Story Points` (`E`) does not chain-reset |
| **Cache** | `R > Q > W > E` | `W (Cryo Trap) -> Q (All-CD Refund) -> AA x4 -> R` | Sidestep `Batch Job` in skirmishes so `Cache` loses `-1.0s` all-CD refund |
| **Hira** | `R > Q > W > E` | `Q (Feedback Hook) -> E (Policy Zone) -> W (Spell Shield) -> R` | Dodge `380 px` `Feedback Hook`; spread apart vs `Mandatory Meeting` PullIn |
| **Lint** | `R > Q > W > E` | `Q (Chain Slow) -> W (Root) -> E (Spell Shield) -> R (Wall)` | Unclump to deny 3-target `Nitpick Chain`; sidestep `650 ms` `W` |
| **Brew** | `R > Q > E > W` | `Q (Heal/Slow) -> E (Decaf Stun) -> W (AS/Heal) -> R` | Anti-heal shuts down `Hot Pour` healOnHit + `Break Room` zone sustain |
| **Pager** | `R > Q > E > W` | `R (920 px Behind) -> W (Spell Shield) -> Q (Boomerang) -> E (Invis)` | Deny vision (`[4]` wards); `W` blocks first peel CC unless poked off first |

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
| **Stack** | `Q` SQL Hook catch threat | `Cluster Shield` | High (`Database Lock` PullIn + Stun) | `Standing Desk` + `Thornmail` | High (Pick hook + Frontline) |
| **Ops** | `Q` heal poke + `W` sustain | `Auto-Scaler Field` | Very High (`Blue-Green Deploy`) | `Rubber Duck` + `Team Lunch` | Very High (Team Spell Shield + Reset) |
| **Tester** | Bush `W` traps + `Q` pierce CS | `CI/CD Pipeline` | High (Map-wide `R` execute) | `Jetpack` + `JIT Compiler` | Hyper-Carry (Crit + Trap Zoning) |
| **Zero** | Stealth flank + `Q` behind burst | `Exploit Chain` | Very High (`Zero-Day` Reset Execute) | `Gauntlet` + `Root Sudo` | High (Reset chain assassin) |
| **Model** | `Q` poke + `E` PullIn root | `Overfit Nova` | Very High (`Big Data` 210 PullIn) | `Headphones` + `Stack Overflow` | Hyper-Mage (AoE singularity) |
| **Brick** | `Q` pierce slow + `W` Spell Shield | `Cluster Shield` | High (`Building Lockdown` wall-pin) | `Standing Desk` + `Kanban` | High (Pick engage + Peel) |
| **Mop** | `Q` Boomerang waveclear | `Overfit Nova` | High (`Deep Clean Vortex` 4s pull) | `Headphones` + `Midnight Oil` | High (Zone pull + True return) |
| **Rush** | Fast Lv 2–3 `Q` ganks | `Turbo Deploy` | High (`Rush Hour` +60% MS) | `Gauntlet` + `Kanban` | Medium-High (Multi-hit Q skirmisher) |
| **Volt** | `Q` chain stun + `E` Watchdog Trap | `Servo Overdrive` | High (`Servo EMP` Pet PullIn) | `Headphones` + `Rubber Duck` | High (Double-speed Servo + Trap control) |
| **Patch** | `Q` heal trades + `E` wall shove | `Merge Cleave` | High (`Merge Conflict` Reset Execute) | `Gauntlet` + `Kanban` | Very High (Reset bruiser carry) |
| **Swipe** | `Q` -> `E` CD refund + `W` stealth | `CI/CD Pipeline` | High (`App Store Launch` execute fan) | `Jetpack` + `RGB Keyboard` | Very High (Stealth kiting ADC) |
| **Sprint** | Early camp + `E` stun ganks | `Turbo Deploy` | High (`Sprint Review` PullIn vortex) | `Gauntlet` + `Second Monitor` | Medium-High (Reset skirmisher) |
| **Cache** | `520` AA range + `W` cryo traps | `Branch Predictor` | High (`Full Table Scan` 2100 px) | `Jetpack` + `RGB Keyboard` | Hyper-Carry (Spam Q CD refunds) |
| **Hira** | `Q` Feedback Hook + `W` Spell Shield | `Auto-Scaler Field` | Very High (`Mandatory Meeting` PullIn) | `Rubber Duck` + `Team Lunch` | High (Hook engage + AoE CC) |
| **Lint** | `Q` chain slow + `W` root setup | `Overfit Nova` | High (`Hard Reset` knockback + stun) | `Smartwatch` + `Headphones` | High (Chain shred + Spell Shield) |
| **Brew** | `Q` sustain wave + `W` AS/heal | `Auto-Scaler Field` | High (`Break Room` 4s heal/burn) | `Team Lunch` + `Headphones` | High (Sustained teamfight aura) |
| **Pager** | Fast camp clear + `Q` boomerang | `Exploit Chain` | Very High (`On My Way` 920 px behind) | `Gauntlet` + `Kanban` | Medium-High (Global stealth pick) |

---

## Sample Recommended 5v5 Team Compositions
- **1. Wombo PullIn Vortex ("All-Hands Wipe"):** `Stack` (Top) + `Pager` (Jungle) + `Model` (Mid) + `Swipe` (Bot) + `Hira` (Support). Chain `Stack Q` / `Hira Q` hooks into `Hira R` -> `Model R` (`210 px` PullIn singularity) -> `Stack R`.
- **2. Spell-Shield Hypercarry ("Unstoppable Deploy"):** `Brick` (Top) + `Zero` (Jungle) + `Lint` (Mid) + `Tester` (Bot) + `Ops` (Support). Stack layered `Spell Shields` (`Ops E`, `Brick W`, `Lint E`) around `Tester`'s `Bug Trap` perimeter while `Zero` hunts reset executes.
- **3. Pick & Boomerang Siege ("Zero-Downtime Push"):** `Patch` (Top) + `Rush` (Jungle) + `Pixel` (Mid) + `Cache` (Bot) + `Volt` (Support). `Volt E` traps and `Cache W` mines lock siege angles while `Pixel Q` Boomerang True Damage shreds frontline tanks.

---

## Lane-by-Lane Playbook & Matchup Priorities

### Top Lane (`Stack`, `Brick`, `Patch`)
- **Role Identity:** Durable frontline duelists, hooks, and wall-brawlers (`1v1` island from `0:20` to `10:00`).
- **Lv 1–3 Priority:** `Brick` pressures with `HALT!` pierce slow and `W` Spell Shield blocks; `Stack` punishes extended positioning with `SQL Hook` tower pulls; `Patch` out-sustains melee trades with `Refactor` heal-on-hit and `< 50%` HP fury.
- **Macro Transition:** Join `Golden Bug` (`3:00`) / `Deadline` (`6:00`) river fights once Tier-1 falls or after `10:00`.

### Jungle (`Zero`, `Rush`, `Sprint`, `Pager`)
- **First Clear & Gank Timing:** Start `small -> medium -> big` quadrant camp at `0:15` (`kill -9` Smite speeds `big` Legacy Mainframe and heals `8% max HP`). First gank window opens at `0:40–1:00` (`Lv 2–3`).
- **Style Split:**
  - `Rush` & `Sprint`: High-tempo gankers; `Rush Q` refunds cooldown across clustered bot lanes, while `Sprint E` resets in river skirmishes.
  - `Zero`: Stealth-gank assassin (`W` `1.8s` invis -> `Q` behind target) with `Zero-Day` reset sweeps.
  - `Pager`: Stealth blink (`E`) + `920 px` `On My Way` behind-target engage from fog + `W` Spell Shield diving.

### Mid Lane (`Pixel`, `Model`, `Mop`, `Lint`)
- **Role Identity:** Shortest lane (`320 px` corridor) granting immediate access to both river Epic Pits.
- **Wave Control:** `Mop` (`Q` Boomerang + `W`) and `Pixel` (`CSS Boomerang`) clear waves rapidly while threatening True Damage return hits; `Model` and `Lint` control choke points with `PullIn` roots and `Nitpick Chain` slows.

### Bot Lane (`Tester`, `Swipe`, `Cache` + `Ops`, `Volt`, `Hira`, `Brew`)
- **2v2 Synergy:** Carries set up lane traps (`Tester W`, `Cache W`) or stealth/dash repositions (`Swipe W/Q/E`), paired with hook/trap/shield supports.
- **Key Bot Pairings:**
  - `Tester + Hira`: `Feedback Hook` drags victims straight into `Bug Trap` + `Regression Barrage`.
  - `Swipe + Brew`: `Espresso Shot` heal/AS fuels `Swipe Q -> E` weave trades.
  - `Cache + Volt`: `Watchdog Trap` + `Data Trap` create double-mine bush zones with `520` AA range poke.

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
| `allies` | None | Ignored by walls | Heals/shields/buffs/Spell-Shields all living allied champions within `radius + 30 px` |
| `zone` | None | Ignored by walls | Persistent area ticking every `tickMs`; supports `pullIn` vortex per tick (`Mop R`, `Sprint R`) and allied healing (`Brew R`) |

---

## Complete Skill-Type Distribution Across All 72 Champion Skills

Every champion has `4` active skills (`18 * 4 = 72` skills total). Below is the exact distribution by `SkillEngine` execution primitive:

| Skill Type | Count | Champions & Slots Using This Type |
| :--- | :---: | :--- |
| **`circle`** | **19** | `Pixel R`, `Stack R`, `Ops Q`, `Tester W` (Trap), `Zero E`, `Model Q/E/R`, `Brick R`, `Rush E`, `Volt E` (Trap) / `R` (`at: 'pet'`), `Patch Q`, `Sprint Q`, `Cache W` (Trap), `Hira R`, `Lint W/R`, `Brew E` |
| **`projectile`** | **14** | `Pixel Q` (Boomerang), `Stack Q` (Pull Hook), `Tester Q/R`, `Brick Q`, `Mop Q` (Boomerang), `Volt Q` (Chain), `Swipe Q/R` (Fan), `Cache Q/R`, `Hira Q` (Pull Hook), `Brew Q`, `Pager Q` (Boomerang) |
| **`self`** | **12** | `Stack W`, `Zero W` (Stealth), `Model W`, `Brick W` (Spell Shield), `Rush W/R`, `Volt W`, `Patch W` (Spell Shield), `Swipe W` (Stealth), `Sprint W`, `Lint E` (Spell Shield), `Pager W` (Spell Shield) |
| **`dash`** | **10** | `Stack E`, `Tester E`, `Zero Q` (Behind), `Brick E` (ToTarget KB), `Mop E`, `Rush Q` (CD Refund), `Patch E` (WallStun), `Swipe E`, `Sprint E` (KillReset), `Pager R` (920 Behind) |
| **`allies`** | **5** | `Ops W/E/R` (`E` Spell Shield), `Hira W` (Spell Shield), `Brew W` |
| **`zone`** | **5** | `Mop W/R` (`R` PullIn), `Sprint R` (PullIn), `Hira E`, `Brew R` |
| **`target`** | **4** | `Pixel W` (Chain), `Zero R` (Behind+KillReset), `Patch R` (Execute+KillReset), `Lint Q` (Chain) |
| **`blink`** | **3** | `Pixel E`, `Cache E`, `Pager E` (Stealth) |

*Sum Check:* `19 + 14 + 12 + 10 + 5 + 5 + 4 + 3 = 72` skills (`18 * 4`).

### Key Roster Mechanics Highlights
- **Boomerangs (3) & Chain Lightning (3):** `Pixel Q`, `Mop Q`, `Pager Q` fire returning boomerangs (`Pixel Q` / `Mop Q` deal True Damage on return); `Pixel W`, `Volt Q`, `Lint Q` chain across up to `2` secondary targets.
- **Hooks & Pull-In Vortexes (8):** `Stack Q` (`680 px`) and `Hira Q` (`380 px`) yank hooked targets; `Stack R`, `Model E`, `Model R`, `Mop R`, `Volt R`, `Sprint R`, `Hira R` drag groups inward.
- **Spell Shields (6) & Active Stealth (3):** `Ops E`, `Brick W`, `Patch W`, `Hira W`, `Lint E`, `Pager W` block the next hostile skill; `Zero W` (`1.8s`), `Swipe W` (`1.2s`), `Pager E` (`1.2s`) grant combat stealth.
- **Traps (3), Behind-Target (3), Kill Resets (3):** `Tester W`, `Volt E`, `Cache W` place persistent ground mines; `Zero Q/R`, `Pager R` land behind targets; `Zero R`, `Patch R`, `Sprint E` reset on takedown.

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
| **Pixel** | `880 px` (`Q`) | High (`Q` return + `R`) | None | `E` blink (`430 px`) | None | Dodge `CSS Boomerang` return lane; `R` has `700 ms` delay |
| **Stack** | `820 px` (`Q` Hook) | Low–Med | `1.6s+` (`Q` pull + `E` `0.6s` + `R` `1.0s`) | `E` dash | `W` shield + Armor | Immobile once `Q/E` miss; break `W` at range |
| **Ops** | `820 px` (`Q`) | Low | None (`Q` 35% slow) | `E` `+30%` MS | `Q` heal + `E` Spell Shield + `R` | Focus with anti-heal after `Firewall Aegis` Spell Shield is baited |
| **Tester** | `1050 px` (`Q`) / `2400 R` | High (`3rd AA` + `R`) | `1.2s` Root (`W` Trap) | `E` `400 px` dash+slow | Trap zone peel | Fragile (`560 HP`); sweep chokepoints and punish `11s` `E` CD |
| **Zero** | `520 px` (`Q`/`R` behind) | V.High (Mark + `R` Reset) | None | `W` `1.8s` stealth (`+35% MS`) | `W` `20%` DR | True vision / stasis denies `Zero-Day` reset chain |
| **Model** | `880–1050 px` | V.High (`R` PullIn burst) | `1.0s` Root (`E`) + PullIn | None | `W` `+15%` MS | Completely immobile; flash/dash out of `850 ms` `Big Data` load |
| **Brick** | `420 px` (`E` dash) | Low–Med | `1.2s` / `1.0s` wall stun | `E` dash | `W` HP shield + 2s Spell Shield | Fight away from walls and poke off `2s` Spell Shield first |
| **Mop** | `900 px` (`R`) | Sustained + True Q return | `80 px` KB + PullIn | `E` `460 px` dash | `Clean Sweep` sustain | Sidestep return broom and exit `Deep Clean Vortex` pull |
| **Rush** | `620 px` (`Q` dash) | Med–High | `0.8s` (`E` `500 ms` delay) | `Q` CD-refund dash + `R` MS | `W` heal | Squishy if locked down during `Rush Hour`; don't clump for `Q` refunds |
| **Volt** | `860 px` (`Q` Chain) | Sustained (`Servo`) | `2.55s` (`Q` `0.7s` + `E` `0.85s` + `R` `1.0s`) | None (`0` dash/blink) | `E` trap peel | No self-peel dash; dodge `Watchdog Trap` and spread away from Servo |
| **Patch** | `460 px` (`E` dash) | High (`R` Execute Reset) | `0.9s` wall stun | `E` dash | `Q` heal + `W` Shield/SpellShield | Kite outside `150 px` AA reach and cut heal-on-hit with `Strict Linter` |
| **Swipe** | `500 px` AA (`840 Q`) | High (`W` stealth + `R` exec) | None | `E` `390 px` dash + `W` `1.2s` invis | Stealth reposition | Dodge `Q` so `E` doesn't refund `1.5s`; lock down when stealth breaks |
| **Sprint** | `520 px` (`E` homing) | Sustained (`R` PullIn zone) | `0.7s` (`E` stun) + PullIn | `E` Kill Reset | `W` heal | Deny kill resets and kite out of `4s` `Sprint Review` vortex |
| **Cache** | `520 px` AA (`2100 R`) | Ramping (`Q` refund + AA) | None (`W` 45% slow trap) | `E` `400 px` blink | Cryo trap slow | Ambush between `Batch Job` casts; dodge `Q` to prevent `1s` all-CD refund |
| **Hira** | `880 px` (`Q` Hook) | Low–Med | `2.0s+` (`Q` Pull+Root + `R` PullIn Stun) | None | `W` heal + 2.5s Spell Shield | Bait `Feedback Hook` and spread apart to avoid `Mandatory Meeting` |
| **Lint** | `650–850 px` | Med (`Q` Chain / `R`) | `1.1s` root + `1.0s` wall stun | None | `E` shield + 2s Spell Shield | Pop `Approved` Spell Shield with light poke before hard engage |
| **Brew** | `820 px` (`Q`) | Low (`R` zone) | `1.05s` (`E` `600 ms` delay) | None | `Q` healOnHit + `W`/`R`/Passive | Anti-heal halves `Hot Pour` + `Break Room` sustain |
| **Pager** | `920 px` (`R` behind) | Med–High | `1.0s` (`R` Stun) | `E` `360 px` blink + `1.2s` stealth | `W` shield + 2s Spell Shield | Requires vision for `R` (`920 px`); poke off `W` Spell Shield before peeling |
