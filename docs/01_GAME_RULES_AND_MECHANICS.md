# Game Rules, Combat Formulas, Bot AI & Core Mechanics (Team Mode 5v5)

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Sources:** `shared/moba/rules.js`, `server/game/moba/tuning.js`, `server/game/moba/SkillEngine.js`, `server/game/moba/MobaBots.js`, `server/rooms/TeamRoom.js`, `src/entities/moba/OfflineSim.js`

---

## 1. Quantitative Combat Formulas & Skill Engine

### 1.1. Raw Skill Scaling & Rank Curve
Every skill amount (`dmg`, `heal`, `shield`) uses `rules.scaledAmount(spec, level, ad, ap, maxHp)` multiplied by the active skill rank curve:

```text
Raw = (Base + PerLevel * (ChampionLevel - 1) + AD * adRatio + AP * apRatio + MaxHP * hpRatio)
      * (1 + 0.12 * (SkillRank - 1))
```

- **Skill Rank Multipliers:**
  - **Rank 0 (Unlearned):** Skill cannot be cast (`rank <= 0` rejected by server and `OfflineSim`).
  - **Rank 1:** `1.00x` power, `1.00x` cooldown.
  - **Rank 2:** `1.12x` power, `0.94x` cooldown (`-6%`).
  - **Rank 3 (Max R):** `1.24x` power, `0.88x` cooldown (`-12%`).
  - **Rank 4:** `1.36x` power, `0.82x` cooldown (`-18%`).
  - **Rank 5 (Max Q/W/E):** `1.48x` power, `0.76x` cooldown (`-24%`), floored at `0.65x` (`Math.max(0.65, 1 - (rank - 1) * 0.06)`).
- **Execute Bonus (`spec.execute`):** Applied before resistance checks on `target` skills (`Zero R` Zero-Day): `Bonus = missingHpPct * max(0, target.maxHp - target.hp)`.

### 1.2. Damage Channels (`physical` / `magic` / `true`)
- **Physical Damage:** Auto-attacks, tower/minion/monster attacks, and AD/HP-scaling skills (`!apRatio || adRatio > 0`). Mitigated by target `Armor` and attacker `ArmorPen`.
- **Magic Damage:** Pure AP-scaling skills (`apRatio > 0 && !adRatio`, classified by `skillDamageType()`), `Servo` companion basic attacks, and `Chain Reaction` AoE blasts. Mitigated by target `Magic Resistance (MR)` and attacker `MRPen`.
- **True Damage (`trueDmg = true`):** Bypasses Armor, MR, and the `2.0x` percentage Damage Amplification Cap. Sources:
  - `Escalate` (Ignite) DoT ticks (`60 + 20/lv` over `5s`).
  - `kill -9` (Smite) instant burst (`450 + 35/lv` on monsters/minions).
  - `Pixel` R (`Framework Rewrite`) detonating `Q` marks (`+25%` of R raw damage as True Damage).
  - `Zero` E (`Brute Force`) detonating `Q` Vulnerability (`+30%` of E raw damage as True Damage).
  - `Tester` R (`Regression Barrage`) detonating Bug Detection stacks (`+12% * stacks` up to `+48%` as True Damage).
  - Enemy Fountain Laser (`1200 DPS`).

### 1.3. Resistance, Shred & Penetration Order (`R.damageAfterResist`)
When `trueDmg === false`, resistance mitigation executes strictly in three deterministic steps:
1. **Percentage Shred First:** `afterShred = max(0, Resist * (1 - min(0.60, ShredPct)))`
   - Examples: `Lint` Passive `Strict Audit` (`-15%` for `2s`), `Overfit Nova` Epic Augment (`-15%` for `2.5s`).
   - Note: `Stack` Passive `Failover Armor` adds flat bonus armor (`+3` per hit taken, up to `+15` for `4s`) before shred on physical hits.
2. **Percentage Penetration Second:** `afterPen = afterShred * (1 - min(0.60, PenPct))`
   - Examples: `Root Sudo` (`+30%` Armor Pen), `Midnight Oil` (`+25%` MR Pen).
3. **Hard Reduction Floor & Formula:**
   - `EffectiveResist = (Resist <= 0) ? 0 : max(Resist * 0.40, afterPen)` (maximum `60%` total resistance bypass).
   - `PostResist = Raw * 100 / (100 + EffectiveResist)` (e.g., `100` Resist halves incoming damage to `50%`).

### 1.4. Critical Strikes & `2.0x` Non-Crit Amplification Cap
- **Mutual-Exclusion Critical Strike:** On each non-pet basic attack, `Ultrawide Monitor` (`20%` chance for `1.60x`) and `JIT Compiler` (every 3rd attack `1.60x`) evaluate via logical OR (`didCrit = crit3Hit || crit20Proc`). Only **one** `1.60x` critical multiplier can apply per attack.
- **Non-Crit Amplification Cap (`2.0x` Post-Crit Base):** Combined percentage multipliers from Champion Passives (`Zero-Day Strike`, `Swipe Combo`, `Express Delivery`, `Cache Hit`, `Hotfix Fury`, `Incident Response`, `Regression Mark`), Item Passives (`Executioner`, `Overclock`), and Augments (`Execution Protocol`, `Crowd Control`, `Coordinated Strike`) cannot exceed `2.0x` of `(didCrit ? 1.60 * BaseAfterResist : BaseAfterResist)`. Expressed cleanly in code:
  ```text
  AmpCeiling = (didCrit ? BaseAfterResist * 1.60 : BaseAfterResist) * 2.0 + 40
  FinalDamage = min(ModifiedDamage, AmpCeiling)
  ```
  *(Note: On non-critical hits, the percentage cap is strictly `2.0x BaseAfterResist + 40`; on `1.60x` critical strikes, the `1.60x` crit factor multiplies outside the `2.0x` passive/augment cap, yielding `3.20x BaseAfterResist + 40` maximum.)*
- **Flat On-Hit Bonuses:** `Midnight Oil` (`+25` skill burn), `Volt` 4th-hit `Servo EMP` (`+40`), and `Red Buff` (`+18`) are covered by the `+40` flat buffer above the amplification ceiling.

### 1.5. Unified Cooldown Reduction (`R.skillCooldownMs`)
- **Single Source of Truth:** Supersedes any legacy `35%` cap references. Distinguishes **Item/Buff Haste (`MAX_HASTE_PCT = 0.40`)** from **Total Effective CDR (`54.4%` max on Rank 5 Q/W/E, `47.2%` max on Rank 3 R)**:
- **Step 1 — Haste Pool (`MAX_HASTE_PCT = 0.40`):**
  `TotalHaste = min(0.40, sum(Item Haste) + (Blue Buff ? 0.15 : 0))`
  `HastedCdMs = round(BaseCdSec * 1000 * (1 - TotalHaste))`
- **Step 2 — Skill Rank Reduction:**
  `RankMul = max(0.65, 1 - 0.06 * (SkillRank - 1))` (`0.76x` at Rank 5 Q/W/E -> combined effective multiplier `0.60 * 0.76 = 0.456x`, i.e., **`54.4%` max effective CDR**; balance tracks per-skill uptime and target TTK rather than Haste alone).
  `FinalCdMs = round(HastedCdMs * RankMul)`
- **Non-Hasted Cooldowns:** Summoner Spells (`D`/`F`), Active Items (`[1]`), Ward Trinket (`[4]`), and Augment internal cooldowns are **never** reduced by Haste or Skill Rank.

### 1.6. Crowd Control, Diminishing Returns & Shield/Heal Rules
- **3-Stage Hard CC Diminishing Returns & Chain Immunity (`applyHardCcDuration` — `CC_DR_WINDOW_MS = 4000`, `CC_DR_MUL = [1.0, 0.50, 0.25]`, `CC_IMMUNE_AFTER = 3`, `CC_IMMUNE_MS = 2000`):**
  - Applies uniformly to **Stun**, **Root**, and **Wall-Stun** (`wallStun` on knockback wall collision) on champions in both Offline and Online simulation.
  - 1st Hard CC applies `1.00x` duration and starts a `4000 ms` chain window (`_ccChainUntil = t + 4000`).
  - 2nd Hard CC within the window applies `0.50x` duration and **resets** the `4000 ms` timer.
  - 3rd Hard CC within the window applies `0.25x` duration and immediately triggers **Hard CC Chain Immunity** (`_ccImmuneUntil = now + dur + 2000`, resetting `_ccChainCount = 0`).
  - For the next `2000 ms` after the 3rd Hard CC expires, further Hard CC applications (stun, root, wall-stun) deal **`0 ms` CC**. Cleanly resets to `1.00x` if `4000 ms` elapses between hits or after the `2000 ms` immunity ends.
