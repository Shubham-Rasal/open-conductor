# Oracle

Oracle is the intelligent orchestration layer for open-conductor. It sits between
incoming issues and the pool of available coding agents, making decisions that a
simple round-robin or manual assignment cannot.

## Responsibilities

1. **Issue decomposition** — breaks a complex issue into ordered sub-tasks when a
   single-agent pass would be insufficient.

2. **Agent selection** — reads each issue's title, description, labels, and
   required skills, then picks the most capable available agent from the workspace
   pool (e.g. a Claude Code agent for exploratory refactors vs. a Codex agent for
   narrow, well-scoped patches).

3. **Priority arbitration** — re-ranks the task queue based on issue priority,
   SLA deadlines, and current agent load so high-value work is never starved by a
   flood of low-priority tasks.

4. **Result validation** — after a task completes, Oracle can optionally run a
   lightweight verification agent (a "judge") that checks whether the output
   actually resolves the original issue before the task is marked done.

5. **Retry / escalation** — if an agent fails or produces an unsatisfactory
   result, Oracle retries with a different agent or escalates to a human reviewer
   by posting a comment on the issue.

## Current state

Oracle does not exist yet. Today, agent assignment is manual: a user sets the
`assignee_id` and `assignee_type = "agent"` on an issue, and the runner
(`internal/runner/runner.go`) claims the task directly.

Oracle will be implemented as a service that hooks into the issue lifecycle
(create / update events) and replaces the manual assignment step.
