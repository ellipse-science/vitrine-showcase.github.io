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
- **No AI *authorship* on commits, but provenance is welcome** — never add `Co-Authored-By: Claude …` trailers or set an AI author/committer (that would credit a co-author in the Contributors graph). Documenting the tool is fine and encouraged via a provenance trailer **in French** `Assisté par : Claude Code (Opus 4.8)` (never the English `Assisted-by` default), which GitHub does not count as co-authorship. Hard rule #8; `includeCoAuthoredBy` is off in `.claude/settings.json`, and `garde-attribution` blocks authorship but lets provenance through on every PR.

- **A PR body reads in one minute** — 3 to 5 bullets, template sections answered in one line each; measurements, tables, test output and the investigation story go in the **linked issue**, not in the PR body (issues themselves stay as detailed as needed). This is gitflow *security*, not style: on 2026-08-12 a long PR was approved with « J'approuve mais j'ai pas lu. Trop long et incompréhensible » — the only human safeguard in the chain became decorative. An AI alone never reviews a PR either. Hard rule #9; no CI check enforces it.

Full detail and rationale: [`AGENTS.md`](./AGENTS.md). To inspect Athena directly (read-only), see the R snippet in [`docs/reference/aws-backend.md`](./docs/reference/aws-backend.md).