- **Slows:** Non-stacking. Only the highest `slowPct` (capped at `90%`, `MIN_MOVE_SPEED = 90 px/s`) takes effect; weaker slows never extend stronger active slows.
- **Knockbacks (`KNOCKBACK_MS = 200`):** Displaces target straight away from caster/center along `nav.clipMove`; cannot move Epic monsters or Structures. Targets colliding with a wall early trigger `wallStun`, which **is** routed through `applyHardCcDuration` (subject to CC DR and Chain Immunity).
- **Shield Soak & Anti-Shield:** Shields absorb incoming damage before HP (soonest-expiring shield first on server). `CORS Bypass` deals `+50%` bonus damage against shields.
- **Healing, Lifesteal & Grievous Wounds:**
  - Lifesteal heals from basic attacks and skill hits (`kind === 'atk' || kind === 'skill'`), **not** from pet attacks, Summoner Spells, or fountain laser.
  - Healing multipliers take the strictest active anti-heal: `Ignite` (`0.50x`), `Strict Linter` (`0.60x`, `3s`).
  - Out-of-Combat Regen (`OUT_OF_COMBAT_MS = 6000`): `4x` base HP regen (`0.6%/s -> 2.4%/s`) and Mana regen (`1.2%/s -> 4.8%/s`), plus flat item `manaRegen`.

### 1.7. Skill Engine Spec Primitives (`SkillEngine.js`)
| Skill Type | Execution & Validation | Latency / Aim Rules |
| :--- | :--- | :--- |
| `projectile` | Linear or fan (`count <= 15`, `spread` deg) sharing **one** `hit` Set per cast | `pierce` passes through units; `champOnly` ignores minions/monsters |
| `circle` | Area at cursor within `range` (`0` = self, `at: 'pet'` = pet center) | Telegraph `delay` ms before damage/CC resolves |
| `target` | Point-and-click within `range + 30` (`TARGET_CAST_SLACK`) | Rejects hidden targets (`!canSee`) and `pet` units |
| `dash` | Moves caster along `clipMove` (stops at walls); optional `toTarget` homing | Blocked while `rooted` or `stunned`; `stopAtFirst` halts on first hit |
| `blink` | Instant teleport toward aim up to `range`, landing on `nav.nearestFree` | Crosses walls; blocked while `rooted`, `stunned`, or displaced |
| `self` | Immediate shield / heal / stat buff on caster for `duration` ms | Re-casting refreshes buff tag (`_addBuff`) |
| `allies` | AoE heal / shield / buff to all living allied champions within `radius` | Includes caster |
| `zone` | Persistent area for `duration` ms ticking every `tickMs` (`>= 100 ms`) | Emits `fx zone`; applies tick damage, slow, and/or ally heal |

- **Combat Caps (`tuning.js`):** `MAX_ATTACK_SPEED = 2.5` attacks/s · `ATK_PROJ_SPEED = 1500 px/s` · `RANGE_SLACK = 12 px` · `MIN_MOVE_SPEED = 90 px/s`.

---

## 2. Leveling, Skill Upgrades & Death System

- **Max Level:** `18` · **Ultimate (R) Unlock:** Level `6` (`ULT_UNLOCK_LEVEL = 6`).
- **Default Match Start (Lv 3):** Champions spawn at **Level 3** (`xp = 660`) with `Q:1, W:1, E:1, R:0` pre-learned and `0` unspent skill points so lane skirmishes and jungle clears start active from `0:00`; `+1` skill point is awarded per level-up (`18` total points across Lv 1–18 = `5 + 5 + 5 + 3`). Skill upgrades bind to `Shift + Q/W/E/R` (or clicking the gold `+` badge above a skill slot) with a `beforeunload` browser guard during active matches.
- **Auto-Aim Fallback (`OfflineSim` / `TeamRoom`):** Point-and-click skills search within `range + 30 px`; skillshots search within `range + 150 px` (`AUTO_AIM_SLACK`); directional dashes/blinks never auto-aim at enemies.

### Complete XP & Respawn Table (Levels 1–18)
| Level | Cumulative XP | XP to Next Lv | Respawn Time | Max Skill Ranks Available |
| :---: | :---: | :---: | :---: | :--- |
| **1** | 0 | 280 | 6.6s | 1 pt (`Q/W/E` max 1) |
| **2** | 280 | 380 | 8.2s | 2 pts (`Q/W/E` max 1–2) |
| **3** | 660 | 480 | 9.8s | 3 pts |
| **4** | 1,140 | 580 | 11.4s | 4 pts |
| **5** | 1,720 | 680 | 13.0s | 5 pts · **Code Augment #1** |
| **6** | 2,400 | 780 | 14.6s | 6 pts · **Ultimate (R) Rank 1** |
| **7** | 3,180 | 880 | 16.2s | 7 pts |
| **8** | 4,060 | 980 | 17.8s | 8 pts |
| **9** | 5,040 | 1,080 | 19.4s | 9 pts (First basic skill can hit Rank 5) |
| **10** | 6,120 | 1,180 | 21.0s | 10 pts · **Code Augment #2** |
| **11** | 7,300 | 1,280 | 22.6s | 11 pts · **Ultimate (R) Rank 2** |
| **12** | 8,580 | 1,380 | 24.2s | 12 pts |
| **13** | 9,960 | 1,480 | 25.8s | 13 pts |
| **14** | 11,440 | 1,580 | 27.4s | 14 pts |
| **15** | 13,020 | 1,680 | 29.0s | 15 pts · **Code Augment #3** |
| **16** | 14,700 | 1,780 | 30.6s | 16 pts · **Ultimate (R) Rank 3** |
| **17** | 16,480 | 1,880 | 32.2s | 17 pts |
| **18** | 18,360 | MAX | 33.8s | 18 pts (`5+5+5+3` full) |

---

## 3. Economy, Minions, Jungle, Epics & Shutdown Bounties

- **Starting Gold:** `500g` · **Passive Gold:** `2.4g/s` starting at `0:30` (`144g/min`).
- **Champion Takedowns:** Kill `300g` · Assist pool `150g` (split among assisters who dealt damage within `ASSIST_WINDOW_MS = 10s`) · First Blood `+100g`.
- **Champion Kill XP:** `140 + 30 * victimLevel` shared equally among living enemy champions within `XP_SHARE_RADIUS = 1300 px`.
- **Tower Destruction:** `+120g` to every living/dead teammate (`18` towers + `2` cores on map; `9` towers per team across `3` lanes).
- **Shop & Sell Rules:** `SHOP_ONLY_IN_FOUNTAIN = true` (`FOUNTAIN_RADIUS = 520 px`, or while dead). Selling refunds `75%` of item cost; there is no undo window (`SELL_UNDO_MS = 0`). Fountain heals `12% max HP/s` and `15% max Mana/s`.

