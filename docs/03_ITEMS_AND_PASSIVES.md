# Items Catalog, Recipes, Gold Efficiency & Build Synergies

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)
**Source:** `shared/moba/items.js` (41 items total: 1 Consumable, 10 Basic Gear, 30 Core Gear; 15 with passives/actives, 3 active items)

---

## 1. Inventory, Combine & Active Item Rules
- **Slots:** `6` slots max; `group: 'boots'` limited to 1 pair; `group: 'active'` limited to **1 active item** (triggered with key `[1]`).
- **Basic -> Core Recipe & Combine Rules (`recipePlan`, `applyBuy`):**
  - Every Core Gear item (`30/30`) builds from 2 Basic Gear components.
  - Owning any required component discounts the Core item by **100% of that component's gold cost** and consumes the component slot(s) upon purchase into the first consumed slot.
  - Upgrades are permitted even at **6/6 full inventory** or when upgrading `Office Sneakers` into Core Boots (`group: 'boots'`) because consumed slots are freed atomically before validation.
- **Active Item Specifications (`group: 'active'`, Key `[1]`):**
  - **Debugger Breakpoint (`freeze_frame`):** `60s` CD, `2s` invulnerable stasis (untargetable, cannot act; **not usable while stunned**).
  - **Git Revert Charm (`git_revert`):** `50s` CD, cleanses all active stuns, roots, and slows + `+35%` MS for `2s` (**usable while stunned**).
  - **Shadow Proxy (`shadow_proxy`):** `60s` CD, grants `240` shield (`3s`) + `+30%` MS + `1.8s` stealth veil (invisible beyond `280 px`, broken immediately on attack or skill cast; **not usable while stunned**).
- **Shop & Sell Rules:** Buy/sell only in fountain (`FOUNTAIN_RADIUS = 520 px`) or while dead. Sell refunds `70%` (`100%` undo within `10s` of purchase).

---

## 2. Stat Valuation & Gold Efficiency Baseline
Derived directly from single-stat Basic Gear items in `shared/moba/items.js`:

| Stat | Reference Basic Item | Cost / Stat | Gold per 1 Unit |
| :--- | :--- | :---: | :---: |
| **Attack Damage (AD)** | Gaming Mouse (`mouse`) | 350g / 12 AD | `29.17g / AD` |
| **Ability Power (AP)** | Tech Book (`tech_book`) | 400g / 25 AP | `16.00g / AP` |
| **Health (HP)** | Ergonomic Chair (`chair`) | 400g / 160 HP | `2.50g / HP` |
| **Armor** | Company Hoodie (`hoodie`) | 350g / 16 Armor | `21.88g / Armor` |
| **Mana** | Power Bank (`power_bank`) | 350g / 220 Mana | `1.59g / Mana` |
| **Cooldown Haste** | Pomodoro Timer (`pomodoro`) | 450g / 10% CDR | `45.00g / 1%` |
| **Move Speed (MS)** | Office Sneakers (`sneakers`) | 300g / 25 MS | `12.00g / MS` |
| **Attack Speed (AS)** | Caffeine Pills (`caffeine`) | 350g / 12% AS | `29.17g / 1%` |
| **Lifesteal (LS)** | Red Pen (`red_pen` minus 6 AD) | ~175g / 6% LS | `~29.17g / 1%` |
| **Magic Resistance (MR)** | Standing Desk / VPN Hoodie benchmark | - | `~20.00g / MR` |

---

## 3. Consumables (1 Item)
| ID | Name | Cost | Group | Stats / Effect | Stack Cap | Recommended For |
| :--- | :--- | :---: | :---: | :--- | :---: | :--- |
| `coffee` | **Coffee** | 50g | - | Restores `160 HP` + `70 Mana` over `6s` (`26.7 HP/s`, `11.7 Mana/s`) | `3` stacks (`COFFEE_MAX_STACK`) | Early lane sustain (cut by `Ignite` / `Grievous`) |

---

## 4. Basic Gear (10 Items) & Upgrade Paths
| ID | Name | Cost | Group | Stats | Builds Into (Core Gear Upgrades) |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `mouse` | **Gaming Mouse** | 350g | - | +12 AD | `rgb_keyboard`, `ultrawide`, `gauntlet`, `second_monitor`, `letter_opener`, `kanban`, `grievous_linter`, `crit_compiler`, `armor_shredder`, `shield_breaker`, `shadow_proxy` |
| `caffeine` | **Caffeine Pills** | 350g | - | +12% AS | `jetpack`, `rgb_keyboard`, `ultrawide`, `energy_crate` (x2), `crit_compiler`, `shield_breaker`, `shadow_proxy` |
| `red_pen` | **Red Pen** | 450g | - | +6 AD, +6% LS | `gauntlet`, `letter_opener`, `midnight_oil` |
| `tech_book` | **Tech Book** | 400g | - | +25 AP | `headphones`, `stackoverflow`, `cloud_credits`, `firewall`, `midnight_oil`, `frost_cache`, `freeze_frame` |
| `sticky_notes` | **Sticky Notes** | 350g | - | +12 AP, +120 Mana, +2.0 MP/s | `stackoverflow` |
| `chair` | **Ergonomic Chair** | 400g | - | +160 HP | `standing_desk`, `server_rack`, `vpn_hoodie`, `thornmail_rack`, `guardian_backup`, `git_revert`, `kanban`, `team_lunch`, `cloud_credits`, `frost_cache` |
| `hoodie` | **Company Hoodie** | 350g | - | +16 Armor | `slippers`, `standing_desk`, `server_rack`, `vpn_hoodie`, `thornmail_rack`, `guardian_backup`, `git_revert`, `firewall`, `freeze_frame` |
| `power_bank` | **Power Bank** | 350g | - | +220 Mana, +2.5 MP/s | `rubber_duck`, `team_lunch` |
| `pomodoro` | **Pomodoro Timer** | 450g | - | +10% CDR | `smartwatch`, `headphones`, `rubber_duck`, `second_monitor`, `grievous_linter` |
| `sneakers` | **Office Sneakers** | 300g | `boots` | +25 MS | `jetpack`, `slippers`, `smartwatch` |

---

