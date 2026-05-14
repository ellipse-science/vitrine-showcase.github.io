# AI Art Generation from Top Headline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 4 hours at xx:15 UTC, generate an editorial illustration in the in-house artist's style based on the current top headline and commit it to the repo as `public/data/generated-art/latest.png`.

**Architecture:** A standalone Python script (`scripts/generate_art.py`) reads the top headline from `public/data/headline-events.json`, selects 20 reference images from `assets/art_images/` (10 topic-matched + 10 random), resizes them to 512×512 JPEG for the API payload, and calls OpenAI's `gpt-image-1` via the responses API with those images as style references. A GitHub Actions workflow (`generate-art.yml`) runs the script on a native `schedule:` cron and commits the output with `[skip ci]`.

**Tech Stack:** Python 3.12, `openai` SDK, `Pillow` (image resize/encode), `python-dotenv` (local .env support), `pytest` (unit tests), GitHub Actions `schedule:` trigger.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Create | `scripts/generate_art.py` | All logic: headline selection, image selection, preprocessing, API call, file output |
| Create | `tests/conftest.py` | Add project root to sys.path for test imports |
| Create | `tests/test_generate_art.py` | Unit tests for all pure functions |
| Create | `.github/workflows/generate-art.yml` | Schedule + run script + commit + Slack alert |
| Create | `public/data/generated-art/.gitkeep` | Ensure output directory is tracked |

---

### Task 1: Test infrastructure + headline selection logic

**Files:**
- Create: `tests/conftest.py`
- Create: `tests/test_generate_art.py`
- Create: `scripts/generate_art.py`

- [ ] **Step 1: Install test dependencies**

```bash
pip install pytest pillow openai python-dotenv
```

Expected: packages installed with no errors.

- [ ] **Step 2: Create `tests/conftest.py`**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
```

- [ ] **Step 3: Write failing tests for `find_top_headline` in `tests/test_generate_art.py`**

```python
import base64
import io

from PIL import Image

from scripts.generate_art import find_top_headline


def test_find_top_headline_returns_most_recent_rank_one():
    events = [
        {
            "event_rank": 1, "date_utc": "2026-05-14", "time_interval_utc": "08-12",
            "title": "Old headline", "event_title_raw": "Old EN",
            "main_issue": "economy_and_labour", "main_issue_text_fr": "Économie et travail",
        },
        {
            "event_rank": 1, "date_utc": "2026-05-14", "time_interval_utc": "12-16",
            "title": "New headline", "event_title_raw": "New EN",
            "main_issue": "immigration", "main_issue_text_fr": "Immigration",
        },
        {
            "event_rank": 2, "date_utc": "2026-05-14", "time_interval_utc": "16-20",
            "title": "Not rank 1", "event_title_raw": "Not rank 1",
            "main_issue": "education", "main_issue_text_fr": "Éducation",
        },
    ]
    result = find_top_headline(events)
    assert result["title"] == "New headline"
    assert result["main_issue"] == "immigration"


def test_find_top_headline_returns_none_when_empty():
    assert find_top_headline([]) is None


def test_find_top_headline_returns_none_when_no_rank_one():
    events = [{"event_rank": 2, "date_utc": "2026-05-14", "time_interval_utc": "08-12"}]
    assert find_top_headline(events) is None


def test_find_top_headline_handles_null_title():
    events = [
        {
            "event_rank": 1, "date_utc": "2026-05-14", "time_interval_utc": "08-12",
            "title": None, "event_title_raw": "Raw English title",
            "main_issue": "economy_and_labour", "main_issue_text_fr": "Économie et travail",
        }
    ]
    result = find_top_headline(events)
    assert result is not None
    assert result["event_title_raw"] == "Raw English title"
```

- [ ] **Step 4: Run tests — expect ImportError (script doesn't exist yet)**

```bash
cd /home/ral/Projects/vitrine/vitrine-showcase.github.io
pytest tests/test_generate_art.py -v 2>&1 | head -15
```

Expected: `ModuleNotFoundError: No module named 'scripts.generate_art'`

- [ ] **Step 5: Create `scripts/generate_art.py` with `find_top_headline`**

```python
#!/usr/bin/env python3
"""Generate an editorial illustration from the current top headline using gpt-image-1."""

import base64
import io
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv optional locally

from openai import OpenAI
from PIL import Image

ROOT = Path(__file__).parent.parent


def find_top_headline(events: list[dict]) -> dict | None:
    """Return the most recent event with event_rank == 1, or None."""
    rank_one = [e for e in events if e.get("event_rank") == 1]
    if not rank_one:
        return None
    return sorted(
        rank_one,
        key=lambda e: (e.get("date_utc") or "", e.get("time_interval_utc") or ""),
        reverse=True,
    )[0]
