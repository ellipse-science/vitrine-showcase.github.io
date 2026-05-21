#!/usr/bin/env python3
"""Generate ambient music from top 3 QC headlines using GEMS + MusicGen via Replicate."""

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).parent.parent


def find_top_headlines(events: list[dict], n: int = 3) -> list[dict]:
    """Return top n QC headlines for the latest block.

    Mirrors the selection logic of loadHeadlineEvents() in lib/data/headlineEvents.ts
    and find_top_headline() in scripts/generate_art.py: dedupe by event_id preferring
    target_region==QC, exclude country_id==USA, restrict to latest (date_utc,
    time_interval_utc) bucket, then pick top n by score_qc / score_saillance.
    """
    by_id: dict[str, dict] = {}
    for e in events:
        existing = by_id.get(e.get("event_id"))
        if existing is None or e.get("target_region") == "QC":
            by_id[e.get("event_id")] = e

    unique = [e for e in by_id.values() if e.get("country_id") != "USA"]
    if not unique:
        return []

    def dt_key(e: dict) -> str:
        start = (e.get("time_interval_utc") or "").split("-")[0]
        return f"{e.get('date_utc')}T{start.zfill(2)}:00Z"

    unique.sort(key=dt_key, reverse=True)
    latest_date     = unique[0].get("date_utc")
    latest_interval = unique[0].get("time_interval_utc")
    latest = [e for e in unique if e.get("date_utc") == latest_date and e.get("time_interval_utc") == latest_interval]

    with_titles = [e for e in latest if e.get("title")]
    with_titles.sort(
        key=lambda e: ((e.get("score_qc") or 0), (e.get("score_saillance") or 0)),
        reverse=True,
    )

    seen: set[str] = set()
    result: list[dict] = []
    for e in with_titles:
        title = e.get("title", "")
        if title not in seen:
            seen.add(title)
            result.append(e)
        if len(result) >= n:
            break

    return result


def compute_weights(events: list[dict]) -> list[int]:
    total = sum(e.get("score_saillance") or 0 for e in events)
    if total == 0:
        return [round(100 / len(events))] * len(events)
    return [round((e.get("score_saillance") or 0) / total * 100) for e in events]


def stories_context(events: list[dict], weights: list[int]) -> str:
    return "\n\n".join(
        f"Story {i + 1} ({w}% of public attention):\n"
        f"Issue: {e.get('main_issue_text_fr', '')}\n"
        f"Headline: {e.get('title', '')}\n"
        f"Summary: {str(e.get('text') or e.get('body') or '')[:300]}"
        for i, (e, w) in enumerate(zip(events, weights))
    )


def score_gems(context: str, api_key: str, date_str: str, interval_str: str) -> dict:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        messages=[
            {"role": "system", "content": "You are a music psychology expert. Return only valid JSON."},
            {"role": "user", "content": (
                f"Top QC news stories for {date_str} block {interval_str} UTC:\n\n{context}\n\n"
                "Score the OVERALL emotional ambiance on 9 GEMS dimensions (0-100).\n"
                'Return ONLY valid JSON: {"wonder":0,"transcendence":0,"tenderness":0,"nostalgia":0,'
                '"peacefulness":0,"energy":0,"joyful_activation":0,"sadness":0,"tension":0}'
            )},
        ],
    )
    content = resp.choices[0].message.content
    m = re.search(r"\{[^{}]*\}", content)
    if not m:
        raise ValueError(f"No JSON object found in GEMS response: {content!r}")
    try:
        return json.loads(m.group())
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid GEMS JSON: {exc}") from exc


def generate_music_prompt(context: str, gems: dict, api_key: str, date_str: str, interval_str: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    sub = (gems["wonder"] + gems["transcendence"] + gems["tenderness"] + gems["nostalgia"] + gems["peacefulness"]) / 5
    vit = (gems["energy"] + gems["joyful_activation"]) / 2
    une = (gems["tension"] + gems["sadness"]) / 2
    resp = client.chat.completions.create(
        model="gpt-4o",
        temperature=0.7,
        messages=[
            {
                "role": "system",
                "content": "You are a music director creating prompts for AI music generation. Write concise, vivid prompts optimized for MusicGen. 30-50 words max.",
            },
            {
                "role": "user",
                "content": (
                    f"Top QC news stories for {date_str} ({interval_str} UTC):\n\n{context}\n\n"
                    f"GEMS: Wonder={gems['wonder']} Transcendence={gems['transcendence']} "
                    f"Tenderness={gems['tenderness']} Nostalgia={gems['nostalgia']} "
                    f"Peacefulness={gems['peacefulness']} Energy={gems['energy']} "
                    f"Joyful_activation={gems['joyful_activation']} Sadness={gems['sadness']} Tension={gems['tension']}\n"
                    f"Sublimity={sub:.0f} Vitality={vit:.0f} Unease={une:.0f}\n\n"
                    "Write a SHORT music generation prompt (30-50 words) for MusicGen capturing the emotional atmosphere. "
                    "Be specific: genre, BPM, key, instruments, mood. No explanation, just the prompt."
                ),
            },
        ],
    )
    return resp.choices[0].message.content.strip()


def generate_audio(prompt: str, replicate_token: str, duration: int = 60) -> bytes:
    import replicate
    client = replicate.Client(api_token=replicate_token)
    output = client.run(
        "meta/musicgen",
        input={
            "prompt": prompt,
            "duration": duration,
            "output_format": "mp3",
            "normalization_strategy": "loudness",
        },
    )
    if hasattr(output, "read"):
        return output.read()
    url = output if isinstance(output, str) else str(next(iter(output)))
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    openai_key      = os.environ.get("OPENAI_API_KEY")
    replicate_token = os.environ.get("REPLICATE_API_TOKEN")

    if not openai_key and not dry_run:
        print("ERROR: OPENAI_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    if not replicate_token and not dry_run:
        print("ERROR: REPLICATE_API_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    data_path = ROOT / "public" / "data" / "headline-events.json"
    events = json.loads(data_path.read_text())
    top = find_top_headlines(events, n=3)

    if not top:
        print("WARNING: no QC headlines found — skipping music generation")
        sys.exit(0)

    date_str     = top[0].get("date_utc", "")
    interval_str = top[0].get("time_interval_utc", "")
    weights      = compute_weights(top)
    context      = stories_context(top, weights)

    print(f"Bloc: {date_str} {interval_str} UTC")
    for e, w in zip(top, weights):
        print(f"  [{w}%] {e.get('title', '')}")

    if dry_run:
        print("\n--- DRY RUN ---")
        sys.exit(0)

    print("Scoring GEMS...")
    gems = score_gems(context, openai_key, date_str, interval_str)
    sub = (gems["wonder"] + gems["transcendence"] + gems["tenderness"] + gems["nostalgia"] + gems["peacefulness"]) / 5
    vit = (gems["energy"] + gems["joyful_activation"]) / 2
    une = (gems["tension"] + gems["sadness"]) / 2
    print(f"GEMS: sublimity={sub:.0f} vitality={vit:.0f} unease={une:.0f}")

    print("Generating music prompt...")
    music_prompt = generate_music_prompt(context, gems, openai_key, date_str, interval_str)
    print(f"Prompt: {music_prompt}")

    print("Generating audio via Replicate MusicGen (60 s)...")
    audio_bytes = generate_audio(music_prompt, replicate_token)

    out_dir = ROOT / "public" / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "latest.mp3").write_bytes(audio_bytes)
    print(f"Saved → {out_dir / 'latest.mp3'} ({len(audio_bytes):,} bytes)")


if __name__ == "__main__":
    main()