## 5. Core Gear (30 Items — With Basic -> Core Recipes)
| ID | Name | Cost (Combine) | Recipe (Builds From) | Group | Stats | Passive / Active | Recommended For |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| `jetpack` | **Jetpack Sneakers** | 1100g (450g) | `sneakers` + `caffeine` | `boots` | +45 MS, +20% AS | _Stat-only_ | Tester, Swipe, Cache |
| `slippers` | **Fuzzy Slippers** | 1000g (350g) | `sneakers` + `hoodie` | `boots` | +45 MS, +20 Armor | _Stat-only_ | Tanks / Bruisers vs AD |
| `smartwatch` | **Smartwatch** | 1000g (250g) | `sneakers` + `pomodoro` | `boots` | +45 MS, +12% CDR | _Stat-only_ | Lint, Mages, Supports |
| `rubber_duck` | **Rubber Duck** | 1100g (300g) | `power_bank` + `pomodoro` | - | +20% CDR, +250 Mana, +4.5 MP/s | _Stat-only_ | Ops, Model, Volt, Hira |
| `team_lunch` | **Team Lunch** | 1500g (750g) | `chair` + `power_bank` | - | +200 HP, +200 Mana, +15% CDR, +4.0 MP/s | _Stat-only_ | Ops, Hira, Brew |
| `rgb_keyboard` | **RGB Mechanical Keyboard** | 1300g (600g) | `mouse` + `caffeine` | - | +35 AD, +15% AS | _Stat-only_ | Rush, Swipe, Cache, Pager |
| `second_monitor` | **Second Monitor** | 1250g (450g) | `mouse` + `pomodoro` | - | +25 AD, +15% CDR | _Stat-only_ | Sprint |
| `energy_crate` | **Energy Drink Crate** | 1250g (550g) | `caffeine` + `caffeine` | - | +30% AS, +15 MS | _Stat-only_ | Cache |
| `gauntlet` | **Git Blame Gauntlet** | 1500g (700g) | `mouse` + `red_pen` | - | +30 AD, +12% LS | **execute:** +15% bonus damage to enemies `< 35%` HP. | Zero, Rush, Patch, Swipe, Sprint, Pager |
| `kanban` | **Kanban Board** | 1800g (1050g) | `mouse` + `chair` | - | +30 AD, +250 HP, +10% CDR | _Stat-only_ | Brick, Rush, Patch, Pager |
| `headphones` | **Noise-Cancelling Headphones** | 1400g (550g) | `tech_book` + `pomodoro` | - | +60 AP, +10% CDR | _Stat-only_ | Pixel, Ops, Model, Mop, Volt, Lint, Brew |
| `cloud_credits` | **Cloud Credits** | 1350g (550g) | `tech_book` + `chair` | - | +55 AP, +220 HP | _Stat-only_ | Hira, Lint |
| `firewall` | **Firewall Appliance** | 2000g (1250g) | `tech_book` + `hoodie` | - | +65 AP, +30 Armor, +30 MR | _Stat-only_ | Model, Volt, Brew |
| `standing_desk` | **Standing Desk** | 1300g (550g) | `chair` + `hoodie` | - | +220 HP, +30 Armor, +20 MR | _Stat-only_ | Stack, Brick, Patch, Swipe, Sprint, Pager |
| `vpn_hoodie` | **VPN Hoodie** | 2400g (1650g) | `chair` + `hoodie` | - | +300 HP, +35 Armor, +45 MR, +10% CDR | _Stat-only_ | Hira, Lint, Tanks vs AP |
| `ultrawide` | **Ultrawide Monitor** | 2700g (2000g) | `mouse` + `caffeine` | - | +65 AD, +25% AS | **crit:** 20% chance for basic attacks to deal 160% damage. | Tester, Rush, Swipe, Cache |
| `letter_opener` | **Letter Opener** | 2900g (2100g) | `mouse` + `red_pen` | - | +55 AD, +20% AS, +10% LS | _Stat-only_ | Sprint, Cache |
| `stackoverflow` | **Stack Overflow Premium** | 2800g (2050g) | `tech_book` + `sticky_notes` | - | +110 AP, +25% AP | **overclock:** +12% skill damage vs targets `> 50%` HP. | Pixel, Ops, Model, Mop, Volt, Lint |
| `midnight_oil` | **Midnight Oil** | 2200g (1350g) | `tech_book` + `red_pen` | - | +80 AP, +12% LS, +25% MPen | **burn:** Skills deal `+25` bonus burn damage. | Mop, Brew, Pixel |
| `server_rack` | **Server Rack Armor** | 2600g (1850g) | `chair` + `hoodie` | - | +400 HP, +45 Armor, +30 MR | **fortress:** Reduces all incoming damage by `10%`. | Stack, Brick, Patch |
| `crit_compiler` | **JIT Compiler** | 2600g (1900g) | `mouse` + `caffeine` | - | +55 AD, +25% AS | **crit3:** Every 3rd basic attack deals 160% damage. | Tester, Zero |
| `grievous_linter` | **Strict Linter** | 1900g (1100g) | `mouse` + `pomodoro` | - | +45 AD, +10% CDR | **grievous:** Attacks & skills cut enemy healing by `40%` (`3s`). | Tester |
| `frost_cache` | **Cold Cache** | 2200g (1400g) | `tech_book` + `chair` | - | +65 AP, +240 HP | **frost:** Skills slow enemies by `25%` for `1.5s`. | Pixel |
| `thornmail_rack` | **Thornmail Firewall** | 2100g (1350g) | `chair` + `hoodie` | - | +320 HP, +55 Armor | **thorns:** Reflects `18%` of attack & skill damage to attackers. | Stack |
| `guardian_backup` | **Cloud Backup** | 2500g (1750g) | `chair` + `hoodie` | - | +280 HP, +35 Armor, +35 MR | **lifeline:** `< 30%` HP grants `260` shield for `3s` (`45s` CD). | Stack |
| `armor_shredder` | **Root Sudo** | 2400g (1700g) | `mouse` + `mouse` | - | +50 AD, +30% Pen | **shred:** Ignores `30%` of target armor. | Tester, Zero |
| `shield_breaker` | **CORS Bypass** | 2100g (1400g) | `mouse` + `caffeine` | - | +45 AD, +15% AS | **anti_shield:** Deals `+50%` bonus damage to enemy shields. | _Situational_ |
| `freeze_frame` | **Debugger Breakpoint** | 2500g (1750g) | `tech_book` + `hoodie` | `active` | +70 AP, +35 Armor | **stasis [1]:** `2s` invulnerable stasis (`60s` CD). | Pixel |
| `git_revert` | **Git Revert Charm** | 1800g (1050g) | `chair` + `hoodie` | `active` | +250 HP, +20 Armor, +25 MR | **cleanse [1]:** Cleanse CC + `35%` MS (`2s`, `50s` CD). Usable stunned. | Zero |
| `shadow_proxy` | **Shadow Proxy** | 2400g (1700g) | `mouse` + `caffeine` | `active` | +50 AD, +20% AS | **veil [1]:** `240` shield + `30%` MS + `1.8s` stealth (`60s` CD). | Marksmen / Assassins |

---

## 6. Passive & Active Interaction Rules
- **Unique Passive Enforcement:** `itemPassives(inventory)` returns a `Set` of passive IDs (`execute`, `overclock`, `burn`, `fortress`, `crit`, `crit3`, `grievous`, `frost`, `thorns`, `lifeline`, `shred`, `anti_shield`, `stasis`, `cleanse`, `veil`). Buying duplicate copies of the same Core item grants its additive stats (`ad`, `ap`, `armor`, `mr`, etc.) but **never** duplicates its passive trigger.
- **Crit Non-Stacking:** Owning both `Ultrawide Monitor` (`crit`) and `JIT Compiler` (`crit3`) increases crit reliability (guaranteed every 3rd hit + 20% on others) without ever stacking to `2.56x`.
- **Executioner + Execution Protocol:** `Git Blame Gauntlet` (`+15% < 35% HP`) and `Execution Protocol` Augment (`+14% < 25% HP`) stack multiplicatively (`1.15 * 1.14 = 1.311x`) within the global `2.0x` Damage Amp Cap.
- **Lifeline & Last Stand Separation:** `Cloud Backup` (`lifeline`) grants a `260` shield for `3s` (`45s` CD on `_lifelineCd`), while `Last Stand` Augment grants `15%` damage reduction for `3s` (`45s` CD on `_augCd.last_stand`). Both can trigger simultaneously below `30%` HP.
- **Thorns Reflection Scope:** `Thornmail Firewall` reflects `18%` post-mitigation attack and skill damage (`kind === 'atk' || kind === 'skill'`) back to non-structure, non-pet champion attackers (floored at `1 HP` so reflection does not steal kill credit without direct action).

---

## 7. Full 18-Champion Recommended Build Summary & Counter-Swaps
*Note: Bots follow `CHAMPIONS[id].build` strictly in order; human players can swap slots 5–6 based on enemy threats.*

