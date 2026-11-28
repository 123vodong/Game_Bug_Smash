# Agent Workflow — use only when it saves effort

Default to one coordinator working directly. Consult only the files and role guides needed for
the current change; do not load the full context or run a fixed multi-agent pipeline for routine
tasks. This keeps work focused and avoids repeating the same repository context across agents.

## When to delegate

- Delegate only a substantial, self-contained task that benefits from separate context or a
  genuinely independent implementation/review. Prefer one agent; add more only for independent
  work that cannot be handled sequentially.
- Do not delegate a simple lookup, a continuous code trace, documentation cleanup, or a task that
  can be completed in a few direct steps.
- Give each agent a bounded objective, exact paths, acceptance criteria, and a concise handoff.
  Avoid asking multiple agents to inspect the same files or repeat the same review.
- Keep one writer per file. The coordinator integrates, verifies, updates relevant docs, and
  reports any checks that could not be run.

Role guides live in `.claude/agents/`; use only the guide matching the delegated role.

## Documentation and verification

- Create a feature breakdown only for substantial multi-stage work. Keep it current during work,
  then fold lasting decisions into design docs and remove completed breakdowns.
- Run the smallest existing check that validates the change; expand to broader tests only when
  targeted checks expose a need.
- Do not start a server or other long-lived process unless the user asks. Never claim a test or
  visual review was performed unless it was.
- Update `tasks/TASK_STATUS.md` for material project status changes. Source code is authoritative
  for runtime behavior and numeric values; keep `design/09_BALANCE.md` as a reference.
- Commit, push, or open a pull request only when the user explicitly asks.
