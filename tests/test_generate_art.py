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
