# Team Mode — "Office Siege" (5v5 office MOBA) · breakdown + frozen contract

Status: 🟡 built + integrated, in review (2026-11-07). Pipeline: [AGENT_TEAM.md](../develop_notes/AGENT_TEAM.md).
Coordinator owns this file. **The Contract section is frozen** — if you need a change, report it; don't improvise.

**Integration changes (coordinator):** `TOWER.range` 440 → 600 · golden bug first spawn 3:00 + 150 g ·
`ATK_PROJ_SPEED` (1500) promoted to rules.js · TeamRoom/MobaBots alternate team processing order per tick.
**Contract additions from the server build** (all backward-compatible): `debug` also accepts `start`, `autopilot`;
a private `announce` at Lv 6 ("ULTIMATE UNLOCKED"); `action` ∈ idle|attack|q|w|e|r|recall|dead; destroyed
structures stay in state with `alive=false`; a human leaving mid-match is replaced by a bot (same key);
`/api/stats` adds `teamOnline`, `teamRooms`.

## 1. Goal

A real MOBA mode: pick a champion, laneing vs bug waves, last-hit for gold, buy gear, push
towers, take jungle camps + river objectives, destroy the enemy **Production Server**.
Original theme (NOT a clone of any existing MOBA's map/champions/items): two companies —
🚀 **Startup** (blue, bottom-left) vs 🏢 **MegaCorp** (red, top-right) — ship bug waves
at each other's servers. Bots fill every empty slot, so one human can play a full 5v5 now.

## 2. Rules (numbers live in `shared/moba/*.js`, never hard-code them)

- **Data:** [shared/moba/rules.js](../../../shared/moba/rules.js) · [map.js](../../../shared/moba/map.js) · [champions.js](../../../shared/moba/champions.js) · [items.js](../../../shared/moba/items.js). Imported by server (`../../shared/moba/x.js` from `server/rooms/`) and client (`../../shared/moba/x.js` from `src/scenes/`). **Read-only for dev agents.**
- **Match flow:** room `team`. Phase `lobby` (12 s countdown from the first join, or `startNow`) → `playing` (room locked) → `ended` (winner shown 20 s, then clients are disconnected). Humans go to the team with fewer humans (blue first); bots fill both teams to 5 at match start, picking distinct champions per team via `ROLE_ORDER`/`ROLE_PICKS` (the human's champion takes its `lane` role).
- **Movement:** server-authoritative. Clients send *orders* (move to point / attack unit / stop); the server moves champions at `ms` (× slows/buffs), clamped to the map. No terrain collision in v1.
- **Combat:** auto-attack every `1000/as` ms when in `range + targetRadius`. Damage after armor: `rules.damageAfterArmor`. Lifesteal heals from attack + skill damage. Skills = generic engine over the 7 types in champions.js; cooldowns `rules.cooldownMs(cd, haste)`; mana cost; R needs level ≥ 6; stunned = no move/attack/cast; rooted = no move/dash/blink.
- **Minions:** waves from `WAVE_FIRST_MS`, every `WAVE_EVERY_MS`, per lane per team: `WAVE_COMPOSITION` (+1 siege every `SIEGE_EVERY_N_WAVES`), growing `MINION_GROWTH_PER_WAVE`. Walk `laneFor(team, lane)` then to the enemy core. Aggro nearest enemy within `MINION_AGGRO_RANGE`, priority minion > champion > structure; switch to an enemy champion that hits an allied champion nearby.
- **Structures:** `STRUCTURES` with `unlockedBy()` chain (invulnerable until unlocked). Towers target: enemy champion that damaged an allied champion in range (last 2 s) › nearest enemy minion › nearest enemy champion; champ damage ramps +25 %/consecutive hit. Backdoor: structures take ×0.4 damage with no attacker-team minion within 700 px. Core destroyed → that team loses.
- **Economy:** `START_GOLD`, passive gold, last-hit gold to the killer only, kill/assist/first-blood gold, tower gold to the whole team. XP split among enemy champions within `XP_SHARE_RADIUS` of a dying unit; kill XP to killer + assisters. Levels via `XP_TABLE` (max 12); stats = `statAt(base, growth, level)` + items.
- **Jungle + epics:** `CAMPS` (neutral; idle until hit; chase the attacker; leash reset beyond `CAMP_LEASH_RADIUS` with full heal; respawn after clear). Epics `golden` (team gold) and `deadline` (team gold + `buff` for 2 min) at `EPIC_SPOTS`, first spawn + respawn per rules.
- **Base:** fountain heals allies, lasers enemies; shop only in own fountain or while dead; `RECALL_MS` channel (cancelled by damage, orders, casts) → teleport to fountain. Respawn `respawnMs(level)` at the fountain.

## 3. Contract (frozen)

### 3.1 Synced state — `server/game/moba/schema.js` (@colyseus/schema v3, `type()` style like `server/game/schema.js`)

```
TeamChamp   (state.champions key = sessionId | 'bot_N')
  x number · y number · team string ('blue'|'red') · champ string · name string · isBot boolean
  level uint8 · xp uint32 · gold uint32
  hp uint16 · maxHp uint16 · mana uint16 · maxMana uint16
  ad uint16 · ap uint16 · armor uint16 · ms uint16 · range uint16 · as number   (current totals, for UI)
  dead boolean · respawnAt number (server ms)
  kills uint16 · deaths uint16 · assists uint16 · cs uint16
  items ArraySchema<string>  (always length 6, '' = empty)
  cdQ number · cdW number · cdE number · cdR number   (server ms when ready; 0 = ready)
  stunnedUntil number · rootedUntil number · slowUntil number · slowPct uint8 (0–100)
  shield uint16 · buffs string (comma tags: 'q','w','e','r','deadline','recall','coffee')
  recallUntil number (0 = not recalling) · action string · action_seq uint32 · targetId string
TeamUnit    (state.units key = 'u<n>')
  x number · y number · team string ('blue'|'red'|'neutral') · kind string
    ('melee'|'ranged'|'siege'|'small'|'medium'|'big'|'golden'|'deadline')
  hp uint16 · maxHp uint16 · alive boolean · hit_seq uint32 · campId string ('' for minions)
TeamStructure (state.structures key = structure id, e.g. 'blue_top_1', 'red_core')
  x number · y number · team string · kind string ('tower'|'core') · lane string · tier uint8
  hp uint16 · maxHp uint16 · alive boolean · invulnerable boolean
TeamState
  phase string ('lobby'|'playing'|'ended') · lobbyEndsAt number · startedAt number · winner string
  blueKills uint16 · redKills uint16
  buffBlue string · buffBlueUntil number · buffRed string · buffRedUntil number
  epicGoldenAt number · epicDeadlineAt number   (server ms of next spawn; 0 = currently alive)
  champions MapSchema<TeamChamp> · units MapSchema<TeamUnit> · structures MapSchema<TeamStructure>
```
Dead units: set `alive=false`, delete ~600 ms later (client plays the death). Ids never collide (sids vs `u<n>` vs structure ids).

### 3.2 Messages
Client → server (all validated: `Object.hasOwn` for ids, `Number.isFinite` for numbers, rate limits):
| type | payload | notes |
|---|---|---|
| `hello` | — | once; reply `welcome` |
| `order` | `{type:'move', x, y}` · `{type:'attack', id}` · `{type:'stop'}` | ≥ `MOVE_ORDER_RATE_MS` apart; cancels recall |
| `cast` | `{slot:'q'|'w'|'e'|'r', x, y, id?}` | x,y = aim point (world); id = optional target (champion sid / unit / structure id) |
| `buy` | `{item}` | fountain or dead; gold; `buyBlocker` |
| `recall` | — | starts channel |
| `chat` | `{text}` | ≤140 chars, ≥600 ms apart |
| `startNow` | — | lobby only, any human |
| `debug` | `{cmd:'gold'|'level'|'win'|'epic', ...}` | **only** when `BUG_SMASH_DEBUG=1` |

Server → client:
| type | payload |
|---|---|
| `welcome` | `{serverNow, team, champ}` |
| `atk` | `[{f, t, r}]` — batched per tick: attacker id, target id, r=1 ranged (projectile visual) / 0 melee |
| `fx` | `{k:'proj', sid, slot, x, y, dx, dy, speed, range, width, color}` · `{k:'circle', x, y, r, delay, color}` · `{k:'dash', sid, x0, y0, x1, y1, color}` · `{k:'blink', sid, x0, y0, x1, y1}` · `{k:'buff', sid, slot, color}` · `{k:'heal', x, y, r, color}` · `{k:'hit', id, color}` |
| `feed` | `{text, color, a?, b?}` (a/b = involved champion sids) |
| `announce` | `{title, sub?, color?, big?}` (first blood, tower down, epic taken, victory) |
| `gold` | `{n, x, y}` — only to the earner (popup) |
| `chat` / `chatHistory` | `{sid, name, text, kind?}` (kind `bot`) |

### 3.3 Server internals (for bots)
`TeamRoom` exposes `_doOrder(sid, msg)`, `_doCast(sid, msg)`, `_doBuy(sid, msg)`, `_doRecall(sid)` — the
human `onMessage` handlers call these, and so does `MobaBots` (bots never touch state directly).
Also: `onUncaughtException` logging (see ArenaRoom), `this.lock()` when playing.

### 3.4 Client modules (UI agent ↔ world agent)
```js
// src/ui/moba/ShopPanel.js
export class ShopPanel {
  constructor(scene, { onBuy })          // onBuy(itemId)
  open(); close(); toggle(); get isOpen()
  update({ gold, items, canShop })       // items = 6-slot array; call every frame (cheap)
}
// src/ui/moba/Scoreboard.js
export class Scoreboard { constructor(scene); show(); hide(); update(state, localSid) }
// src/ui/moba/EndScreen.js
export class EndScreen {
  constructor(scene, { onPlayAgain, onMenu })
  show({ winner, myTeam, rows })         // rows: [{ sid, team, name, champ, level, kills, deaths, assists, cs, gold, items, isBot, isMe }]
}
```
All screen-pinned (`setScrollFactor(0)`), depth 80–95, safe to construct before connecting.
Scenes: `TeamLobbyScene` (key) → `this.scene.start('TeamModeScene', { champ, name })`;
TeamModeScene "play again" → `this.scene.start('TeamLobbyScene')`. Both are already registered in `src/main.js`.

## 4. Tasks (file ownership — one writer per file)

| Owner | Files | Done when |
|---|---|---|
| **server-dev** | `server/rooms/TeamRoom.js`, `server/game/moba/*`, `server/index.js` (register `team`), `tools/playtest/team_sim.mjs` | A bots-only match (headless client as spectator-human) runs end-to-end to a winner; zero exceptions; all contract fields/messages emitted; exploit checks like `exploits.mjs` hold for `order`/`cast`/`buy` |
| **client-dev (world)** | `src/scenes/TeamModeScene.js`, `src/entities/moba/*` | Map, structures, minions, monsters, champions render; orders/casts/recall/shop/scoreboard wired; skill aim + VFX from `fx`/`atk`; HUD (skills+cooldowns, HP/mana, level/XP, items, gold), minimap, feed, death + end screens; zero `[PAGEERROR]` |
| **client-dev (ui)** | `src/scenes/TeamLobbyScene.js`, `src/ui/moba/*`, `src/scenes/MenuScene.js` (TEAM button live), `src/core/SaveManager.js` (`getTeamChamp/setTeamChamp`) | Champion select (6 cards, stats, skills, name) → match; shop/scoreboard/end modules per §3.4 |
| **coordinator** | this file, `shared/moba/*`, `src/main.js`, docs, integration | — |

## 5. Humor pass
Kill feed: "{a} pushed {b} to production", "{a} code-reviewed {b} into oblivion", "{a} force-merged over {b}".
Towers: "🔥 MegaCorp's top Firewall is down!". Core: "💀 PRODUCTION IS DOWN — 🚀 Startup ships it!".
Epics: "✨ Startup fixed the CEO's bug (+200 gold each)", "⏰ MegaCorp met THE DEADLINE — their bugs are empowered!".
Champion `lines` (pick/kill/death) in champions.js; bots may say them in chat.

## 6. Risks
- Bot AI quality drives fun (one human + 9 bots). Keep it simple but competent: lane, last-hit, retreat, recall, buy, focus low targets, push with waves.
- Match length target 12–20 min; tune tower HP / minion damage in rules.js after playtests.
- Performance: ≤ ~100 synced units; batch `atk`; don't sync projectiles (fx messages).
- Security: same lessons as ArenaRoom (finite numbers, own-key ids, rate limits, opt-in debug, onUncaughtException).
