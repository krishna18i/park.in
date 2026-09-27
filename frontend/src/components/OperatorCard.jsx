/**
 * Who to call about this lot.
 *
 * Lives in the top-right of the lot header, not behind a bay tap: a driver
 * looking for the desk is usually not mid-booking, and hiding it inside the
 * bay sheet meant only people who clicked a bay ever found it.
 */
import { Mail, Phone, User } from "lucide-react";
import { useI18n } from "../context/I18nContext";

/** Digits only, so `tel:` dials cleanly on a phone. */
function telHref(phone) {
  const cleaned = String(phone || "").replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : null;
}

function ContactRow({ icon: Icon, label, value, href }) {
  const body = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-brand-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[11px] font-medium text-ink-500">{label}</span>
        <span className="block truncate text-sm font-semibold text-ink-900">{value}</span>
      </span>
    </>
  );

  if (!href) {
    return <div className="flex items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2">{body}</div>;
  }
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2 transition hover:bg-brand-50"
    >
      {body}
    </a>
  );
}

export default function OperatorCard({ location, className = "" }) {
  const { t } = useI18n();
  if (!location) return null;

  const phoneHref = telHref(location.contact_phone);
  const email = location.contact_email || "";
  const hasContact = Boolean(location.contact_name || phoneHref || email);

  return (
    <div className={`rounded-2xl bg-sand-50 p-3 ${className}`}>
      <p className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        {t("bay.operator")}
      </p>
      {hasContact ? (
        <div className="space-y-1.5">
          {location.contact_name ? (
            <ContactRow icon={User} label={t("bay.desk")} value={location.contact_name} />
          ) : null}
          {phoneHref ? (
            <ContactRow
              icon={Phone}
              label={t("bay.phone")}
              value={location.contact_phone}
              href={phoneHref}
            />
          ) : null}
          {email ? (
            <ContactRow
              icon={Mail}
              label={t("bay.email")}
              value={email}
              href={`mailto:${email}?subject=${encodeURIComponent(location.name || "")}`}
            />
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border-2 border-dashed border-sand-300 px-3 py-3 text-xs text-ink-500">
          {t("bay.noContact")}
        </p>
      )}
    </div>
  );
}