| Champion | Recommended 6-Item Path (`CHAMPIONS[id].build`) | Full Build Cost | Key Stat Profile | Situational Counter Swap |
| :--- | :--- | :---: | :--- | :--- |
| **Pixel** | `tech_book` -> `sneakers` -> `headphones` -> `frost_cache` -> `stackoverflow` -> `freeze_frame` | 9,600g | High AP (+25% AP), 25% Slow, Stasis `[1]` | Swap `frost_cache` -> `midnight_oil` vs high-MR tanks |
| **Stack** | `chair` -> `sneakers` -> `standing_desk` -> `thornmail_rack` -> `server_rack` -> `guardian_backup` | 9,200g | +1,160 HP, +135 Armor, +85 MR, -10% Dmg, Thorns | Upgrade `sneakers` -> `slippers`; swap `thornmail_rack` -> `vpn_hoodie` vs heavy AP |
| **Ops** | `power_bank` -> `sneakers` -> `rubber_duck` -> `team_lunch` -> `headphones` -> `stackoverflow` | 7,450g | 40% CDR Cap, +11.0 MP/s, High AP/Heal scaling | Upgrade `sneakers` -> `smartwatch` |
| **Tester** | `mouse` -> `jetpack` -> `crit_compiler` -> `grievous_linter` -> `ultrawide` -> `armor_shredder` | 11,050g | +222 AD, +70% AS, Crit3+20%, -40% Heal, 30% Pen | Swap `grievous_linter` -> `shadow_proxy` vs assassins |
| **Zero** | `red_pen` -> `sneakers` -> `gauntlet` -> `armor_shredder` -> `crit_compiler` -> `git_revert` | 10,650g | +141 AD, +18% LS, 30% Pen, Crit3, Cleanse `[1]` | Swap `crit_compiler` -> `shield_breaker` vs double shield |
| **Model** | `tech_book` -> `sneakers` -> `headphones` -> `stackoverflow` -> `rubber_duck` -> `firewall` | 8,000g | +325 AP (+25%), 30% CDR, +30 Armor/MR | Swap `rubber_duck` -> `midnight_oil` for +25% MPen |
| **Brick** | `chair` -> `sneakers` -> `standing_desk` -> `hoodie` -> `kanban` -> `server_rack` | 6,750g | +1,030 HP, +91 Armor, +50 MR, -10% Dmg | Upgrade `sneakers` -> `slippers`; `hoodie` -> `vpn_hoodie` |
| **Mop** | `tech_book` -> `sneakers` -> `headphones` -> `midnight_oil` -> `stackoverflow` -> `pomodoro` | 7,550g | +344 AP, 20% CDR, 25% MPen, Burn + Slow | Upgrade `pomodoro` -> `smartwatch` / `freeze_frame` |
| **Rush** | `mouse` -> `sneakers` -> `gauntlet` -> `kanban` -> `rgb_keyboard` -> `ultrawide` | 7,950g | +172 AD, +40% AS, +250 HP, Crit + Execute | Upgrade `sneakers` -> `jetpack`; swap `rgb_keyboard` -> `git_revert` |
| **Volt** | `power_bank` -> `sneakers` -> `headphones` -> `rubber_duck` -> `firewall` -> `stackoverflow` | 8,050g | +294 AP, 30% CDR, +7.0 MP/s, +30 Armor/MR | Swap `firewall` -> `team_lunch` for 40% CDR |
| **Patch** | `mouse` -> `sneakers` -> `gauntlet` -> `kanban` -> `standing_desk` -> `server_rack` | 7,850g | +72 AD, +870 HP, +75 Armor, +50 MR, -10% Dmg | Swap `standing_desk` -> `armor_shredder` when ahead |
| **Swipe** | `caffeine` -> `jetpack` -> `rgb_keyboard` -> `gauntlet` -> `ultrawide` -> `standing_desk` | 8,250g | +130 AD, +72% AS, +220 HP, +30 Armor, +20 MR | Swap `standing_desk` -> `shadow_proxy` for stealth peel |
| **Sprint** | `red_pen` -> `sneakers` -> `gauntlet` -> `second_monitor` -> `standing_desk` -> `letter_opener` | 7,700g | +116 AD, +28% LS, 15% CDR, +220 HP | Swap `second_monitor` -> `armor_shredder` vs tanks |
| **Cache** | `mouse` -> `jetpack` -> `rgb_keyboard` -> `energy_crate` -> `ultrawide` -> `letter_opener` | 9,600g | +167 AD, +85% AS, +60 MS, Crit + LS | Swap `energy_crate` -> `shadow_proxy` or `shield_breaker` |
| **Hira** | `power_bank` -> `sneakers` -> `rubber_duck` -> `team_lunch` -> `cloud_credits` -> `vpn_hoodie` | 7,000g | +720 HP, 45% CDR (40% cap), +11.0 MP/s, +45 MR | Upgrade `sneakers` -> `smartwatch` |
| **Lint** | `tech_book` -> `smartwatch` -> `headphones` -> `cloud_credits` -> `stackoverflow` -> `vpn_hoodie` | 9,350g | +312 AP, 32% CDR, +520 HP, +45 MR | Swap `cloud_credits` -> `midnight_oil` for +25% MPen |
| **Brew** | `power_bank` -> `sneakers` -> `team_lunch` -> `headphones` -> `firewall` -> `midnight_oil` | 7,750g | +205 AP, 25% CDR, 25% MPen, +30 Armor/MR | Swap `power_bank` -> `rubber_duck` late game |
| **Pager** | `red_pen` -> `sneakers` -> `gauntlet` -> `kanban` -> `rgb_keyboard` -> `standing_desk` | 6,650g | +101 AD, +470 HP, +30 Armor, +20 MR, Execute | Upgrade `sneakers` -> `slippers`; swap `rgb_keyboard` -> `git_revert` |


---

## 8. Individual Core Item Engineering Profiles (All 30 Core Items)

Each profile documents exact combine economics, stat efficiency, simulation hooks (`OfflineSim.js` / `TeamRoom.js`), and optimal champion pairings.

### 8.1. Mobility Boots Upgrades (`group: 'boots'`, max 1 pair)
1. **Jetpack Sneakers (`jetpack` — 1100g | Combine: 450g from `sneakers` + `caffeine`)**
   - *Stats:* `+45 MS`, `+20% AS`.
   - *Role:* Standard Marksman and AS-bruiser boot upgrade; provides `+20 MS` and `+8% AS` over its components for `450g`.
2. **Fuzzy Slippers (`slippers` — 1000g | Combine: 350g from `sneakers` + `hoodie`)**
   - *Stats:* `+45 MS`, `+20 Armor`.
   - *Role:* Anti-physical boot upgrade for Tanks (`Stack`, `Brick`) and melee Junglers facing AD-heavy teams.
3. **Smartwatch (`smartwatch` — 1000g | Combine: 250g from `sneakers` + `pomodoro`)**
   - *Stats:* `+45 MS`, `+12% CDR`.
   - *Role:* Lowest combine cost (`250g`) in the shop; ideal for Mages (`Lint`, `Pixel`) and Supports (`Ops`, `Hira`) rushing the `40%` Haste cap.

### 8.2. Attack Damage, Attack Speed & Penetration Core
4. **RGB Mechanical Keyboard (`rgb_keyboard` — 1300g | Combine: 600g from `mouse` + `caffeine`)**
   - *Stats:* `+35 AD`, `+15% AS`.
   - *Role:* Cost-efficient early AD/AS spike (`1,458g` raw stat value for `1,300g` = `112%` gold efficient) for `Swipe`, `Cache`, `Rush`, and `Pager`.
5. **Second Monitor (`second_monitor` — 1250g | Combine: 450g from `mouse` + `pomodoro`)**
   - *Stats:* `+25 AD`, `+15% CDR`.
   - *Role:* Ability-caster AD bridge item for `Sprint`, `Patch`, and `Pager`.
6. **Energy Drink Crate (`energy_crate` — 1250g | Combine: 550g from `caffeine` + `caffeine`)**
   - *Stats:* `+30% AS`, `+15 MS`.
   - *Role:* Pure kiting and attack-speed amplifier; pairs with `Cache`'s `Cache Hit` passive.
7. **Git Blame Gauntlet (`gauntlet` — 1500g | Combine: 700g from `mouse` + `red_pen`)**
   - *Stats:* `+30 AD`, `+12% LS`.
   - *Passive (`execute`):* `+15%` bonus damage to targets `< 35%` HP (evaluated inside `_damage`, capped within `2.0x` ceiling).
8. **Kanban Board (`kanban` — 1800g | Combine: 1050g from `mouse` + `chair`)**
   - *Stats:* `+30 AD`, `+250 HP`, `+10% CDR`.
   - *Role:* Core fighter/juggernaut stat stick (`Brick`, `Patch`, `Rush`, `Pager`).
9. **Strict Linter (`grievous_linter` — 1900g | Combine: 1100g from `mouse` + `pomodoro`)**
   - *Stats:* `+45 AD`, `+10% CDR`.
   - *Passive (`grievous`):* Sets `target._grievousUntil = t + 3000`, cutting enemy healing/regen/lifesteal by `40%`. Mandatory counter vs `Ops`, `Brew`, `Hira`, and `Patch`.
