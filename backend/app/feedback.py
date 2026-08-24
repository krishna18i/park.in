"""Post-visit feedback: the tag catalogue and the triage rules around it.

A rating on its own tells an operator that something went wrong but not what.
The driver therefore picks structured tags -- problems when the visit was poor,
highlights when it was good -- and those tags are what the operator console and
the lot summary aggregate. Free text stays optional.

Tags are stored as a comma-separated string rather than a join table: the set is
small, fixed, and only ever read back whole.
"""
from __future__ import annotations

import secrets

# Problems a driver can report. Keys are stable ids -- the UI translates them,
# so never rename one without a migration.
ISSUE_TAGS: dict[str, str] = {
    "hard_to_find": "Bay was hard to find",
    "bay_occupied": "Someone else was in my bay",
    "gate_scan_failed": "QR did not scan at the gate",
    "long_wait": "Long wait at the gate",
    "payment_trouble": "Payment or refund trouble",
    "overcharged": "Charged more than expected",
    "dirty": "Lot was dirty",
    "poor_lighting": "Poor lighting",
    "felt_unsafe": "Felt unsafe",
    "staff_unhelpful": "Staff was unhelpful",
    "valet_delay": "Valet took too long",
    "vehicle_damage": "Vehicle was damaged",
    "ev_charger_broken": "EV charger not working",
    "confusing_signage": "Confusing signage",
    "wrong_bay_size": "Bay was too small for my vehicle",
    "other": "Something else",
}

# What went well. Offered instead of problems when the driver rates 4 or 5.
HIGHLIGHT_TAGS: dict[str, str] = {
    "easy_booking": "Booking was easy",
    "quick_entry": "Quick entry and exit",
    "clean": "Clean and tidy",
    "well_lit": "Well lit",
    "helpful_staff": "Helpful staff",
    "close_to_gate": "Bay close to the gate",
    "good_value": "Good value",
    "felt_safe": "Felt safe",
    "smooth_valet": "Smooth valet",
    "ev_charging": "EV charging worked",
}

# Reports that must not sit in a queue: a safety or money problem gets flagged
# for the operator the moment it is submitted.
SEVERE_ISSUES = frozenset(
    {"felt_unsafe", "vehicle_damage", "bay_occupied", "overcharged", "payment_trouble"}
)

# The named quality scores collected alongside the overall star rating. 0 means
# "driver skipped this one" and is left out of every average.
ASPECTS = ("cleanliness", "safety", "staff", "value")

MAX_TAGS = 8
EDIT_WINDOW_HOURS = 24


class FeedbackStatus:
    NEW = "new"
    REVIEWED = "reviewed"
    RESOLVED = "resolved"


ALL_STATUSES = (FeedbackStatus.NEW, FeedbackStatus.REVIEWED, FeedbackStatus.RESOLVED)


def clean_tags(values: list[str] | None, allowed: dict[str, str]) -> list[str]:
    """Drop unknown/duplicate tags, keep order, cap the count.

    Raises ValueError on an unknown tag so a typo in a client surfaces as a 422
    instead of silently vanishing.
    """
    if not values:
        return []
    seen: list[str] = []
    for raw in values:
        tag = (raw or "").strip().lower()
        if not tag:
            continue
        if tag not in allowed:
            raise ValueError(f"Unknown tag '{tag}'")
        if tag not in seen:
            seen.append(tag)
    if len(seen) > MAX_TAGS:
        raise ValueError(f"Pick at most {MAX_TAGS} tags")
    return seen


def join_tags(tags: list[str]) -> str:
    return ",".join(tags)


def split_tags(value: str | None) -> list[str]:
    return [tag for tag in (value or "").split(",") if tag]


def priority_for(rating: int, issues: list[str]) -> str:
    """How loudly this report should land on the operator's desk."""
    if any(tag in SEVERE_ISSUES for tag in issues):
        return "high"
    if rating <= 2:
        return "high"
    if rating == 3 or issues:
        return "medium"
    return "low"


def new_reference() -> str:
    """Short human-quotable id, e.g. FBK-7Q2K4M -- used when care calls back."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "FBK-" + "".join(secrets.choice(alphabet) for _ in range(6))


def label_for(tag: str) -> str:
    return ISSUE_TAGS.get(tag) or HIGHLIGHT_TAGS.get(tag) or tag
