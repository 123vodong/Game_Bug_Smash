# Code Augments v1 — Mid-Match Evolution System

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Source:** `shared/moba/augments.js`, `src/entities/moba/OfflineSim.js` (26 augments [common: 8 · rare: 10 · epic: 8], **18/18 champions covered in Epic**, 3 synergies)

---

## 1. Core Rules, Milestone Flow & Selection State Machine

### 1.1. Milestone Triggers & Persistence
- **Milestones (`AUGMENT_LEVELS`):** Level **5, 10, 15** (3 permanent augments per match; persists through death; cannot be bought or sold with gold).
- **Multi-Level Jump Chaining:** If a champion gains enough XP to cross two milestones at once (e.g., Lv 4 -> Lv 10 via debug/epic objective), `_pickAugment` re-invokes `_checkAugmentOffer(c)` immediately after selection so no milestone is ever skipped.
- **Bot Auto-Selection:** In `OfflineSim`, bot champions automatically pick `choices[0]` without opening an offer modal.

### 1.2. Two-Step Rarity Roll, Level 10 Epic Pity & Shared Reroll (`rollAugmentChoices`)
1. **Eligibility Filter:** Exclude all augments already owned by the champion (`owned.has(a.id)`) or currently displayed (`excluded.has(a.id)`), and any augment whose `champs` array excludes `champId`.
2. **Level 10 Epic Skill Evolution Guarantee (`guaranteeEpic`):** At Level `10`, if the champion has not yet acquired their signature **Epic Skill Evolution**, Slot 1 guarantees that Epic Augment before rolling Slots 2 and 3. This eliminates RNG lockout of defining kit evolutions.
3. **Per-Card Tier Roll:** For each remaining card (`picked.length < 3`):
   - Compute `activeTiers` = subset of `['common', 'rare', 'epic']` that still have `>= 1` unpicked eligible augment in `avail`.
   - Sum `totalW = sum(RARITY_WEIGHTS[tier])` across `activeTiers` using **Common `60` · Rare `30` · Epic `10`**.
   - Draw uniform random `r` in `[0, totalW)` to select `chosenTier`.
4. **Uniform Candidate Pick:** Pick uniformly at random from `avail` matching `chosenTier`, remove from `avail` (guaranteeing **zero duplicates** among the 3 cards).
5. **Exhaustion Fallback:** Because `activeTiers` dynamically excludes empty tiers, once a champion owns their Epic Skill Evolution (or it is locked into Slot 1 at Lv 10), remaining slots automatically renormalize weights to `Common 60 / Rare 30` (`66.7%` Common / `33.3%` Rare).
6. **Single Shared Reroll per Milestone (`rerolls: 1`, `3` total per match):** Each milestone grants **1** shared full-offer reroll (`REROLL (1 FREE)` button via `rollAugmentChoices`), preserving strategic adaptation while preventing deterministic 9-reroll synergy farming.

---

## 2. Per-Champion Pool Size & Roll Probabilities

| Champion Group | Eligible Common | Eligible Rare | Eligible Epic | Total Pool (Lv 5) | Epic Sight Odds (Lv 5 / Lv 10 Guaranteed / Match Total) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `pixel`, `zero`, `stack`, `dev`, `courier`, `cleaner` | 8 | 10 | 1 | **19** | `27.1%` (Lv 5) / **`100%` (Lv 10)** / **`100%` per match** |
| `tester`, `appdev`, `sprint`, `oncall`, `guard` | 8 | 9–10 | 1 | **18–19** | `27.1%` (Lv 5) / **`100%` (Lv 10)** / **`100%` per match** |
| `ops`, `barista`, `hr`, `model`, `lint`, `embedded`, `cache` | 8 | 8 | 1 | **17** | `27.1%` (Lv 5) / **`100%` (Lv 10)** / **`100%` per match** |

- *Note on `Merge Cleave` (`rare`) and `Turbo Deploy` (`rare`):* Only champions matching `champs` include these in their Rare pool (`dev`, `guard`, `stack`, `courier` for `Merge Cleave`; 9 dash/blink champions for `Turbo Deploy`).
- *Synergy Completion Odds:* Because each milestone grants `1` full-board reroll (`6` total cards inspected per milestone, `18` across a full match vs. `9` independent slot rerolls previously), players weigh keeping a reliable single card against gambling for a 2-piece Synergy partner (`chain_reaction + overload`, `last_stand + emergency_patch`, or `bush_hacker + ghost_protocol`).

---

## 3. Augment Synergies (2-Piece Combos)
| Synergy ID | Name | Required Augments | Exact Trigger, Bonus & Anti-Recursion Rules |
| :--- | :--- | :--- | :--- |
| `cascade_overflow` | **Cascade Overflow** | `chain_reaction` + `overload` | Every 4th cast (`overload`) bypasses `chain_reaction`'s `6s` internal cooldown once and fires a `55` Magic Damage `140 px` AoE blast around each hit enemy champion. Marked non-recursive so the AoE blast never increments `_castCount` or re-triggers `chain_reaction`. |
| `immortal_hotfix` | **Immortal Hotfix** | `last_stand` + `emergency_patch` | On champion takedown, if owner's HP is `< 35%` max HP prior to the heal, `emergency_patch` heals `+50%` more (`18% -> 27%` missing HP). |
| `shadow_ops` | **Shadow Ops** | `bush_hacker` + `ghost_protocol` | Leaving any bush (`!inBush && c._wasInBush`) grants `+20%` burst move speed for `2s` (`8s` internal cooldown on `c._augCd.shadow_ops`). |

---

## 4. Complete Catalog (26 Augments)

### 4.1. Group A — Combat Augments (6)
| ID | Name | Rarity | Eligible Champions | Effect |
| :--- | :--- | :---: | :--- | :--- |
| `chain_reaction` | **Chain Reaction** | `rare` | All | Skill hits on enemy champions trigger a `140 px` AoE blast for `+55` Magic Damage (`6s` CD per caster). |
| `last_stand` | **Last Stand** | `rare` | All | Dropping below `30%` HP grants `15%` damage reduction for `3s` (`45s` CD). |
| `overload` | **Overload** | `rare` | All | Every 4th skill cast deals `+28%` bonus damage. |
| `execution_protocol` | **Execution Protocol** | `common` | All | Deal `+14%` bonus damage to enemies below `25%` HP. |
| `emergency_patch` | **Emergency Patch** | `rare` | All | Champion takedowns restore `18%` of your missing HP (`27%` with `Immortal Hotfix`). |
| `crowd_control` | **Crowd Control** | `common` | All | Deal `+15%` bonus damage to stunned, rooted, or slowed enemies. |