10. **CORS Bypass (`shield_breaker` — 2100g | Combine: 1400g from `mouse` + `caffeine`)**
    - *Stats:* `+45 AD`, `+15% AS`.
    - *Passive (`anti_shield`):* Multiplies damage absorbed by enemy shields by `1.50x` (`shieldDmg = dmg * 1.5`) before subtracting shield HP. Counters `Stack W`, `Brick W`, `Ops R`, and `Cloud Backup`.
11. **Root Sudo (`armor_shredder` — 2400g | Combine: 1700g from `mouse` + `mouse`)**
    - *Stats:* `+50 AD`, `+30% Armor Pen`.
    - *Passive (`shred`):* Applied in step 2 of `damageAfterResist`, bypassing `30%` of post-shred Armor on champions and towers.
12. **JIT Compiler (`crit_compiler` — 2600g | Combine: 1900g from `mouse` + `caffeine`)**
    - *Stats:* `+55 AD`, `+25% AS`.
    - *Passive (`crit3`):* Deterministic `1.60x` critical strike on every 3rd non-pet basic attack (`_atkCount % 3 === 0`).
13. **Ultrawide Monitor (`ultrawide` — 2700g | Combine: 2000g from `mouse` + `caffeine`)**
    - *Stats:* `+65 AD`, `+25% AS`.
    - *Passive (`crit`):* `20%` chance per basic attack to deal `1.60x` critical damage (does not stack with `crit3` on the same swing).
14. **Letter Opener (`letter_opener` — 2900g | Combine: 2100g from `mouse` + `red_pen`)**
    - *Stats:* `+55 AD`, `+20% AS`, `+10% LS`.
    - *Role:* Highest-cost luxury AD sustain slot (`2,900g`) for late-game `Cache` and `Sprint`.

### 8.3. Ability Power, Mana & Support Core
15. **Rubber Duck (`rubber_duck` — 1100g | Combine: 300g from `power_bank` + `pomodoro`)**
    - *Stats:* `+20% CDR`, `+250 Mana`, `+4.5 Mana/s`.
    - *Role:* Premier early support/caster battery; solves early mana drain immediately for `300g` combine fee.
16. **Cloud Credits (`cloud_credits` — 1350g | Combine: 550g from `tech_book` + `chair`)**
    - *Stats:* `+55 AP`, `+220 HP`.
    - *Role:* Mid-game AP bruiser/controller bridge (`Hira`, `Lint`).
17. **Noise-Cancelling Headphones (`headphones` — 1400g | Combine: 550g from `tech_book` + `pomodoro`)**
    - *Stats:* `+60 AP`, `+10% CDR`.
    - *Role:* Bread-and-butter 1st/2nd core AP spike (`1,410g` raw stat value) for all Mages and AP Supports.
18. **Team Lunch (`team_lunch` — 1500g | Combine: 750g from `chair` + `power_bank`)**
    - *Stats:* `+200 HP`, `+200 Mana`, `+15% CDR`, `+4.0 Mana/s`.
    - *Role:* Enchanter durability + sustain core; pairs with `Rubber Duck` for `35%` CDR and `+8.5 Mana/s`.
19. **Firewall Appliance (`firewall` — 2000g | Combine: 1250g from `tech_book` + `hoodie`)**
    - *Stats:* `+65 AP`, `+30 Armor`, `+30 MR`.
    - *Role:* Hybrid battle-mage/support defensive AP item (`Model`, `Volt`, `Brew`).
20. **Cold Cache (`frost_cache` — 2200g | Combine: 1400g from `tech_book` + `chair`)**
    - *Stats:* `+65 AP`, `+240 HP`.
    - *Passive (`frost`):* Every skill hit applies a `25%` slow for `1.5s`, enabling `Crowd Control` (`+15%` dmg) Augment uptime on `Pixel`.
21. **Midnight Oil (`midnight_oil` — 2200g | Combine: 1350g from `tech_book` + `red_pen`)**
    - *Stats:* `+80 AP`, `+12% LS`, `+25% MR Pen`.
    - *Passive (`burn`):* Adds `+25` bonus burn damage on non-structure skill/attack hits; sole `MR Pen` item for piercing tank `MR`.
22. **Stack Overflow Premium (`stackoverflow` — 2800g | Combine: 2050g from `tech_book` + `sticky_notes`)**
    - *Stats:* `+110 AP`, `+25% Total AP`.
    - *Passive (`overclock`):* `+12%` bonus damage against targets `> 50%` HP; primary late-game AP capstone (`ap = (b.ap + it.ap) * (1 + it.apPct)`).

### 8.4. Tank & Defensive Core
23. **Standing Desk (`standing_desk` — 1300g | Combine: 550g from `chair` + `hoodie`)**
    - *Stats:* `+220 HP`, `+30 Armor`, `+20 MR`.
    - *Role:* Affordable mixed-resistance staple (`1,606g` stat value = `123%` gold efficient) for tanks and marksmen needing survival.
24. **Thornmail Firewall (`thornmail_rack` — 2100g | Combine: 1350g from `chair` + `hoodie`)**
    - *Stats:* `+320 HP`, `+55 Armor`.
    - *Passive (`thorns`):* Reflects `18%` of post-mitigation attack and skill damage back to non-pet champion attackers (floored at `1 HP`).
25. **VPN Hoodie (`vpn_hoodie` — 2400g | Combine: 1650g from `chair` + `hoodie`)**
    - *Stats:* `+300 HP`, `+35 Armor`, `+45 MR`, `+10% CDR`.
    - *Role:* Highest single-item `MR` (`+45`) in the game; primary anti-mage defensive core.
26. **Cloud Backup (`guardian_backup` — 2500g | Combine: 1750g from `chair` + `hoodie`)**
    - *Stats:* `+280 HP`, `+35 Armor`, `+35 MR`.
    - *Passive (`lifeline`):* Triggers automatically when incoming damage drops HP `< 30%`, granting a `260` shield for `3s` (`45s` CD).
27. **Server Rack Armor (`server_rack` — 2600g | Combine: 1850g from `chair` + `hoodie`)**
    - *Stats:* `+400 HP`, `+45 Armor`, `+30 MR`.
    - *Passive (`fortress`):* Flat `0.90x` multiplier (`-10%`) to all incoming physical and magic damage after resistance checks (tuned down from 450/50/35 so `-10%` mitigation carries real stat trade-off).

### 8.5. Active Utility Items (`group: 'active'`, Key `[1]`, max 1)
28. **Git Revert Charm (`git_revert` — 1800g | Combine: 1050g from `chair` + `hoodie`)**
    - *Stats:* `+250 HP`, `+20 Armor`, `+25 MR`.
    - *Active (`cleanse`, `50s` CD):* Clears `stunnedUntil`, `rootedUntil`, `slowUntil` and grants `+35%` MS for `2s`. **Usable while stunned**.
29. **Shadow Proxy (`shadow_proxy` — 2400g | Combine: 1700g from `mouse` + `caffeine`)**
    - *Stats:* `+50 AD`, `+20% AS`.
    - *Active (`veil`, `60s` CD):* Grants `240` shield (`3s`), `+30%` MS, and `1.8s` stealth (`_stealthUntil`, broken on attack/cast or `< 280 px` proximity).
30. **Debugger Breakpoint (`freeze_frame` — 2500g | Combine: 1750g from `tech_book` + `hoodie`)**
    - *Stats:* `+70 AP`, `+35 Armor`.
    - *Active (`stasis`, `60s` CD):* Grants `2s` invulnerability (`_stasisUntil`), blocking all damage and targeting while immobilizing the user (`not usable while stunned`).


---

## 9. Basic Gear & Consumable Engineering Profiles (11 Items)

