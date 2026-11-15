# Team Mode v3 — "Draft Day" · breakdown + frozen contract

Status: ✅ built · reviewed · playtested · integrated (2026-11-08).

**Results:** team_ff 20 — 0 exceptions / stuck / in-wall / draft problems, avg 17.7 min, max 30.1 (Crunch Time), tick avg 0.39 ms;
sides over ~100 v3 sims ≈ 49–50; `team_sim --exploits` 57/57, `exploits.mjs` 9/9, `nav_check` ✅; online flow menu → queue →
select → loading → match → PLAY AGAIN ×3 verified in browsers (2-browser draft rules too). **Integration fixes:** Crunch Time
(30 min: structures ×2, no backdoor guard — fixed a 45-min stalemate), `time` clock-sync message (§3.6), `onMessage('*')`
no-op (newer client never kicked with 4002), lock-in race, stuck lock button, InfoPanel incremental updates, HP bars above walls,
per-caster ignite burns, open-role refill for leavers, auto-hover when the favourite is taken, bots take Ghost (top).
**Open:** enemy hovers are visible to a modified client (state not filtered per team); loading cards show the champion's
native lane, not the drafted role; bots end with 1.6–2.6k unspent gold; ~22 kills/match (pacing a bit slow); one-off
colyseus warning after cancelling the queue. Builds on v1 ([TEAM_MODE_BREAKDOWN.md](TEAM_MODE_BREAKDOWN.md)) and v2
([TEAM_MODE_V2_BREAKDOWN.md](TEAM_MODE_V2_BREAKDOWN.md)) — both still apply unless changed here.
Coordinator owns this file + `shared/moba/*` + `src/main.js`. **Contract = frozen** — report needed changes.

## 1. Goal (player feedback)
1. **Walls border the walkable areas** (MOBA-style) instead of big furniture blocks: long thin office partitions
   line the jungle side of each lane, both river banks and the mid lane, with gaps = jungle entrances, plus a few
   interior walls making camp pockets. **DONE in shared data** (`map.js` WALLS v3, new `kind:'seg'`).
2. **Champion select AFTER the match is found** (MOBA flow): Find Match → queue → **champion select** (10 slots,
   hover/lock, timer, summoner spells) → **loading screen** → match.
3. **Info panel** in the match: your champion's stats, basic attack and every ability (scaled numbers), summoner
   spells — always reachable (key + HUD button).
4. **Summoner spells** (D / F): Flash ("Alt+Tab", crosses walls), Heal ("Coffee Break"), Ghost, Barrier, Ignite, Smite.

## 2. Shared data (DONE — read-only for dev agents)
- `shared/moba/map.js` — `WALLS` (44): `{id, kind:'seg', x1,y1,x2,y2, w, look}` (look `partition|cubicles|glass|shelf`)
  + 2 circles per quadrant (`plant`). Camps moved (`CAMPS`), epics unchanged. `nav_check` ✅.
- `shared/moba/nav.js` — supports `seg`; new export `wallBounds(w)`; grid has a 6 px margin.
- `shared/moba/spells.js` — `SPELLS` (6), `SPELL_IDS`, `DEFAULT_SPELLS`, `ROLE_SPELLS`, `isSpellId`, `validSpellPair`.
  Effect kinds documented at the top of the file.
- `shared/moba/rules.js` — `SELECT_MS`, `SELECT_BOT_PICK_MS`, `SELECT_ALL_LOCKED_MS`, `LOADING_MS`, `PICK_RATE_MS`.

## 3. Contract changes (frozen)

### 3.1 Phases
`lobby` (queue; LOBBY_MS from the first human join, or `startNow`) → **`select`** (room locked; bots + humans get
champion entries; SELECT_MS) → **`loading`** (LOADING_MS; champions placed at the fountain, frozen) → `playing` → `ended`.
- At `select` start the server creates all 10 `state.champions` entries (humans + bots, `champ=''`, `locked=false`,
  spells = defaults / ROLE_SPELLS). Bots hover+lock a role-appropriate random free champion at a random time in
  `SELECT_BOT_PICK_MS` (still distinct per team; humans' locked/hovered picks take priority — a bot never takes a
  champion a teammate human is hovering).
- Select ends at `selectEndsAt`, or SELECT_ALL_LOCKED_MS after all 10 are locked. Unlocked humans auto-lock their
  hover, else a random free champion.
