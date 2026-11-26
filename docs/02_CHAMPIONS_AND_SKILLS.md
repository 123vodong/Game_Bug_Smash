# Champions, Unique Passives, Skill Combos & Matchups

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Source:** `shared/moba/champions.js` (18 champions, **18/18 unique passives**, **18/18 recommended builds**)

## Champion Matchup & Counterplay Guide
| Archetype / Champion | Excels Against | Vulnerable To | Key Counter Mechanics |
| :--- | :--- | :--- | :--- |
| **Zero / Rush / Sprint / Pager** (Dive / Assassins) | `Tester`, `Cache`, `Pixel`, `Model` | `Stack`, `Brick`, `Lint` | Hard CC (`Database Lock`, `Escort Out`), `freeze_frame` stasis, `thornmail_rack` |
| **Tester / Swipe / Cache** (Marksmen) | `Stack`, `Brick`, Structures | `Zero`, `Pager`, `Pixel` | Gap-closers (`Pen Test`, `On My Way`), burst fog ambushes |
| **Stack / Brick / Patch** (Frontline Tanks) | `Zero`, `Pixel`, `Mop` | `Tester`, `Cache`, `armor_shredder` | Sustained %/armor-pen DPS, `CORS Bypass` vs `Load Balancer` shield |
| **Pixel / Mop / Model / Lint** (Mages / Control) | Grouped teams, melee bruisers | `Zero`, `Sprint`, `git_revert` | Cleanse CC (`Git Revert Charm`), flanks from bushes |
| **Ops / Volt / Hira / Brew** (Supports) | Poke lanes, long skirmishes | `grievous_linter`, `shield_breaker` | `Strict Linter` (-40% heal), `Escalate` (-50% heal), focus fire |

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
- *Note:* Target win-rate bands and power-curve labels below are **design hypotheses**, not proven playtest results; ADC sustained DPS vs. burst TTK must be validated empirically across Lv 3/6/10/15.
- **Healthy Balance Window:** `48.0% – 52.0%` Win Rate (`< 46%` buff trigger, `> 54%` nerf trigger), Pick Rate `< 35%` *(no Ban phase yet)*, and normalized `damageDealt` / `damageTaken` parity by role.
- **Role Benchmarks at Lv 18 (Unitemized Base):** Tanks `2400–2650 HP / 114+ Armor / 68 MR`; Fighters/Junglers `2250–2300 HP / 98–101 Armor / 59 MR`; Marksmen/Mages/Supports `1938–2090 HP / 76–84 Armor / 50.4 MR`.

| Champion | Role | Lv1 / Lv18 HP | Lv18 Armor / MR | Dmg Channel | Hard CC Budget | Mobility | Power Curve (E / M / L) | Primary Balance Lever |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Pixel** (`pixel`) | Mage | 520 / 1982 | 77.8 / 50.4 | Magic + True R | None | High (E Blink) | Med / High / High | Q AP ratio (70%) & R true-dmg proc (25%) |
| **Stack** (`stack`) | Tank | 650 / 2554 | 114.2 / 68.0 | Physical | High (E 0.6s + R 1.0s) | Med (E Dash) | High / High / Med | W armor-break shockwave & E/R stun duration |
| **Ops** (`ops`) | Support | 540 / 2070 | 83.5 / 50.4 | Magic | None | Low (+MS buffs) | Med / High / High | W/R AP heal ratios & Passive -2s R CD |
| **Tester** (`tester`) | Marksman | 560 / 2090 | 83.5 / 50.4 | Physical + True R | None (W 30% slow) | Med (E Dash) | Low / High / V.High | AS growth (0.025/lv) & 3-hit Passive (+35%) |
| **Zero** (`zero`) | Assassin | 580 / 2195 | 96.0 / 59.2 | Physical + True E | None | High (Q Dash + MS) | Med / V.High / High | W 20% DR & Q/E Vulnerability burst |
| **Model** (`model`) | Controller | 530 / 1992 | 77.8 / 50.4 | Magic | Med (E 1.0s Root) | Low | Low / High / V.High | R load delay (1.2s) & Passive +30% stack cap |
| **Brick** (`guard`) | Tank | 680 / 2635 | 119.6 / 68.0 | Physical | High (E 1.0s / R 0.9s Wall Stuns) | Low | High / High / Med | E 320 px knockback & wall-stun duration |
| **Mop** (`cleaner`) | Mage | 510 / 1938 | 76.1 / 50.4 | Magic | Low (Q 90 px nudge) | Med (E Dash) | High / High / Med | W/R zone tick ratios & lane sustain passive |
| **Rush** (`courier`) | Jungler | 600 / 2266 | 96.0 / 59.2 | Physical | Med (E 0.8s Stun) | High (Q Dash + R +55% MS) | High / High / Med | Base MS (`355`) & R (`5s`, no DR) |
| **Volt** (`embedded`) | Support | 540 / 2036 | 81.5 / 50.4 | Magic (Skills + Servo) | High (Q 0.8s + R 1.0s) | Low | Med / High / High | Servo 900 ms cadence & Overclock double dmg |
| **Patch** (`dev`) | Fighter | 600 / 2300 | 101.4 / 59.2 | Physical | High (E 0.8s Wall + R 1.0s) | Med (E Dash) | Med / High / High | W +20% AD/+30% AS & <50% HP fury |
| **Swipe** (`appdev`) | Marksman | 550 / 2046 | 79.8 / 50.4 | Physical | None | Med (E Dash) | Low / High / High | Fan overlap cap (1/cast) & W +28% weave |
| **Sprint** (`sprint`) | Jungler | 610 / 2276 | 99.7 / 59.2 | Physical | Med (E 0.7s Stun) | High (E Dash + Passive MS) | High / High / Med | Reset MS duration (2.5s) & R AoE tick rate |
| **Cache** (`cache`) | Marksman | 545 / 2024 | 79.8 / 50.4 | Physical | None (W 35% slow) | Med (E Blink) | Low / High / V.High | 520 attack range & +24% stacked Cache Hit |
| **Hira** (`hr`) | Support | 545 / 2058 | 82.5 / 50.4 | Magic | High (Q 1.0s Root + R 1.0s Stun) | Low | Med / High / High | Q root duration & R Stun delay (0.6s) |
| **Lint** (`lint`) | Controller | 525 / 1970 | 78.8 / 50.4 | Magic | High (W 1.05s Root + R 0.9s Wall) | Low | Med / High / High | Strict Audit -15% shred & W delay (0.7s) |
| **Brew** (`barista`) | Support | 540 / 2036 | 79.8 / 50.4 | Magic | Med (E 1.0s Stun) | Low | Med / High / High | W +25% team AS & 2-cast 6% max HP heal |
| **Pager** (`oncall`) | Jungler | 615 / 2264 | 98.0 / 59.2 | Physical | High (R 1.0s Stun) | High (E 340 px Blink + R 820 px) | High / High / Med | E `18s` CD / `340 px`, W no free DR, R requires vision |

---

## Detailed Champion Roster