1. **`coffee` — Coffee (`50g`, Consumable):** Restores `160 HP` and `70 Mana` over `6s` (`26.7 HP/s`, `11.7 Mana/s`). Up to `3` stacks queue in `ch.regens` on server; cut by `-50%` under `Escalate` (`Ignite`) or `-40%` under `Strict Linter`.
2. **`mouse` — Gaming Mouse (`350g`, Basic):** `+12 AD` (`29.17g / AD`). Core building block for 11 AD/Crit/Armor-Pen Core items; standard Lv 1 start for `Tester`, `Rush`, `Patch`, `Cache`.
3. **`caffeine` — Caffeine Pills (`350g`, Basic):** `+12% AS` (`29.17g / 1% AS`). Essential early attack-speed component; builds into `Jetpack Sneakers` and 6 AD/AS Core items (`Energy Drink Crate` uses two).
4. **`red_pen` — Red Pen (`450g`, Basic):** `+6 AD`, `+6% Lifesteal`. Dual-stat jungle/assassin starter (`Zero`, `Sprint`, `Pager`) providing early camp sustain; builds into `Git Blame Gauntlet`, `Letter Opener`, and `Midnight Oil`.
5. **`tech_book` — Tech Book (`400g`, Basic):** `+25 AP` (`16.00g / AP`). Standard Lv 1 start for `Pixel`, `Model`, `Mop`, `Lint`; builds into 7 AP Core items.
6. **`sticky_notes` — Sticky Notes (`350g`, Basic):** `+12 AP`, `+120 Mana`, `+2.0 Mana/s`. Hybrid AP/mana-regen bridge (`192g` AP + `191g` Mana + regen); upgrades directly into `Stack Overflow Premium`.
7. **`chair` — Ergonomic Chair (`400g`, Basic):** `+160 HP` (`2.50g / HP`). Tank Lv 1 starter (`Stack`, `Brick`); builds into all 6 Tank defensive Core items plus `Kanban Board`, `Team Lunch`, `Cloud Credits`, and `Cold Cache`.
8. **`hoodie` — Company Hoodie (`350g`, Basic):** `+16 Armor` (`21.88g / Armor`). Early physical mitigation component; builds into `Fuzzy Slippers`, `Firewall Appliance`, `Debugger Breakpoint`, and all 6 Tank Core items.
9. **`power_bank` — Power Bank (`350g`, Basic):** `+220 Mana`, `+2.5 Mana/s`. Support Lv 1 starter (`Ops`, `Volt`, `Hira`, `Brew`), adding `+150 Mana/min` regen in lane; builds into `Rubber Duck` and `Team Lunch`.
10. **`pomodoro` — Pomodoro Timer (`450g`, Basic):** `+10% CDR` (`45.00g / 1%`). Early ability haste component; upgrades into `Smartwatch`, `Noise-Cancelling Headphones`, `Rubber Duck`, `Second Monitor`, and `Strict Linter`.
11. **`sneakers` — Office Sneakers (`300g`, Basic | `group: 'boots'`):** `+25 MS` (`12.00g / MS`). Only 1 pair of boots allowed; upgrades cleanly at 6/6 slots into `Jetpack Sneakers`, `Fuzzy Slippers`, or `Smartwatch`.

---

## 10. Counter-Building Playbook & Gold-Timing Benchmarks

### 10.1. Threat-to-Counter Decision Matrix
| Enemy Threat / Comp | Immediate Counter Item(s) | Cost | Mechanical Impact |
| :--- | :--- | :---: | :--- |
| **Heavy Healing (`Ops`, `Brew`, `Hira`, `Patch`)** | `Strict Linter` (`grievous_linter`) | 1,900g | Cuts enemy healing/regen/lifesteal by `40%` for `3s` on hit |
| **Big Shields (`Stack W`, `Brick W`, `Ops R`, `Cloud Backup`)** | `CORS Bypass` (`shield_breaker`) | 2,100g | Deals `+50%` bonus damage against shields |
| **High-Armor Tanks (`Stack`, `Brick`, `Server Rack`)** | `Root Sudo` (`armor_shredder`) | 2,400g | Ignores `30%` of post-shred Armor (`+50 AD`) |
| **High-MR Frontline (`VPN Hoodie`, `Server Rack`)** | `Midnight Oil` (`midnight_oil`) | 2,200g | Ignores `25%` of Magic Resistance (`+80 AP`, `+25` burn) |
| **Fed Burst Mages (`Pixel`, `Model`, `Mop`)** | `VPN Hoodie` (`vpn_hoodie`) + `Cloud Backup` | 4,900g (`2,400g + 2,500g`) | `+45 MR` + `+35 MR` + `260` emergency lifeline shield |
| **Lockdown CC Chains (`Stack`, `Hira`, `Lint`, `Pager`)** | `Git Revert Charm` (`git_revert`, Key `[1]`) | 1,800g | Cleanses stuns/roots/slows while stunned + `+35% MS` |
| **Dive Assassins (`Zero`, `Rush`, `Pager`)** | `Debugger Breakpoint` (`freeze_frame`) / `Shadow Proxy` | 2,500g / 2,400g | `2s` Stasis invulnerability (AP) or `1.8s` Veil stealth + `240` shield (AD) |

### 10.2. Expected Gold & Item Progression Timeline
| Match Time | Expected Cumulative Gold | Typical Inventory State | Power Milestone |
| :---: | :---: | :--- | :--- |
| **0:00** | `500g` | `1` Basic Gear (`300–450g`) + `1–2` `Coffee` (`50g`) | Initial lane / jungle clear |
| **3:00** | `1,300 – 1,600g` | `Office Sneakers` + `1` Core item or 2 Basic components | Golden Bug skirmish readiness |
| **6:00** | `2,600 – 3,200g` | Upgraded Core Boots + `1st` full Core Gear + `1` Basic | Lv 6–8 Ultimate spike |
| **10:00** | `4,800 – 5,800g` | `2` Core Gear + Core Boots + component | Lv 10 Augment #2 + mid-game teamfights |
| **15:00** | `7,500 – 9,500g` | `4–5` Core Gear (near full build) | Lv 15 Augment #3 + `The Deadline` push |
| **18:00+** | `10,000g+` | Full `6`-slot Core Build (Active `[1]` equipped) | Late-game Core siege / Crunch check |


---

## 11. Complete 30 Core Items — Gold Efficiency & Stat-Value Breakdown

Using Section 2's Basic Gear baseline (`AD = 29.17g`, `AP = 16.00g`, `HP = 2.50g`, `Armor = 21.88g`, `MR ~ 20.00g`, `Mana = 1.59g`, `CDR = 45.00g/%`, `MS = 12.00g`, `AS = 29.17g/%`, `LS = 29.17g/%`):

