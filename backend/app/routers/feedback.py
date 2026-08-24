"""Everything about feedback that is not scoped to one booking.

Three audiences, three shapes of the same rows:

  * the driver filling the form   -> GET /feedback/options   (the chip catalogue)
  * anyone choosing a lot         -> GET /locations/{id}/feedback   (aggregates only)
  * the operator working the queue-> GET /feedback/admin    (full reports + triage)

The public summary never exposes who left a comment -- only the rating, the
tags and the text.
"""
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..feedback import (
    ASPECTS,
    EDIT_WINDOW_HOURS,
    HIGHLIGHT_TAGS,
    ISSUE_TAGS,
    MAX_TAGS,
    SEVERE_ISSUES,
    label_for,
    split_tags,
)
from ..models import Booking, Feedback, Location, User
from ..schemas import (
    AdminFeedbackListOut,
    AdminFeedbackOut,
    FeedbackHighlightOut,
    FeedbackOptionsOut,
    FeedbackSummaryOut,
    FeedbackTriageIn,
    FeedbackOut,
    TagCountOut,
    TagOut,
    to_feedback_out,
)
from ..security import current_admin

router = APIRouter(tags=["feedback"])

RECENT_COMMENTS = 6
TOP_TAGS = 5


@router.get("/feedback/options", response_model=FeedbackOptionsOut)
def feedback_options() -> FeedbackOptionsOut:
    """The chip catalogue. Served from the API so the two clients cannot drift."""
    return FeedbackOptionsOut(
        issues=[
            TagOut(id=tag, label=label, severe=tag in SEVERE_ISSUES)
            for tag, label in ISSUE_TAGS.items()
        ],
        highlights=[TagOut(id=tag, label=label) for tag, label in HIGHLIGHT_TAGS.items()],
        aspects=list(ASPECTS),
        max_tags=MAX_TAGS,
        edit_window_hours=EDIT_WINDOW_HOURS,
    )


def _rows_for_location(db: Session, location_id: str) -> list[tuple[Feedback, Booking]]:
    return list(
        db.execute(
            select(Feedback, Booking)
            .join(Booking, Feedback.booking_id == Booking.id)
            .where(Booking.location_id == location_id)
            .order_by(Feedback.created_at.desc())
        ).all()
    )


def _tag_counts(values: list[str]) -> list[TagCountOut]:
    counts = Counter(values)
    return [
        TagCountOut(id=tag, label=label_for(tag), count=count)
        for tag, count in counts.most_common(TOP_TAGS)
    ]


@router.get("/locations/{location_id}/feedback", response_model=FeedbackSummaryOut)
def location_feedback(location_id: str, db: Session = Depends(get_db)) -> FeedbackSummaryOut:
    """What drivers make of this lot -- shown before anyone books it."""
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")

    rows = [row for row, _ in _rows_for_location(db, location_id)]
    count = len(rows)

    distribution = {str(star): 0 for star in range(1, 6)}
    for row in rows:
        distribution[str(row.rating)] += 1

    aspect_averages: dict[str, float] = {}
    for aspect in ASPECTS:
        scored = [getattr(row, aspect) for row in rows if getattr(row, aspect)]
        if scored:
            aspect_averages[aspect] = round(sum(scored) / len(scored), 2)

    answered = [row.would_recommend for row in rows if row.would_recommend is not None]
    recommend_pct = (
        round(sum(1 for value in answered if value) / len(answered) * 100, 1) if answered else None
    )

    recent = [
        FeedbackHighlightOut(
            rating=row.rating,
            comment=row.comment,
            issues=split_tags(row.issues),
            highlights=split_tags(row.highlights),
            created_at=row.created_at,
        )
        for row in rows
        if row.comment
    ][:RECENT_COMMENTS]

    return FeedbackSummaryOut(
        location_id=location.id,
        location_name=location.name,
        count=count,
        average=round(sum(row.rating for row in rows) / count, 2) if count else 0.0,
        distribution=distribution,
        aspect_averages=aspect_averages,
        recommend_pct=recommend_pct,
        top_issues=_tag_counts([tag for row in rows for tag in split_tags(row.issues)]),
        top_highlights=_tag_counts([tag for row in rows for tag in split_tags(row.highlights)]),
        recent=recent,
    )


@router.get("/feedback/admin", response_model=AdminFeedbackListOut)
def admin_feedback(
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
    location_id: str | None = Query(default=None),
    feedback_status: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> AdminFeedbackListOut:
    """The operator queue: every report, newest first, with the driver's contact."""
    stmt = (
        select(Feedback, Booking, User)
        .join(Booking, Feedback.booking_id == Booking.id)
        .join(User, Booking.user_id == User.id)
        .order_by(Feedback.created_at.desc())
    )
    if location_id:
        stmt = stmt.where(Booking.location_id == location_id)
    if feedback_status:
        stmt = stmt.where(Feedback.status == feedback_status)
    if priority:
        stmt = stmt.where(Feedback.priority == priority)

    rows = list(db.execute(stmt).all())
    items = [
        AdminFeedbackOut(
            feedback=to_feedback_out(row),
            booking_id=booking.id,
            location_id=booking.location_id,
            location_name=booking.location_name,
            slot_code=booking.slot_code,
            vehicle_number=booking.vehicle_number,
            holder_name=holder.name,
            holder_email=holder.email,
            holder_phone=row.contact_phone or holder.phone or "",
            checked_out_at=booking.checked_out_at,
        )
        for row, booking, holder in rows[:limit]
    ]

    ratings = [row.rating for row, _, _ in rows]
    return AdminFeedbackListOut(
        total=len(rows),
        open_high_priority=sum(
            1 for row, _, _ in rows if row.priority == "high" and row.status != "resolved"
        ),
        average=round(sum(ratings) / len(ratings), 2) if ratings else 0.0,
        items=items,
    )


@router.patch("/feedback/admin/{feedback_id}", response_model=FeedbackOut)
def triage_feedback(
    feedback_id: str,
    payload: FeedbackTriageIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> FeedbackOut:
    """Operator marks a report reviewed or resolved, optionally with a note."""
    row = db.get(Feedback, feedback_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    if payload.status is not None:
        row.status = payload.status
    if payload.operator_note is not None:
        row.operator_note = payload.operator_note.strip()
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return to_feedback_out(row)