- Join option `champ` (deep links, harness) = initial hover. Join option `autoLock: true` = lock it immediately.
- A human leaving during select/loading → replaced by a bot (keeps the pick if locked).

### 3.2 Schema (append at the END of each class)
```
TeamChamp  + locked boolean · spellD string · spellF string · cdD number · cdF number   (cd = server ms when ready, 0 = ready)
TeamState  + selectEndsAt number · loadingEndsAt number
```
`buffs` gains tags `ghost` (Overtime), `ignited` (Escalate on you).

### 3.3 Client → server messages (new)
| type | payload | rules |
|---|---|---|
| `pick` | `{champ}` | phase `select`, not locked, `isChampionId`, not locked/hovered by a TEAMMATE (enemy duplicates allowed) — rate PICK_RATE_MS |
| `lock` | — | phase `select`, has a hovered champ |
| `spells` | `{d, f}` | phase `lobby`/`select`, `validSpellPair` — rate PICK_RATE_MS |
| `spell` | `{slot:'d'\|'f', x, y, id?}` | phase `playing`, alive, not stunned, ready (cdD/cdF); per-kind target validation (smite: monster/enemy minion in range; ignite: enemy champ in range — never pets); CAST_RATE_MS |

### 3.4 Server → client
`fx` gains `{k:'spell', sid, spell, x0, y0, x1, y1}` (x1,y1 = Flash landing / target position) — client plays the
per-spell effect. Existing `fx blink` is NOT reused for Flash. `feed` lines for smite-steals of epics are welcome.

### 3.5 Client scene flow
```
MenuScene → TeamLobbyScene (name, FIND MATCH, "practice offline", browse champions)
          → joins room 'team' → TeamSelectScene({ room, offline? })   ← NEW scene (key 'TeamSelectScene')
          → (phase 'loading') loading screen inside TeamSelectScene
          → (phase 'playing') TeamModeScene({ room })                 ← takes over the SAME room
```
- Room handoff: every scene registers its `room.onMessage` / state listeners with the unsubscribe functions they
  return and removes them on `shutdown`; `room.leave()` only when going back to the menu/lobby.
- TeamModeScene still accepts `{ champ, name }` (deep link `?scene=team&champ=X` → joins with `{champ, autoLock:true}`
  and shows a minimal "waiting / selecting" overlay until `playing`) and `{ offline: true, champ, spells }`.
- Offline: TeamSelectScene runs a local select (bots auto-pick) then `TeamModeScene({ offline:true, champ, spells, allies? })`.

## 4. Tasks (one writer per file)

| Owner | Files | |
|---|---|---|
| **server-dev** | `server/rooms/TeamRoom.js`, `server/game/moba/*`, `tools/playtest/{team_sim,team_ff,exploits}.mjs` | §4.1 |
| **client-world** | `TeamModeScene.js`, `src/entities/moba/{MobaMap,MobaFx,MobaHud,OfflineSim,mobaGfx,StructureView,Fallbacks}.js`, **new** `src/ui/moba/InfoPanel.js` | §4.2 |
| **client-ui** | `TeamLobbyScene.js`, **new** `src/scenes/TeamSelectScene.js`, `src/ui/moba/{ShopPanel,Scoreboard,EndScreen,uiKit}.js`, `src/entities/moba/{looks,ChampionView,UnitView}.js` | §4.3 |
| **coordinator** | this file, `shared/moba/*`, `src/main.js` (registers TeamSelectScene), docs, `nav_check` | |

### 4.1 server-dev
- **S1 Phases** select + loading per §3.1, `pick`/`lock`/`spells` per §3.3, bot drafting, leave/replace rules, room
  locked from `select`. Pets/champion records are created when the match starts (`playing`), not at select.
- **S2 Spells** — `spell` message, all 6 kinds per `spells.js`; cooldowns (no haste); `fx spell`; ghost ignores unit
  separation; ignite healCut applies to all healing (heals, lifesteal, regen, fountain); smite only monsters / enemy
  minions; Flash = `nearestFree(clamp(aim within range))` (crosses walls), blocked while rooted/stunned/displaced.
- **S3 Bots** use spells sensibly: Flash to escape at low HP or to finish a kill, Heal low-HP self/ally, Barrier when
  burst, Ghost to chase/escape, Ignite on a killable champion, Smite to secure camps + epics (epic-steal attempts).