### 4.2. Group B — Skill Evolution Augments (10: 8 Epic + 2 Rare)
| ID | Name | Rarity | Eligible Champions | Effect |
| :--- | :--- | :---: | :--- | :--- |
| `evo_pixel_split` | **CSS Split-Bolt** | `epic` | `pixel` | Pixel Q (CSS Bolt) splashes `45%` Magic Damage to up to `2` nearby enemies within `260 px` on hit. |
| `evo_stack_lock` | **Cluster Shield** | `epic` | `stack`, `guard` | Casting Ultimate (`R`) grants a `+140` shield (`3.5s`). |
| `evo_tester_barrage` | **CI/CD Pipeline** | `epic` | `tester`, `appdev` | Casting Ultimate (`R`) refunds `35%` of its remaining cooldown. |
| `evo_zero_reset` | **Exploit Chain** | `epic` | `zero`, `dev`, `courier`, `sprint`, `oncall` | Champion kills reset `Q` & `E` cooldowns and restore `30%` max Mana. |
| `evo_ops_field` | **Auto-Scaler Field** | `epic` | `ops`, `barista`, `hr` | Healing or buffing allies pulses an extra `+70 HP` heal to all living allied champions within `450 px`. |
| `evo_model_nova` | **Overfit Nova** | `epic` | `model`, `lint`, `cleaner` | Ultimate casts slow enemies hit by `30%` and shred `15%` armor (`_auditUntil`) for `2.5s`. |
| `evo_volt_overdrive` | **Servo Overdrive** | `epic` | `embedded` | Volt R (`Servo EMP`) empowers Servo with `+45%` attack speed and `+35%` Magic Damage for `4s`. |
| `evo_cache_prefetch` | **Branch Predictor** | `epic` | `cache` | Cache's 4th `Cache Hit` stack deals `+45` bonus Magic Damage and grants `+20%` attack speed for `2.5s`. |
| `evo_dev_cleave` | **Merge Cleave** | `rare` | `dev`, `guard`, `stack`, `courier` | After casting any skill, your next basic attack cleaves enemies within `170 px` for `40%` AoE damage. |
| `evo_sprint_surge` | **Turbo Deploy** | `rare` | `sprint`, `oncall`, `courier`, `appdev`, `pixel`, `zero`, `stack`, `dev`, `cleaner` | Casting a `dash` or `blink` skill grants `+25%` move speed for `2s`. |

### 4.3. Group C — Utility Augments (4)
| ID | Name | Rarity | Eligible Champions | Effect |
| :--- | :--- | :---: | :--- | :--- |
| `flash_cache` | **Flash Cache** | `common` | All | Summoner Spells (`D`/`F`) have `20%` reduced cooldown (`0.8x`). |
| `ghost_protocol` | **Ghost Protocol** | `common` | All | After `5s` out of combat (`t - _lastCombatAt >= 5000`), gain `+15%` bonus move speed. |
| `bush_hacker` | **Bush Hacker** | `rare` | All | Entering a bush reveals hidden enemies within `750 px` for `2s` (`12s` CD). |
| `recall_opt` | **Recall Optimization** | `common` | All | Reduces Recall channel time by `35%` (`4.0s -> 2.6s`). |

### 4.4. Group D — Economy & Scaling Augments (3)
| ID | Name | Rarity | Eligible Champions | Effect |
| :--- | :--- | :---: | :--- | :--- |
| `bug_bounty` | **Bug Bounty** | `common` | All | Champion takedowns grant `+60g` on kill and `+30g` on assist. |
| `efficient_farming` | **Efficient Farming** | `common` | All | Minion kills grant `+5` bonus gold. |
| `jungle_contract` | **Jungle Contract** | `rare` | All | Jungle monsters grant `+25%` bonus gold and restore `8%` max HP on kill. |

### 4.5. Group E — Team Synergy Augments (3)
| ID | Name | Rarity | Eligible Champions | Effect |
| :--- | :--- | :---: | :--- | :--- |
| `pair_shield` | **Pair Shielding** | `common` | All | Standing within `450 px` of an allied champion grants `+12` bonus armor (`8%` dmg reduction proxy). |
| `shared_resources` | **Shared Resources** | `rare` | All | Casting a heal/shield/ally-buff skill also restores `40 HP` to yourself. |
| `coordinated_strike` | **Coordinated Strike** | `rare` | All | Deal `+12%` bonus damage to enemies recently damaged by an allied champion (`< 3s`). |

---

## 5. Trigger & Edge-Case Mechanical Specification

| Augment | Damage Type / Channel | Cooldown Scope | Exact Edge-Case Behavior |
| :--- | :--- | :--- | :--- |
| **Chain Reaction** | Magic (`140 px` AoE) | `6s` **per caster** | Triggers on skill hit against enemy champions; AoE blast hits nearby enemy champions within `140 px` (including primary target); bypassed once per `Overload` trigger. |
| **Overload** | Matches base skill channel | Every 4th cast | Increments `c._castCount` once per cast; multi-hit fans (`Swipe Q/R`) and persistent zones (`Mop W/R`, `Sprint R`, `Brew R`) count as **1 cast**. |
| **Last Stand** | Defensive (`0.85x` taken) | `45s` per owner | Evaluates `(target.hp - dmg) / maxHp < 0.30`; mitigates the triggering hit itself and persists `3000 ms`. |
| **Crowd Control** | Multiplicative (`1.15x`) | None | Triggers on any active `stunnedUntil > t`, `rootedUntil > t`, or `slowUntil > t` (any `slowPct > 0`). |
| **Execution Protocol** | Multiplicative (`1.14x`) | None | Multiplies with `Git Blame Gauntlet` when HP `< 25%`, subject to the `2.0x` total Damage Amp Cap. |
| **Emergency Patch** | Heal (`missing HP`) | None | Fires on kill or assist credit; evaluates HP `< 35%` before applying the `18%` / `27%` heal. |
| **CSS Split-Bolt** | Matches `Pixel Q` (`Magic`) | None | Splashes `45%` of Q scaled damage to up to `2` other living enemy champions within `260 px` of the primary hit target. |
| **Cluster Shield** | Shield (`3.5s` expiry) | R cooldown | Adds `+140` shield per enemy champion hit (stacking onto existing shields and refreshing `_shieldUntil` to `t + 3500`). |
| **CI/CD Pipeline** | R Cooldown Refund | R cooldown | Multiplies remaining R cooldown `(cdR - t)` by `0.65` on enemy champion hit. |
| **Exploit Chain** | Q Cooldown Refund | None | Checks `t - killer._lastQAt <= 3000` on champion kill; halves remaining Q cooldown `(cdQ - t) * 0.5`. |
| **Auto-Scaler Field** | Heal (`+70 HP`) | Skill cooldown | Pulses to every living allied champion within `450 px` whenever casting any skill with `sk.heal` or `sk.type === 'allies'`. |
| **Overfit Nova** | Slow (`30%`) + Shred (`15%`) | R cooldown | Applied on R hit against enemy champions for `2500 ms`; shreds armor before `damageAfterResist` penetration step. |
| **Servo Overdrive** | Magic (`Servo` pet) | R cooldown | Sets `_servoOverdriveUntil = t + 4000` on `Volt R` cast, boosting Servo attack rate (`+45%`) and damage (`+35%`). |
| **Branch Predictor** | Magic (`+45`) + AS (`+20%`) | 4th attack | Triggers when `Cache` reaches 4th `Cache Hit` stack on the same target; procs `+45` Magic Damage + `+20%` AS for `2.5s`. |
| **Merge Cleave** | AoE (`170 px` radius) | Skill cast | Next non-pet basic attack cleaves nearby non-pet, non-ward enemies within `170 px` for `40%` post-mitigation damage (floored at `1 HP`). |
| **Turbo Deploy** | Move Speed (`+25%`, `2s`) | Dash/Blink CD | Restricted strictly to 9 champions with `dash` or `blink` skills (`sprint`, `oncall`, `courier`, `appdev`, `pixel`, `zero`, `stack`, `dev`, `cleaner`). |
| **Bush Hacker** | Team Reveal (`750 px`, `2s`) | `12s` per owner | Triggers on bush entry (`inBush && !c._wasInBush`); sets `_revealUntil = t + 2000` on enemies within `750 px`, sharing vision with the whole team. |
| **Ghost Protocol** | Move Speed (`+15%`) | `5s` OOC | Active whenever `t - c._lastCombatAt >= 5000` ms (`_lastCombatAt` updates on dealing damage). |
| **Pair Shielding** | Defensive (`0.92x` taken) | Aura | Active whenever `>= 1` living allied champion stands within `450 px` of owner. |
| **Coordinated Strike** | Multiplicative (`1.12x`) | `3s` mark | Triggers when `target._lastHitBy.id !== src.id && target._lastHitBy.team === src.team && (t - target._lastHitBy.t < 3000)`. |