### 3.1. Minion Waves, AI & Anti-Pileup Caps
- **Spawn Cadence:** First wave at `0:20` (`WAVE_FIRST_MS = 20000`), subsequent waves every `30s` (`WAVE_EVERY_MS = 30000`), growing **linearly** `+2.5%` HP/DMG per wave (`1 + 0.025 * (wave - 1)`, **capped at `MINION_GROWTH_MAX = 1.85x`** around wave 35 / `17:30` so late-game waves remain clearable).
- **Support Ambient Lane Gold (`NEARBY_MINION_GOLD_PCT = 0.25`):** When a champion last-hits a lane minion, the single lowest-gold nearby ally within `XP_SHARE_RADIUS = 1300 px` (excluding the killer) receives `25%` ambient gold (`~32g/wave = +64g/min`) without reducing the killer's `100%` gold, allowing Supports to stay on item pace without stealing CS.
- **Composition:** `3 Melee + 3 Ranged` per wave; `+1 Siege` every `3` waves. Super Minions (`1.85x HP`, `1.55x DMG`) replace the lead unit in a lane while that lane's enemy Tier-3 Core Firewall (`top_3`, `mid_3`, or `bot_3`) is destroyed (and halt if the Tier-3 Core Firewall respawns).
- **Wave Caps & Spacing (`tuning.js`):** `MINION_SPACING = 48 px`, `MINION_LANE_CAP = 16` per team per lane, `MINION_TOTAL_CAP = 60` server-wide, `MINION_CORE_STOP = 160 px`, `UNIT_REMOVE_MS = 600 ms` death linger.
- **Minion Aggro:** `MINION_AGGRO_RANGE = 520 px`, `MINION_RETARGET_MS = 250 ms`, `MINION_CHAMP_AGGRO_MS = 2500 ms` (switches onto enemy champions attacking allied champions), `MINION_CHASE_RANGE = 700 px`.

| Kind | Name | Base HP | Base DMG | Range | Atk Cadence | Speed | Gold | XP | Size |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `melee` | Robo-Vacuum | 460 | 14 | 70 px | 1250 ms | 170 | 21g | 60 XP | 46 |
| `ranged` | Project Bot | 300 | 24 | 330 px | 1550 ms | 170 | 15g | 30 XP | 42 |
| `siege` | Printer Tank | 950 | 42 | 320 px | 2000 ms | 170 | 60g | 92 XP | 60 |

### 3.2. Jungle Camps (12 Camps Total: 4 Quadrants x 3 Camps Each)
- **Spawn & Leash:** Initial spawn at `0:15` (`CAMP_SPAWN_MS = 15000`); `CAMP_LEASH_RADIUS = 620 px` (`MONSTER_SPEED = 300`, `MONSTER_RETURN_SPEED = 600`, `MONSTER_REACH = 70 px`; leashed monsters regenerate `50% max HP/s` on return).
- **Time-Based Camp & Epic Scaling (`campScaleAt(matchMs, epic)` in `shared/moba/rules.js`):**
  - **Jungle Camps (`epic = false`):** Start gentler at `0:00` (`0.68x HP`, `0.58x DMG`) so Lv 3 junglers clear their opening route cleanly, then scale linearly per match minute: `hpMul = min(2.1, 0.68 + mins * 0.08)`, `dmgMul = min(1.85, 0.58 + mins * 0.075)`, and `rewardMul = min(1.5, 1 + mins * 0.03)` applied to both Gold and XP.
  - **River Epics (`epic = true`):** Spawn at `1.0x` on first appearance (`3:00`), then scale after minute 3: `hpMul = min(1.8, 1 + max(0, mins - 3) * 0.06)` and `dmgMul = min(1.5, 1 + max(0, mins - 3) * 0.04)`.
- **Symmetry:** Blue Top-Jungle (`tj_*`, Robot variants) and Blue Bot-Jungle (`bj_*`, Bug variants) mirror identically to Red side (`6` Blue + `6` Red = `12` camps).
- **Buff Camps:** Each quadrant's `big` camp (`tj_big` top-side = Blue Buff; `bj_big` bot-side = Red Buff) spawns `1` Legacy Mainframe.

| Camp Type | Variants (Top / Bot) | Mobs/Camp | Camps on Map | HP | DMG | Gold/Mob | XP/Mob | Respawn |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `small` | Coffee Drones / Loose Bugs | 3 | 4 (12 mobs) | 320 | 16 | 15g | 40 XP | 60s |
| `medium` | Shredder Bots / Legacy Beetles | 2 | 4 (8 mobs) | 720 | 28 | 40g | 90 XP | 75s |
| `big` | Legacy Mainframe | 1 | 4 (4 mobs) | 1500 | 48 | 110g | 200 XP | 90s |

### 3.3. River Epic Objectives (Economy vs. Pure Siege Split)
- **Strategic Differentiation:** `Golden Bug` delivers a **pure Economic spike** (`+200g` per teammate, `300 XP`, no combat/siege buff), whereas `The Deadline` grants half the gold (`+100g` per teammate, `400 XP`) plus a **pure Siege & Wave buff (`90s`, `+40%` minion HP/DMG and `+20%` structure damage — `0%` champion-vs-champion damage amp)** so winning a Deadline fight accelerates tower pushes without inflating PvP snowball damage. `EPIC_LEASH_RADIUS = 900 px`; `The Deadline` slam cleaves within `DEADLINE_CLEAVE_RADIUS = 150 px`.

| ID | Boss | HP | DMG | Atk Cadence | Team Gold | XP | First / Respawn | Strategic Buff |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `golden` | ✨ THE CEO'S GOLDEN BUG | 2600 | 40 | 1300 ms | +200g/teammate | 300 XP | 180s / 180s | Pure Economy (`+200g` team-wide / `1,000g` swing) |
| `deadline` | ⏰ THE DEADLINE | 4500 | 110 | 1700 ms | +100g/teammate | 400 XP | 360s / 240s | Pure Siege (`+20%` struct dmg + `+40%` minion HP/DMG for `90s`; `0%` PvP amp) |

### 3.4. Kill Streak & Shutdown Bounty Table
| Victim Consecutive Streak | Shutdown Bonus | Total Kill Gold |
| :---: | :---: | :---: |
| 0 – 2 | +0g | 300g |
| 3 | +150g | 450g |
| 4 | +300g | 600g |
| 5 | +450g | 750g |
| 6+ | +600g | 900g |

---

## 4. Structures, Tower AI, Ward Trinket & Heal Relics

- **Structure HP & Armor:** Tier-1 Tower `2100 HP` / `40 Armor`; Tier-2 Tower `2500 HP` / `40 Armor`; Tier-3 Core Firewall (`top_3`, `mid_3`, `bot_3`) `2900 HP` / `40 Armor`; Production Server Core `5000 HP` / `30 Armor`.
- **Tower & Core Combat / Aggro:**
  - **Towers:** `range = 600 px`, `atkMs = 1000 ms`, `dmgChampByTier = { T1: 155, T2: 195, T3 Core Firewall: 260 }` (`+25%` per consecutive hit on the same champion, capped at `TOWER_MAX_RAMP_HITS = 6` -> `+150%` max, up to `650/shot` on Tier-3 Core Firewall on both server & `OfflineSim`), `dmgMinionPctMaxHp = 28%` max HP.
  - **Production Server Core (`CORE`):** Defends itself with `range = 640 px`, `atkMs = 950 ms`, `dmgChamp = 300` (`+25%` per consecutive hit, capped at `6` stacks -> up to `750/shot`), `dmgMinionPctMaxHp = 32%` max HP, bush vision inside `640 px`, and live target laser + danger range ring.
  - **Targeting Priority:** Both Towers and Production Server switch immediately to any enemy champion damaging an ally within `TOWER_AGGRO_VICTIM_PAD = 200 px` over the last `TOWER_AGGRO_MS = 2000 ms` with a red Warning Laser, else enemy minions first, else nearest enemy champion.
- **Tier-3 Core Firewall Respawn (`TOWER.tier3RespawnMs = 180000 ms`):** Each destroyed Tier-3 Core Firewall (`top_3`, `mid_3`, `bot_3`) rebuilds automatically after `180s` (`3 min`) at full `2900 HP`, halts Super Minions in that lane, and re-locks the Production Server's invulnerability shield if all 3 Tier-3 Core Firewalls are standing again.
- **Backdoor Protection & Crunch Time:** Structures take `0.40x` damage (`BACKDOOR_DAMAGE_MUL = 0.4`) without allied minions within `BACKDOOR_RADIUS = 700 px`. After `30:00` (`CRUNCH_MS`), backdoor guard disables and structures take `2.0x` damage (`CRUNCH_STRUCT_MUL = 2`) in both `TeamRoom` and `OfflineSim`.
- **Tower Heal Relics:** `6` orbs behind Tier-1 towers restore `18% max HP + 15% max Mana` (`60s` respawn).
- **Jungle Buffs (75s):** Top-side big camp -> **Blue Buff** (`+3%` max mana/s regen, `+15%` Haste in the capped `40%` Haste pool); Bot-side big camp -> **Red Buff** (`+18` burn dmg, `20%` slow for `1.5s`).
- **Ward Trinket (Key `[4]`):** Free stealth ward (`750 px` sight radius, `550 px` cast range, `45s` duration, `90s` cooldown, max `2` active wards per player; wards placed inside bushes reveal enemies hiding in that bush).