- **S4 Walls v3** — re-verify Mover/bots with the new thin walls (stuck count must stay 0; camps moved).
- **S5 Verify** — team_ff 20+ (0 exceptions / stuck / in-wall; sides; length; spell usage counts per kind), update the
  harness for the new phases (team_ff/team_sim must drive select: autoLock or `pick`+`lock`), `team_sim --exploits` +
  new checks (pick a teammate's champ, pick after lock, pick outside select, spells pair invalid/duplicate, spell on
  cooldown, Flash into a wall lands free, smite a champion/pet, ignite a minion/pet, spell while stunned),
  `exploits.mjs` 9/9, `nav_check` ✅. Debug server on **:2650** only.

### 4.2 client-world
- **C1 Walls v3** — MobaMap draws `seg` walls as office partitions (look: partition = drywall + top trim; cubicles = row
  of cubicle backs; glass = translucent glass + frame; shelf = bookshelf) with height/shadow, y-sorted correctly for
  DIAGONAL walls (split long diagonals into short y-sorted pieces), on the minimap; decor avoids walls.
- **C2 Summoner spells in HUD** — D/F slots next to QWER (icon, cooldown sweep, key label), keys D/F (and touch
  buttons), aim previews (Flash: range circle + landing at nearestFree; Ignite/Smite: target ring in range), `fx spell`
  visuals (Flash burst at both ends; heal; shield; ghost trail; ignite flames on target; smite lightning).
- **C3 Info panel** (`src/ui/moba/InfoPanel.js`, screen-pinned, depth 80–95): key **C** + HUD "ℹ" button toggles it;
  shows champion portrait/name/role, live stats (HP, mana, AD, AP, armor, AS, range, MS, haste), **basic attack** (melee/
  ranged, range, damage, attacks/s, on-hit item effects), Q/W/E/R with current-level scaled numbers, cost, cooldown
  (incl. remaining), mechanics badges, and the 2 summoner spells. Clicking a champion row in the Scoreboard (TAB) MAY
  open the panel for that champion (stretch).
- **C4 Room handoff** — TeamModeScene takes `{ room }` from TeamSelectScene (no re-join), plus the deep-link path of
  §3.5; `loading` phase never shows the world before `playing`. OfflineSim: phases skip straight to playing with the
  given champ/spells; implements the 6 spells roughly.

### 4.3 client-ui
- **U1 TeamLobbyScene** becomes the **queue screen**: name, FIND MATCH (joins 'team' with `{name, champ: saved
  favourite}` → shows "Searching… n/10 humans · starts in Xs" during `lobby`, START NOW button = `startNow`), CANCEL,
  PRACTICE OFFLINE, and a "Champions" browse panel (the 12-card collection from v2, read-only). On phase `select` →
  `scene.start('TeamSelectScene', { room })`.
- **U2 TeamSelectScene** (new): MOBA-style draft — your team's 5 slots left, enemy 5 right (enemy picks shown only when
  locked; hovered = silhouette), champion grid with lane filter (taken by a teammate = greyed), detail of the hovered
  champion (skills), **summoner spell picker** (D/F, 6 spells, default flash+heal, remembered in SaveManager-like local
  storage via uiKit or a small helper), LOCK IN button, timer bar (`selectEndsAt`), bot picks animate in. Then the
  **loading screen** (10 portrait cards with names + spells) during `loading`, then `TeamModeScene({ room })`.
  Offline: same UI with local bots, then `TeamModeScene({ offline:true, champ, spells })`.
- **U3 looks.js** — `WALL_STYLE` entries for `partition | cubicles | glass | shelf` (+ `accent`); spell icons/colors
  helper if useful (`spellIconKey(id)` optional).
- Done when: menu → find match → select (lock, spells) → loading → match works online with 1 human + 9 bots and with
  2 browsers; offline practice works; zero `[PAGEERROR]`; screenshots of each screen.

## 5. Ports
`:2567` coordinator's normal server — don't kill/restart. server-dev debug **:2650**; client-world **:2660**; client-ui
**:2670** (static + their own online tests; server code may be mid-change → fall back to offline). Never
`BUG_SMASH_DEBUG` on :2567. Port 2600 has a stale old server — ignore it. Don't commit.

### 3.6 Contract addition (coordinator, review round 1)
- Client → server `time {t}` (t = client `Date.now()`), any phase, ≥ 500 ms apart → server replies `time {serverNow, t}`.
  Clock offset = `serverNow + (Date.now() − t) / 2 − Date.now()`; take the sample with the smallest round trip.
  Every scene that shows server timers (queue, select, loading, match) syncs with this — `hello`/`welcome` stays once-per-client.
