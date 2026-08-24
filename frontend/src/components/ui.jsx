/** Small presentational primitives shared across screens. */
import { useEffect } from "react";
import { Loader2, X } from "lucide-react";

const VARIANTS = {
  primary:
    "bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 hover:-translate-y-0.5",
  secondary: "bg-teal-500 text-white shadow-lg shadow-teal-500/20 hover:bg-teal-600 hover:-translate-y-0.5",
  outline: "border-2 border-brand-500 text-brand-600 hover:bg-brand-50",
  ghost: "text-ink-700 hover:bg-sand-100",
  danger: "border border-red-200 text-red-600 hover:bg-red-50",
};

const SIZES = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className = "",
  children,
  disabled,
  ...props
}) {
  return (
    <button
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Centred dialog over a dimmed page. Escape and a backdrop click close it, and
 * the page behind stops scrolling while it is open.
 */
export function Modal({ open, onClose, title, description, children, closeLabel = "Close" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-900/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-slide-in w-full max-w-md rounded-2xl border border-sand-200 bg-white p-6 shadow-2xl shadow-ink-900/20"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-xl font-bold text-ink-900">{title}</h2>
            )}
            {description && <p className="mt-1 text-sm text-ink-700">{description}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="shrink-0 rounded-lg p-1.5 text-ink-500 transition hover:bg-sand-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-sand-200 bg-white shadow-sm shadow-ink-900/5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`h-11 w-full rounded-xl border-2 border-sand-200 bg-white px-4 text-sm outline-none transition-colors placeholder:text-ink-500/60 focus:border-brand-400 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`min-h-[5.5rem] w-full rounded-xl border-2 border-sand-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-500/60 focus:border-brand-400 ${className}`}
      {...props}
    />
  );
}

export function Badge({ className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

export function Stat({ icon: Icon, label, value, tone = "brand", sub }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    teal: "bg-teal-50 text-teal-600",
    sand: "bg-sand-100 text-ink-700",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-500">
            {label}
          </p>
          <p className="mt-1.5 font-display text-2xl font-bold text-ink-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-ink-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm font-medium">{label}...</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sand-100 text-ink-500">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="font-display text-lg font-bold text-ink-900">{title}</h3>
      {children && <p className="max-w-sm text-sm text-ink-500">{children}</p>}
      {action}
    </div>
  );
}

/** Image that degrades to a branded gradient if the remote asset fails. */
export function Photo({ src, alt, className = "" }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-brand-300 to-teal-500 ${className}`}>
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}