---

## 6. Augment Balance & Telemetry Guidelines
- **Rarity & Role Parity:** Compare `augmentWinRateByChamp` across Common (`60%`), Rare (`30%`), and Epic (`10%`) segmented by **champion, milestone (`Lv 5 / 10 / 15`), pick order, and team role** rather than global averages so strong champions do not inflate shared Augment tiers.
- **Identity Preservation:** Champions must remain tactically distinct at Levels 1–4 before Level 5 Augment unlocks; Augments amplify or branch existing kits rather than fixing incomplete base kits.
- **Pick Rate vs. Win-Rate Delta Rule:** Separate "fun/popular" picks from genuinely overpowered outliers. Flag any Augment for nerfs only when **high offered pick rate (`> 65%`) pairs with a significant positive Win-Rate Delta (`>= +3.0%`)**, or when any single synergy path dictates `> 75%` of a champion's winning matches.


---

## 7. Individual Augment Engineering Specifications (All 26 Augments)

Each entry below records the exact simulation hook, internal cooldown key, synergy interactions, and tactical application in `OfflineSim.js` and `shared/moba/augments.js`.

### 7.1. Combat Augments (6)
1. **`chain_reaction` — Chain Reaction (`rare`)**
   - *Hook:* `_cast` -> `effects(e)` (triggers on enemy champion hit).
   - *Behavior:* Emits `circle` FX (`140 px`, color `0xff9f43`) and deals `55` **Magic Damage** (`damageAfterResist` vs target `MR`) to all living enemy champions within `140 px` of `e`.
   - *Cooldown & Synergy:* `6000 ms` per caster (`c._augCd.chain_reaction`); bypassed once per `Overload` trigger via `Cascade Overflow` (`!isOverload` skips CD write).
2. **`last_stand` — Last Stand (`rare`)**
   - *Hook:* `_damage` (incoming damage evaluation on `target.champ`).
   - *Behavior:* When `(target.hp - dmg) / maxHp < 0.30` and `(target._augCd.last_stand || 0) <= t`, activates `_lastStandUntil = t + 3000` (`45000 ms` CD) and multiplies incoming damage by `0.85x` (`-15%`).
   - *Synergy:* Required piece of `Immortal Hotfix`.
3. **`overload` — Overload (`rare`)**
   - *Hook:* `_cast` (`c._castCount` incremented once per valid cast).
   - *Behavior:* When `c._castCount % 4 === 0`, sets `isOverload = true` and multiplies `rankDmgMul` by `1.28x` (`+28%` scaled skill damage/heal/shield).
   - *Synergy:* Required piece of `Cascade Overflow`.
4. **`execution_protocol` — Execution Protocol (`common`)**
   - *Hook:* `_damage` (attacker modifier stage).
   - *Behavior:* When `target.maxHp > 0 && target.hp / target.maxHp < 0.25`, multiplies post-resist damage by `1.14x` (subject to `2.0x` amp ceiling).
5. **`emergency_patch` — Emergency Patch (`rare`)**
   - *Hook:* `_kill` (champion kill and assist award paths).
   - *Behavior:* Restores `18%` of `missingHp = max(0, maxHp - hp)` scaled by `_healMul(c)` (anti-heal applies).
   - *Synergy:* With `Immortal Hotfix` (`last_stand` owned) and `hp / maxHp < 0.35`, heals `27%` (`1.5x`) missing HP.
6. **`crowd_control` — Crowd Control (`common`)**
   - *Hook:* `_damage` (attacker modifier stage).
   - *Behavior:* When `target.champ` has `(stunnedUntil > t || rootedUntil > t || slowUntil > t)`, multiplies damage by `1.15x` (synergizes directly with `Cold Cache` item slow).

### 7.2. Skill Evolution Augments (10: 8 Epic + 2 Rare)
7. **`evo_pixel_split` — CSS Split-Bolt (`epic` | `pixel`)**
   - *Hook:* `_cast` -> `effects(e)` when `slot === 'q'`.
   - *Behavior:* Scans living enemy champions `foe.id !== e.id` within `260 px` of `e`; deals `0.45 * amt(sk.dmg)` **Magic Damage** to up to `2` secondary targets.
8. **`evo_stack_lock` — Cluster Shield (`epic` | `stack`, `guard`)**
   - *Hook:* `_cast` -> `effects(e)` when `slot === 'r'`.
   - *Behavior:* Grants `+140` shield (`_shieldUntil = max(..., t + 3500)`) per enemy champion hit by R (`Stack`'s `Database Lock` or `Brick`'s `Building Lockdown`).
9. **`evo_tester_barrage` — CI/CD Pipeline (`epic` | `tester`, `appdev`)**
   - *Hook:* `_cast` -> `effects(e)` when `slot === 'r'`.
   - *Behavior:* Reduces remaining R cooldown by `35%` (`cdR = t + round((cdR - t) * 0.65)`) per enemy champion hit (`Swipe R` 7-fan can hit multiple champions for multi-refunds).
10. **`evo_zero_reset` — Exploit Chain (`epic` | `zero`, `dev`, `courier`, `sprint`, `oncall`)**
    - *Hook:* `_kill` (champion kill path).
    - *Behavior:* If `t - killer._lastQAt <= 3000`, refunds `50%` of remaining `cdQ` (`cdQ = t + round((cdQ - t) * 0.5)`).
11. **`evo_ops_field` — Auto-Scaler Field (`epic` | `ops`, `barista`, `hr`)**
    - *Hook:* `_cast` when `(sk.heal || sk.type === 'allies')`.
    - *Behavior:* Pulses `+70 HP` heal to every living allied champion within `450 px` of the caster (including self).
12. **`evo_model_nova` — Overfit Nova (`epic` | `model`, `lint`, `cleaner`)**
    - *Hook:* `_cast` -> `effects(e)` when `slot === 'r'`.
    - *Behavior:* Applies `30%` slow (`2500 ms`) and `15%` armor shred (`e._auditUntil = t + 2500`) to every enemy champion hit by R.
13. **`evo_volt_overdrive` — Servo Overdrive (`epic` | `embedded`)**
    - *Hook:* `_cast` when `slot === 'r'` -> `_petTick`.
    - *Behavior:* Sets `c._servoOverdriveUntil = t + 4000`, granting `Servo` `+45%` attack speed and `+35%` Magic Damage for `4s`.
14. **`evo_cache_prefetch` — Branch Predictor (`epic` | `cache`)**
    - *Hook:* `_damage` (`roleP === 'cache_hit'`) -> `_recalc`.
    - *Behavior:* On reaching 4 `Cache Hit` stacks on the same target, deals `+45` bonus **Magic Damage** (`_damage(..., 45, src, true, false, 'magic')`) and sets `_prefetchUntil = t + 2500` (`+20%` AS).
15. **`evo_dev_cleave` — Merge Cleave (`rare` | `dev`, `guard`, `stack`, `courier`)**
    - *Hook:* `_cast` sets `c._cleaveReady = true` -> `_damage` (`!byPet`).
    - *Behavior:* Next non-pet basic attack deals `40%` of its post-mitigation damage to all other living non-pet, non-ward enemies within `170 px` of the primary target (floored at `1 HP`).