```

- [ ] **Step 6: Run tests — expect all 4 to pass**

```bash
pytest tests/test_generate_art.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate_art.py tests/conftest.py tests/test_generate_art.py
git commit -m "feat(art): headline selection logic with tests"
```

---

### Task 2: Reference image selection

**Files:**
- Modify: `scripts/generate_art.py`
- Modify: `tests/test_generate_art.py`

- [ ] **Step 1: Add failing tests for `select_reference_images` to `tests/test_generate_art.py`**

Append to the file:

```python
from scripts.generate_art import select_reference_images


def test_select_reference_images_picks_topic_first(tmp_path):
    for issue in ["economy_and_labour", "immigration", "education"]:
        for n in range(1, 5):
            (tmp_path / f"{issue}_generic{n}.png").touch()

    selected = select_reference_images(tmp_path, "economy_and_labour", n_topic=4, n_total=8)

    assert len(selected) == 8
    topic = [p for p in selected if p.name.startswith("economy_and_labour")]
    assert len(topic) == 4
    assert len(set(selected)) == 8  # no duplicates


def test_select_reference_images_fills_when_topic_is_small(tmp_path):
    # Only 2 images for the topic — rest filled from other categories
    for n in range(1, 3):
        (tmp_path / f"immigration_generic{n}.png").touch()
    for issue in ["economy_and_labour", "education"]:
        for n in range(1, 6):
            (tmp_path / f"{issue}_generic{n}.png").touch()
    # Total: 12 images (2+5+5)

    selected = select_reference_images(tmp_path, "immigration", n_topic=10, n_total=20)

    assert len(selected) == 12  # all 12 available (cap at what exists)
    immigration = [p for p in selected if p.name.startswith("immigration")]
    assert len(immigration) == 2  # all topic images included
    assert len(set(selected)) == len(selected)  # no duplicates


def test_select_reference_images_no_duplicates(tmp_path):
    for n in range(1, 8):
        (tmp_path / f"economy_and_labour_generic{n}.png").touch()
    for n in range(1, 8):
        (tmp_path / f"education_generic{n}.png").touch()

    selected = select_reference_images(tmp_path, "economy_and_labour", n_topic=10, n_total=20)
    assert len(selected) == len(set(selected))
```

- [ ] **Step 2: Run failing tests**

```bash
pytest tests/test_generate_art.py -k "select_reference" -v 2>&1 | head -10
```

Expected: `ImportError: cannot import name 'select_reference_images'`

- [ ] **Step 3: Add `select_reference_images` to `scripts/generate_art.py`**

Add after `find_top_headline`:

```python
def select_reference_images(
    image_dir: Path,
    main_issue: str,
    n_topic: int = 10,
    n_total: int = 20,
) -> list[Path]:
    """Return up to n_total images: up to n_topic from main_issue, rest random."""
    all_images = list(image_dir.glob("*.png"))
    topic_images = [p for p in all_images if p.name.startswith(main_issue)]
    other_images = [p for p in all_images if p not in topic_images]

    selected_topic = topic_images[:n_topic]
    remaining_slots = n_total - len(selected_topic)
    selected_other = random.sample(other_images, min(remaining_slots, len(other_images)))

    return selected_topic + selected_other
```

- [ ] **Step 4: Run all selection tests**

```bash
pytest tests/test_generate_art.py -k "select_reference" -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_art.py tests/test_generate_art.py
git commit -m "feat(art): reference image selection logic with tests"
```

---

### Task 3: Image preprocessing

**Files:**
- Modify: `scripts/generate_art.py`
- Modify: `tests/test_generate_art.py`

- [ ] **Step 1: Add failing tests for `prepare_image` to `tests/test_generate_art.py`**

Append to the file:

```python
from scripts.generate_art import prepare_image


def test_prepare_image_returns_valid_base64_jpeg(tmp_path):
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img_path = tmp_path / "test.png"
    img.save(img_path, "PNG")

    result = prepare_image(img_path, max_size=64)

    assert isinstance(result, str)
    decoded = base64.b64decode(result)
    reopened = Image.open(io.BytesIO(decoded))
    assert reopened.format == "JPEG"


def test_prepare_image_respects_max_size(tmp_path):
    img = Image.new("RGB", (1024, 512), color=(0, 255, 0))
    img_path = tmp_path / "wide.png"
    img.save(img_path, "PNG")

    result = prepare_image(img_path, max_size=256)

    decoded = base64.b64decode(result)
    reopened = Image.open(io.BytesIO(decoded))
    assert reopened.size[0] <= 256
    assert reopened.size[1] <= 256
