# vitrine-showcase.github.io — CLAUDE.md

**Start with [`AGENTS.md`](./AGENTS.md).** It holds the universal rules: stack, commands, branches/PRs, the non-negotiable hard rules, module naming + signalement labels, and the multi-repo map. This file adds Claude-specific guidance and a just-in-time index so the working context stays small.

## How to work in this repo (context engineering)

- **Progressive disclosure.** Load a reference file only when the task needs it — don't read everything up front. The index below maps needs → files.
- **Prefer skills.** The repeatable procedures in [`docs/reference/procedures.md`](./docs/reference/procedures.md) are being converted into triggerable skills under `.claude/skills/` (NordAI agentic plan, step 4). When a matching skill exists, use it.
- **Multi-agent git discipline.** Human+agent pairs follow [`llm_context/protocole_collaboration_agents.md`](./llm_context/protocole_collaboration_agents.md): pull/review before, atomic commit + PR + assignment after.
- **Verify before you ship.** CI runs type-check + build on every PR. Treat a green CI as the minimum bar; for data logic, run the loaders' tests (see `.claude/skills/` and `tests/` as they grow).

## Reference index (read on demand)

| Need | File |
|------|------|
| Directory tree, data flow, what-to-edit map | [`docs/reference/architecture.md`](./docs/reference/architecture.md) |
| Data schemas: `issues_score_day`, `headline_events_4h`, ISSUE_KEYS | [`docs/reference/data-schemas.md`](./docs/reference/data-schemas.md) |
| AWS backend: refiner lifecycle, deploy, schedules, active refiners, Athena | [`docs/reference/aws-backend.md`](./docs/reference/aws-backend.md) |
| Procedures (skill candidates): add a section, diagnose stale data, modify/schedule a refiner, edit static HTML | [`docs/reference/procedures.md`](./docs/reference/procedures.md) |
| Automated guardrails: the `PreToolUse` hook (`.claude/hooks/guard.py`) that blocks `public/data/` edits + AWS deploy paths | [`docs/reference/guardrails.md`](./docs/reference/guardrails.md) |
| Visual / editorial design language | [`design_language.md`](./design_language.md) |
| Long-form vision & architecture references | [`llm_context/`](./llm_context/) |
| Design specs (constitution-style decisions, alternatives rejected, acceptance criteria) | [`docs/superpowers/specs/`](./docs/superpowers/specs/) |

## Quick reminders (the rules most often missed)

- **Never hand-edit `public/data/`** — it is overwritten by `scripts/fetch_data.R`.
- **Schedule times are Montreal local**, not UTC.
- **No AWS deployment path** in this repo — GitHub Pages only.

Full detail and rationale: [`AGENTS.md`](./AGENTS.md). To inspect Athena directly (read-only), see the R snippet in [`docs/reference/aws-backend.md`](./docs/reference/aws-backend.md).