16. **`evo_sprint_surge` — Turbo Deploy (`rare` | 9 dash/blink champions)**
    - *Hook:* `_cast` when `sk.type === 'dash' || sk.type === 'blink'`.
    - *Behavior:* Grants `+25%` move speed (`_spMsUntil = max(..., t + 2000)`, `_spMsPct = max(..., 0.25)`).

### 7.3. Utility, Economy & Team Synergy Augments (10)
17. **`flash_cache` — Flash Cache (`common`)**: Multiplies `D`/`F` Summoner Spell cooldown by `0.8x` (`-20%` CD).
18. **`ghost_protocol` — Ghost Protocol (`common`)**: Evaluated in `_recalc` (`t - _lastCombatAt >= 5000` -> `+15%` MS); pairs with `bush_hacker` for `Shadow Ops`.
19. **`bush_hacker` — Bush Hacker (`rare`)**: On bush entry (`inBush && !_wasInBush`, `12s` CD), sets `_revealUntil = t + 2000` on enemies within `750 px`; pairs with `ghost_protocol` for `Shadow Ops`.
20. **`recall_opt` — Recall Optimization (`common`)**: Multiplies `RECALL_MS` (`4000 ms`) by `0.65` (`2600 ms`).
21. **`bug_bounty` — Bug Bounty (`common`)**: Grants `+60g` on champion kill and `+30g` on assist.
22. **`efficient_farming` — Efficient Farming (`common`)**: Adds `+5g` on minion last-hit.
23. **`jungle_contract` — Jungle Contract (`rare`)**: Killing jungle monsters grants `+25%` bonus gold and heals `8%` max HP.
24. **`pair_shield` — Pair Shielding (`common`)**: Evaluated in `_damage` (`target.champ`); grants `0.92x` incoming damage reduction (`+12` Armor equivalent) when an allied champion is within `450 px`.
25. **`shared_resources` — Shared Resources (`rare`)**: Evaluated in `_cast`; restores `+40 HP` to caster whenever casting a heal, shield, or `allies` skill.
26. **`coordinated_strike` — Coordinated Strike (`rare`)**: Evaluated in `_damage`; deals `1.12x` damage when `target._lastHitBy` belongs to a different allied champion within the last `3000 ms`.


---

## 8. Champion-by-Champion Augment Priority Tier List (All 18 Champions)

Recommendations below assume standard 5v5 pacing (milestones at Lv 5, 10, 15) and prioritize kit synergy over raw stats:

- **Pixel (`pixel` — Mage):**
  - *S-Tier:* `CSS Split-Bolt` (Epic), `Overload` (Rare), `Chain Reaction` (Rare).
  - *Synergy Target:* `Cascade Overflow` (`chain_reaction + overload`) turns every 4th `Q -> R` combo into a multi-target AoE explosion; `Cold Cache` item activates `Crowd Control` (`+15%` dmg) permanently.
- **Stack (`stack` — Tank):**
  - *S-Tier:* `Cluster Shield` (Epic), `Merge Cleave` (Rare), `Last Stand` (Rare).
  - *Synergy Target:* `Immortal Hotfix` (`last_stand + emergency_patch`) sustains through multi-man `Database Lock` engages; `Cluster Shield` amplifies `Load Balancer` shield-break playstyle.
- **Ops (`ops` — Support):**
  - *S-Tier:* `Auto-Scaler Field` (Epic), `Shared Resources` (Rare), `Recall Optimization` (Common).
  - *Tactical Note:* `Auto-Scaler Field` triggers on both `Auto-Heal` (`W`) and `Blue-Green Deploy` (`R`), doubling teamwide sustain in prolonged river fights.
- **Tester (`tester` — Marksman):**
  - *S-Tier:* `CI/CD Pipeline` (Epic), `Execution Protocol` (Common), `Crowd Control` (Common).
  - *Tactical Note:* `CI/CD Pipeline` drops `Regression Barrage` cooldown from `60s` to `~39s` at Rank 1, letting Tester snipe twice per mid-game siege.
- **Zero (`zero` — Assassin):**
  - *S-Tier:* `Exploit Chain` (Epic), `Bush Hacker` (Rare), `Ghost Protocol` (Common).
  - *Synergy Target:* `Shadow Ops` (`bush_hacker + ghost_protocol`) stacks `+20%` exit MS onto `Zero-Day Strike`, while `Exploit Chain` resets `Pen Test` (`Q`) for multi-kill dives.
- **Model (`model` — Controller):**
  - *S-Tier:* `Overfit Nova` (Epic), `Overload` (Rare), `Crowd Control` (Common).
  - *Tactical Note:* `Overfit Nova` applies `30%` slow and `15%` shred on `Big Data` (`R`), locking fleeing enemies inside `Gradient Descent` follow-ups.
- **Brick (`guard` — Tank):**
  - *S-Tier:* `Cluster Shield` (Epic), `Merge Cleave` (Rare), `Pair Shielding` (Common).
  - *Tactical Note:* `Cluster Shield` gives Brick an extra `+140` shield per enemy hit by `Building Lockdown`, stacking with `Clipboard of Rules` (`W`).
- **Mop (`cleaner` — Mage):**
  - *S-Tier:* `Overfit Nova` (Epic), `Overload` (Rare), `Turbo Deploy` (Rare).
  - *Tactical Note:* `Overfit Nova` slows enemies inside `Deep Clean` (`R`) by an extra `30%`, keeping targets trapped for all `8` zone damage ticks.
- **Rush (`courier` — Jungler):**
  - *S-Tier:* `Exploit Chain` (Epic), `Turbo Deploy` (Rare), `Jungle Contract` (Rare).
  - *Tactical Note:* `Turbo Deploy` procs on `Express Delivery` (`Q`), giving `+25%` MS to stick onto targets or escape counter-ganks.
- **Volt (`embedded` — Support):**
  - *S-Tier:* `Servo Overdrive` (Epic), `Shared Resources` (Rare), `Crowd Control` (Common).
  - *Tactical Note:* `Servo Overdrive` combines with `Overclock` (`W`) to turn `Servo` into a `+145%` AS / `+135%` Magic Damage turret for `4s`.
- **Patch (`dev` — Fighter):**
  - *S-Tier:* `Merge Cleave` (Rare), `Exploit Chain` (Epic), `Last Stand` (Rare).
  - *Tactical Note:* `Merge Cleave` + `Refactor` (`Q`) clears waves and chunks clustered bruisers; `Last Stand` stacks with `Hotfix Fury` below `50%` HP.
- **Swipe (`appdev` — Marksman):**
  - *S-Tier:* `CI/CD Pipeline` (Epic), `Turbo Deploy` (Rare), `Execution Protocol` (Common).
  - *Tactical Note:* `App Store Launch` (`R` 7-fan) refunds `35%` CD per champion hit, rapidly resetting ultimates in 5v5 choke fights.
- **Sprint (`sprint` — Jungler):**
  - *S-Tier:* `Turbo Deploy` (Rare), `Exploit Chain` (Epic), `Emergency Patch` (Rare).
  - *Tactical Note:* `Emergency Patch` (`18%` missing HP heal) compounds with `Sprint Velocity` (`45` HP + `25%` MS) on takedowns.
- **Cache (`cache` — Marksman):**
  - *S-Tier:* `Branch Predictor` (Epic), `Coordinated Strike` (Rare), `Flash Cache` (Common).
  - *Tactical Note:* `Branch Predictor` rewards locking onto frontline tanks, converting every 4th `Cache Hit` stack into `+45` Magic Damage + `+20%` AS.
