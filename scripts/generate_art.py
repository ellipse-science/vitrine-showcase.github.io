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
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode()


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


def generate_image(api_key: str, prompt: str, reference_b64s: list[str]) -> bytes:
    """Call gpt-image-1 via responses API with reference images + prompt, return image bytes."""
    client = OpenAI(api_key=api_key)

    # detail="low" keeps tokens low while still grounding the model in the artist's style
    content: list[dict] = [
        {"type": "input_image", "image_url": f"data:image/jpeg;base64,{b64}", "detail": "low"}
        for b64 in reference_b64s
    ]
    content.append({"type": "input_text", "text": prompt})

    response = client.responses.create(
        model="gpt-4o-mini",
        input=[{"role": "user", "content": content}],
        tools=[{"type": "image_generation", "quality": "medium", "size": "1024x1024"}],
    )

    for item in response.output:
        if item.type == "image_generation_call":
            return base64.b64decode(item.result)

    raise RuntimeError("No image_generation_call item found in API response")


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