| Item ID | Name | Cost | Pure Stat Gold Value | Efficiency (Before Passive) | Passive / Active Value Note |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `jetpack` | Jetpack Sneakers | 1,100g | 1,123g | `102.1%` | Core boots slot |
| `slippers` | Fuzzy Slippers | 1,000g | 978g | `97.8%` | Budget anti-AD boots |
| `smartwatch` | Smartwatch | 1,000g | 1,080g | `108.0%` | Highest CDR efficiency boots |
| `rubber_duck` | Rubber Duck | 1,100g | 1,298g (+regen) | `118.0%+` | Best early mana/CDR battery |
| `team_lunch` | Team Lunch | 1,500g | 1,493g (+regen) | `99.5%+` | Balanced sustain + CDR |
| `rgb_keyboard` | RGB Mechanical Keyboard | 1,300g | 1,458g | `112.2%` | High early AD/AS efficiency |
| `second_monitor` | Second Monitor | 1,250g | 1,404g | `112.3%` | Strong AD caster spike |
| `energy_crate` | Energy Drink Crate | 1,250g | 1,055g | `84.4%` | Premium `+30%` AS + `+15` MS mobility |
| `gauntlet` | Git Blame Gauntlet | 1,500g | 1,225g | `81.7%` | `+15%` Execute passive (`< 35%` HP) |
| `kanban` | Kanban Board | 1,800g | 1,950g | `108.3%` | Efficient fighter stat package |
| `headphones` | Noise-Cancelling Headphones | 1,400g | 1,410g | `100.7%` | Standard mage/support spike |
| `cloud_credits` | Cloud Credits | 1,350g | 1,430g | `105.9%` | Efficient AP + HP bruiser bridge |
| `firewall` | Firewall Appliance | 2,000g | 2,296g | `114.8%` | Strongest mixed AP/Armor/MR stat stick |
| `standing_desk` | Standing Desk | 1,300g | 1,606g | `123.5%` | Highest raw defensive gold efficiency |
| `vpn_hoodie` | VPN Hoodie | 2,400g | 2,866g | `119.4%` | Premier anti-AP tank/support core |
| `ultrawide` | Ultrawide Monitor | 2,700g | 2,625g | `97.2%` | `20%` Crit (`1.60x`) scaling |
| `letter_opener` | Letter Opener | 2,900g | 2,480g | `85.5%` | All-in-one AD/AS/LS slot compression |
| `stackoverflow` | Stack Overflow Premium | 2,800g | 1,760g (+25% AP) | `120%+` late | Scales total AP multiplicatively + `+12%` Overclock |
| `midnight_oil` | Midnight Oil | 2,200g | 1,630g (+25% MPen) | `105%+` | Sole `MR Pen` + `+25` burn passive |
| `server_rack` | Server Rack Armor | 2,600g | 2,584g | `99.4%` | Pays a deliberate `-10%` stat-value trade-off for Fortress `-10%` damage reduction |
| `crit_compiler` | JIT Compiler | 2,600g | 2,334g | `89.8%` | Deterministic every-3rd-hit `1.60x` crit |
| `grievous_linter` | Strict Linter | 1,900g | 1,763g | `92.8%` | `-40%` enemy healing on hit (`3s`) |
| `frost_cache` | Cold Cache | 2,200g | 1,640g | `74.5%` | `25%` skill slow (`1.5s`) + `Crowd Control` synergy |
| `thornmail_rack` | Thornmail Firewall | 2,100g | 2,003g | `95.4%` | `18%` attack & skill damage reflection |
| `guardian_backup` | Cloud Backup | 2,500g | 2,166g | `86.6%` | `260` Lifeline emergency shield (`45s` CD) |
| `armor_shredder` | Root Sudo | 2,400g | 1,458g (+30% Pen) | `100%+` vs armor | Essential late-game tank buster |
| `shield_breaker` | CORS Bypass | 2,100g | 1,750g | `83.3%` | `+50%` shield damage multiplier |
| `freeze_frame` | Debugger Breakpoint | 2,500g | 1,886g | `75.4%` | `2s` Invulnerable Stasis active (`[1]`) |
| `git_revert` | Git Revert Charm | 1,800g | 1,563g | `86.8%` | Usable-while-stunned Cleanse + `35%` MS (`[1]`) |
| `shadow_proxy` | Shadow Proxy | 2,400g | 2,042g | `85.1%` | `1.8s` Stealth Veil + `240` shield + `30%` MS (`[1]`) |

---

## 12. Role-Based 6-Slot Build Curves & Upgrade Paths

### 12.1. Marksman (`Tester`, `Swipe`, `Cache`)
1. **Start (`0:00`):** `Gaming Mouse` (`350g`) + `Coffee` (`50g`).
2. **First Back (`~1,050g`):** `Office Sneakers` (`300g`) + `Caffeine Pills` (`350g`) -> upgrade to `Jetpack Sneakers` (`450g` combine).
3. **Core 1–2 (`4:00 – 9:00`):** `JIT Compiler` or `RGB Mechanical Keyboard` -> `Git Blame Gauntlet` / `Ultrawide Monitor`.
4. **Flex Core 4–6 (`10:00 – 18:00`):** `Root Sudo` (vs Armor), `Strict Linter` (vs Healers), `CORS Bypass` (vs Shields), or `Shadow Proxy` (`[1]` vs Assassins).

### 12.2. Mage & Controller (`Pixel`, `Model`, `Mop`, `Lint`)
1. **Start (`0:00`):** `Tech Book` (`400g`) + `Coffee` (`50g`).
2. **First Back (`~900g`):** `Pomodoro Timer` (`450g`) + `Office Sneakers` (`300g`), or combine `Smartwatch` (`250g`).
3. **Core 1–3 (`4:00 – 10:00`):** `Noise-Cancelling Headphones` (`550g` combine) -> `Cold Cache` / `Midnight Oil` -> `Stack Overflow Premium`.
4. **Flex Core 4–6:** `Debugger Breakpoint` (`[1]` Stasis vs `Zero`/`Pager`) or `Firewall Appliance` / `VPN Hoodie` for survivability.

### 12.3. Tank & Fighter (`Stack`, `Brick`, `Patch`)
1. **Start (`0:00`):** `Ergonomic Chair` (`400g`) + `Coffee` (`50g`).
2. **First Back (`~800g`):** `Company Hoodie` (`350g`) + `Office Sneakers` (`300g`), combine `Standing Desk` (`550g`) or `Fuzzy Slippers` (`350g`).
3. **Core 1–3:** `Thornmail Firewall` (vs AD carries) / `VPN Hoodie` (vs Mages) -> `Server Rack Armor` (`-10%` dmg taken).
4. **Flex Core 4–6:** `Cloud Backup` (`260` Lifeline shield) or `Git Revert Charm` (`[1]` Cleanse).

### 12.4. Support (`Ops`, `Volt`, `Hira`, `Brew`)
1. **Start (`0:00`):** `Power Bank` (`350g`, `+2.5 MP/s`) + `Coffee` (`50g`).
2. **First Back (`~750g`):** `Pomodoro Timer` (`450g`) -> combine `Rubber Duck` (`300g` combine, `+20% CDR`, `+4.5 MP/s`).
3. **Core 1–3:** `Team Lunch` (`+15% CDR`, `+4.0 MP/s`) + `Smartwatch` (`+12% CDR`) -> hits `40%` CDR cap rapidly.
4. **Flex Core 4–6:** `Firewall Appliance` / `VPN Hoodie` for aura survival or `Stack Overflow Premium` for massive heal/shield ratios.

### 12.5. Jungler (`Zero`, `Rush`, `Sprint`, `Pager`)
1. **Start (`0:00`):** `Red Pen` (`450g`) or `Gaming Mouse` (`350g`) + `Coffee` (`50g`).
2. **First Back (`~1,000g`):** `Office Sneakers` (`300g`) + `Git Blame Gauntlet` (`700g` combine from `mouse` + `red_pen`).
3. **Core 1–3:** `Kanban Board` / `Second Monitor` -> `Root Sudo` / `JIT Compiler` / `Ultrawide Monitor`.
4. **Flex Core 4–6:** `Git Revert Charm` (`[1]` Cleanse) or `Shadow Proxy` (`[1]` Stealth Veil) for backline dives.


---

## 13. Item Engine API Contracts & Verification Scenarios (`shared/moba/items.js`)

### 13.1. Exported Helpers & Contracts
- **`recipePlan(inventory, id)`:**
  - Iterates over `ITEMS[id].recipe || []` and greedily matches each required Basic Gear ID against unused inventory indices `0..5`.
  - Returns `{ cost, baseCost, discount, consumedSlots, components }`, where `cost = max(0, baseCost - discount)`.
  - Guarantees each owned component slot is consumed at most once (even for `Energy Drink Crate`, which requires `['caffeine', 'caffeine']`).
- **`buyBlocker(inventory, id)`:**
  - Returns `null` when purchase is valid, else `'unknown item'`, `'inventory full'`, or `` `already own ${it.group}` ``.
  - Evaluates capacity and `group` uniqueness (`boots`, `active`) strictly against `kept` items **after** removing `plan.consumedSlots`.
- **`applyBuy(inventory, boughtAt, id, now)`:**
  - Clears all `consumedSlots` (`inventory[s] = ''`, `boughtAt[s] = 0`), places `id` into `consumedSlots[0]` (or the first empty slot `inventory.indexOf('')`), and stamps `boughtAt[slot] = now`.
  - Returns `{ ok, slot, cost, consumedSlots, discount }`.
