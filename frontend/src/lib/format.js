/** Shared formatting helpers. */

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const money = (amount) => rupees.format(amount ?? 0);

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const timeOnly = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export const when = (iso) => (iso ? dateTime.format(new Date(iso)) : "--");
export const clock = (iso) => (iso ? timeOnly.format(new Date(iso)) : "--");

/** "2h 30m" from a decimal hour count. */
export function duration(hours) {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (whole && minutes) return `${whole}h ${minutes}m`;
  if (whole) return `${whole}h`;
  return `${minutes}m`;
}

/** Live countdown label, e.g. "8m 04s left". Returns null once expired. */
export function timeLeft(iso, now = Date.now()) {
  if (!iso) return null;
  const remaining = new Date(iso).getTime() - now;
  if (remaining <= 0) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * `<input type="datetime-local">` speaks local wall-clock time with no zone.
 * These two keep the conversion in one place so bookings never drift by the
 * UTC offset.
 */
export function toLocalInput(date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export const fromLocalInput = (value) => new Date(value);

export const STATUS_STYLES = {
  pending: { label: "Awaiting payment", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", className: "bg-teal-100 text-teal-700" },
  active: { label: "Parked", className: "bg-brand-100 text-brand-700" },
  completed: { label: "Completed", className: "bg-sand-200 text-ink-700" },
  cancelled: { label: "Cancelled", className: "bg-stone-200 text-stone-600" },
  expired: { label: "Expired", className: "bg-stone-200 text-stone-600" },
};