- **Hira (`hr` — Support):**
  - *S-Tier:* `Auto-Scaler Field` (Epic), `Shared Resources` (Rare), `Pair Shielding` (Common).
  - *Tactical Note:* `Auto-Scaler Field` pulses `+70` HP on `Team Building` (`W`), boosting sustain for grouped sieges.
- **Lint (`lint` — Controller):**
  - *S-Tier:* `Overfit Nova` (Epic), `Crowd Control` (Common), `Chain Reaction` (Rare).
  - *Tactical Note:* `Overfit Nova` stacks with `Strict Audit` (`-15%` armor) while `Crowd Control` amplifies `Nitpick` and `Request Changes`.
- **Brew (`barista` — Support):**
  - *S-Tier:* `Auto-Scaler Field` (Epic), `Shared Resources` (Rare), `Coordinated Strike` (Rare).
  - *Tactical Note:* `Break Room` (`R`) and `Espresso Shot` (`W`) both trigger `Auto-Scaler Field` and `Shared Resources`.
- **Pager (`oncall` — Jungler):**
  - *S-Tier:* `Exploit Chain` (Epic), `Turbo Deploy` (Rare), `Jungle Contract` (Rare).
  - *Tactical Note:* `On My Way` (`R`) + `Revert` (`E`) blink trigger `Turbo Deploy`, while `Jungle Contract` accelerates Lv 6 ultimate timing.

---