- **`itemStats(inventory)`:**
  - Sums additive stats across all occupied slots into `{ ad, ap, hp, mana, manaRegen, armor, armorPen, mr, mrPen, ms, as, haste, lifesteal, apPct }`.
- **`ownedActiveItem(inventory)`:**
  - Returns the first item spec in `inventory` with an `.active` block (`freeze_frame`, `git_revert`, or `shadow_proxy`), triggered via key `[1]`.

### 13.2. Verified Purchase, Combine & Sell Scenarios
1. **Empty Inventory Direct Core Buy:**
   - *Input:* `inv = ['','','','','','']`, buy `jetpack` (`1100g`).
   - *Result:* `recipePlan` -> `discount = 0`, `cost = 1100g`, `consumedSlots = []`, placed at slot `0`.
2. **Single-Component Combine:**
   - *Input:* `inv = ['sneakers','','','','','']`, buy `jetpack`.
   - *Result:* `discount = 300g`, `cost = 800g`, `consumedSlots = [0]`, `jetpack` replaces slot `0`.
3. **Two-Component Combine:**
   - *Input:* `inv = ['sneakers','caffeine','','','','']`, buy `jetpack`.
   - *Result:* `discount = 650g`, `cost = 450g`, `consumedSlots = [0, 1]`, `inv` becomes `['jetpack','','','','','']`.
4. **Full 6/6 Inventory Boots Upgrade:**
   - *Input:* `inv = ['sneakers','caffeine','mouse','chair','hoodie','tech_book']`, buy `jetpack`.
   - *Result:* `buyBlocker` returns `null` (4 kept items `< 6`, no kept `boots`), pays `450g`, `inv` becomes `['jetpack','','mouse','chair','hoodie','tech_book']`.
5. **Duplicate Boots Block:**
   - *Input:* `inv = ['jetpack','','','','','']`, buy `slippers`.
   - *Result:* `buyBlocker` returns `'already own boots'`.
6. **Duplicate Active Item Block:**
   - *Input:* `inv = ['freeze_frame','','','','','']`, buy `shadow_proxy`.
   - *Result:* `buyBlocker` returns `'already own active'`.
7. **Double-Component Recipe (`Energy Drink Crate`):**
   - *Input:* `inv = ['caffeine','mouse','','','','']`, buy `energy_crate` (`['caffeine','caffeine']`).
   - *Result:* Only 1 `caffeine` is matched (`discount = 350g`, `cost = 900g`, `consumedSlots = [0]`); slot `1` (`mouse`) stays untouched.
   - *Input:* `inv = ['caffeine','caffeine','','','','']` -> `discount = 700g`, `cost = 550g`, `consumedSlots = [0, 1]`.
8. **10-Second Undo Refund vs. 70% Sell:**
   - Selling within `10,000 ms` of purchase (`SELL_UNDO_MS`) refunds `100%` of item cost (`sellValue`).
   - Selling after `10,000 ms` (or items retained from prior reconnect) refunds `Math.floor(cost * 0.70)`.
9. **Consumable Stack Purchase (`Coffee`):**
   - `Coffee` (`50g`) bypasses the 6-slot inventory (`consumable: true`), is usable even at `6/6` slots, and stacks up to `3` active regens on server (`COFFEE_MAX_STACK = 3`).
10. **Fountain & Death Shop Gate:**
    - `_buy` / `_doBuy` and `_sell` / `_doSell` succeed only when `ch.dead === true` or `dist(ch, fountain) <= 520 px`.

### 13.3. Shop Grid Layout Reference (`ShopPanel.js`)
- **Total Items (`41`):**
  - Row 1 (`consumable`): `coffee` (`1` item).
  - Rows 2–3 (`basic`): `mouse`, `caffeine`, `red_pen`, `tech_book`, `sticky_notes`, `chair`, `hoodie`, `power_bank`, `pomodoro`, `sneakers` (`10` items).
  - Rows 4–9 (`core`): `30` items across `6` rows of `5` tiles (`TILE_W = 166`, `TILE_H = 49`, `emoji` at `y = 17`, `cost` at `y = 39`, `⚒️` badge at top-right when `discount > 0`).


---

## 14. Item Trade-Offs, Anti-Stat-Stick Guardrails & Situational Decision Trees

To avoid a fixed mathematical "one best 6-item build" meta across matches, defensive and offensive Core items enforce explicit trade-offs between raw stat efficiency, passive specialization, and opportunity cost within the 6-slot + 1-Active-Item limit.

### 14.1. Stat-Stick Tuning Audit (`Server Rack Armor` & Capstone Items)
- **`Server Rack Armor` (`2,600g`):** Tuned from `450 HP / 50 Armor / 35 MR` (`112.3%` pure stat efficiency) down to **`400 HP / 45 Armor / 30 MR`** (`99.4%` raw stat efficiency before passive). Players purchasing it now pay a deliberate raw-stat tax to gain the `Fortress` (`-10%` post-mitigation incoming damage) passive instead of receiving both best-in-class stats and best-in-class damage reduction.
- **Luxury Slot Opportunity Cost:**
  - Choosing `Stack Overflow Premium` (`2,800g`) maximizes pure AP scaling (`+110 AP, +25% AP`) but grants zero Armor, MR, HP, or CDR—exposing Mages if bought before defensive slots.
  - Choosing `Ultrawide Monitor` (`2,700g`) or `JIT Compiler` (`2,600g`) commits `2,600–2,700g` solely to AD/AS/Crit with zero penetration (`Root Sudo` needed vs Armor) and zero healing cut (`Strict Linter` needed vs Supports).

### 14.2. Active Item Selection Trade-Off (`group: 'active'`, max `1` per champion)
Because every champion can carry at most **1 Active Item (`[1]`)** alongside Boots (`[group: 'boots']`) and `4` non-active slots, choosing the wrong `[1]` item locks out the other two defensive tools:

| Active Item | Cost | Primary User | Grants | Forces You to Give Up |
| :--- | :---: | :--- | :--- | :--- |
| **`Debugger Breakpoint`** | `2,500g` | AP Mages / Enchanters | `2.0s` untargetable invulnerable Stasis (`60s` CD) | Cleanse while stunned (`Git Revert`) and stealth disengage (`Shadow Proxy`) |
| **`Git Revert Charm`** | `1,800g` | Fighters / Tanks / Divers | Usable-while-stunned Cleanse + `35% MS` (`50s` CD) | `2s` burst immunity (`Stasis`) vs instant multi-skill nuke combos |
| **`Shadow Proxy`** | `2,400g` | Marksmen / AD Assassins | `240` shield + `30% MS` + `1.8s` stealth (`60s` CD) | Stun removal (`Git Revert`) if caught inside Hard CC chains |

### 14.3. Situational Decision Trees by Match State

#### Decision Tree A — Ahead at 10 Minutes (Pressing Lead)
1. Are enemies stacking Armor (`Stack`, `Brick`, `Standing Desk`, `Server Rack`)?
   - **Yes (AD):** Prioritize `Root Sudo` (`2,400g`, `+30%` Armor Pen) over `Letter Opener`.
   - **Yes (AP stacking MR / `VPN Hoodie`):** Prioritize `Midnight Oil` (`2,200g`, `+25%` MR Pen + burn).
2. Are enemy Supports keeping carries alive (`Ops`, `Hira`, `Brew`, `Patch`)?
   - **Yes:** Buy `Strict Linter` (`1,900g`, `-40%` heal cut) on AD Carry/Fighter; assign `Escalate` (`Ignite`) carrier to focus primary healer.
3. Are enemies relying on massive Shields (`Stack W`, `Ops R`, `Cloud Backup`)?
   - **Yes:** Swap 4th AD slot to `CORS Bypass` (`2,100g`, `+50%` shield damage).

#### Decision Tree B — Behind at 10 Minutes (Stabilizing & Comeback)
1. **Carries Behind (`Tester`, `Swipe`, `Cache`, `Pixel`, `Model`):**
   - Abandon greedy capstone (`Letter Opener` / `Stack Overflow`) temporarily.
   - Purchase affordable mixed defense (`Standing Desk` `1,300g`, Combine `550g`) or immediate Active survivability (`Git Revert Charm` `1,800g` / `Shadow Proxy` `2,400g` / `Debugger Breakpoint` `2,500g`).