```

- [ ] **Step 2: Run failing tests**

```bash
pytest tests/test_generate_art.py -k "prepare_image" -v 2>&1 | head -10
```

Expected: `ImportError: cannot import name 'prepare_image'`

- [ ] **Step 3: Add `prepare_image` to `scripts/generate_art.py`**

Add after `select_reference_images`:

```python
def prepare_image(image_path: Path, max_size: int = 512) -> str:
    """Resize to max_size×max_size, encode as JPEG, return base64 string."""
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_generate_art.py -k "prepare_image" -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_art.py tests/test_generate_art.py
git commit -m "feat(art): image preprocessing (resize + JPEG base64 encode)"
```

---

### Task 4: Prompt building

**Files:**
- Modify: `scripts/generate_art.py`
- Modify: `tests/test_generate_art.py`

- [ ] **Step 1: Add failing tests for `build_prompt` to `tests/test_generate_art.py`**

Append to the file:

```python
from scripts.generate_art import build_prompt


def test_build_prompt_includes_headline_and_topic():
    prompt = build_prompt("Honda suspend son projet EV", "Économie et travail")
    assert "Honda suspend son projet EV" in prompt
    assert "Économie et travail" in prompt
    assert "style" in prompt.lower()


def test_build_prompt_contains_no_restricted_content():
    prompt = build_prompt("Quelconque titre", "Immigration")
    assert "sk-" not in prompt
    assert "OPENAI" not in prompt
    assert len(prompt) > 50
```

- [ ] **Step 2: Run failing tests**

```bash
pytest tests/test_generate_art.py -k "build_prompt" -v 2>&1 | head -10
```

Expected: `ImportError: cannot import name 'build_prompt'`

- [ ] **Step 3: Add `build_prompt` to `scripts/generate_art.py`**

Add after `prepare_image`:

```python
def build_prompt(headline: str, main_issue_text_fr: str) -> str:
    """Build the style-reference generation prompt."""
    return (
        "These reference images are editorial illustrations by our in-house artist. "
        "Generate a new editorial illustration in the same visual style "
        "(palette, composition, abstraction level, artistic treatment) "
        f"depicting this news headline: «{headline}» "
        f"(topic: {main_issue_text_fr}). "
        "No text, no logos, no photographs."
    )
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_generate_art.py -k "build_prompt" -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_art.py tests/test_generate_art.py
git commit -m "feat(art): prompt builder with tests"
```

---

### Task 5: OpenAI API integration + main orchestrator

**Files:**
- Modify: `scripts/generate_art.py`
- Modify: `tests/test_generate_art.py`

- [ ] **Step 1: Add a mocked test for `generate_image` to `tests/test_generate_art.py`**

Append to the file:

```python
from unittest.mock import MagicMock, patch

from scripts.generate_art import generate_image