---

## 5. Bot AI Architecture & Decision Mechanics

### 5.1. Online Server Bots (`server/game/moba/MobaBots.js`)
- **Authoritative Parity & Zero-Cheat Vision:** Every bot acts strictly through the room's public intent handlers (`_doOrder`, `_doCast`, `_doBuy`, `_doRecall`), obeying identical cast range, mana, cooldown, stun/root, wall-collision, and fountain-shop rules. Enemy sensing filters through `room.canSee(team, e, now)` so bots never see enemies hidden in Fog of War or unwarded bushes.
- **Role-Based Pick & Spell Assignment:** Bots fill open seats per `ROLE_ORDER` (`top`, `jungle`, `mid`, `bot`, `support`) using `ROLE_PICKS`, and equip role Summoner Spells (`ROLE_SPELLS`).
- **Static Skill Classification (`SkillEngine.classifySkill`):** On spawn, each bot statically tags its `Q/W/E/R` skills (`damage`, `cc`, `hardCC`, `heal`, `shield`, `defensive`, `steroid`, `speed`, `mobility`, `selfCentered`, `allies`, `zone`, `fan`, `knockback`, `wallStun`, `atPet`, `petBuff`) so all 18 champions use generic tactical rules without hardcoded per-champion scripts.

#### Adaptive MMR & Custom Room Bot Difficulty Tiers (`BOT_SKILL` & `BOT_SKILL_MMR`)
In Quick Play, the server selects difficulty from the match's average human MMR (`botSkillFor(avgMmr)`; bots-only matches default to `normal`). In **Custom Rooms**, rooms default to **`easy`** and only the **host** (`hostId`) can cycle `easy` / `normal` / `hard` via the `BOT` button (hotkey `B`, message `botLevel`). Skillshot aim error scales with `(1 - aim) * 130 px`:

| Tier | Trigger MMR / Custom | Think Cadence | Aim / Aggro | Cast Prob | Summoner Spells | Retreat HP (Solo / Outnumbered) | Fight Min HP | Danger Ratio | Human Grace / Gank Grace | Mercy Rule |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Easy** | `< 1050` (Custom default) | `480–680 ms` | `0.25–0.50` / `0.35–0.65` | `45%` | Off | `28%` / `48%` | `40%` | `1.4x` | `5:00` / `5:00` | `2` deaths in `180s` |
| **Normal** | `1050–1199` | `300–440 ms` | `0.50–0.75` / `0.50–0.80` | `68%` | On | `22%` / `42%` | `34%` | `1.65x` | `2:00` / `2:00` | `3` deaths in `120s` |
| **Hard** | `>= 1200` | `170–250 ms` | `0.80–0.96` / `0.70–0.95` | `90%` | On | `16%` / `35%` | `25%` | `2.0x` | `0:00` / `0:00` | Disabled (`Infinity`) |

*Note: Newcomer Grace & Mercy Rules immediately lift for `4s` (`PROVOKED_MS = 4000 ms`) whenever a human damages the bot.*

#### Power & Danger Formula
Each bot evaluates local fight odds using `_power(c)` and `_localPowers(team, x, y, r)`:
- `ChampionPower = (0.3 + hpPct) * (level + 3) * (1 + itemGold / 4000)`
- Allied towers within range contribute `TOWER_POWER = 18` (~a mid-game champion).
- If `enemyPower > allyPower * tier.danger` (and the bot cannot guarantee an immediate burst kill on a low-HP target within `range + 60 px`), the bot enters `backoff` mode toward its nearest allied tower.

#### 8-Priority Per-Tick Brain State Machine (`_think`)
1. **Dead / Fountain Shopping & Healing:** Purchases next affordable item along `CHAMPIONS[id].build` (utilizing Basic -> Core combine discounts) and waits in fountain until `>= 90%` HP (`BASE_HEAL_TO = 0.90`) and `>= 50%` Mana unless enemies threaten within `1000 px`.
2. **Recall Safety Check:** Holds position while recalling; aborts immediately if a visible enemy champion closes within `800 px`.
3. **Tower Aggro Step-Out & Dive Evaluation:** Steps outside enemy tower range (`TOWER.range + 160`) if focused unless committed to a valid tower dive (`Lv >= 3`, lone target `<= 35%` HP, no enemy ally within `900 px`).
4. **Low-HP Retreat & Escape Spells:** Flees toward fountain when below tier `retreatHp` (or `retreatOut` when outnumbered), casting `Alt+Tab` Flash (`<= 22%` HP), `Overtime` Ghost (`<= 45%` HP), `Ctrl+Z` Barrier (`<= 32%` HP), or mobility dashes.
5. **Rich Recall to Shop:** Recalls from a quiet lane once holding `>= 850g` (`RECALL_GOLD_MIN`) and able to afford the next build item.
6. **Danger Evaluation & Local Combat:** Engages optimal visible target using wall-aware dashes (skipping dashes that hit walls immediately), `wallStun` knockback priority (aiming targets toward nearby walls), `at: 'pet'` Shockwave triggers when enemies stand near Servo, `Coffee Break` Heal (`<= 28%` self / `<= 20%` ally), `Escalate` Ignite (`<= 45%` foe HP), and `kill -9` Smite (contests epics within `2600 px`).
7. **Team Macro Coordinator (`_plan` every `1000 ms`):**
   - **Defend:** Prioritizes highest-tier structure taking champion damage (`<= 2200 px` response radius in early game).
   - **River Epics:** Commits when `>= 3` allies alive, average HP `> 50%`, and average level meets threshold (`Golden Bug >= Lv 3`, `Deadline >= Lv 6`; drops attempt after `60s` timeout with `25s` cooldown).
   - **Late-Game Group Push:** Rallies all 5 bots to push the weakest lane after `10:00` (`GROUP_AFTER_MS`) or once `>= 3` enemy towers fall (re-evaluated every `45s`).
8. **Role Default Loop:**
   - **Laners (`top` / `mid` / `bot`):** Hold behind allied wave, prioritize last-hitting/pushing, and siege unlocked towers alongside minions (push-through mode engages after `3:30` to prevent lane stalemates).
   - **Jungler:** Clears quadrant camps sequentially; attempts first gank after initial camp (`0:40–1:00`, subsequent ganks every `12–20s`, `GANK_MIN_SCORE = 0.05`) and joins tanked tower sieges within `3000–5000 px` after `2:00`.
   - **Support:** Shadows bot-lane marksman, applies ally heals/shields/speed buffs, and peels melee divers.
- **Bot Rollback Voting:** When a human calls a `ROLLBACK` vote, bots cast their vote `800–3000 ms` later (`VOTE_BOT_DELAY_MS`) and vote **YES** if their team trails by `>= 10` kills (`VOTE_BOT_KILL_GAP`) or has lost more structures than the enemy.

### 5.2. Offline Practice Bots (`src/entities/moba/OfflineSim.js`)
- Runs a lightweight local brain (`350–650 ms` cadence) so offline matches exercise every HUD, Fog of War, and combat path:
  - Retreats below `25%` HP outside base; waits in fountain until `>= 95%` HP.
  - Auto-spends skill points on level-up (`R > Q > W > E`) and automatically selects the first rolled Code Augment at Levels `5 / 10 / 15`.
  - Uses Summoner Spells (`heal` / `barrier` / `ignite` / `smite`), engages nearest visible enemy within `range + 380 px` (`25%` skill cast chance/tick), or patrols lane structures / allied jungle camps.

---