## 9. Roll Simulator & Fairness Verification Rules
1. **No-Duplicate Guarantee:** Each of the 3 offered cards splices the chosen Augment out of `avail` before rolling the next card.
2. **Tier Weight Normalization:** If `avail` contains `0` Epic augments (e.g., player already picked their champion's Epic at Lv 5), `activeTiers` contains only `['common', 'rare']`, yielding `60 / 90 = 66.7%` Common and `30 / 90 = 33.3%` Rare per card at Lv 10 and Lv 15.
3. **Zero Gold / Shop Coupling:** Augments never occupy the `6` item inventory slots, cannot be sold, and do not count toward `_power(c)` item-gold calculations in `MobaBots`.
4. **Reroll Independence:** Rerolls draw cleanly from `rollAugmentChoices(c.champ, c.augments, 3)` without blacklisting the previous 3 cards; if a player wants a different roll, all unowned eligible Augments remain in the pool.


---

## 10. Augment-to-Item & Augment-to-Champion Combo Matrix

| Augment | Best Item Pairing | Best Champion Pairing | Combined Mechanical Synergy |
| :--- | :--- | :--- | :--- |
| **`crowd_control`** (`+15%` vs CC'd) | `Cold Cache` (`25%` slow on all skills) | `Pixel`, `Model`, `Mop`, `Lint`, `Hira` | Turns every skill cast into a self-primed `+15%` damage amplifier |
| **`execution_protocol`** (`+14% < 25%` HP) | `Git Blame Gauntlet` (`+15% < 35%` HP) | `Zero`, `Tester`, `Rush`, `Pager` | Multiplicative `1.311x` execute burst on low-HP targets |
| **`last_stand`** (`-15% < 30%` HP) | `Cloud Backup` (`260` shield `< 30%` HP) | `Stack`, `Brick`, `Patch` | Dual `45s` CD survival proc triggers simultaneously at `< 30%` HP |
| **`chain_reaction`** (`55` Magic AoE) | `Midnight Oil` (`+25%` MR Pen + burn) | `Pixel`, `Mop`, `Lint`, `Model` | Amplifies Magic AoE blasts against MR-stacking frontlines |
| **`overload`** (`+28%` every 4th cast) | `Rubber Duck` + `Team Lunch` (`40%` CDR) | `Pixel`, `Lint`, `Mop`, `Brew` | High Haste cycles every 4th cast in `~8–10s` |
| **`evo_dev_cleave`** (`40%` AoE cleave) | `JIT Compiler` (`1.60x` crit) | `Patch`, `Stack`, `Rush` | Crit-boosted basic attack cleaves nearby enemies for `40%` post-resist dmg |
| **`evo_sprint_surge`** (`+25%` MS on dash) | `Jetpack Sneakers` (`+45` MS) | `Rush`, `Pager`, `Zero`, `Swipe` | High burst engage and kite speed after every mobility skill |
| **`bush_hacker`** (`750 px` reveal) | `Shadow Proxy` (`[1]` stealth) | `Zero`, `Pager`, `Hira`, `Ops` | Safe face-checking of river bushes before `Golden Bug` / `Deadline` |
| **`shared_resources`** (`+40` HP self) | `Team Lunch` (`+15%` CDR, `+4.0 MP/s`) | `Ops`, `Volt`, `Hira`, `Brew` | Sustains enchanters continuously during poke lanes |
| **`jungle_contract`** (`+25%g`, `8% HP`) | `Git Blame Gauntlet` | `Zero`, `Rush`, `Sprint`, `Pager` | Sustains jungle clear HP and accelerates item spikes ahead of laners |
| **`pair_shield`** (`+12` Armor aura) | `Server Rack Armor` (`-10%` dmg taken) | `Stack`, `Brick`, `Ops`, `Hira` | Multiplicative `0.92 * 0.90 = 0.828x` damage taken in teamfights |
| **`coordinated_strike`** (`+12%` focus) | `Strict Linter` / `CORS Bypass` | `Tester`, `Cache`, `Swipe` | Shreds priority targets marked by frontline engage |

---

## 11. Augment UI Modal, Sync & Telemetry Integration

### 11.1. Client Modal Flow (`AugmentPanel.js` & `TeamModeScene.js`)
- **Non-Blocking Trigger:** When `c.augmentOffer` becomes non-null at Level `5`, `10` (guaranteed Epic if unowned), or `15`, the scene opens `AugmentPanel` displaying `3` cards with rarity border colors (`RARITY_COLOR`: Common `#39c2ff`, Rare `#c44dff`, Epic `#ffd23f`), group label, synergy highlight, and reroll button(s) parented via `makeButton(...).root`.
- **Network Sync & Client Caching (`schema.js`, `TeamRoom.js`, `TeamModeScene.js`, `Scoreboard.js`):**
  - Owned augments sync over Colyseus as a primitive comma-separated string `augmentsCsv` on `TeamChamp` and `TeamScore` (instead of a child `ArraySchema`), avoiding the `@colyseus/schema 3.0.76` `StateView` `refId not found` corruption at Level 5 and during page-reload rejoin.
  - `TeamModeScene.js` caches parsed `augmentOfferJson` and `augmentsCsv` by string equality so zero `JSON.parse()` or `split()` allocations occur on unchanged frames.
- **Actions:**
  - Clicking a card sends `augmentPick { id }`, appends `id` to `c.augments`, recalculates stats (`_recalc`), and checks `_checkAugmentOffer` for multi-level jumps.
  - Clicking `REROLL (1 FREE)` sends `augmentReroll {}` (replacing all 3 cards via `rollAugmentChoices(c.champ, c.augments, 3, { guaranteeEpic: c.augmentOffer.level === 10 })` and setting `rerolls = 0`).
  - `_rerollAugment` rejects any duplicate reroll once `rerolls <= 0`, enforcing `1` reroll per milestone (`3` max per match).
- **Telemetry Breakdown:**
  - **`augmentPickRate`:** Tracks how often each Augment is chosen when offered across the 3-card presentation.
  - **`augmentWinRateDelta`:** Tracks `(winRateWithAugment - champBaselineWinRate)` broken down by `champId`, `milestone` (`5 / 10 / 15`), `teamComp` (Poke / Dive / Front-to-Back), and `augmentPickOrder`.
  - **`synergyTriggerCount` & `rerollUsage`:** Counts combat activations of the `3` synergies plus how frequently players spend their shared `1` reroll at Lv 5, Lv 10, and Lv 15.

### 11.3. Quick-Reference Augment Rarity & Group Totals
| Group | Common (60%) | Rare (30%) | Epic (10%) | Group Total |
| :--- | :---: | :---: | :---: | :---: |
| **Combat** | 2 (`execution_protocol`, `crowd_control`) | 4 (`chain_reaction`, `last_stand`, `overload`, `emergency_patch`) | 0 | **6** |
| **Skill Evolution** | 0 | 2 (`evo_dev_cleave`, `evo_sprint_surge`) | 8 (covers **18/18** champs) | **10** |
| **Utility** | 3 (`flash_cache`, `ghost_protocol`, `recall_opt`) | 1 (`bush_hacker`) | 0 | **4** |
| **Economy** | 2 (`bug_bounty`, `efficient_farming`) | 1 (`jungle_contract`) | 0 | **3** |
| **Team Synergy** | 1 (`pair_shield`) | 2 (`shared_resources`, `coordinated_strike`) | 0 | **3** |
| **Total** | **8** | **10** | **8** | **26** |


---

## 12. Augment Roll & Synergy Verification Scenarios

### 12.1. Verified `rollAugmentChoices` Edge Cases
1. **Fresh Level 5 Roll (Empty `ownedIds`):**
   - `avail` contains `17–19` eligible Augments depending on champion.
   - All 3 tiers (`common`, `rare`, `epic`) are active (`totalW = 60 + 30 + 10 = 100`).
   - Output array always has length `3` with `3` distinct Augment IDs.
2. **Post-Epic Ownership Roll (Level 10 / 15 after owning Epic):**
   - Because each champion has `1` eligible Epic Skill Evolution, once owned it is excluded from `pool`.
   - `activeTiers` becomes `['common', 'rare']` (`totalW = 90`), guaranteeing `0` undefined tier crashes and `0` empty offers.
3. **Single Epic Card Guarantee Per Offer:**
   - Once card 1 draws the champion's Epic Augment and splices it out of `avail`, `activeTiers` for cards 2 and 3 automatically drops `'epic'` and rolls from `'common'` and `'rare'`.
4. **Reroll State Reset:**
   - `_rerollAugment(c)` verifies `c.augmentOffer.rerolls > 0`, calls `rollAugmentChoices(c.champ, c.augments, 3)`, and sets `rerolls: 0`.
   - Subsequent reroll messages for the same milestone are ignored server-side.
5. **Multi-Level Jump (e.g. Level 4 -> Level 10):**
   - `_checkAugmentOffer` triggers Lv 5 offer first (`_augNextIdx = 1`).
   - Immediately inside `_pickAugment`, `_checkAugmentOffer` runs again, sees `c.level >= 10` (`_augNextIdx = 1 -> 2`), and presents the Lv 10 offer cleanly without losing a milestone.

### 12.2. Complete 26-Augment Eligibility & Hook Reference Table
| # | ID | Group | Rarity | Eligible Pool | Primary Hook | Internal CD |
| :-: | :--- | :---: | :---: | :--- | :---: | :---: |
| 1 | `chain_reaction` | Combat | `rare` | All 18 | `_cast` (`effects`) | `6s` / caster |
| 2 | `last_stand` | Combat | `rare` | All 18 | `_damage` (target) | `45s` / owner |
| 3 | `overload` | Combat | `rare` | All 18 | `_cast` (`_castCount`) | Every 4th cast |
| 4 | `execution_protocol` | Combat | `common` | All 18 | `_damage` (attacker) | None |
| 5 | `emergency_patch` | Combat | `rare` | All 18 | `_kill` (kill/assist) | None |
| 6 | `crowd_control` | Combat | `common` | All 18 | `_damage` (attacker) | None |
| 7 | `evo_pixel_split` | Skill Evo | `epic` | `pixel` | `_cast` (`q` hit) | Q CD |
| 8 | `evo_stack_lock` | Skill Evo | `epic` | `stack`, `guard` | `_cast` (`r`) | R CD |
| 9 | `evo_tester_barrage` | Skill Evo | `epic` | `tester`, `appdev` | `_cast` (`r`) | R CD |
| 10 | `evo_zero_reset` | Skill Evo | `epic` | `zero`, `dev`, `courier`, `sprint`, `oncall` | `_kill` (champ) | None |
| 11 | `evo_ops_field` | Skill Evo | `epic` | `ops`, `barista`, `hr` | `_cast` (heal/allies) | Skill CD |
| 12 | `evo_model_nova` | Skill Evo | `epic` | `model`, `lint`, `cleaner` | `_cast` (`r` hit) | R CD |
| 13 | `evo_volt_overdrive` | Skill Evo | `epic` | `embedded` | `_cast` (`r`) -> `_petTick` | R CD |
| 14 | `evo_cache_prefetch` | Skill Evo | `epic` | `cache` | `_damage` (`cache_hit`) | 4th stack |
| 15 | `evo_dev_cleave` | Skill Evo | `rare` | `dev`, `guard`, `stack`, `courier` | `_cast` -> `_damage` | Next AA |
| 16 | `evo_sprint_surge` | Skill Evo | `rare` | 9 dash/blink champs | `_cast` (dash/blink) | Skill CD |
| 17 | `flash_cache` | Utility | `common` | All 18 | `_spell` (D/F) | Spell CD |
| 18 | `ghost_protocol` | Utility | `common` | All 18 | `_recalc` (`5s` OOC) | `5s` OOC |
| 19 | `bush_hacker` | Utility | `rare` | All 18 | `_champTick` (bush) | `12s` / owner |
| 20 | `recall_opt` | Utility | `common` | All 18 | `_recall` | None |
| 21 | `bug_bounty` | Economy | `common` | All 18 | `_kill` (champ) | None |
| 22 | `efficient_farming` | Economy | `common` | All 18 | `_kill` (minion) | None |
| 23 | `jungle_contract` | Economy | `rare` | All 18 | `_kill` (monster) | None |
| 24 | `pair_shield` | Team Synergy | `common` | All 18 | `_damage` (`<= 450 px`) | Aura |
| 25 | `shared_resources` | Team Synergy | `rare` | All 18 | `_cast` (heal/shield) | Skill CD |
| 26 | `coordinated_strike` | Team Synergy | `rare` | All 18 | `_damage` (`< 3s` hit) | `3s` mark |

### 12.3. Synergy Interaction Verification Traces
- **`Cascade Overflow` Trace:** `c._castCount = 4` -> `isOverload = true` -> skill hits target champion -> `chain_reaction` sees `isOverload === true`, skips `_augCd.chain_reaction` check AND does not overwrite `_augCd.chain_reaction`, deals `55` Magic Damage in `140 px` without calling `_cast` recursively.
- **`Immortal Hotfix` Trace:** Owner has `last_stand` + `emergency_patch`, current HP `= 30%` max HP -> enemy dies with owner's assist -> `hp / maxHp < 0.35` evaluates true -> heals `0.27 * (maxHp - hp)` instead of `0.18 * (maxHp - hp)`.
- **`Shadow Ops` Trace:** Owner has `bush_hacker` + `ghost_protocol`, exits bush (`!inBush && c._wasInBush`) with `_augCd.shadow_ops <= t` -> sets `_augCd.shadow_ops = t + 8000`, `_spMsUntil = t + 2000`, `_spMsPct = 0.20`, and triggers `_recalc`.


---

## 13. Level 10 Epic Pity, Shared Reroll Decision Matrix & Anti-RNG Architecture

To ensure Code Augments feel like **deliberate build-crafting** rather than pure slot-machine RNG while preserving game-to-game variety, two systemic safeguards were added in `shared/moba/augments.js`, `OfflineSim.js`, `AugmentPanel.js`, and `TeamModeScene.js`.

### 13.1. Guaranteeing Champion Identity (`guaranteeEpic` at Level 10)
- **Previous Failure Mode:** With flat `60% / 30% / 10%` draws across 3 cards, a champion had only `27.1%` chance to see their signature **Epic Skill Evolution** at Lv 5 and `46.9%` with a full reroll—meaning many matches finished without ever offering the champion's signature evolution.
- **Implemented Fix (`opts.guaranteeEpic = (nextLv === 10)`):**
  1. Level `5` keeps natural `60% / 30% / 10%` discovery so getting an early Epic feels exciting (`~27.1%` base odds).
  2. At Level `10`, if the champion does not yet own their eligible Epic Skill Evolution, Slot 1 **guarantees** that Epic card while Slots 2 and 3 roll normally from `'common'` and `'rare'` pools.
  3. At Level `15`, because every champion's Epic pool (`1` signature Epic) is already owned or passed through, the offer dynamically renormalizes across remaining `'common'` (`66.7%`) and `'rare'` (`33.3%`) pools to complete builds and synergies.

### 13.2. Shared Single-Reroll Discipline (`rerolls: 1` per Milestone)
- **Design Rationale (Anti-Fixed-Meta Guardrail):** Giving `3` independent per-slot rerolls per milestone (`9` total) let players lock anchor cards and deterministically assemble the exact same 2-piece Synergy every game, turning Augments into a fixed recipe. Reducing to **`1` shared full-offer reroll per milestone (`3` max per match)** restores meaningful gamble-vs-settle trade-offs.
- **Implemented Rule (`rollAugmentChoices`, `rerolls: 1`):**
  - Each milestone offer (`Lv 5 / 10 / 15`) starts with `{ level: nextLv, choices, rerolls: 1 }`.
  - Pressing `REROLL (1 FREE)` re-rolls the entire 3-card tray (preserving `guaranteeEpic: true` at Lv 10) and decrements `rerolls` to `0`.
  - Total agency allows at most `1` reset per milestone (`1` pick from up to `6` seen cards per milestone = `3` final Augments per match).

### 13.3. Shared Reroll Tactical Decision Guide
| Scenario at Milestone | Recommended Action | Expected Outcome |
| :--- | :--- | :--- |
| **Lv 5: 1 Solid Rare Card + 2 Weak Economy Cards** | Weigh settling on the solid Rare vs. gambling all 3 cards for Epic | Creates real agency tension without guaranteeing an optimal roll |
| **Lv 5: Early Epic Rolled** | Pick immediately (do not burn shared reroll) | Locks signature Epic before Lv 10 pity is needed |
| **Lv 10: Signature Epic in Slot 1 + Weak Slots 2–3** | Evaluate Epic power; reroll only if you prefer pivoting other two slots (`guaranteeEpic` remains active) | Slot 1 keeps Epic eligibility on reroll if not yet owned |
| **Lv 10: Already Own `Chain Reaction` (`overload` missing)** | Reroll tray only if current 3 choices have low combat impact | Preserves unpredictability while giving 1 second-chance draw |
| **Lv 15: Game Ending Soon vs Long Siege** | Reroll if tray offers dead early-economy cards (`Bug Bounty`, `Efficient Farming`) | Late Lv 15 seeks immediate teamfight multipliers (`Execution Protocol`, `Last Stand`, `Coordinated Strike`) |

### 13.4. Updated State Synchronization Contract for Augments
- **Offer Schema (`c.augmentOffer`):**
  ```js
  {
    level: 5 | 10 | 15,
    choices: ['aug_id_0', 'aug_id_1', 'aug_id_2'],
    rerolls: 1,                  // single shared milestone reroll budget (3 total/match)
  }
  ```
- **Client UI Render Key (`AugmentPanel.js`):**
  `sig = `${offer.level}:${offer.rerolls}:${(offer.slotRerolls || []).join(',')}:${offer.choices.join(',')}:${(owned || []).join(',')}``
  Because `slotRerolls` is omitted (`!Array.isArray(offer.slotRerolls)`), `AugmentPanel` automatically renders the single `REROLL (1 FREE)` button whenever `rerolls > 0` and hides it cleanly once spent.
- **Anti-Duplicate & Pool Exhaustion Safety:**
  - `rollAugmentChoices(c.champ, c.augments, 3, { guaranteeEpic })` filters out all currently owned Augments and preserves zero duplicates within any 3-card tray.
  - Because every champion's eligible pool has `17–19` Augments and at most `3` owned + `3` displayed (`6` total), at least `11–13` valid candidates remain even on a Lv 15 reroll.

### 13.5. Future Expansion Guardrails for Augment v2
- **No Uncapped Infinite Stacking:** All combat Augments (`Overload` 1.28x, `Execution Protocol` 1.14x, `Crowd Control` 1.15x, `Coordinated Strike` 1.12x) pass through the unified `2.0x` post-resist amplification ceiling so adding future Augments never breaks TTK limits.
- **Non-Recursive Proc Rule:** All triggered AoE or cleave Augments (`Chain Reaction`, `Merge Cleave`, `Auto-Scaler Field`) must execute at `delay = 0` without re-invoking `_cast()`, preventing infinite event loops.
- **100% Roster Epic Mandate:** Any newly introduced Champion must define or join at least `1` `rarity: 'epic'` Skill Evolution in `AUGMENTS` before entering ranked/draft rotation, verified automatically by the CI Epic coverage assertion.


---

## 14. Probability Math Derivations, Combinatorics & Lifecycle Traces

### 14.1. Exact Draw Probabilities Under Two-Step Rarity Roll
Let $W_C = 60$, $W_R = 30$, $W_E = 10$ when all three tiers have available candidates ($W_{\text{all}} = 100$).

- **Single-Card Draw at Level 5 (No Guarantee):**
  - $P(\text{Epic on Card } 1) = \frac{10}{100} = 10.0\%$.
  - Once Card 1 rolls `'common'` or `'rare'`, `'epic'` still has $1$ candidate left, so Cards 2 and 3 keep $P(\text{Epic}) = 10.0\%$.
  - $P(\ge 1 \text{ Epic in 3-card Lv 5 Offer}) = 1 - (0.90)^3 = 1 - 0.729 = \mathbf{27.1\%}$.
- **With Single Shared Reroll (`rerolls = 1` at Lv 5):**
  - If Lv 5 misses Epic on all 3 initial cards and player spends the 1 shared full-tray reroll ($3$ fresh cards, each having $\approx 10.0\%$ Epic probability while `'epic'` remains unpicked):
  - $P(\ge 1 \text{ Epic at Lv 5 across 6 seen cards}) = 1 - (0.90)^6 = \mathbf{46.86\%}$.
- **Guaranteed Level 10 Pity (`opts.guaranteeEpic = true`):**
  - If the player still does not own their Epic Skill Evolution upon reaching Level 10 ($53.14\%$ of games after spending the Lv 5 reroll, or $72.9\%$ without rerolling at Lv 5), Slot 1 draws directly from `avail.filter(a => a.rarity === 'epic')`.
  - $P(\text{Epic offered by Level 10}) = \mathbf{100.0\%}$ across all 18 champions.
- **Post-Epic Pool Renormalization (Lv 10 Slots 2–3 & All Lv 15 Draws):**
  - Once `epicCount = 0` in `avail`, `activeTiers = ['common', 'rare']` with $W = 60 + 30 = 90$:
  - $P(\text{Common per card}) = \frac{60}{90} = \mathbf{66.67\%}$
  - $P(\text{Rare per card}) = \frac{30}{90} = \mathbf{33.33\%}$

### 14.2. Synergy Acquisition Math Under Shared Reroll
Assume a player owns `chain_reaction` from Level 5 and evaluates Lv 10 and Lv 15 offers (`overload` Rare pool size $N_R \approx 7\text{–}9$ remaining unowned Rares):
- With `1` shared reroll per milestone, the player cannot lock a single slot while rerolling the other 2; opting to reroll discards the whole 3-card tray for a fresh draw of `3` cards (`2` non-Epic at Lv 10 if Epic wasn't picked at Lv 5, or `3` at Lv 15).
- Each Rare-tier hit ($\frac{1}{3}$ chance per post-Epic slot) selects `overload` with probability $\frac{1}{N_R}$ ($\approx \frac{1}{7}$ to $\frac{1}{9}$), keeping 2-piece Synergies exciting without making every match identical.

### 14.3. Complete Lifecycle State Transitions (`_checkAugmentOffer` -> `_rerollAugment` -> `_pickAugment`)
1. **Trigger Check (`_levelCheck`):** When champion XP crosses Level `5`, `10`, or `15`, `_checkAugmentOffer(c)` runs whenever `c.augmentOffer === null` and `c.level >= AUGMENT_LEVELS[c._augNextIdx]`.
2. **Offer Creation:**
   - Calls `rollAugmentChoices(c.champ, c.augments, 3, { guaranteeEpic: nextLv === 10 })`.
   - Increments `c._augNextIdx`.
   - Bot seat: pushes `choices[0]` immediately.
   - Human seat: stores `{ level: nextLv, choices, rerolls: 1 }` and emits golden announcement banner.
3. **Shared Reroll (`augmentReroll {}`):**
   - Validates `c.augmentOffer.rerolls > 0`.
   - Calls `rollAugmentChoices(c.champ, c.augments, 3, { guaranteeEpic: c.augmentOffer.level === 10 })`.
   - Replaces `choices` cleanly and decrements `rerolls` to `0`.
4. **Selection Confirmation (`augmentPick { id }`):**
   - Validates `c.augmentOffer.choices.includes(id)`.
   - Appends `id` to `c.augments`, clears `c.augmentOffer = null`, recalculates passive stats (`_recalc`), and immediately re-runs `_checkAugmentOffer(c)` to handle multi-level XP jumps cleanly.

### 14.4. Regression & Coverage Assertions Checklist
- All `18/18` champions return `rarity === 'epic'` in Slot 1 when `guaranteeEpic: true` across `20/20` trials per champion.
- `rollAugmentChoices` returns zero duplicate IDs across every `Lv 5 / 10 / 15` draw and `rerolls` strictly decrements from `1` to `0`.
- `activeSynergies(ownedIds)` returns exact active synergy objects whenever both `requires` IDs are owned.

### 14.5. Augment System Architecture & Future Multiplayer Parity Notes
- **Shared Pure Data (`shared/moba/augments.js`):** Zero external imports or side effects—safely imported by both client (`OfflineSim.js`, `AugmentPanel.js`) and server (`TeamRoom.js`) without environment divergence.
- **Bot Auto-Pick Behavior:** Bots pick `choices[0]` immediately without pausing or opening modals, benefiting automatically from Lv 10 `guaranteeEpic` slot reservation so bot champions showcase Skill Evolutions consistently in mid/late teamfights.
- **Network Protocol Readiness (`augmentPick` & `augmentReroll`):**
  - `augmentPick { id }`: Validates `c.augmentOffer` exists and `c.augmentOffer.choices.includes(id)`, appends `id` to `c.augments`, clears `augmentOffer`, triggers `_recalc`, and chains `_checkAugmentOffer` for multi-level jumps.
  - `augmentReroll {}`: Validates `c.augmentOffer.rerolls > 0`, calls `rollAugmentChoices(c.champ, c.augments, 3, { guaranteeEpic: c.augmentOffer.level === 10 })`, replaces `choices`, and sets `rerolls = 0` (`slotRerolls` remains supported only for legacy callers).

### 14.6. Augment Quick Verification Commands
- Verify total count (`26`: `8` common, `10` rare, `8` epic), `18/18` champion Epic eligibility, and `100%` Epic appearance on Level 10 `guaranteeEpic: true`:
  ```bash
  node -e "import('./shared/moba/augments.js').then(async A => { const C = await import('./shared/moba/champions.js'); for (const id of C.CHAMPION_IDS) { const ch = A.rollAugmentChoices(id, [], 3, { guaranteeEpic: true }); console.log(id, ch); } })"
  ```
- Inspect exact Epic coverage per role: Tanks (`Stack`, `Brick`), Fighters (`Patch`), Assassins (`Zero`), Junglers (`Rush`, `Sprint`, `Pager`), Marksmen (`Tester`, `Swipe`, `Cache`), Mages (`Pixel`, `Mop`), Controllers (`Model`, `Lint`), Supports (`Ops`, `Volt`, `Hira`, `Brew`).

### 14.7. Summary of Anti-Snowball & Anti-Meta-Convergence Safeguards
- **2.0x Non-Crit Ceiling Preserved:** Even when stacking `Overload` (`+28%`) + `Execution Protocol` (`+14%`) + `Crowd Control` (`+15%`) + `Coordinated Strike` (`+12%`), `_damage` and `_dealDamage` enforce `AmpCeiling = (didCrit ? BaseAfterResist * 1.6 : BaseAfterResist) * 2.0 + 40`, preventing unavoidable 1-shot deletions.
- **No Unpunishable CC Extensions:** Augments never increase `stun` or `root` durations, keeping the tightened `CC_DR_MUL = [1.0, 0.50, 0.25]` + `2.0s` Chain Immunity guarantee intact across every Lv 5–18 build path.
- **Lv 10 Epic Pity + 1 Shared Reroll per Milestone:** Every champion sees their kit evolution by Lv 10 (`100%`), while capping rerolls at `3` per match preserves build variety and prevents deterministic 2-piece Synergy forcing.
- **Data-Driven Tiering Over Manual Labels:** Priority lists in Section 8 serve strictly as design hypotheses; automated Stage 2/3 telemetry evaluates **Win-Rate Delta by Champion, Milestone, Team Comp, and Pick Order** alongside Offered Pick Rate before adjusting rarity weights or synergy numbers.
- **Zero Augment Lockout on Multi-Level Jumps:** `_pickAugment` re-invokes `_checkAugmentOffer` recursively until caught up, ensuring Epic/takedown XP spikes never skip Level 5, 10, or 15 offers.
- **Anti-Convergence Telemetry Mandate:**
  - Any Augment or 2-piece Synergy (`Cascade Overflow`, `Immortal Hotfix`, `Shadow Ops`) exceeding `+3.0%` champion-normalized Win-Rate Delta paired with `> 65%` offered Pick Rate triggers immediate tuning.
  - High Pick Rate without positive Win-Rate Delta is logged as a "fun preference" rather than nerfed unnecessarily.
- **Verified Invariants:** Zero duplicate cards per 3-card draw, zero unowned tier crashes on pool exhaustion, and zero unintended `Server` / `Offline` divergence on Augment scaling.