2. **Frontline Tanks Behind (`Stack`, `Brick`, `Patch`):**
   - Match enemy primary damage source: build `Thornmail Firewall` (`2,100g`) vs AD Crit teams, or `VPN Hoodie` (`2,400g`, `+45 MR`) vs Double-AP comps before finishing `Server Rack Armor`.

#### Decision Tree C — Late-Game 6/6 Full Slot Upgrade Discipline
1. Maintain basic components in empty early slots (`mouse`, `chair`, `hoodie`, `pomodoro`) rather than floating `400g–800g` unspent in fountain before Dragon/Deadline contests.
2. When holding `6/6` items (e.g., `['sneakers', 'caffeine', 'mouse', 'chair', 'hoodie', 'tech_book']`), click Core upgrades (`Jetpack Sneakers`, `Standing Desk`, `Noise-Cancelling Headphones`) directly: `buyBlocker` + `applyBuy` combine consumed components atomically at `100%` component discount without requiring you to sell an item first.
3. Reserve `50g`–`100g` leftover on early backs for `Coffee` (`50g`, `160 HP` + `70 Mana` over `6s`) only while slots/health pressure require lane stay; once Core Sustain (`Red Pen`, `Rubber Duck`, `Team Lunch`) finishes, transition gold exclusively into Core completion.

### 14.4. Consumable & Component Slot Planning Summary
- **Early Efficiency Rule:** Two Basic items (`mouse` `350g` + `caffeine` `350g` = `700g`) convert cleanly with `0g` wasted sell penalty into **7** distinct Core Gear items (`RGB Keyboard`, `Ultrawide Monitor`, `JIT Compiler`, `CORS Bypass`, `Shadow Proxy`, or pivot into `Git Blame Gauntlet` / `Kanban Board` / `Second Monitor`).
- **Support Mana Bridge:** Starting `Power Bank` (`350g`, `+2.5 MP/s`) eliminates early-game OOM recalls and discounts `Rubber Duck` (`1,100g -> 300g` combine once `Pomodoro` is owned) or `Team Lunch` (`1,500g -> 750g` combine once `Chair` is owned).
- **Undo Window Safety:** Accidentally purchasing the wrong component or Core item in fountain allows `100%` full gold refund (`SELL_UNDO_MS = 10s`) via right-click or the `UNDO` button in `ShopPanel` before leaving base.


---

## 15. Stat Cap, Stacking Formulas & Shop Grid Index (`shared/moba/items.js`)

### 15.1. Exact Derived Stat Equations (`_recalc`)
- **Max Health (`maxHp`):** `statAt(b.hp, g.hp, lv) + sum(it.hp)`. Increasing `maxHp` heals current `hp` by `maxHp - oldMax`.
- **Max Mana (`maxMana`):** `statAt(b.mana, g.mana, lv) + sum(it.mana)`. Flat `manaRegen` (`+sum(it.manaRegen)`) adds directly every second alongside `MANA_REGEN_PCT_PER_SEC` (`1.2%` base, `4x` OOC).
- **Attack Damage (`ad`):** `(statAt(b.ad, g.ad, lv) + sum(it.ad)) * (1 + buff.adPct)`.
- **Ability Power (`ap`):** `(b.ap + sum(it.ap)) * (1 + sum(it.apPct) + buff.apPct)` — `Stack Overflow Premium` (`+25% apPct`) multiplies all flat item AP and Model `Overfit` (`+30%`).
- **Armor & Magic Resistance:** `statAt(b.armor, g.armor, lv) + sum(it.armor) + buff.armor` and `statAt(b.mr, g.mr, lv) + sum(it.mr)`.
- **Penetration Cap:** Effective resistance bypass (`shred` then `pen`) is hard-floored at `0.40 * Resist` (`60%` max bypass across `Root Sudo`, `Midnight Oil`, `Strict Audit`, `Overfit Nova`).
- **Move Speed (`ms`):** `max(90, (b.ms + sum(it.ms)) * (1 + sum(buff.msPct)) * (1 - maxActiveSlowPct))`.
- **Attack Speed (`as`):** `min(2.5, statAt(b.as, g.as, lv) * (1 + sum(it.as) + sum(buff.as)))`.
- **Cooldown Haste:** `min(0.40, sum(it.haste) + (blueBuff ? 0.15 : 0))` multiplied afterward by Skill Rank Reduction (`max(0.65, 1 - 0.06 * (rank - 1))`).

### 15.2. Complete `SHOP_ORDER` Display Matrix (9 Rows x 5 Columns = `41` Items)
| Shop Row | Tier | Slots (Columns 1–5) |
| :---: | :---: | :--- |
| **Row 1** | `consumable` | `coffee` *(1 item)* |
| **Row 2** | `basic` (Offense) | `mouse` · `caffeine` · `red_pen` · `tech_book` · `sticky_notes` |
| **Row 3** | `basic` (Defense / Boots) | `chair` · `hoodie` · `power_bank` · `pomodoro` · `sneakers` |
| **Row 4** | `core` (Boots & Mana/CDR) | `jetpack` · `slippers` · `smartwatch` · `rubber_duck` · `team_lunch` |
| **Row 5** | `core` (AD / Bruiser) | `rgb_keyboard` · `second_monitor` · `energy_crate` · `gauntlet` · `kanban` |
| **Row 6** | `core` (AP / Mixed Defense) | `headphones` · `cloud_credits` · `firewall` · `standing_desk` · `vpn_hoodie` |
| **Row 7** | `core` (Capstones) | `ultrawide` · `letter_opener` · `stackoverflow` · `midnight_oil` · `server_rack` |
| **Row 8** | `core` (AoV-Style Passives) | `crit_compiler` · `grievous_linter` · `frost_cache` · `thornmail_rack` · `guardian_backup` |
| **Row 9** | `core` (Counters & Actives) | `armor_shredder` · `shield_breaker` · `freeze_frame` · `git_revert` · `shadow_proxy` |

### 15.3. Item Design Verification Checklist
1. Every Core item (`30/30`) defines `recipe` referencing valid Basic Gear items whose summed cost is strictly `< item.cost`.
2. Every item with `mr`, `mrPen`, `armorPen`, or `manaRegen` formats cleanly in `itemStatLine()` (`uiKit.js`) and accumulates in `itemStats()` (`items.js`).
3. Every team role has dedicated late-game counterplay tools: `Root Sudo` (Armor), `Midnight Oil` (MR), `Strict Linter` (Heal), `CORS Bypass` (Shield), and three `[1]` Actives (`Stasis`, `Cleanse`, `Veil`).

### 15.4. Active Item (`[1]`) Cooldown & Interaction Matrix
| Active ID | Item | Cooldown | Usable While Stunned | Effect Summary | Broken / Cancelled By |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `stasis` | **Debugger Breakpoint** (`freeze_frame`) | `60s` | No | Invulnerable + untargetable (`2.0s`), self-immobilized (`_stasisUntil`), clears move order | Expires cleanly at `2.0s` |
| `cleanse` | **Git Revert Charm** (`git_revert`) | `50s` | **Yes** | Clears `stunnedUntil`, `rootedUntil`, `slowUntil`, `slowPct` + `+35% MS` (`2.0s`) | Re-applied enemy CC after cast |
| `veil` | **Shadow Proxy** (`shadow_proxy`) | `60s` | No | `240` Shield (`3.0s`) + `+30% MS` (`1.8s`) + stealth beyond `280 px` (`_stealthUntil`) | Any attack, skill cast, or enemy `< 280 px` |

- **Shared Cooldown Variable (`c._activeCd`):** All active items store cooldown on `_activeCd = t + act.cd * 1000`. Selling an Active item inside the `10s` undo window refunds `100%` of its gold and clears `ownedActiveItem()` immediately.
- **No Haste Scaling:** Item Haste and Blue Buff (`15%`) never reduce Active Item cooldowns (`60s` / `50s` fixed).