### Pixel — the Frontend Wizard (`pixel`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`460`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `520` (+86), Mana `420` (+42), AD `48` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.65` (+0.01), MS `330`
- **Unique Passive — Syntax Surge:** Casting a skill grants +12% move speed for 1.5s and restores 4% max mana on champion hit.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `frost_cache` (Cold Cache) -> `stackoverflow` (Stack Overflow Premium) -> `freeze_frame` (Debugger Breakpoint)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | CSS Bolt | `projectile` | 45 | 5s | Dmg: 80 +18/lv +70% AP | Fires a styled bolt that damages the first enemy hit and marks them (4s) for Framework Rewrite. |
| **W** | Flexbox Barrier | `self` | 60 | 12s | Shield: 90 +20/lv +50% AP | Wraps yourself in a shield that flexes to fit any damage. +15% move speed. |
| **E** | Hot Reload | `blink` | 70 | 13s | - | Instantly blinks nearby and empowers your next Q or R within 3.5s by +20% damage. |
| **R** | Framework Rewrite | `circle` | 100 | 70s | Dmg: 260 +30/lv +90% AP | After a short delay, rewrites an area for massive damage; detonates Q marks for +25% bonus true damage. |

### Stack — the Backend Tank (`stack`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `650` (+112), Mana `280` (+30), AD `62` (+4), Armor `36` (+4.6), MR `34` (+2.0), AS `0.66` (+0.01), MS `340`
- **Unique Passive — Failover Armor:** Taking damage grants +3 armor (stacks up to +15 for 4s).
- **Recommended Build (6 items):** `chair` (Ergonomic Chair) -> `sneakers` (Office Sneakers) -> `standing_desk` (Standing Desk) -> `thornmail_rack` (Thornmail Firewall) -> `server_rack` (Server Rack Armor) -> `guardian_backup` (Cloud Backup)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Heavy Query | `target` | 35 | 6s | Dmg: 50 +15/lv +110% AD, Slow 35% | Slams a target with an unindexed query. Damages and slows. |
| **W** | Load Balancer | `self` | 50 | 14s | Shield: 100 +18/lv +8% HP | Gains a shield and +25 armor; if the shield breaks, releases an AoE shockwave (80 + 40% armor). |
| **E** | Connection Pool | `dash` | 60 | 12s | Dmg: 60 +14/lv +60% AD, Stun 0.6s | Charges forward and stuns the first enemy it connects to. |
| **R** | Database Lock | `circle` | 100 | 80s | Dmg: 180 +20/lv +50% AD, Stun 1.0s | Locks every table in range. Nearby enemies are damaged and stunned. |

### Ops — the DevOps Medic (`ops`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`450`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `540` (+90), Mana `400` (+45), AD `46` (+2.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Uptime Pulse:** Healing or shielding an ally reduces your ultimate cooldown by 2s and grants +15% MS.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `rubber_duck` (Rubber Duck) -> `team_lunch` (Team Lunch) -> `headphones` (Noise-Cancelling Headphones) -> `stackoverflow` (Stack Overflow Premium)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Pipeline | `projectile` | 50 | 6s | Dmg: 70 +15/lv +60% AP | Pushes a deploy straight through every enemy in a line. |
| **W** | Auto-Heal | `allies` | 70 | 11s | Heal: 70 +16/lv +40% AP | Restarts unhealthy containers: heals you and nearby allies. |
| **E** | Hotfix | `allies` | 50 | 15s | - | Ships an emergency patch: nearby allies gain 30% move speed. |
| **R** | Blue-Green Deploy | `allies` | 110 | 90s | Heal: 180 +25/lv +60% AP, Shield: 150 +15/lv +40% AP | Swaps the whole team to a fresh deployment: big heal + shield. |

### Tester — the QA Sniper (`tester`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `560` (+90), Mana `300` (+36), AD `60` (+3.6), Armor `24` (+3.5), MR `30` (+1.2), AS `0.68` (+0.025), MS `330`
- **Unique Passive — Regression Mark:** Every 3rd basic attack on a target detonates a bug report for +35% bonus physical damage.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `jetpack` (Jetpack Sneakers) -> `crit_compiler` (JIT Compiler) -> `grievous_linter` (Strict Linter) -> `ultrawide` (Ultrawide Monitor) -> `armor_shredder` (Root Sudo)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Unit Test | `self` | 40 | 9s | - | Runs the test suite at full speed: +50% attack speed. |
| **W** | Bug Report | `projectile` | 55 | 8s | Dmg: 60 +14/lv +90% AD, Slow 30% | Files a detailed report at the first enemy hit. Damages and slows. |
| **E** | Edge Case | `dash` | 40 | 12s | - | Finds an edge case and slips through it. |
| **R** | Regression Barrage | `projectile` | 100 | 60s | Dmg: 240 +30/lv +120% AD | A map-wide shot hitting the first champion; detonates Bug Detection stacks (0-4) for +12% true dmg/stack. |

### Zero — the Security Ninja (`zero`)
- **Role / Lane:** Assassin / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `580` (+95), Mana `300` (+35), AD `66` (+4.2), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `350`
- **Unique Passive — Zero-Day Strike:** First attack after leaving a bush or out-of-combat deals +30% bonus damage.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `armor_shredder` (Root Sudo) -> `crit_compiler` (JIT Compiler) -> `git_revert` (Git Revert Charm)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Pen Test | `dash` | 40 | 7s | Dmg: 70 +16/lv +90% AD | Dashes onto a target and applies Vulnerability (4s). |
| **W** | Encrypt | `self` | 50 | 15s | - | Encrypts yourself: +35% move speed and 20% damage reduction. |
| **E** | Brute Force | `circle` | 35 | 5s | Dmg: 60 +15/lv +75% AD | Damages nearby enemies; consumes Q Vulnerability (+30% bonus dmg, -1.5s Q CD; basic attacks also consume it). |
| **R** | Zero-Day | `target` | 90 | 70s | Dmg: 150 +25/lv +100% AD | Exploits an unpatched champion. Bonus damage from their missing HP. |

### Model — the Data Sorcerer (`model`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`480`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `530` (+86), Mana `430` (+43), AD `46` (+3), Armor `20` (+3.4), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Gradient Descent:** Consecutive skill hits within 4s deal +10% escalating magic damage (up to +30%).
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `stackoverflow` (Stack Overflow Premium) -> `rubber_duck` (Rubber Duck) -> `firewall` (Firewall Appliance)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Gradient Descent | `circle` | 45 | 6s | Dmg: 70 +16/lv +60% AP, Slow 40% | Descends on an area: damages and slows everything inside. |
| **W** | Overfit | `self` | 60 | 14s | - | Overfits: +30% AP, +15% move speed, and empowers your next Q or R within 4.5s by +20% damage. |
| **E** | Random Forest | `projectile` | 60 | 12s | Dmg: 50 +12/lv +40% AP, Root 1.0s | Grows a forest around the first enemy hit, rooting them in place. |
| **R** | Big Data | `circle` | 110 | 85s | Dmg: 320 +35/lv +100% AP | Drops a petabyte on an area after a long load time. Enormous damage. |