## 6. Match Lifecycle, Reconnect & Rollback Surrender

- **Phases:** `lobby` (`30s` base, `+10s` per later join up to `45s` max, `3s` when all 10 human seats fill) -> `select` (`30s` draft timer, bots lock in `1–3s`, `1.5s` all-locked fast-forward) -> `loading` (`2.5s`) -> `playing` -> `ended` (`20s` victory linger).
- **Reconnect & Abandonment:** Human seats remain reserved for the entire match (`TEAM_RECONNECT_GRACE_S = 300s` client auto-retry). If zero humans remain connected for `5 min` (`ABANDON_MS`) or all seats explicitly leave (`10s`, `ABANDON_EMPTY_MS`), the room closes cleanly.
- **Rollback Surrender Vote:** Available from `12:00` (`ROLLBACK_FROM_MS = 720000 ms`). Vote remains open `20s`, requires `>= 4/5` YES votes with **zero human NO vetoes** (`ROLLBACK_NEED = 4`), and enforces a `180s` team cooldown after any failed vote.


---

## 7. Simulation Tick Execution Order (`TeamRoom` & `OfflineSim`)

Every `50 ms` (`20 Hz`), the authoritative simulation advances `dt = min(0.1, elapsedSec)` in a deterministic sequence:

1. **Scheduled Timers:**
   - Epic objective spawn timers (`golden` at `180s`, `deadline` at `360s`, plus respawn timers).
   - Delayed ranged auto-attack / tower projectile resolution callbacks and `SkillEngine` delayed `circle` / `zone` ticks.
2. **Minion Wave Spawner:**
   - Checks `now >= _nextWaveAt` (`20s` initial, `30s` cadence).
   - Enforces `MINION_LANE_CAP = 16` per team/lane and `MINION_TOTAL_CAP = 60` server-wide.
   - Applies `1 + 0.025 * (wave - 1)` scaling and `DEADLINE_MINION_HP_MUL = 1.4` (`+40%` HP/DMG) when `The Deadline` siege buff is active.
3. **Unit Tick (`_unitTick`):**
   - **Wards (`kind === 'ward'`):** Despawns when `t >= _expiresAt` (`45s`).
   - **Pets (`kind === 'pet'`):** Follows owner `110 px` behind at `1.15x` owner MS; teleports if distance `> PET_LEASH = 900 px`; attacks owner's target or last champion hit within `3.0s`.
   - **Minions:** Scans `MINION_AGGRO_RANGE = 520 px` (`MINION_RETARGET_MS = 250 ms`), prioritizes enemy champions who damaged an ally within `2.5s`, drops chase past `700 px`, and stops `160 px` from an invulnerable enemy core.
   - **Jungle Monsters & Epics:** Evaluates `CAMP_LEASH_RADIUS = 620 px` (`EPIC_LEASH_RADIUS = 900 px`); resets home at `600 px/s` while regenerating `50% max HP/s`.
4. **Tower Tick (`_towerTick`):**
   - Scans `TOWER.range = 600 px` (squared distance).
   - Priority 1: Enemy champion that damaged an allied champion within `2.0s–2.5s` inside `TOWER_AGGRO_VICTIM_PAD`.
   - Priority 2: Nearest visible enemy minion in range.
   - Priority 3: Nearest visible enemy champion in range.
   - Resets ramp counter (`_rampCount`) when switching off a champion.
5. **Champion Tick (`_champTick`):**
   - Dead check -> `_respawn(c)` at fountain when `t >= respawnAt`.
   - Heal Relic pickup check (`68 px` radius, `18% HP + 15% Mana`, `60s` CD).
   - Active buff & DoT resolution (`coffee`, `blueBuff`, `redBuff`, `deadline`, `ghost`, `ignited` `500 ms` True Damage ticks).
   - Bush entry/exit transitions (`Bush Hacker` `12s` CD reveal, `Shadow Ops` `+20%` MS).
   - Shield expiration (`t > _shieldUntil`), passive HP/Mana regen (`4x` OOC or `12%/15%` in fountain + flat `manaRegen`), passive gold (`2.4g/s` after `0:30`).
   - Recall channel completion (`4.0s`, or `2.6s` with `Recall Optimization`) -> teleports to fountain and snaps pet.
   - Displacement / Stun gate (`_dispUntil > t` or `stunnedUntil > t` blocks movement and orders).
   - Bot AI decision (`_think` / `_botThink`), followed by path-smoothed movement (`nav.findPath`) or basic attack execution (`1000 / as`).
6. **Visibility & Interest Pass (`_updateBushes` / `StateView`):**
   - Updates `inBush` tags for all units and champions and refreshes per-team `StateView` visibility at `20 Hz`.

---

## 8. Worked Combat & Economy Calculation Examples

### 8.1. Shred -> Penetration -> 60% Cap Example
- **Scenario:** Lv 18 `Stack` (`114.2` base Armor + `140` item Armor + `15` Failover Armor = `269.2` Armor) is marked by `Lint` (`Strict Audit`: `15%` shred) and hit by `Tester` with `Root Sudo` (`30%` Armor Pen) for `400` raw physical damage.
- **Step 1 (Shred):** `269.2 * (1 - 0.15) = 228.82` Armor.
- **Step 2 (Penetration):** `228.82 * (1 - 0.30) = 160.17` Armor.
- **Step 3 (Cap Check):** `269.2 * 0.40 = 107.68`. Since `160.17 >= 107.68`, `EffectiveArmor = 160.17`.
- **Step 4 (Mitigation):** `PostResist = 400 * 100 / (100 + 160.17) = 153.75` physical damage.

### 8.2. Critical Strike & `2.0x` Non-Crit Amplification Cap Example
- **Scenario:** `Tester` lands a 3rd basic attack (`JIT Compiler` `1.60x` crit + `Regression Mark` `1.35x`) against a stunned target below `25%` HP (`Git Blame Gauntlet` `1.15x` + `Execution Protocol` `1.14x` + `Crowd Control` `1.15x`), with `BaseAfterResist = 200`.
- **Crit Separation (`didCrit = true`):** `1.60x` critical base is `200 * 1.60 = 320`.
- **Uncapped Non-Crit Passive Product:** `1.35 * 1.15 * 1.14 * 1.15 = 2.0354x`, yielding `320 * 2.0354 = 651.34`.
- **Ceiling Check:** `AmpCeiling = (200 * 1.60) * 2.0 + 40 = 680` (`3.20x` effective crit multiplier + `40` flat buffer; non-crit hits cap at `200 * 2.0 + 40 = 440`). Since `651.34 <= 680`, the `+40` buffer absorbs the marginal overage, whereas stacking additional multipliers (e.g., `Hotfix Fury` + `Overclock`) clamps cleanly at `680`.

### 8.3. Unified Cooldown Reduction Example (`40%` Haste vs `54.4%` Total CDR)
- **Scenario:** `Ops` owns `Rubber Duck` (`20%`) + `Team Lunch` (`15%`) + `Headphones` (`10%`) = `45%` raw item haste, plus `Blue Buff` (`15%`). Casts Rank 5 `Auto-Heal` (`11s` base CD) and Rank 3 `Blue-Green Deploy` (`90s` base CD).
- **Haste Cap:** `min(0.40, 0.45 + 0.15) = 0.40`.
- **Rank 5 `Auto-Heal` (`54.4%` Effective CDR):** `11,000 * (1 - 0.40) * (1 - 4 * 0.06) = 6,600 * 0.76 = 5,016 ms` (`5.02s`).
- **Rank 3 `Blue-Green Deploy` (`47.2%` Effective CDR):** `90,000 * (1 - 0.40) * (1 - 2 * 0.06) = 54,000 * 0.88 = 47,520 ms` (`47.52s`).

