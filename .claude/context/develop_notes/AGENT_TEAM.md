# Agent Team — how we build features

One **coordinator** (the main Claude session) runs a pipeline of specialist agents.
Agents work in parallel wherever their files don't overlap; the coordinator owns
integration, verification and the final call.

```
 idea ─► 1 DESIGN ─► 2 TASKS ─► 3 DEVELOP ─────────────► 4 REVIEW ───────► 5 TEST ─► 6 INTEGRATE
         designer     designer    server-dev ║ client-dev   reviewer ×2-3      playtester  coordinator
                      (contract)  (parallel, own folders)   (parallel, R/O)    (R/O)       (fix, re-test,
                                                                                            docs, commit)
```

## Roles (definitions in `.claude/agents/`)

| Role | Owns | Writes code? | Hand-off artifact |
|---|---|---|---|
| **coordinator** (main session) | the pipeline, integration, final fixes | yes | updated TASK_STATUS + summary to the human |
| `game-designer` | design docs, breakdowns | docs only | `tasks/<FEATURE>_BREAKDOWN.md` with a frozen **Contract** |
| `server-dev` | `server/` | yes | changed files + sim.mjs evidence |
| `client-dev` | `src/`, `assets/` | yes | changed files + screenshots |
| `code-reviewer` | — | **no** (read-only) | ranked findings (file:line, scenario, fix) |
| `playtester` | — | **no** (read-only) | test report (issues + measurements) |

## The stages

1. **Design** — `game-designer` writes Goal / Rules / Humor pass / Risks against the pillars
   in `design/01_VISION.md`. Coordinator approves (or the human, for big bets).
2. **Tasks** — same breakdown file: tasks split by **file ownership** (`S#` server, `C#` client,
   `D#` data/copy) and the **Contract** (schema fields, message types, ids). The contract is
   frozen before development starts — it's the only thing client and server share.
3. **Develop** — `server-dev` and `client-dev` run **in parallel**, each only in its own
   folder. For riskier work, give each its own git worktree (`isolation: "worktree"`) and
   merge afterwards. Each dev self-verifies (`node --check`, harness run) before handing back.
4. **Review** — 2–3 `code-reviewer`s in parallel, split by area (e.g. server, client, data).
   Read-only, so they can't collide. Findings are claims, not facts.
5. **Test** — `playtester` runs the harness scenarios for the feature and reports with evidence.
6. **Integrate** — the coordinator **verifies every finding** (reproduce or trace the code path;
   drop false positives), applies fixes, re-runs the harness, updates `tasks/TASK_STATUS.md`
   + affected `design/*.md`, and commits only when the human asks.

## Parallelism rules
- One writer per file per stage. Reviewers/playtesters never write game code.
- Shared files (`server/game/schema.js`, message names) change only via the Contract.
- Keep teams small (≤ 4 agents at once): more agents ≠ faster once they start overlapping.
- Agents start cold: every brief names the files, the goal, the acceptance criteria and the
  output format. Point them at their role file instead of repeating it.

## Definition of done
- [ ] `node --check` passes on all touched files
- [ ] `tools/playtest/sim.mjs` scenario for the feature runs with no server exceptions
- [ ] `tools/playtest/shot.mjs` screenshots look right, zero `[PAGEERROR]`
- [ ] SP campaign still starts (menu → PLAY)
- [ ] Review findings triaged (fixed or consciously deferred with a reason)
- [ ] `TASK_STATUS.md` updated; numbers mirrored in `design/09_BALANCE.md`

## Playtest harness (`tools/playtest/`)
```powershell
cd server; $env:BUG_SMASH_DEBUG=1; node index.js        # dev server with debug hooks
cd tools/playtest; npm install                          # once
node sim.mjs 60 golden_bug@5 deadline_boss@25           # headless human + forced events
node exploits.mjs                                       # malicious-message regression (must be 9/9)
node shot.mjs out/arena 6000 "play:15000" "shot:after"  # real browser, screenshots
```
Forced events use the `debug` message, which only exists when the server runs with
`BUG_SMASH_DEBUG=1` (fail-closed). Harness clients **predict their own position** like the
real client — stepping from the 12.5 Hz synced position crawls at ~150 px/s and skews results.

## Lessons from the first run (2026-11-07)
- Reviewers given an **in-process harness** (real room, stubbed I/O) found exploits that
  black-box playtests never would — ask reviewers to prove findings, not just suspect them.
- Verify playtest conclusions against the harness itself: "humans never win the golden bug"
  was half a harness artifact (stale-position stepping), half a real leak (`_pickBug`).
- Agents can hit usage limits mid-task; their transcript is saved — resume with SendMessage
  instead of relaunching, and tell them what's being fixed in parallel so they don't re-report it.

## Example coordinator briefs
- *Review:* "You are the `code-reviewer` (read `.claude/agents/code-reviewer.md`). Review the
  uncommitted changes under `server/` for the Office Chaos update — design intent is in
  `tasks/TASK_STATUS.md` § Office Chaos. Report findings in the role's format."
- *Test:* "You are the `playtester` (read `.claude/agents/playtester.md`). The server is running
  on :2567. Test: bots fill the room, all 7 world events, boss win + fail paths, a new
  Intern's first 60 s. Save screenshots under `tools/playtest/out/`."
