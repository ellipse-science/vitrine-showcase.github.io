# Reference — Repeatable procedures

> **Skill candidates.** These procedures are being formalized into triggerable skills under `.claude/skills/` (NordAI agentic plan, step 4). Until then, they are documented here. When a matching skill exists, prefer it.

See [`AGENTS.md`](../../AGENTS.md) for the hard rules, [`architecture.md`](./architecture.md) for the layout, and [`aws-backend.md`](./aws-backend.md) for the AWS side.

## Diagnosing frontend vs backend problems

### "The treemap / section looks wrong or stale"

1. **Check `public/data/`**: Is the JSON file present and recent? `ls -la public/data/refined/day/`
2. **Check the last refresh run**: GitHub Actions → `refresh-data.yml` workflow history
3. **Check Athena directly** (see R snippet in [`aws-backend.md`](./aws-backend.md)): Does the table have recent rows with a recent `tag`?
4. **Is it a frontend transform bug?** Check `lib/data/headlineEvents.ts` — the `buildPeriodData` function aggregates rows. The treemap shows day/week/month tabs; if all three look identical with only a few days of data in the table, that's expected — divergence appears as history accumulates.
5. **Is it a refiner bug?** Check the Lambda logs in CloudWatch (AWS DEV account). Log group name matches the Lambda function name from `aws-infra/lib/data-stacks/refiners/refiners.ts`.

### "The section doesn't update when I click the tabs (day / week / month)"

The data for all three periods is fetched at **build time** and passed as props to the client component. If the tabs appear identical, it usually means:
- Only a few days of data exist yet (expected early on)
- The `tag` tiebreaker in `latestIssueRow()` is picking the wrong row
- The period aggregation in `buildPeriodData()` is summing fewer rows than expected

### "A refiner stopped publishing data"

1. Check AWS DEV CloudWatch for the Lambda log group
2. Check the ECR image was pushed (did `pr.yml` in `aws-refiners` succeed?)
3. Verify the schedule in `aws-infra/lib/data-stacks/refiners/refiners.ts` — remember times are **Montreal local**, not UTC
4. Run the R inspection snippet (in [`aws-backend.md`](./aws-backend.md)) to see what's actually in Athena

## How to add a new data-bound section

1. Add the table to `scripts/tables.json` if not already there. Wait for it to refresh into `/public/data/...`.
2. In `lib/data/`, add a typed loader (`fs.readFile` from `path.resolve(cwd, 'public', 'data', ...)`). Pre-compute every value the UI will display.
3. In `components/sections/`, add an async Server Component that calls the loader.
4. If the section has interactive bits (tabs, filters, etc.), add a Client Component (`'use client'`) in `components/interactive/` that receives the pre-computed data as props.
5. Wire into `app/page.tsx`.

Use `lib/data/parties.ts` + `components/sections/PartisCouvertureSection.tsx` + `components/interactive/PartisCouvertureClient.tsx` as the canonical example.

## How to modify a refiner

1. Edit `aws-refiners/refiners/<refiner-name>/runtime.R`
2. Test locally if possible (mock data or direct Athena query)
3. Commit and merge to `develop` in `aws-refiners` → ECR push → auto-redeploy to DEV Lambda (via PR #102 mechanism)
4. Inspect output in Athena DEV (R snippet in [`aws-backend.md`](./aws-backend.md)) or wait for next scheduled run
5. Once validated: open a PR to `main` in `aws-refiners` for production

## How to change a refiner schedule

1. Edit `aws-infra/lib/data-stacks/refiners/refiners.ts` — find the refiner entry, change the `cron` array
2. **Times are Montreal local (EDT/EST), not UTC**
3. Run `yarn lint:ts && yarn lint:eslint && yarn lint:prettier` in `aws-infra` before pushing — prettier is strict (no alignment spaces)
4. Open a PR to `develop` in `aws-infra`; CDK deploy propagates the new schedule

## How to edit a static (non-data) section

The masthead, sub-nav, pulse-band, headlines, treemap, partners, and footer live as raw HTML in `static-content/{top,middle,bottom}.html`. Edit them as plain HTML — they're inlined verbatim via `dangerouslySetInnerHTML`. No JSX gotchas. To make a chunk interactive, JSX-convert it into a proper component (move the markup into a `.tsx`, replace `class` → `className`, etc.) and remove the chunk from `static-content/`.
