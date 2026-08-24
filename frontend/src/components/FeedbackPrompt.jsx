/**
 * The nudge that fires the moment a visit ends.
 *
 * It is deliberately a *popup with stars in it*, not a full form: tapping a
 * star both records the driver's first impression and carries it into the
 * feedback screen, so the rating is never asked for twice. "Not now" is a real
 * option and is remembered, so the same visit does not nag on every reload.
 */
import { useState } from "react";
import { MessageSquareHeart, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { RATING_TONES } from "../lib/feedback";
import StarRating from "./StarRating";
import { Button, Modal } from "./ui";

const DISMISS_KEY = "parkin.feedback.dismissed";

export function wasPromptDismissed(bookingId) {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
    return Array.isArray(raw) && raw.includes(bookingId);
  } catch {
    return false;
  }
}

export function dismissPrompt(bookingId) {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
    const next = Array.isArray(raw) ? raw : [];
    if (!next.includes(bookingId)) next.push(bookingId);
    // Keep the list short -- it only exists to stop repeat nagging.
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-30)));
  } catch {
    /* ignore */
  }
}

export default function FeedbackPrompt({ open, booking, onClose }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [rating, setRating] = useState(0);

  if (!booking) return null;

  const go = (stars) => {
    dismissPrompt(booking.id);
    navigate(`/feedback/${booking.id}`, { state: { rating: stars || rating } });
  };

  const skip = () => {
    dismissPrompt(booking.id);
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={skip}
      closeLabel={t("fb.prompt.later")}
      title={t("fb.prompt.title")}
      description={t("fb.prompt.lead", {
        lot: booking.location_name,
        bay: booking.slot_code,
      })}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-sand-50 px-4 py-5">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <MessageSquareHeart className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-ink-900">{t("fb.prompt.ask")}</p>

        {/* Picking a star here jumps straight into the full form with that
            score already selected. */}
        <StarRating value={rating} onChange={(value) => go(value)} size="lg" label={t("fb.overall")} />

        <p className={`h-5 text-xs font-semibold ${RATING_TONES[rating] ?? "text-ink-500"}`}>
          {rating ? t(`fb.score.${rating}`) : t("fb.prompt.tap")}
        </p>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-snug text-ink-500">
        <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
        {t("fb.prompt.why")}
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
        <Button className="flex-1" onClick={() => go(rating)}>
          {t("fb.prompt.cta")}
        </Button>
        <Button variant="ghost" className="flex-1" onClick={skip}>
          {t("fb.prompt.later")}
        </Button>
      </div>
    </Modal>
  );
}