### 8.4. 3-Stage Hard CC Diminishing Returns & Immunity Chain
- **Scenario:** Enemy hits `Stack E` (`0.60s` Stun) -> `1.0s` later `Hira R` (`1.00s` Stun) -> `1.0s` later `Lint W` (`1.05s` Root) -> `0.1s` later `Brick E` (`1.00s` Wall-Stun).
- **Hit 1 (`Stack E`):** `0.60s * 1.00 = 0.600s` Stun (`_ccChainCount = 1`, window expires at `t + 4.0s`).
- **Hit 2 (`Hira R`):** Within `4.0s` -> `1.00s * 0.50 = 0.500s` Stun (`_ccChainCount = 2`, window resets to `t + 4.0s`).
- **Hit 3 (`Lint W`):** Within `4.0s` -> `1.05s * 0.25 = 0.263s` Root (`_ccChainCount = 3`, triggers `2.0s` Hard CC Chain Immunity until `t_hit3 + 0.263s + 2.0s`, resetting `_ccChainCount = 0`).
- **Hit 4 (`Brick E` Wall-Stun):** Blocked by Chain Immunity (`0.000s` Stun).
- **Total Hard CC:** Capped at **`1.363s` (`1.36s`)** (down from `3.65s` raw / `2.175s` prior DR), eliminating `2+` second stun-locks before follow-up damage kills without counterplay.

---

## 9. Bot AI Sub-Systems Deep-Dive (`MobaBots.js`)

- **Target Scoring (`_pickFight`):** Filters visible enemy champions within engage range; skips protected humans during `graceMs` or after `mercyDeaths` unless `PROVOKED_MS` (`4s`) is active. Scores candidates by low HP %, isolation, and role priority (carries/mages prioritized over tanks).
- **Skill Geometry Selection (`_engage`):**
  - **Wall-Pin Knockbacks:** For skills tagged `wallStun`, projects `clipMove` along the knockback vector from `caster -> target`; boosts cast priority when a wall lies within `knockback.dist`.
  - **Safe Dashes:** For non-`toTarget` mobility dashes, checks `clipMove` clearance so bots never dash face-first into a blocking wall.
  - **Pet Ult (`at: 'pet'`):** Evaluates enemy proximity to `Servo` rather than `Volt`'s own position.
- **Last-Hitting & Wave Control (`_lane`):** Laners position behind their allied minion frontline, prioritize minions below killable auto-attack HP for last-hit gold, and step back immediately if enemy minions aggro onto them (`MINION_CHAMP_AGGRO_MS`).
- **Jungle Clear & Gank Triggers (`_jungle`):** Clears `small -> medium -> big` quadrant camps; scores lane gank opportunities by enemy extension distance from tower and HP deficit (`>= GANK_MIN_SCORE = 0.05`).
- **Support Tethering (`_support`):** Follows the allied bot-lane carry within `350–500 px`, prioritizes `Coffee Break` / ally heals when carry drops below `65%` HP, and saves Hard CC skills to peel approaching melee champions.


---

## 10. Complete Tunables & Constants Reference (`rules.js` & `tuning.js`)

### 10.1. Core Simulation & Lobby Constants (`shared/moba/rules.js`)
| Constant | Value | Purpose |
| :--- | :---: | :--- |
| `TEAM_SIZE` | `5` | Players per side (`5v5`, bots fill open seats) |
| `TICK_MS` | `50 ms` | Authoritative `20 Hz` simulation step |
| `LOBBY_MS` / `LOBBY_JOIN_EXTEND_MS` | `30,000` / `10,000 ms` | Queue base wait and per-join extension |
| `LOBBY_MAX_MS` / `LOBBY_FULL_MS` | `45,000` / `3,000 ms` | Max lobby wait and full-10-human fast start |
| `SELECT_MS` / `LOADING_MS` | `30,000` / `2,500 ms` | Champion select timer and loading screen |
| `MAX_LEVEL` / `ULT_UNLOCK_LEVEL` | `18` / `6` | Level cap and R unlock level |
| `START_GOLD` / `PASSIVE_GOLD_PER_SEC` | `500g` / `2.4g/s` | Starting gold and passive income after `30s` |
| `KILL_GOLD` / `ASSIST_GOLD` / `FIRST_BLOOD_BONUS` | `300g` / `150g` / `+100g` | Champion takedown rewards |
| `TOWER_GOLD_TEAM` / `ASSIST_WINDOW_MS` | `120g` / `10,000 ms` | Global tower gold and assist credit window |
| `XP_SHARE_RADIUS` / `KILL_XP_BASE` | `1,300 px` / `140 + 30*Lv` | XP proximity sharing and kill XP formula |
| `RECALL_MS` / `FOUNTAIN_RADIUS` | `4,000 ms` / `520 px` | Base recall channel and shop/heal zone |
| `FOUNTAIN_HEAL_PER_SEC` / `FOUNTAIN_MANA_PER_SEC` | `12%` / `15%` | Fountain regeneration rates per second |
| `FOUNTAIN_LASER_DPS` | `1200` True DPS | Anti-spawn-camp laser inside enemy fountain |
| `INVENTORY_SLOTS` / `SELL_REFUND_PCT` / `SELL_UNDO_MS` | `6` / `75%` / `0 ms` | Inventory capacity and sell rules; no undo window |
| `MAX_HASTE_PCT` | `0.40` (`40%`) | Hard cap on combined Item + Blue Buff Haste |
| `CC_DR_WINDOW_MS` / `CC_DR_MUL` | `4,000 ms` / `[1, 0.5, 0.25]` | 3-stage Hard CC Diminishing Returns (`stun`, `root`, `wallStun`) |
| `CC_IMMUNE_AFTER` / `CC_IMMUNE_MS` | `3` hits / `2,000 ms` | Hard CC Chain Immunity window granted after 3rd Hard CC resolves |
| `WARD` | `45s / 90s CD / 750 px / max 2` | Free Vision Ward Trinket (`[4]`) |
| `OUT_OF_COMBAT_MS` | `6,000 ms` | Delay before `4x` OOC HP/Mana regen activates |
| `ATK_PROJ_SPEED` | `1,500 px/s` | Ranged auto-attack & tower projectile speed |
| `BACKDOOR_RADIUS` / `BACKDOOR_DAMAGE_MUL` | `700 px` / `0.40x` | Structure protection without nearby minions |
| `CRUNCH_MS` / `CRUNCH_STRUCT_MUL` | `30 min` / `2.0x` | Late-game stalemate breaker |
| `KNOCKBACK_MS` / `BUSH_REVEAL_MS` | `200 ms` / `1,500 ms` | Displacement duration and bush attack reveal |
| `PET_SPEED_MUL` / `PET_LEASH` / `PET_OWNER_HIT_MEMORY_MS` | `1.15x` / `900 px` / `3,000 ms` | Companion pet follow, leash, and target memory |
| `ROLLBACK_FROM_MS` / `ROLLBACK_VOTE_MS` / `ROLLBACK_NEED` | `12:00` / `20s` / `4/5` | Surrender vote eligibility and quorum |
| `ABANDON_MS` / `ABANDON_EMPTY_MS` | `5 min` / `10s` | Room shutdown timers when humans disconnect |

### 10.2. Server-Only Simulation Constants (`server/game/moba/tuning.js`)
| Constant | Value | Purpose |
| :--- | :---: | :--- |
| `MAX_HUMANS` / `PATCH_MS` | `10` / `50 ms` | Max human players per room and patch cadence |
| `MAX_ATTACK_SPEED` / `MIN_MOVE_SPEED` | `2.5 /s` / `90 px/s` | Attack speed ceiling and minimum slowed MS |
| `RANGE_SLACK` / `TARGET_CAST_SLACK` | `12 px` / `30 px` | Latency tolerance on attack and targeted casts |
| `UNIT_REMOVE_MS` / `COFFEE_MAX_STACK` | `600 ms` / `3` | Corpse linger and Coffee regen stack limit |
| `TOWER_AGGRO_MS` / `TOWER_AGGRO_VICTIM_PAD` | `2,000 ms` / `200 px` | Tower champion-defense aggro window |
| `TOWER_MAX_RAMP_HITS` | `6` (`+150%` max) | Tower consecutive-hit damage ramp limit |
| `MINION_LANE_CAP` / `MINION_TOTAL_CAP` | `16` / `60` | Anti-pileup minion spawn caps |
| `CAMP_SPAWN_MS` / `EPIC_LEASH_RADIUS` | `15,000 ms` / `900 px` | Initial camp spawn and epic boss leash radius |
| `DEADLINE_CLEAVE_RADIUS` | `150 px` | Splash radius on `The Deadline` boss slams |
| `MAX_FAN_COUNT` / `MIN_ZONE_TICK_MS` | `15` / `100 ms` | Sanity caps on projectile fans and DoT zones |
| `INTEREST_RADIUS` / `VIEW_GC_MS` | `1,600 px` / `1,000 ms` | Event broadcast radius and `StateView` GC interval |
| `TEAM_RECONNECT_GRACE_S` | `300s` | Client auto-reconnect retry window |

