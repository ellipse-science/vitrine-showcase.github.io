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


# ---------------------------------------------------------------------------
# Task 2: select_reference_images
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Task 3: prepare_image
# ---------------------------------------------------------------------------

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
