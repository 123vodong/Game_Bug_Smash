# THREEJS P3 — Scene migration discovery (condensed)

Source: read-only discovery agent, 2026-11-27. Verify details in MultiPlayScene/MenuScene before coding (only grepped).

## Facts
- `src/main.js` registers only MenuScene, HuntScene, MultiPlayScene, TeamLobbyScene, TeamCustomScene, TeamSelectScene, TeamModeScene. LevelScene/BossScene/VictoryScene/GameOverScene are dead: ignore.
- 3D opt-in: `?renderer=3d` or `localStorage bs.renderer='3d'`, only for `scene=team|story` (main.js ~l.17) -> `src/three/boot.js bootThree` -> `screens/select.js start()`. Widen the `use3d` gate + route in select.js for menu/hunt/arena.
- Hunt/Arena have NO Phaser arcade physics: manual vector math; logic is coupled to Phaser only via `scene.time.now`, `scene.add.sprite`, `scene.tweens`, `scene.cameras`.
- Reuse: core/{Renderer,Camera,Input,Clock,Quality,SimSource}, net/room.js, fx/*, hud/*, units/bugs.js, world/*, loading.js.

## Menu (src/scenes/MenuScene.js) — logic renderer-free, layout Phaser
Inputs: ENTER play, M mute, L levels, S story; pointer on PLAY / Personal(MultiPlayScene) / Team(TeamLobbyScene) / Practice(TeamModeScene offline sandbox) / Settings / Career / Levels / name prompt / daily-missions card / Story card / rejoin banner. Deep links `?room=`, `?scene=lobby|select|team|story`.
Panels: LevelSelect, Settings, Profile, Leaderboard, Welcome. Data: SaveManager, Progress, i18n `t()`, missions.js, tips.js, Presence.
Plan: REWRITE as DOM/CSS menu over a light Three backdrop (M, 2-3 d). Keep: title "BUG SMASH: Deadline Hunter", Dev Tip `</>`, streak, NEW tags, i18n keys.

## SP campaign (HuntScene) — pure math, inject clock
Input: pointer move = hunter target (accel 1800, max 380), HOLD = smash (overlap d < 24+radius, cooldown 200ms). Keys ESC R H P M.
Bugs (data/bugs.js): null 1hp/80, ladybug 1/70, beetle 2/90, scarab 3/60, race 1/140, robot 4/80, toxic 2/110. AI: flee 260, panic 110, wander 1500ms, lifetime expiry hides (not kills); respawn 3500->1100ms with deadlineProgress.
Skills (data/skills.js): sonnet Espresso Bot, opus Senior Review, haiku Intern Bot, cursor Hot Desk, + respawnAllBugs skill.
Levels (data/levels.js): 4 worlds, timeLimit 50-64s, wave, bugHpMul/SpeedMul, gimmick glitchRelocate, tutorial 1-1.
Logic to extract (HuntSim, no Phaser): hunter, Bug.update, BugSpawner, SkillManager, combo (1500ms), score + time bonus, starsFor (2*=25% left, 3*=45%), win/lose, coach, deadline-hold rule. Persistence: SaveManager, Progress.campaignClear.
HUD: DEADLINE timer+bar urgency colors, BUGS n/total + hiding, SCORE, combo badge, hint line, pause, coach pill, skill chips.
Plan: headless `src/three/hunt/sim.js` first, then 2.5D view (pointer raycast to ground plane, bug billboards/instances, hunter billboard). Effort L (5-7 d).
Must survive: deadline timer, hold-to-smash, combo, AI-tool pickups, glitchRelocate, coach lines, VS Code/code backdrop + code glyph fragments, FAIL_MESSAGES, "BUGS FIXED! / ALL DEADLINES MET!", DEV + PM.

## Personal arena (MultiPlayScene ~4650 lines + server/rooms/ArenaRoom.js) — server authoritative
Client sends move{x,y}, action{kind}, smash{kind,id|targetSid|boss}, castSkill, setName, setHat, chat, hello. Server sends welcome, chatHistory, chat, feed, announce, reward (grep `_sendTo` for more).
Schema (server/game/schema.js): Player, Bug, HealthPickup, ToxicCloud, Obstacle, Boss, ArenaState (world 6000x3375).
Plan: `arena/source.js` (state adapter like createRoomSource) + view over server state; reuse hud/*. Effort XL (8-12 d).
Must survive: code-snippet obstacles, level titles Intern->Super Senior, hats, Tech Lead crown + bounty, broken-laptop mechanic, BOT tags, toxic clouds, health pickups, event banners, feed, infinite room.

## Boss / ending
Registered flows only: online boss The Deadline (ArenaState.bosses, MPBossView) and SP win/lose in HuntScene (`_playFinaleCinematic` slow-mo, win overlay with stars + DEV/PM bubbles, lose overlay with FAIL_MESSAGE). Build as DOM overlays + camera dolly in `src/three/screens/`. Effort M-L.

## Task order (file ownership)
1. routing gate (main.js use3d, select.js router) — S
2. menu/ (DOM menu + backdrop) — M
3. hunt/sim.js (headless) — M, before view
4. hunt/{view,hud,fx}.js — L
5. screens/{finale,endcards}.js — M
6. arena/source.js — M, before 7
7. arena/{view,hud,chat}.js — XL
8. QA/perf; keep Phaser fallback `?renderer=2d`
Dependencies: 1 first; 3 before 4; 6 before 7. Menu, hunt, arena can run in parallel after 1.