---

## 11. Combat & Simulation Edge-Case Resolution Matrix

- **Simultaneous Kill / Projectile in Flight:** If a champion dies while their ranged auto-attack or skillshot is mid-flight, projectiles already spawned continue to travel and deal damage (`_damage` checks target aliveness, not projectile owner aliveness); lifesteal heals only if `!src.dead`.
- **Stasis (`Debugger Breakpoint`) Interactions:**
  - While `_stasisUntil > t`, target takes `0` damage from all sources (including True Damage, `Ignite` ticks, and Tower shots) and cannot move, attack, or cast skills.
  - Existing delayed telegraphs (`Pixel R`, `Model R`) still detonate on schedule; targets in Stasis ignore the hit.
- **Stealth (`Shadow Proxy`) Interactions:**
  - Grants `1.8s` stealth (`_stealthUntil`); enemy champions within `280 px` detect the stealthed unit normally.
  - Any basic attack, skill cast, or Summoner Spell cast calls `_reveal(c)`, immediately clearing `_stealthUntil = 0` and revealing the champion for `1500 ms` if inside a bush.
- **Recall Interruption:** Taking any post-shield/post-mitigation damage, receiving a `move`/`attack` order, casting a skill, or being stunned/displaced immediately cancels `recallUntil = 0`.
- **Shield Expiration vs. Damage:** Timed shields expire cleanly when `t > _shieldUntil`; `Stack`'s `Load Balancer` shockwave (`80 + 40% armor` in `190 px`) triggers only when enemy damage breaks an active shield (`hadShield && target.shield <= 0`), not on passive timer expiration.
- **Backdoor Transition:** Evaluated dynamically on every hit against a tower or core (`_hasMinionNear` within `700 px`); if the last allied minion dies mid-siege, subsequent hits immediately drop to `0.40x` until the next wave arrives or `30:00` Crunch Time activates.


---

## 12. Ranked Ladder, MMR & Match Scoring (`shared/moba/ranks.js`)

Team Mode uses a dual-rating system separating hidden skill matchmaking (`mmr`) from visible progression (`rating` / LP / Stars):

- **Hidden MMR (`MMR_START = 1000`):** Pure Elo computed on team averages (`BOT_RATING = 1000` per bot seat), ensuring balanced matches and feeding `botSkillFor(avgMmr)` (`Easy < 1050`, `Normal 1050–1199`, `Hard >= 1200`).
- **Visible Rank (`RATING_START = 700 = RANK_FLOOR`):** Starts at **Intern IV · 0 LP** and never drops below `RANK_FLOOR`.
- **Catch-Up Multiplier (`CATCH_UP_SPAN = 150`):** Every `150` points of `(mmr - rating)` grants `+100%` LP gain on wins (up to `3x`) and reduces losses down to `0.25x` so visible rank converges rapidly toward true MMR.
- **Placement Phase (`PLACEMENT_GAMES = 5`):** First 5 matches use `K_PLACEMENT = 48` (`2x` standard `K_RANKED = 24`).
- **Divisions & Stars:** Tiers **Intern** through **Principal** each span `4` divisions (`IV -> I`) of `DIV_SPAN = 50` rating (`100 LP`, `5` stars at `20 LP` per star). **CTO** (`1900+`) has no divisions and counts total stars (`★ × n`).

| Tier | Min Rating | Divisions | Badge Color |
| :--- | :---: | :---: | :---: |
| **Intern** (`intern`) | `700` | IV – I | `#9aa7b4` |
| **Junior** (`junior`) | `900` | IV – I | `#7ed957` |
| **Mid-level** (`mid`) | `1100` | IV – I | `#39c2ff` |
| **Senior** (`senior`) | `1300` | IV – I | `#b084ff` |
| **Staff** (`staff`) | `1500` | IV – I | `#ffd23f` |
| **Principal** (`principal`) | `1700` | IV – I | `#00e5ff` |
| **CTO** (`cto`) | `1900` | Uncapped Stars | `#ff4fa3` |

---

## 13. Buffs, Status Tags & Fountain Rules Reference

### 13.1. Synced Champion Status Tags (`ch.buffs`)
- `recall`: Active `4.0s` (`2.6s` with `Recall Optimization`) channel to fountain.
- `coffee`: Active Coffee consumable regen (`160 HP` + `70 Mana` over `6s`, max `3` stacks).
- `blueBuff`: `75s` top-side `big` camp buff (`+3%` max mana/s regen + `+15%` Haste in `40%` Haste pool).
- `redBuff`: `75s` bot-side `big` camp buff (`+18` bonus damage + `20%` slow for `1.5s` on hit).
- `deadline`: `90s` pure-siege team buff from `The Deadline` (`+20%` structure damage + `+40%` minion wave HP/DMG; `0%` champion PvP amp).
- `ghost`: Active `Overtime` Summoner Spell (`+35%` MS + unit collision ignore for `6.0s`).
- `ignited`: Active `Escalate` DoT (`60 + 20/lv` True Damage over `5.0s` + `-50%` healing).

### 13.2. Fountain Safe Zone & Anti-Spawn-Camp Rules
- **Radius & Healing (`FOUNTAIN_RADIUS = 520 px`):** Allied champions inside their fountain regenerate `12% max HP/s` and `15% max Mana/s` continuously and have full shop/sell access (`SHOP_ONLY_IN_FOUNTAIN = true`).
- **Enemy Fountain Laser (`FOUNTAIN_LASER_DPS = 1200`):** Any enemy champion entering the opposing team's fountain takes `1200` True Damage per second (`FOUNTAIN_FX_MS = 400 ms` hit FX cadence) in both `TeamRoom` and `OfflineSim`, bypassing Armor, MR, and shields to prevent spawn camping.
- **Respawn Reset:** Upon respawn, champion teleports to fountain spawn, resets HP/Mana to `100%`, clears `_nav`, and re-spawns any companion pet (`Servo`).

### 13.3. Complete Combat & Economy Flow Summary
1. **Early Game (`0:00 – 4:00`):** Start `500g`, buy 1 Basic Gear + Coffee, clear first camp (`0:15`) or lane wave (`0:20`), contest `3:00` Golden Bug (`+200g` team-wide), reach Lv 5 Augment #1 (~`2:45`) and Lv 6 Ult (~`4:00`).
2. **Mid Game (`4:00 – 12:00`):** Contest `6:00` The Deadline (`+20%` structure dmg + `+40%` empowered waves, `0%` PvP amp — separated by `3 min` from Golden Bug), complete Core Boots + 2 Core items via Basic -> Core combine discounts, reach Lv 10 Augment #2 (~`8:30` with guaranteed Epic Skill Evolution), transition to `10:00` team pushes.
3. **Late Game (`12:00 – 22:00+`):** `ROLLBACK` surrender opens at `12:00`; reach Lv 15 Augment #3 (~`14:00`), complete 5–6 Core items incl. Active `[1]` (`Stasis` / `Cleanse` / `Veil`), break Core Firewall (`tier 3`) -> Production Server Core, or trigger `30:00` Crunch Time (`2.0x` structure dmg).


---

## 14. Authoritative Bot AI & Simulation Decision Flow

