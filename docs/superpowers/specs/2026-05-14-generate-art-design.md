# Design: AI Art Generation from Top Headline

**Date:** 2026-05-14  
**Status:** Approved

## Overview

Every 4 hours at xx:15 UTC, a GitHub Actions workflow reads the current top headline from `public/data/headline-events.json`, selects 20 reference images from the in-house artist's portfolio, and calls OpenAI's `gpt-image-1` model to generate an editorial illustration in the artist's style. The result is committed to the repo as `public/data/generated-art/latest.png`.

## Files

| File | Purpose |
|---|---|
| `scripts/generate_art.py` | Reads headline, selects images, calls OpenAI, writes output |
| `.github/workflows/generate-art.yml` | Schedules the script, commits result |
| `public/data/generated-art/latest.png` | Generated image (overwritten each run) |
| `public/data/generated-art/latest.json` | Metadata: headline, timestamp, main_issue |

No changes to the Next.js build, `package.json`, or existing data pipeline.

## Trigger

GitHub Actions native `schedule:` cron: `15 0,4,8,12,16,20 * * *` (UTC) plus `workflow_dispatch` for manual runs.

## Headline selection

Read `public/data/headline-events.json`. Sort events by `(date_utc, time_interval_utc)` descending. Take the first event where `event_rank == 1`. If none found, exit 0 (no image generated, not a failure).

Fields used: `title` (French), `event_title_raw` (English fallback), `main_issue`, `main_issue_text_fr`.

## Reference image selection

Source: `assets/art_images/` (57 PNG files named `{issue}_generic{n}.png`).

- 10 images whose filename starts with `main_issue` of the top headline
- If fewer than 10 exist for that issue, take all of them and fill from the random pool
- Fill remaining slots randomly from the rest (no duplicates)
- Total: always 20 images

## Image preprocessing

The source PNGs are 5–10 MB at up to 2912×1632 px. Before encoding:
- Resize to max 512×512 with `PIL.Image.thumbnail()` (preserves aspect ratio)
- Save as JPEG in memory at quality=85
- Base64-encode the result

## Prompt

```
These reference images are editorial illustrations by our in-house artist.
Generate a new editorial illustration in the same visual style (palette,
composition, abstraction level, artistic treatment) depicting this news headline:
«{title}» (topic: {main_issue_text_fr}).
No text, no logos, no photographs.
```

`title` is the French headline; fall back to `event_title_raw` if `title` is null.

## API call

Model: `gpt-image-1` via OpenAI responses API with multimodal user message (20 reference images + prompt text). Size: 1024×1024, quality: medium.

## Output

- `public/data/generated-art/latest.png` — generated image bytes
- `public/data/generated-art/latest.json` — `{ generated_at, headline_fr, headline_en, main_issue, main_issue_text_fr }`

## Secrets

`OPENAI_API_KEY` stored as a GitHub Actions repository secret. Read from `os.environ["OPENAI_API_KEY"]`. Script exits immediately with a clear error if the variable is missing. Key is never logged or written to any committed file.

For local runs: `.env` file at repo root (gitignored), loaded via `python-dotenv` if present.

## Error handling

- Missing `OPENAI_API_KEY`: exit 1 with message before any API call
- No `event_rank=1` event in data: log warning, exit 0
- OpenAI API error: propagate exception, workflow marks run as failed
- Slack failure notification: same pattern as `refresh-data.yml`

## Dependencies (CI)

```
pip install openai pillow python-dotenv
```

Python is pre-installed on `ubuntu-latest`. No changes to `package.json`.