def test_generate_image_calls_responses_api_correctly():
    fake_image_bytes = b"fake_png_data"
    fake_b64 = base64.b64encode(fake_image_bytes).decode()

    fake_item = MagicMock()
    fake_item.type = "image_generation_call"
    fake_item.result = fake_b64

    fake_response = MagicMock()
    fake_response.output = [fake_item]

    with patch("scripts.generate_art.OpenAI") as MockOpenAI:
        mock_client = MagicMock()
        MockOpenAI.return_value = mock_client
        mock_client.responses.create.return_value = fake_response

        result = generate_image("sk-fake", "A test prompt", ["ref1_b64", "ref2_b64"])

    assert result == fake_image_bytes

    call_kwargs = mock_client.responses.create.call_args.kwargs
    assert call_kwargs["model"] == "gpt-image-1"
    input_content = call_kwargs["input"][0]["content"]
    # First 2 items are reference images, last is the text prompt
    assert input_content[-1]["type"] == "input_text"
    assert input_content[-1]["text"] == "A test prompt"
    assert input_content[0]["type"] == "input_image"
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/test_generate_art.py::test_generate_image_calls_responses_api_correctly -v 2>&1 | head -10
```

Expected: `ImportError: cannot import name 'generate_image'`

- [ ] **Step 3: Add `generate_image` to `scripts/generate_art.py`**

Add after `build_prompt`:

```python
def generate_image(api_key: str, prompt: str, reference_b64s: list[str]) -> bytes:
    """Call gpt-image-1 with reference images + prompt via responses API, return image bytes."""
    client = OpenAI(api_key=api_key)

    content: list[dict] = [
        {"type": "input_image", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
        for b64 in reference_b64s
    ]
    content.append({"type": "input_text", "text": prompt})

    response = client.responses.create(
        model="gpt-image-1",
        input=[{"role": "user", "content": content}],
        output=[{"type": "image_generation_call", "quality": "medium"}],
    )

    for item in response.output:
        if item.type == "image_generation_call":
            return base64.b64decode(item.result)

    raise RuntimeError("No image_generation_call item found in API response")
```

- [ ] **Step 4: Add `main()` to `scripts/generate_art.py`**

Add after `generate_image`:

```python
def main() -> None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY is not set", file=sys.stderr)
        sys.exit(1)

    data_path = ROOT / "public" / "data" / "headline-events.json"
    events = json.loads(data_path.read_text())
    event = find_top_headline(events)

    if event is None:
        print("WARNING: no event_rank=1 event found — skipping image generation")
        sys.exit(0)

    headline_fr = event.get("title") or event.get("event_title_raw") or ""
    headline_en = event.get("event_title_raw") or event.get("title") or ""
    main_issue = event.get("main_issue") or "governments_and_governance"
    main_issue_text_fr = event.get("main_issue_text_fr") or main_issue

    art_dir = ROOT / "assets" / "art_images"
    image_paths = select_reference_images(art_dir, main_issue)
    reference_b64s = [prepare_image(p) for p in image_paths]

    prompt = build_prompt(headline_fr, main_issue_text_fr)
    print(f"Headline: {headline_fr!r}")
    print(f"Topic: {main_issue_text_fr}")
    print(f"Reference images: {len(reference_b64s)}")

    image_bytes = generate_image(api_key, prompt, reference_b64s)

    out_dir = ROOT / "public" / "data" / "generated-art"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "latest.png").write_bytes(image_bytes)

    metadata = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "headline_fr": headline_fr,
        "headline_en": headline_en,
        "main_issue": main_issue,
        "main_issue_text_fr": main_issue_text_fr,
    }
    (out_dir / "latest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    print(f"Saved → {out_dir / 'latest.png'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run all tests**

```bash
pytest tests/test_generate_art.py -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate_art.py tests/test_generate_art.py
git commit -m "feat(art): OpenAI API integration and main orchestrator"
```

---

### Task 6: Output directory placeholder

**Files:**
- Create: `public/data/generated-art/.gitkeep`

- [ ] **Step 1: Create the output directory and placeholder**

```bash
mkdir -p public/data/generated-art
touch public/data/generated-art/.gitkeep
```

- [ ] **Step 2: Confirm `public/data/` is not excluded by .gitignore**

```bash
grep -n "generated-art\|public/data" .gitignore
```

Expected: no output (the directory is not excluded). If it is excluded, add `!public/data/generated-art/` to `.gitignore`.

- [ ] **Step 3: Commit**

```bash
git add public/data/generated-art/.gitkeep
git commit -m "chore: add generated-art output directory"
```

---

### Task 7: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/generate-art.yml`

- [ ] **Step 1: Create `.github/workflows/generate-art.yml`**

```yaml
name: Generate Art

# Runs every 4 hours at xx:15 UTC via GitHub Actions native scheduler.
# For tighter timing, cron-job.org can also trigger via workflow_dispatch:
#   URL:    https://api.github.com/repos/<owner>/vitrine-showcase.github.io/actions/workflows/generate-art.yml/dispatches
#   Method: POST   Body: {"ref":"main"}
#   Header: Authorization: token <GitHub PAT with workflow scope>
#   Cron:   15 0,4,8,12,16,20 * * *

on:
  schedule:
    - cron: '15 0,4,8,12,16,20 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest

    env:
      OPENAI_API_KEY:    ${{ secrets.OPENAI_API_KEY }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install openai pillow python-dotenv

      - name: Generate art
        run: python scripts/generate_art.py

      - name: Commit generated image
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/data/generated-art/
          if git diff --cached --quiet; then
            echo "No changes — skipping commit."
          else
            git commit -m "art: generate $(date -u +%Y-%m-%dT%H:%MZ) [skip ci]"
            git push
          fi

      - name: Alert Slack on failure
        if: failure()
        run: |
          if [ -n "$SLACK_WEBHOOK_URL" ]; then
            RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
            curl -fsS -X POST -H 'Content-Type: application/json' \
              -d "{\"text\":\"⚠️ *Vitrine art generation FAILED*\nRun: ${RUN_URL}\"}" \
              "$SLACK_WEBHOOK_URL"
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/generate-art.yml
git commit -m "feat(art): generate-art.yml workflow — schedule every 4h at xx:15 UTC"
```

---

### Task 8: Smoke tests + key absent guard

- [ ] **Step 1: Run the full test suite**

```bash
pytest tests/test_generate_art.py -v
```

Expected: all tests PASS.

- [ ] **Step 2: Confirm the script imports cleanly**

```bash
python -c "import scripts.generate_art; print('imports OK')"
```

Expected: `imports OK`

- [ ] **Step 3: Verify clean failure when OPENAI_API_KEY is absent**

```bash
OPENAI_API_KEY="" python scripts/generate_art.py 2>&1; echo "Exit: $?"
```

Expected output:
```
ERROR: OPENAI_API_KEY is not set
Exit: 1
```

- [ ] **Step 4: Push the branch**

```bash
git push
```

All tasks complete. The next run of the scheduled workflow will generate the first image.
