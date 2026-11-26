---
trigger: always_on
description: Project Git and Pull Request automation rules for Game_Bug_Smash (`auto : ...` trigger).
---

# Project Git & Auto-PR Workflow Rules

**Author:** Duke Nguyen (`duc.nguyen@onethesis.com`)

## 1. Default Behavior (No `auto :` Trigger)
- Implement requested code and documentation changes locally.
- Run syntax/runtime verification (`node --check` on all modified `.js` files).
- **Do NOT** run `git commit`, `git push`, `gh pr create`, or `gh pr merge` automatically. Leave changes local and wait for the next instruction.

## 2. Triggered Automation (`auto : ...` or `auto : <description>`)
Whenever Duke's prompt contains the directive `auto : ...` or `auto : <description>`:
1. **Execute Task (if `<description>` is provided):** Implement the requested task first (or, if only `auto : ...` is given, package all current local changes).
2. **Verify:** Run `node --check` on every modified `.js` file before committing. Abort if any check fails.
3. **Commit:** Stage all relevant modified files and commit on the current feature branch (never commit directly to `main` or `develop`) using author identity **Duke Nguyen** (`duc.nguyen@onethesis.com`) with strict English commit messages and zero AI attribution.
4. **Push:** Push the current feature branch to `origin`.
5. **Create & Merge PR into `develop`:**
   - Use GitHub CLI (`gh`, or `$env:LOCALAPPDATA\Programs\gh\bin\gh.exe` if not yet on session `PATH`).
   - Run `gh pr create --base develop --head <current-branch>` with a clear English title and summary.
   - Run `gh pr merge <pr-url> --merge`.
   - Run `git fetch origin develop` and report the commit hash, PR URL, and merged `origin/develop` commit hash.