### 14.1. `MobaBots._think(b, ch, now)` Execution Flow
```text
1. if ch.dead -> _shop(b, ch); return
2. if inFountain(ch) -> _shop(b, ch)
3. if ch.recallUntil > 0:
     if nearestEnemyChamp(ch, 800) -> abort recall & move away
     return
4. ctx = _sense(ch, now)   // strictly filtered by room.canSee(ch.team, e, now)
5. _supportCasts(b, ch, ctx, now)   // heal/shield low allies
6. _spellUtility(b, ch, ctx, now)   // Smite epic steal/secure, Heal, Barrier
7. if inFountain && (hp < 90% || mana < 50%) && no enemy < 1000px:
     stop & heal; return
8. if towerShootingMe(ch) && now >= b.diveUntil:
     stepOut(TOWER.range + 160); cast escape skills/spells; return
9. if _shouldRetreat(b, ch, ctx):
     retreat toward fountain + Flash(<=22% HP) / Ghost(<=45% HP); return
10. if _shouldRecallToShop(b, ch, ctx, now):  // >= 850g + next item affordable + safe
     _recall(b, ch, now); return
11. _snipe(b, ch, now)   // long-range finisher check
12. foe = _pickFight(b, ch, ctx, now)   // respects Human Grace & Mercy Rules
13. danger = _danger(ch, ctx)   // enemyPower > allyPower * tier.danger
14. if danger && !(burstKillPossible):
     _backOff(b, ch, ctx, danger, now); return
15. if foe:
     _engage(b, ch, foe, ctx, now); return
16. if _objective(b, ch, ctx, now): return   // Defend / Epic / Group Push
17. role loop: _jungle() | _support() | _lane()
```

### 14.2. `MobaBots._plan(team, now)` Macro Plan Priority
1. **Defend (`plan.defend`):** Scans all living friendly structures hit within the last `3000 ms` with `>= 1` visible enemy champion within `1200 px`; selects the highest-tier threatened structure (`tier 4 Core > tier 3 Firewall > tier 2 > tier 1`).
2. **River Epic (`plan.epic`):**
   - Drops active epic call if alive allies `< 2` or elapsed `> 60,000 ms` (`25,000 ms` cooldown).
   - Starts `deadline` (`avgLevel >= 6`) or `golden` (`avgLevel >= 3`) when `alive >= 3`, `alive >= enemiesAlive - 1`, and `avgHp > 50%`.
3. **Group Push (`plan.group`):**
   - Activates once `matchMs >= 10:00` (`600,000 ms`) or `enemyTowersDown >= 3`.
   - `_pushLane(team)` scores each lane (`+10` per destroyed tower, `+(1 - hp/maxHp)` on standing tower, `+0.5` mid tiebreaker) and refreshes target every `45,000 ms`.

### 14.3. Complete Combat Damage Pipeline (`OfflineSim._damage` & `TeamRoom._dealDamage`)
```text
rawDamage
  ├─► if (trueDmg) -> bypass armor/MR & bypass 2.0x amp cap -> shieldSoak -> applyHP
  └─► else:
        1. Select Resist: Magic -> target.mr (or structure armor) | Physical -> target.armor (+Failover stacks)
        2. Shred: afterShred = Resist * (1 - min(0.60, shredPct))
        3. Pen:   afterPen   = afterShred * (1 - min(0.60, penPct))
        4. Cap:   effResist  = max(Resist * 0.40, afterPen)
        5. BaseAfterResist = rawDamage * 100 / (100 + effResist)
        6. Struct Backdoor: * 0.40 if no allied minions within 700px (or * 2.0 at 30:00 Crunch Time)
        7. Crit (non-pet AA): * 1.60 once if (crit3 || crit20)
        8. Multipliers: Deadline (+20% vs structures only), Champion Passives, Item Passives, Augments
        9. Amp Ceiling: min(dmg, (didCrit ? BaseAfterResist * 1.60 : BaseAfterResist) * 2.0 + 40)
       10. Defensive Mitigation: Fortress (0.90x), Last Stand (0.85x), Pair Shield (0.92x), Buff DR
       11. Shield Soak (CORS Bypass 1.50x vs shield) -> Subtract HP -> Lifesteal -> Kill Check
```


---

## 15. Offline vs. Online Simulation Parity Matrix

To ensure offline practice (`OfflineSim.js`) teaches identical combat timing, tower diving, and macro pacing as online multiplayer (`TeamRoom.js`), every shared gameplay rule below is imported directly from `shared/moba/rules.js`:

| Mechanic | Online (`TeamRoom.js`) | Offline (`OfflineSim.js`) | Parity Status |
| :--- | :---: | :---: | :---: |
| **Simulation Tick** | `50 ms` (`20 Hz`) | `50 ms` (`20 Hz`) | Exact Match |
| **Minion Wave Cadence** | `WAVE_EVERY_MS = 30,000 ms` | `R.WAVE_EVERY_MS = 30,000 ms` | Exact Match |
| **Minion Growth per Wave** | `+2.5%` (`MINION_GROWTH_PER_WAVE`) | `+2.5%` (`R.MINION_GROWTH_PER_WAVE`) | Exact Match |
| **Tower Ramp Cap** | `6` hits (`+150%` max) | `6` hits (`+150%` max) | Exact Match |
| **Backdoor Radius & Multiplier** | `700 px` / `0.40x` | `R.BACKDOOR_RADIUS` / `R.BACKDOOR_DAMAGE_MUL` | Exact Match |
| **Crunch Time (`30:00`)** | `2.0x` struct dmg, backdoor off | `R.CRUNCH_MS` / `R.CRUNCH_STRUCT_MUL` | Exact Match |
| **Damage Channels & Shred -> Pen** | `damageAfterResist` (`60%` cap) | `R.damageAfterResist` (`60%` cap) | Exact Match |
| **Unified Cooldown Formula** | `skillCooldownMs` (`40%` + rank) | `R.skillCooldownMs` (`40%` + rank) | Exact Match |
| **Basic -> Core Item Combine** | `recipePlan` + `applyBuy` | `recipePlan` + `applyBuy` | Exact Match |
| **Epic Spawn Timers** | Golden `3:00` / Deadline `6:00` | Golden `3:00` / Deadline `6:00` | Exact Match |
| **Ward Trinket (`[4]`)** | `750 px` / `45s` / `90s` CD | `750 px` / `45s` / `90s` CD | Exact Match |
| **CC Diminishing Returns** | `applyHardCcDuration` (`[1, 0.5, 0.25]`, `2.0s` immunity @ 3) | `applyHardCcDuration` (`[1, 0.5, 0.25]`, `2.0s` immunity @ 3) | Exact Match |
| **Basic-Attack Crit & Combat Passives** | `crit3`/`crit` (`1.6x`), Champion & Item Passives + `AmpCeiling` | `crit3`/`crit` (`1.6x`), Champion & Item Passives + `AmpCeiling` | Exact Match |
| **River Epics (Economy vs. Siege)** | Golden `200g` / Deadline `100g`, `90s` (`+40%` wave, `+20%` struct, `0%` PvP) | Golden `200g` / Deadline `100g`, `90s` (`+40%` wave, `+20%` struct, `0%` PvP) | Exact Match |

---

## 16. Immediate Gameplay Pacing & Balance Safeguards Applied
1. **Separated Neutral Objective Timers (`3:00` vs. `6:00`):** Moving `The Deadline` first spawn from `4:00` to `6:00` restores a dedicated early laning window before the first team-buff boss fight.
2. **Delayed Bot Grouping (`10:00`):** Moving `GROUP_AFTER_MS` from `8:00` to `10:00` preserves side-lane duels, split-push pressure, and mid-game jungle rotations.
3. **Reduced Kit Overload Outliers:** Lowered `Zero W` damage reduction (`30% -> 20%`), shortened `Pager R` engage reach (`950 -> 820 px`) and stun (`1.2s -> 1.0s`), and removed free stat inflation on `Server Rack Armor`.
4. **Eliminated 2+ Second Hard CC Lockouts:** Trimmed base Hard CC & `wallStun` durations across `Stack`, `Hira`, `Lint`, `Brick`, `Patch`, `Volt`, and `Model`; tightened `CC_DR_MUL` to `[1, 0.5, 0.25]` + `2.0s` Hard CC Chain Immunity after 3 hits; and unified `wallStun`, `OfflineSim.js`, and `TeamRoom.js` on `applyHardCcDuration`.
