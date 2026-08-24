/**
 * Feedback vocabulary shared by the rating screen, the lot summary and the
 * operator queue.
 *
 * The tag ids and their English labels come from the API (`/feedback/options`)
 * so the two never drift. This module only decorates them: an icon per tag and
 * a translation key, falling back to the API label when a language has no
 * string for it yet.
 */
import {
  BadgeIndianRupee,
  Bike,
  CarFront,
  CircleAlert,
  CircleHelp,
  Clock,
  Coins,
  CreditCard,
  Droplets,
  Handshake,
  Lightbulb,
  MapPin,
  Navigation,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Signpost,
  Sparkles,
  ThumbsUp,
  Timer,
  TriangleAlert,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";

/** Icon per tag id. Anything unmapped falls back to a neutral marker. */
const TAG_ICONS = {
  // problems
  hard_to_find: MapPin,
  bay_occupied: CarFront,
  gate_scan_failed: QrCode,
  long_wait: Clock,
  payment_trouble: CreditCard,
  overcharged: BadgeIndianRupee,
  dirty: Droplets,
  poor_lighting: Lightbulb,
  felt_unsafe: ShieldAlert,
  staff_unhelpful: UserRound,
  valet_delay: Timer,
  vehicle_damage: Wrench,
  ev_charger_broken: Zap,
  confusing_signage: Signpost,
  wrong_bay_size: Bike,
  other: CircleHelp,
  // highlights
  easy_booking: ThumbsUp,
  quick_entry: Navigation,
  clean: Sparkles,
  well_lit: Lightbulb,
  helpful_staff: Handshake,
  close_to_gate: MapPin,
  good_value: Coins,
  felt_safe: ShieldCheck,
  smooth_valet: CarFront,
  ev_charging: Zap,
};

export const tagIcon = (id) => TAG_ICONS[id] ?? CircleAlert;

/**
 * Translated tag label, falling back to the label the API sent.
 * `t()` echoes the key back when a string is missing, which is what makes the
 * fallback detectable.
 */
export function tagLabel(t, tag) {
  if (!tag) return "";
  const key = `fb.tag.${tag.id ?? tag}`;
  const translated = t(key);
  return translated === key ? tag.label ?? tag.id ?? tag : translated;
}

/** The four named scores, in the order they are asked. */
export const ASPECTS = [
  { id: "cleanliness", icon: Sparkles },
  { id: "safety", icon: ShieldCheck },
  { id: "staff", icon: UserRound },
  { id: "value", icon: Coins },
];

export const RATING_TONES = {
  1: "text-red-600",
  2: "text-orange-600",
  3: "text-amber-600",
  4: "text-teal-600",
  5: "text-teal-700",
};

/** A visit rated 3 or less leads with "what went wrong". */
export const isNegative = (rating) => rating > 0 && rating <= 3;

export const PRIORITY_STYLES = {
  high: { className: "bg-red-100 text-red-700", icon: TriangleAlert },
  medium: { className: "bg-amber-100 text-amber-800", icon: CircleAlert },
  low: { className: "bg-teal-100 text-teal-700", icon: ThumbsUp },
};

export const STATUS_TONES = {
  new: "bg-brand-100 text-brand-700",
  reviewed: "bg-amber-100 text-amber-800",
  resolved: "bg-teal-100 text-teal-700",
};

/** Drafts survive a refresh or an accidental back-swipe mid-review. */
export const draftKey = (bookingId) => `parkin.feedback.draft.${bookingId}`;

export function readDraft(bookingId) {
  try {
    const raw = localStorage.getItem(draftKey(bookingId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeDraft(bookingId, draft) {
  try {
    localStorage.setItem(draftKey(bookingId), JSON.stringify(draft));
  } catch {
    /* private mode / quota -- a lost draft is not worth an error */
  }
}

export function clearDraft(bookingId) {
  try {
    localStorage.removeItem(draftKey(bookingId));
  } catch {
    /* ignore */
  }
}

/**
 * How much of the optional detail the driver has filled in. Drives the
 * progress bar that nudges without blocking -- only the star rating is
 * actually required.
 */
export function completeness(form) {
  const checks = [
    form.rating > 0,
    ASPECTS.some((aspect) => form[aspect.id] > 0),
    form.issues.length > 0 || form.highlights.length > 0,
    form.comment.trim().length > 0,
    form.would_recommend !== null,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
