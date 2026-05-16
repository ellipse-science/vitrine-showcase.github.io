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

ROOT = Path(__file__).parent.parent


def find_top_headline(events: list[dict]) -> dict | None:
    """Return the event the site renders as its #1 "une des unes" headline.

    SOURCE OF TRUTH: loadHeadlineEvents() in lib/data/headlineEvents.ts
    (~lines 199-231). The AI illustration sits in the same `une-main` block as
    that headline, so it must depict the *same* event. Mirror that selection:
    dedupe by event_id (prefer target_region == "QC"), drop country_id == "USA",
    restrict to the latest (date_utc, time_interval_utc) bucket, then pick the
    highest score_qc, tie-broken by score_saillance, among events with a title.

    (Old behaviour selected event_rank == 1 — a global rank that diverges from
    the QC-weighted lead the site actually shows: La Vitrine démocratique *du
    Québec*. That mismatch produced a pipeline image beside a Québec headline.)
    If the two selectors ever drift apart again, fix them together.
    """
    by_id: dict[str, dict] = {}
    for e in events:
        existing = by_id.get(e.get("event_id"))
        if existing is None or e.get("target_region") == "QC":
            by_id[e.get("event_id")] = e
    unique = [e for e in by_id.values() if e.get("country_id") != "USA"]
    if not unique:
        return None

    def dt_key(e: dict) -> str:
        start = (e.get("time_interval_utc") or "").split("-")[0]
        return f"{e.get('date_utc')}T{start}:00Z"

    unique.sort(key=dt_key, reverse=True)
    latest_date = unique[0].get("date_utc")
    latest_interval = unique[0].get("time_interval_utc")
    latest = [
        e
        for e in unique
        if e.get("date_utc") == latest_date
        and e.get("time_interval_utc") == latest_interval
    ]
    with_titles = [e for e in latest if e.get("title")]
    if not with_titles:
        return None
    with_titles.sort(
        key=lambda e: ((e.get("score_qc") or 0), (e.get("score_saillance") or 0)),
        reverse=True,
    )
    return with_titles[0]


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


def prepare_image(image_path: Path, max_size: int = 512) -> str:
    """Resize to max_size×max_size, encode as JPEG, return base64 string."""
    from PIL import Image

    with Image.open(image_path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode()


def build_context_digest(event: dict, max_outlets: int = 4, max_chars: int = 300) -> tuple[str, list[str]]:
    """Build a balanced multi-outlet factual digest from the event's articles.

    Returns (digest_text, outlet_ids). One body_preview per distinct outlet,
    French preferred then English backfilled, so the model sees the spread of
    framings rather than one newsroom's. Empty digest if no usable articles.
    """
    raw = event.get("articles")
    if isinstance(raw, str):
        try:
            articles = json.loads(raw)
        except (ValueError, TypeError):
            return "", []
    elif isinstance(raw, list):
        articles = raw
    else:
        return "", []

    if not articles:
        return "", []

    def usable(a: dict) -> bool:
        return bool(a.get("media_id")) and bool((a.get("body_preview") or "").strip())

    picked: dict[str, dict] = {}
    # First pass: French outlets. Second pass: backfill remaining slots with English.
    for lang in ("fr", "en"):
        for a in articles:
            if len(picked) >= max_outlets:
                break
            if not usable(a):
                continue
            mid = a["media_id"]
            if mid in picked:
                continue
            if (a.get("language") or "").lower() == lang:
                picked[mid] = a

    if not picked:
        return "", []

    lines = []
    for a in picked.values():
        snippet = " ".join((a.get("body_preview") or "").split())[:max_chars]
        lines.append(f"- {snippet}")
    return "\n".join(lines), list(picked.keys())


def build_prompt(headline: str, main_issue_text_fr: str, context_digest: str = "") -> str:
    """Build the style-reference generation prompt."""
    parts = [
        "These reference images are editorial illustrations by our in-house artist. "
        "Generate a new editorial illustration in the same visual style "
        "(palette, composition, abstraction level, artistic treatment) "
        f"depicting this news headline: «{headline}» "
        f"(topic: {main_issue_text_fr}).",
    ]
    if context_digest:
        parts.append(
            "The following are factual excerpts from several independent newsrooms "
            "covering the same event, provided only so you understand the subject — "
            "not to be depicted literally:\n" + context_digest
        )
    parts.append(
        "Adopt a detached, neutral editorial stance. Do not imply the news is good "
        "or bad and do not take a side. Avoid celebratory cues (triumphant or golden "
        "light, clear blue skies, smiling harmony, upward momentum) and equally avoid "
        "catastrophic cues (darkness, storms, decay, conflict, ruin). Represent the "
        "subject symbolically and even-handedly, with a neutral colour temperature, "
        "balanced composition, and restraint rather than drama."
    )
    parts.append(
        "Absolutely no text of any kind: no words, no letters, no numbers, "
        "no captions, no titles, no signatures, no watermarks. "
        "No logos, no photographs. The image must contain zero written characters."
    )
    return "\n\n".join(parts)


def generate_image(api_key: str, prompt: str, reference_b64s: list[str]) -> bytes:
    """Call gpt-image-1 via responses API with reference images + prompt, return image bytes."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    # detail="low" keeps tokens low while still grounding the model in the artist's style
    content: list[dict] = [
        {"type": "input_image", "image_url": f"data:image/jpeg;base64,{b64}", "detail": "low"}
        for b64 in reference_b64s
    ]
    content.append({"type": "input_text", "text": prompt})

    response = client.responses.create(
        model="gpt-4o",
        input=[{"role": "user", "content": content}],
        tools=[{"type": "image_generation", "quality": "medium", "size": "1024x1024"}],
    )

    for item in response.output:
        if item.type == "image_generation_call":
            return base64.b64decode(item.result)

    raise RuntimeError("No image_generation_call item found in API response")


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and not dry_run:
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

    context_digest, context_outlets = build_context_digest(event)
    prompt = build_prompt(headline_fr, main_issue_text_fr, context_digest)

    print(f"Headline: {headline_fr!r}")
    print(f"Topic: {main_issue_text_fr}")
    print(f"Context outlets: {context_outlets or '(none — headline+topic only)'}")

    if dry_run:
        print("\n--- DRY RUN: assembled prompt ---\n")
        print(prompt)
        sys.exit(0)

    art_dir = ROOT / "assets" / "art_images"
    image_paths = select_reference_images(art_dir, main_issue)
    reference_b64s = [prepare_image(p) for p in image_paths]
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
        "context_outlets": context_outlets,
    }
    (out_dir / "latest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    print(f"Saved → {out_dir / 'latest.png'}")


if __name__ == "__main__":
    main()