### Brick — the Security Guard (`guard`)
- **Role / Lane:** Tank / `top` · **Range:** Melee (`125`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `680` (+115), Mana `280` (+30), AD `58` (+3.6), Armor `38` (+4.8), MR `34` (+2.0), AS `0.64` (+0.01), MS `335`
- **Unique Passive — Firewall Plating:** Standing near an allied tower or champion reduces incoming damage by 10%.
- **Recommended Build (6 items):** `chair` (Ergonomic Chair) -> `sneakers` (Office Sneakers) -> `standing_desk` (Standing Desk) -> `hoodie` (Company Hoodie) -> `kanban` (Kanban Board) -> `server_rack` (Server Rack Armor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | HALT! | `projectile` | 40 | 7s | Dmg: 60 +15/lv +60% AD +3% HP, Slow 40% | Shines a flashlight and yells. The first enemy hit is damaged and slowed. |
| **W** | Clipboard of Rules | `self` | 50 | 13s | Shield: 90 +18/lv +7% HP | Hides behind the rules: a shield that scales with max HP and +20 armor. |
| **E** | Escort Out | `target` | 55 | 11s | Dmg: 50 +14/lv +80% AD, Knockback 320, WallStun 1.0s | Shoves an enemy far away. If they hit a WALL, they are stunned. |
| **R** | Building Lockdown | `circle` | 100 | 80s | Dmg: 160 +22/lv +6% HP, Slow 35%, Knockback 300, WallStun 0.9s | Locks down the floor: every enemy nearby is damaged, slowed and thrown back. Walls stun. |

### Mop — the Night-Shift Cleaner (`cleaner`)
- **Role / Lane:** Mage / `mid` · **Range:** Ranged (`450`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `510` (+84), Mana `440` (+44), AD `46` (+2.8), Armor `20` (+3.3), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Clean Sweep:** Killing a minion or monster restores 25 HP and 20 mana instantly.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `midnight_oil` (Midnight Oil) -> `stackoverflow` (Stack Overflow Premium) -> `pomodoro` (Pomodoro Timer)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Broom Sweep | `projectile` | 45 | 6s | Dmg: 70 +16/lv +60% AP, Knockback 90 | A wide sweep that hits every enemy in a line and nudges them back. |
| **W** | Wet Floor | `zone` | 60 | 12s | Dmg: 12 +3/lv +8% AP, Slow 45% | Mops an area for 3 s. Enemies inside slip: slowed and damaged every half second. |
| **E** | Mop Slide | `dash` | 50 | 13s | - | Slides across the floor she just mopped. |
| **R** | Deep Clean | `zone` | 110 | 85s | Dmg: 45 +6/lv +14% AP, Slow 25% | Floods a huge area with industrial cleaner for 4 s. Heavy damage over time + slow. |

### Rush — the Delivery Rider (`courier`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `600` (+98), Mana `300` (+34), AD `64` (+4), Armor `28` (+4), MR `32` (+1.6), AS `0.68` (+0.012), MS `355`
- **Unique Passive — Express Delivery:** Moving continuously builds momentum: next basic attack deals +25% bonus damage and slows 15%.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `ultrawide` (Ultrawide Monitor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Express Delivery | `dash` | 45 | 8s | Dmg: 70 +16/lv +80% AD | Revs through a line, damaging every enemy along the route. |
| **W** | Hot Meal | `self` | 45 | 12s | Heal: 60 +14/lv +30% AD | Eats a customer's order: heals and gains +35% attack speed. |
| **E** | Package Drop | `circle` | 55 | 11s | Dmg: 60 +15/lv +70% AD, Stun 0.8s | Throws a heavy parcel. After a moment it lands: damage + stun. |
| **R** | Rush Hour | `self` | 90 | 75s | - | Full throttle for 5 s: +55% move speed and +30% attack damage. |

### Volt — the Embedded Engineer (`embedded`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`470`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `44` (+2.6), Armor `22` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Servo EMP:** Every 4th basic attack discharges a pulse through your pet for +40 bonus magic damage.
- **Companion Pet — Servo (🤖):** Untargetable unit following `110 px` behind; attacks owner's target within `320 px` every `900 ms` for `20 +4/lv +15% AD +12% AP` (despawns on death).
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `headphones` (Noise-Cancelling Headphones) -> `rubber_duck` (Rubber Duck) -> `firewall` (Firewall Appliance) -> `stackoverflow` (Stack Overflow Premium)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Interrupt Signal | `projectile` | 55 | 9s | Dmg: 60 +14/lv +50% AP, Stun 0.8s | Fires a hardware interrupt. The first enemy hit is damaged and stunned. |
| **W** | Overclock | `self` | 60 | 13s | - | Overclocks you and Servo: +30% attack speed; Servo deals double damage. |
| **E** | Watchdog Reset | `allies` | 70 | 14s | Heal: 55 +13/lv +35% AP, Shield: 50 +10/lv +25% AP | Resets everyone nearby to a known-good state: heal + small shield. |
| **R** | Servo EMP | `circle` | 110 | 70s | Dmg: 200 +25/lv +80% AP, Stun 1.0s | Servo overloads: after a short charge, everything around SERVO is shocked and stunned. |

### Patch — the Software Engineer (`dev`)
- **Role / Lane:** Fighter / `top` · **Range:** Melee (`150`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `600` (+100), Mana `300` (+34), AD `62` (+4), Armor `30` (+4.2), MR `32` (+1.6), AS `0.66` (+0.012), MS `340`
- **Unique Passive — Hotfix Fury:** Below 50% HP, gain +12% attack damage and +12% lifesteal.
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `standing_desk` (Standing Desk) -> `server_rack` (Server Rack Armor)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Refactor | `circle` | 35 | 6s | Dmg: 65 +15/lv +80% AD | Spins the keyboard around, refactoring everything nearby. |
| **W** | Pair Programming | `self` | 50 | 14s | Shield: 60 +12/lv +30% AD | An imaginary pair partner helps: shield, +20% attack damage, +30% attack speed. |
| **E** | git push --force | `dash` | 50 | 11s | Dmg: 55 +14/lv +70% AD, Knockback 260, WallStun 0.8s | Force-pushes into the first enemy and shoves them back. Into a wall = stunned. |
| **R** | Merge Conflict | `target` | 100 | 75s | Dmg: 170 +25/lv +100% AD, Stun 1.0s | Creates a merge conflict in an enemy champion. Big damage + long stun while they resolve it. |

### Swipe — the App Developer (`appdev`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`500`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `550` (+88), Mana `300` (+36), AD `60` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.025), MS `330`
- **Unique Passive — Swipe Combo:** Alternating a skill and a basic attack empowers the attack with +28% bonus damage.
- **Recommended Build (6 items):** `caffeine` (Caffeine Pills) -> `jetpack` (Jetpack Sneakers) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `gauntlet` (Git Blame Gauntlet) -> `ultrawide` (Ultrawide Monitor) -> `standing_desk` (Standing Desk)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Push Notification | `projectile` | 45 | 6s | Dmg: 60 +13/lv +70% AD | Throws 3 phones in a fan. Each enemy can be hit by one of them. |
| **W** | Dark Mode | `self` | 45 | 12s | - | Switches to dark mode: +25% move speed and +30% attack speed. |
| **E** | Swipe Left | `dash` | 40 | 11s | - | Swipes out of danger. |
| **R** | App Store Launch | `projectile` | 100 | 65s | Dmg: 170 +25/lv +100% AD | Launch day! A wide fan of 7 phones. Each enemy can be hit by one of them. |

### Sprint — the Scrum Master (`sprint`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`125`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `610` (+98), Mana `300` (+34), AD `63` (+4), Armor `30` (+4.1), MR `32` (+1.6), AS `0.67` (+0.012), MS `350`
- **Unique Passive — Sprint Velocity:** Takedowns and camp kills grant +25% move speed for 2.5s and heal 45 HP.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `second_monitor` (Second Monitor) -> `standing_desk` (Standing Desk) -> `letter_opener` (Letter Opener)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Daily Stand-up | `circle` | 35 | 6s | Dmg: 65 +15/lv +85% AD, Slow 30% | Makes everyone nearby stand up and give a status update: damage + slow. |
| **W** | Velocity | `self` | 45 | 13s | Heal: 50 +12/lv +25% AD | Measures velocity, then beats it: heals, +30% attack speed, +20% move speed. |
| **E** | Story Points | `dash` | 45 | 10s | Dmg: 60 +15/lv +80% AD, Stun 0.7s | Estimates a target at 13 points and lands on it: damage + short stun. |
| **R** | Sprint Review | `zone` | 100 | 80s | Dmg: 35 +6/lv +20% AD, Slow 30% | Holds a 4 s review where you stand: enemies inside take damage every half second and are slowed. |

### Cache — the Data Engineer (`cache`)
- **Role / Lane:** Marksman / `bot` · **Range:** Ranged (`520`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `545` (+87), Mana `310` (+36), AD `59` (+3.5), Armor `22` (+3.4), MR `30` (+1.2), AS `0.67` (+0.024), MS `330`
- **Unique Passive — Cache Hit:** Attacking the same target repeatedly grants +6% bonus damage per hit (up to +24%).
- **Recommended Build (6 items):** `mouse` (Gaming Mouse) -> `jetpack` (Jetpack Sneakers) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `energy_crate` (Energy Drink Crate) -> `ultrawide` (Ultrawide Monitor) -> `letter_opener` (Letter Opener)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Batch Job | `projectile` | 45 | 7s | Dmg: 65 +14/lv +85% AD | Ships a batch job through every enemy in a line. |
| **W** | Data Pipeline | `zone` | 55 | 12s | Dmg: 10 +3/lv +8% AD, Slow 35% | Lays a slow pipeline on an area for 3 s: enemies inside are slowed and take a little damage. |
| **E** | Failover | `blink` | 50 | 14s | - | Fails over to a standby node nearby. |
| **R** | Full Table Scan | `projectile` | 100 | 70s | Dmg: 200 +28/lv +110% AD | Scans the whole lane: a very long beam that hits every enemy in its path. |

### Hira — the People Partner (`hr`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`460`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `545` (+89), Mana `420` (+43), AD `44` (+2.6), Armor `23` (+3.5), MR `30` (+1.2), AS `0.62` (+0.01), MS `330`
- **Unique Passive — Culture Fit:** Nearby allied champions grant +10% shield/heal power and +12% move speed when assisting.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `rubber_duck` (Rubber Duck) -> `team_lunch` (Team Lunch) -> `cloud_credits` (Cloud Credits) -> `vpn_hoodie` (VPN Hoodie)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Feedback Session | `projectile` | 55 | 9s | Dmg: 55 +13/lv +50% AP, Root 1.0s | Books a feedback session with the first enemy hit: damage + root. |
| **W** | Team Building | `allies` | 70 | 12s | Heal: 60 +14/lv +35% AP | Trust fall! Heals you and nearby allies, +20% move speed. |
| **E** | Policy Update | `circle` | 55 | 10s | Dmg: 50 +12/lv +40% AP, Slow 45% | Emails a new policy to an area: everyone inside is damaged and slowed while they read it. |
| **R** | Mandatory Meeting | `circle` | 110 | 85s | Dmg: 150 +20/lv +60% AP, Stun 1.0s | Calls an all-hands: after a moment, every enemy in the area is damaged and stunned. |

### Lint — the Code Reviewer (`lint`)
- **Role / Lane:** Controller / `mid` · **Range:** Ranged (`470`) · **Difficulty:** 3/3
- **Base Stats (+Growth/lv):** HP `525` (+85), Mana `430` (+43), AD `46` (+2.9), Armor `21` (+3.4), MR `30` (+1.2), AS `0.63` (+0.01), MS `330`
- **Unique Passive — Strict Audit:** Skills apply a 2s mark reducing enemy armor by 15%.
- **Recommended Build (6 items):** `tech_book` (Tech Book) -> `smartwatch` (Smartwatch) -> `headphones` (Noise-Cancelling Headphones) -> `cloud_credits` (Cloud Credits) -> `stackoverflow` (Stack Overflow Premium) -> `vpn_hoodie` (VPN Hoodie)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Nitpick | `target` | 40 | 5s | Dmg: 80 +17/lv +60% AP, Slow 30% | Leaves a picky comment on an enemy: damage + slow. |
| **W** | Request Changes | `circle` | 60 | 11s | Dmg: 60 +14/lv +50% AP, Root 1.05s | Blocks the merge: after a delay, enemies in the area are damaged and rooted. |
| **E** | Approved | `self` | 55 | 14s | Shield: 80 +18/lv +45% AP | Approves your own PR: a shield and +25% move speed. |
| **R** | Hard Reset | `circle` | 110 | 80s | Dmg: 210 +28/lv +85% AP, Knockback 280, WallStun 0.9s | git reset --hard on an area: big damage and everyone inside is thrown back. Into a wall = stunned. |

### Brew — the Office Barista (`barista`)
- **Role / Lane:** Support / `support` · **Range:** Ranged (`480`) · **Difficulty:** 1/3
- **Base Stats (+Growth/lv):** HP `540` (+88), Mana `410` (+42), AD `45` (+2.7), Armor `22` (+3.4), MR `30` (+1.2), AS `0.63` (+0.011), MS `330`
- **Unique Passive — Espresso Shot:** Every 2nd skill cast brews a shot that restores 6% max HP to you and the nearest ally.
- **Recommended Build (6 items):** `power_bank` (Power Bank) -> `sneakers` (Office Sneakers) -> `team_lunch` (Team Lunch) -> `headphones` (Noise-Cancelling Headphones) -> `firewall` (Firewall Appliance) -> `midnight_oil` (Midnight Oil)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Hot Pour | `projectile` | 50 | 8s | Dmg: 50 +12/lv +45% AP, Slow 30% | Pours a scalding line of fresh coffee: damages and slows every enemy it splashes. |
| **W** | Espresso Shot | `allies` | 60 | 14s | - | A double shot for everyone nearby: +25% attack speed and +15% move speed for 4 s. |
| **E** | Decaf | `circle` | 65 | 13s | Dmg: 40 +10/lv +35% AP, Stun 1s | Swaps an area's coffee for decaf. After a moment, enemies inside doze off (stun). |
| **R** | Break Room | `zone` | 110 | 85s | Dmg: 10 +3/lv +5% AP, Heal: 14 +3/lv +7% AP, Slow 30% | Opens the break room for 4 s: allies inside heal every half second, enemies inside are slowed and scalded. |

### Pager — the On-Call SRE (`oncall`)
- **Role / Lane:** Jungler / `jungle` · **Range:** Melee (`140`) · **Difficulty:** 2/3
- **Base Stats (+Growth/lv):** HP `615` (+97), Mana `300` (+34), AD `64` (+4.1), Armor `30` (+4), MR `32` (+1.6), AS `0.67` (+0.012), MS `345`
- **Unique Passive — Incident Response:** Deal +25% bonus damage to jungle monsters/epics and gain +15% MS toward low-HP enemies.
- **Recommended Build (6 items):** `red_pen` (Red Pen) -> `sneakers` (Office Sneakers) -> `gauntlet` (Git Blame Gauntlet) -> `kanban` (Kanban Board) -> `rgb_keyboard` (RGB Mechanical Keyboard) -> `standing_desk` (Standing Desk)

| Slot | Skill Name | Type | Mana | Base CD | Scaling / Effects | Description |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **Q** | Ping | `projectile` | 35 | 5s | Dmg: 85 +17/lv +100% AD, Slow 30% | Pings everyone in a line: damage + slow. Nobody can ignore a ping. |
| **W** | Incident Mode | `self` | 50 | 14s | Shield: 70 +15/lv +30% AD | Declares an incident: a shield, +20% move speed and +25% attack speed. |
| **E** | Revert | `blink` | 55 | 18s | Range: 340 | Reverts to the last known-good position nearby. Instantly. |
| **R** | On My Way | `dash` | 100 | 80s | Dmg: 170 +24/lv +95% AD, Stun 1.0s | Acknowledges the page and races to an enemy champion from afar: big damage + 1.0 s stun on arrival. |

---

## Edge-Case Mechanics, Skill Engine Rules & Damage Channels
- **Damage Channels (`skillDamageType`):** Skills with pure AP scaling (`apRatio > 0 && !adRatio`) and `Servo` companion attacks deal **Magic Damage** (mitigated by `MR` and `MR Pen`). Auto-attacks and AD/HP-scaling skills deal **Physical Damage** (mitigated by `Armor` and `Armor Pen`). Combo mark detonations (`Pixel R`, `Zero E`, `Tester R` Bug Stacks) deal **True Damage**.
- **Auto-Aim Policy (`autoAimsAtEnemy`, `autoAimReach`):**
  - Point-and-click skills (`target`, `toTarget` dashes) search within `range + 30 px` (`TARGET_CAST_SLACK`).
  - Skillshots/circles search within `range + 150 px` (`AUTO_AIM_SLACK`), aiming at the nearest visible enemy champion first, then nearest visible unit.
  - Directional dashes (`Tester E`, `Mop E`, `Swipe E`, `Rush Q`) and blinks (`Pixel E`, `Cache E`, `Pager E`) **never** auto-aim at enemies — they fire strictly along the player's movement stick or cursor facing direction (`MIN_AIM_DIST = 24 px`).
- **Volt (`Servo`) Rules:** Targets the owner's current basic-attack target, else the last enemy champion hit by Volt within `3.0s` (`PET_OWNER_HIT_MEMORY_MS`). Follows `110 px` behind at `1.15x` owner MS (`PET_LEASH = 900 px` teleport snap), is untargetable/invulnerable, scales attack cadence with `Overclock` (`+100%`) and `Servo Overdrive` Epic Augment (`+45%` AS / `+35%` Magic Damage), **does not** trigger on-hit items/crit/lifesteal (`byPet = true`), ignores walls via `nearestFree`, and despawns immediately when Volt dies.
- **Pager (`On My Way` R):** Point-and-click long-range dash (`820 px`, `toTarget`) — requires target visibility (`!_hiddenFrom`, blocked by Fog of War/stealth), clips at walls (`clipMove`), can be interrupted by displacement/stun, and recalculates hit on arrival if target Blinks mid-dash (`hitRadius = 60`).
- **Brick (`Escort Out` / `Building Lockdown`):** `knockback` resolves along `clipMove` + `nav.pushOut` so displaced champions slide/stop cleanly along wall boundaries without escaping the `6000x6000` arena or trapping inside wall geometry.

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
| **Pixel** | `R > Q > W > E` | `E (Empower) -> Q (Mark) -> R (Detonate)` | Sidestep `Q` behind minions; `R` has `750 ms` telegraph delay to Flash/dash out |
| **Stack** | `R > Q > W > E` | `E (Stun) -> W (Shield) -> Q (Slow) -> R` | Avoid breaking `W` shield in melee clump; kite with `Root Sudo` |
| **Ops** | `R > W > Q > E` | `Q (Poke) -> E (Speed) -> W / R (Reset)` | Buy `Strict Linter` (`-40%` heal) or `Escalate` (`-50%` heal) and focus Ops first |
| **Tester** | `R > Q > W > E` | `3x AA (Bug Stacks) -> Q (+AS) -> W -> R` | Dive before 3rd-hit stacks; use `Shadow Proxy` or bushes to break target lock |
| **Zero** | `R > Q > E > W` | `Q (Mark) -> AA / E (Detonate) -> W -> R` | Ward jungle flanks (`[4]`); save Hard CC or `Debugger Breakpoint` for `Zero-Day` execute |
| **Model** | `R > W > Q > E` | `W (Empower) -> E (Root) -> Q -> R (1.2s)` | Dash out of `Big Data` (`1200 ms` load); punish during `W` downtime |
| **Brick** | `R > W > E > Q` | `Q (Slow) -> E (Wall Pin) -> R -> W` | Never fight near office walls where `E/R` trigger `0.9–1.0s` wall-stuns |
| **Mop** | `R > Q > W > E` | `W (Slow Zone) -> Q (Nudge) -> R (Deep Clean)` | Use mobility (`Flash`, `E` dash) to exit `W/R` DoT zones immediately |
| **Rush** | `R > Q > W > E` | `R (Throttle) -> Q (Through) -> E (Stun) -> W` | Root/slow Rush early to stop `Express Delivery` momentum passive |
| **Volt** | `R > Q > W > E` | `Q (Stun) -> W (Overclock Servo) -> R (At Pet)` | Watch Servo's position (`320 px` zap); do not clump around Servo when `R` charges (`700 ms`) |
| **Patch** | `R > Q > E > W` | `E (Wall Shove) -> W (Shield/Buff) -> Q -> R` | Watch `< 50%` HP `Hotfix Fury` lifesteal spike; apply `Strict Linter` |
| **Swipe** | `R > Q > W > E` | `W -> Q -> AA (Weave) -> E -> R (7-Fan)` | Engage when `E` (`Swipe Left`) is on cooldown; fan hits at most once per cast |
| **Sprint** | `R > Q > E > W` | `E (Stun) -> Q (Slow) -> W -> R (Zone)` | Deny takedowns in skirmishes to stop `Sprint Velocity` reset heals/MS |
| **Cache** | `R > Q > W > E` | `W (Zone) -> Q -> AA x4 (Stack) -> R (Snipe)` | Break target lock with bush/stealth so `Cache Hit` stacks reset |
| **Hira** | `R > Q > W > E` | `Q (Root) -> E (Slow) -> R (All-Hands Stun)` | Spread out vs `Mandatory Meeting` (`340 px`, `600 ms` delay) and cleanse with `Git Revert Charm` |
| **Lint** | `R > Q > W > E` | `Q (Audit Shred) -> W (Root) -> R (Wall)` | `Request Changes` has `700 ms` delay; sidestep out before root triggers |
| **Brew** | `R > Q > E > W` | `Q (Slow) -> E (Decaf Stun) -> W -> R` | Anti-heal cuts `Break Room` zone healing + `Espresso Shot` passive |
| **Pager** | `R > Q > E > W` | `R (820 px Engage) -> W -> Q -> AA` | Deny vision (`[4]` wards); `R` cannot target champions hidden in Fog of War |




---

## Champion Archetypes, Team Compositions & Power-Spike Windows

### Role Ecosystem & Draft Synergy
| Archetype | Champions | Core Job in 5v5 | Ideal Pairings | Weakness if Unchecked |
| :--- | :--- | :--- | :--- | :--- |
| **Frontline Tanks** | `Stack`, `Brick` | Initiate fights, absorb tower/carry fire, lock down divers with Hard CC | Pair with immobile hyper-carries (`Tester`, `Cache`) | Vulnerable to `Root Sudo` (`30%` Pen) and `Strict Audit` (`-15%` shred) |
| **Bruiser / Fighter** | `Patch` | Split-push side lanes, win extended 1v1 duels, secondary dive | Pair with enchanter speed/heal (`Ops`, `Brew`) | Kited by `Cold Cache` slows and `Strict Linter` anti-heal |
| **Assassins & Dive** | `Zero`, `Rush`, `Sprint`, `Pager` | Flank from fog/bushes, delete backline carries, secure river picks | Pair with global/long-range follow-up (`Pixel`, `Cache`) | Shut down by `Debugger Breakpoint` stasis and `Database Lock` |
| **Burst & Zone Mages** | `Pixel`, `Mop` | Clear waves fast, burst grouped targets, control river choke points | Pair with AoE setup (`Stack R`, `Hira R`, `Brick R`) | Vulnerable when `E` mobility is on cooldown |
| **Controllers** | `Model`, `Lint` | Zone objectives with delayed AoE CC, shred armor, punish immobile comps | Pair with frontline tanks to hold targets inside `Big Data` / `Request Changes` | Mobile blink/dash champions can exit `700–1200 ms` telegraphs |
| **Marksmen (ADC)** | `Tester`, `Swipe`, `Cache` | Sustained late-game DPS, melt tanks and structures behind minion waves | Pair with peel supports (`Volt`, `Hira`, `Ops`) | Low Lv 1–4 HP (`545–560`); punished by early jungle ganks (`0:40–1:00`) |
| **Supports** | `Ops`, `Volt`, `Hira`, `Brew` | Protect bot carry, sustain skirmishes, control vision with `[4]` wards | Pair with any scaling ADC or double-bruiser comp | Low solo wave-clear; dependent on `Mana Regen` early |

### Power-Spike Timeline Across All 18 Champions
| Champion | Lv 1–4 Laning | Lv 5 Augment Spike | Lv 6 Ultimate Spike | 2-Item Core Spike | Lv 15 Late Game |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pixel** | Safe Q poke + E blink | `CSS Split-Bolt` waveclear | High (`Q -> R` true-dmg burst) | `Headphones` + `Cold Cache` | Very High (AoE siege + Stasis) |
| **Stack** | Strong melee trades | `Cluster Shield` / `Merge Cleave` | High (`Database Lock` 1.0s AoE stun) | `Standing Desk` + `Thornmail` | High (Frontline wall) |
| **Ops** | Passive sustain lane | `Auto-Scaler Field` | Very High (`Blue-Green Deploy` team reset) | `Rubber Duck` + `Team Lunch` | Very High (40% CDR team heal) |
| **Tester** | Farm & stack 3-hit passive | `CI/CD Pipeline` | High (Map-wide `R` snipe) | `Jetpack` + `JIT Compiler` | Hyper-Carry (Crit + True R) |
| **Zero** | Fast camp clear, ambush ganks | `Exploit Chain` | Very High (`Zero-Day` execute) | `Gauntlet` + `Root Sudo` | High (Backline assassin) |
| **Model** | Zone Q poke, E root peel | `Overfit Nova` | Very High (`Big Data` 1.0 AP ratio) | `Headphones` + `Stack Overflow` | Hyper-Mage (Teamfight nuke) |
| **Brick** | Dominant melee bully | `Cluster Shield` | High (`Building Lockdown` wall-pin) | `Standing Desk` + `Kanban` | High (Peel & choke control) |
| **Mop** | Fast wave clear (`W + Q`) | `Overfit Nova` | High (`Deep Clean` 4s zone) | `Headphones` + `Midnight Oil` | High (Zone denial + burn) |
| **Rush** | Fastest Lv 2–3 map ganks | `Turbo Deploy` / `Exploit Chain` | High (`Rush Hour` +55% MS / +30% AD) | `Gauntlet` + `Kanban` | Medium-High (Pick diver) |
| **Volt** | Servo harass + Q stun | `Servo Overdrive` | High (`Servo EMP` remote stun) | `Headphones` + `Rubber Duck` | High (Double-damage Servo) |
| **Patch** | Strong 1v1 wall-pin trades | `Merge Cleave` / `Exploit Chain` | High (`Merge Conflict` 1.0s lockdown) | `Gauntlet` + `Kanban` | High (Bruiser carry) |
| **Swipe** | Fan Q poke + E dash safety | `CI/CD Pipeline` / `Turbo Deploy` | High (`App Store Launch` 7-fan) | `Jetpack` + `RGB Keyboard` | Very High (Kiting ADC) |
| **Sprint** | Early camp + stun ganks | `Turbo Deploy` / `Exploit Chain` | High (`Sprint Review` AoE zone) | `Gauntlet` + `Second Monitor` | Medium-High (Skirmisher) |
| **Cache** | Longest AA range (`520 px`) | `Branch Predictor` | High (`Full Table Scan` 2000 px beam) | `Jetpack` + `RGB Keyboard` | Hyper-Carry (`520` range + AS) |
| **Hira** | Q root + W sustain trades | `Auto-Scaler Field` | Very High (`Mandatory Meeting` 1.0s stun) | `Rubber Duck` + `Team Lunch` | High (Teamfight engage/peel) |
| **Lint** | Point-click Q poke + shred | `Overfit Nova` | High (`Hard Reset` knockback + wall stun) | `Smartwatch` + `Headphones` | High (Pick & shred control) |
| **Brew** | W AS steroid + E stun setup | `Auto-Scaler Field` | High (`Break Room` 4s heal/burn zone) | `Team Lunch` + `Headphones` | High (Sustained skirmish) |
| **Pager** | Fast camp clear (`+25%` dmg) | `Exploit Chain` / `Turbo Deploy` | Very High (`On My Way` 820 px stun) | `Gauntlet` + `Kanban` | Medium-High (Global pick) |

---

## Sample Recommended 5v5 Team Compositions
- **1. Hard-Engage AoE ("All-Hands Wipe"):** `Stack` (Top) + `Pager` (Jungle) + `Model` (Mid) + `Swipe` (Bot) + `Hira` (Support). Chain `Pager R` -> `Hira R` -> `Stack R` to lock enemies inside `Model R` (`Big Data`).
- **2. Protect-the-Hypercarry ("Production Scaling"):** `Brick` (Top) + `Zero` (Jungle) + `Lint` (Mid) + `Tester` (Bot) + `Ops` (Support). `Brick` and `Lint` peel divers off `Tester` while `Ops` resets team HP with `Blue-Green Deploy`.
- **3. Fast-Tempo Dive & Snowball ("Ship by 5 PM"):** `Patch` (Top) + `Rush` (Jungle) + `Pixel` (Mid) + `Cache` (Bot) + `Volt` (Support). Early `0:45` jungle ganks by `Rush` + `Volt` stun chain snowball into `3:00` Golden Bug.


---

## Lane-by-Lane Playbook & Matchup Priorities

### Top Lane (`Stack`, `Brick`, `Patch`)
- **Role Identity:** Durable frontline duelists and wall-brawlers (`1v1` island from `0:20` to `10:00`).
- **Lv 1–3 Priority:** `Brick` holds strongest Lv 1–2 lane control via `HALT!` slow and wall-pin threats; `Stack` wins extended trades once `Load Balancer` (`W`) is learned; `Patch` spikes sharply at `< 50%` HP via `Hotfix Fury`.
- **Macro Transition:** Join `Golden Bug` (`3:00`) / `Deadline` (`6:00`) river fights once Tier-1 falls or after `10:00` when team group-push activates.

### Jungle (`Zero`, `Rush`, `Sprint`, `Pager`)
- **First Clear & Gank Timing:** Start `small -> medium -> big` quadrant camp at `0:15` (`kill -9` Smite speeds `big` Legacy Mainframe and heals `8% max HP`). First gank window opens at `0:40–1:00` (`Lv 2–3`).
- **Style Split:**
  - `Rush` & `Sprint`: High-tempo early gankers (`355` / `350` MS) looking to snowball side lanes before `4:00`.
  - `Zero`: Bush-ambush assassin (`+30%` Zero-Day Strike); controls river vision and deletes isolated mid/bot carries.
  - `Pager`: Objective shredder (`+25%` camp/epic damage) with `820 px` `On My Way` engage from fog.

### Mid Lane (`Pixel`, `Model`, `Mop`, `Lint`)
- **Role Identity:** Shortest lane (`320 px` corridor, straight diagonal) granting immediate access to both Top and Bot river Epic Pits.
- **Wave Control:** `Mop` (`W + Q`) and `Pixel` (`CSS Split-Bolt` at Lv 5) clear waves fastest for roam priority; `Model` and `Lint` play for `600–850 px` zone control and jungle-gank setup (`Random Forest` / `Request Changes` roots).

### Bot Lane (`Tester`, `Swipe`, `Cache` + `Ops`, `Volt`, `Hira`, `Brew`)
- **2v2 Synergy:** Carries (`Tester`, `Swipe`, `Cache`) scale exponentially with `AS` and `Crit` but start with `545–560 HP`; supports control bush vision (`[4]` wards) and peel divers.
- **Key Bot Pairings:**
  - `Tester + Hira`: Long-range root/stun chain guarantees `Regression Barrage` hits.
  - `Swipe + Brew`: `Espresso Shot` (`+25% AS`) accelerates `Swipe Combo` weaves.
  - `Cache + Volt`: `520` AA range + `Servo` poke zones enemy carries off CS; double-stun (`Volt Q + R`) shuts down assassins.

---

## Skill Engine Execution Rules by Skill Type (`SkillEngine.js`)

| Skill `type` | Caster Movement Lock | Wall / Terrain Behavior | Target / Hitbox Validation |
| :--- | :--- | :--- | :--- |
| `projectile` | None (instant fire) | Flies **over** all walls; hits units/champs along segment | `width / 2` capsule radius; `pierce: true` hits all along line; fans share 1 `hit` Set |
| `circle` | None | Ignored by walls; telegraphs draw over terrain | `delay` ms wind-up before `_applyHit`; `range: 0` centers on caster; `at: 'pet'` centers on Servo |
| `target` | None | Requires `canSee(team, target)` (no Fog/bush blind cast) | Distance `<= range + 30 px` (`TARGET_CAST_SLACK`); rejects `pet` units |
| `dash` | Displaces caster over dash | Stops cleanly at walls (`nav.clipMove`) | `toTarget` homes onto visible target; `stopAtFirst` halts on first enemy hit |
| `blink` | Instant teleport | Crosses walls, landing on `nav.nearestFree(x, y, 30)` | Blocked while `rooted`, `stunned`, or knocked back |
| `self` | None | N/A | Applies instant heal, shield, and/or `_addBuff` tag on caster |
| `allies` | None | Ignored by walls | Affects all living allied champions within `radius + 30 px` (including caster) |
| `zone` | None | Ignored by walls | Persistent area for `duration` ms, ticking every `max(100, tickMs)` ms |


---

## Complete Skill-Type Distribution Across All 72 Champion Skills

Every champion has `4` active skills (`18 * 4 = 72` skills total). Below is the exact distribution by `SkillEngine` execution primitive:

| Skill Type | Count | Champions & Slots Using This Type |
| :--- | :---: | :--- |
| **`projectile`** | **15** | `Pixel Q`, `Ops Q`, `Tester W/R`, `Model E`, `Brick Q`, `Mop Q`, `Volt Q`, `Swipe Q/R`, `Cache Q/R`, `Hira Q`, `Brew Q`, `Pager Q` (`pierce: true` on `Ops Q`, `Mop Q`, `Cache Q/R`, `Brew Q`, `Pager Q`; fan `count > 1` on `Swipe Q/R`) |
| **`circle`** | **15** | `Pixel R`, `Stack R`, `Zero E`, `Model Q/R`, `Brick R`, `Rush E`, `Volt R` (`at: 'pet'`), `Patch Q`, `Sprint Q`, `Hira E/R`, `Lint W/R`, `Brew E` |
| **`self`** | **14** | `Pixel W`, `Stack W`, `Tester Q`, `Zero W`, `Model W`, `Brick W`, `Rush W/R`, `Volt W`, `Patch W`, `Swipe W`, `Sprint W`, `Lint E`, `Pager W` |
| **`dash`** | **9** | `Stack E` (`stopAtFirst`), `Tester E`, `Zero Q` (`toTarget`), `Mop E`, `Rush Q` (line dmg), `Patch E` (`stopAtFirst` + `wallStun`), `Swipe E`, `Sprint E` (`toTarget`), `Pager R` (`toTarget`, `820 px`) |
| **`allies`** | **6** | `Ops W/E/R`, `Volt E`, `Hira W`, `Brew W` |
| **`target`** | **5** | `Stack Q`, `Zero R`, `Brick E`, `Patch R`, `Lint Q` |
| **`zone`** | **5** | `Mop W/R`, `Sprint R`, `Cache W`, `Brew R` |
| **`blink`** | **3** | `Pixel E`, `Cache E`, `Pager E` *(`Alt+Tab` Flash is a Summoner Spell blink)* |

*Sum Check:* `15 + 15 + 14 + 9 + 6 + 5 + 5 + 3 = 72` skills (`18 * 4`).

### Key Roster Mechanics Highlights
- **True Damage Combo Marks (3):** `Pixel` (`Q` mark -> `R` `+25%` true), `Zero` (`Q` vuln -> `AA`/`E` `+30%` true + `-1.5s Q CD`), `Tester` (`AA` Bug Stacks 0–4 -> `R` `+12%/stack` true).
- **Wall-Interaction Knockbacks (4):** `Brick E` (`320 px`, `1.0s` wall-stun), `Brick R` (`300 px`, `0.9s` wall-stun), `Patch E` (`260 px`, `0.8s` wall-stun), `Lint R` (`280 px`, `0.9s` wall-stun), plus `Mop Q` (`90 px` nudge).
- **Shield-Break & Sustain Passives:** `Stack W` triggers an AoE shockwave (`80 + 40% armor`) on shield break; `Mop` (`Clean Sweep`), `Brew` (`Espresso Shot`), `Ops` (`Uptime Pulse`), and `Sprint` (`Sprint Velocity`) provide built-in lane/skirmish sustain.


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

### Roster Design Verification Rules
1. **Unique Passive Parity:** Every champion maps 1-to-1 to a distinct entry in `CHAMPION_PASSIVES` (`18/18` unique mechanics).
2. **Universal MR Baseline:** All 18 champions scale Magic Resistance by role (`34 + 2.0/lv` Tanks, `32 + 1.6/lv` Fighters/Assassins/Junglers, `30 + 1.2/lv` Mages/Controllers/Supports/Marksmen) so magic burst remains counterable at all stages.
3. **Complete Build & Epic Coverage:** Every champion defines a 6-item `build` array in `CHAMPIONS[id]` and is eligible for at least `1` Epic Skill Evolution Augment in `shared/moba/augments.js`.


---

## Kit Power-Budget & Counterplay Audit (18 Champions)

This audit evaluates every champion against the six combat-fairness pillars (`Engage`, `Burst`, `CC`, `Escape`, `Defense`, `Counterplay`) to prevent zero-counterplay overload:

| Champion | Engage Reach | Burst Speed | Hard CC Budget | Escape Tools | Self Defense | Primary Vulnerability / Counterplay Window |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Pixel** | `950 px` (`Q`) | High (`Q -> R` mark) | `0s` (none) | `E` blink (`420 px`) | `W` shield | Dodge `Q` behind creeps; `R` has `750 ms` telegraph delay to dash/Flash |
| **Stack** | `420 px` (`E` dash) | Low–Med | `1.6s` raw (`E` `0.6s` + `R` `1.0s`; `1.1s` w/ DR) | `E` dash only | `W` shield + Armor | Immobile after `E`; `CORS Bypass` breaks `W` shield before AoE pop |
| **Ops** | `480–1000 px` | Low (`Q` poke) | `0s` | `E` `+30%` MS | `W` / `R` heal+shield | Zero hard CC or wall-dash; focus during `W/R` cooldown with `Strict Linter` |
| **Tester** | `500 px` AA (`2400 R`) | High (`3rd AA` + `R`) | `0s` (`W` 30% slow) | `E` `360 px` dash | None | Fragile (`560 HP`); dive immediately after `E` (`12s` CD) |
| **Zero** | `520 px` (`Q` dash) | V.High (Mark + `R`) | `0s` | `W` `+35%` MS only | `W` `20%` DR (`3s`) | Tuned `W` DR (`30% -> 20%`); lacks wall-cross escape once `Q` commits |
| **Model** | `850–1100 px` | V.High (`R` 1.0 AP) | `1.0s` (`E` root) | None (`0` dash/blink) | `W` `+15%` MS | Completely immobile; `R` has `1200 ms` load telegraph to walk out |
| **Brick** | `220 px` (`E` melee) | Low–Med | `1.0s` / `0.9s` wall stun | None (`0` dash/blink) | `W` HP shield + Armor | Fight in open lanes away from walls; kite cleanly outside `220 px` `E` |
| **Mop** | `450–800 px` | Sustained (`W`/`R` DoT) | `90 px` knockback | `E` `450 px` dash | `Clean Sweep` sustain | Walk out of static `W/R` puddles; lowest Lv 1 HP (`510 HP`) |
| **Rush** | `600 px` (`Q` dash) | Med–High | `0.8s` (`E` `550 ms` delay) | `Q` dash + `R` MS (`5s`) | `W` heal (no `R` DR) | Squishy all-in diver after losing `R` `15%` DR; `R` trimmed to `5s` (`355` base MS) |
| **Volt** | `850 px` (`Q`) / Pet `R` | Sustained (`Servo`) | `1.8s` raw (`Q` `0.8s` + `R` `1.0s`; `1.3s` w/ DR) | None (`0` dash/blink) | `E` small shield/heal | No self-peel mobility; bait `Servo EMP` (`700 ms` charge) and dive Volt |
| **Patch** | `450 px` (`E` dash) | Med (`R` single target) | `0.8s` wall + `1.0s R` (`1.3s` w/ DR) | `E` dash only | `W` shield + `<50%` LS | Kite outside `150 px` AA reach; `Strict Linter` halves `< 50%` HP sustain |
| **Swipe** | `500 px` AA (`820 Q`) | High (`Weave` + 7-fan) | `0s` | `E` `380 px` dash | `W` `+25%` MS | Zero CC; punish `11s` `E` cooldown window |
| **Sprint** | `500 px` (`E` homing) | Sustained (`R` zone) | `0.7s` (`E` stun) | `E` (needs target) | `W` heal | Single target dive commits inward; weak escape without reset kills |
| **Cache** | `520 px` AA (`2000 R`) | Ramping (`+24%` AA) | `0s` (`W` slow) | `E` `380 px` blink | None | Requires `4` hits on same target; ambush from fog or break tether |
| **Hira** | `800–900 px` | Low–Med | `2.0s` raw (`Q` `1.0s` + `R` `1.0s`; `1.5s` w/ DR) | None (`0` dash/blink) | `W` heal + MS | No dash/blink; spread to avoid multi-target `R` (`600 ms` delay) |
| **Lint** | `650–850 px` | Med (`Q`/`R`) | `1.05s` root + `0.9s` wall (`1.5s` w/ DR) | None (`0` dash/blink) | `E` self shield | Immobile caster; `W` has `700 ms` delay to sidestep |
| **Brew** | `750–800 px` | Low (`R` zone) | `1.0s` (`E` `650 ms` delay) | None (`0` dash/blink) | `W`/Passive heal | No escape mobility; `Ignite` / `Strict Linter` counters sustained healing |
| **Pager** | `820 px` (`R` toTarget) | Med–High | `1.0s` (`R`) | `E` `340 px` blink (`18s` CD) | `W` shield only (no DR) | Removed `W` `15%` DR; shortened `E` blink (`400 -> 340 px`, `15 -> 18s` CD) so post-dive exit is punishable |
