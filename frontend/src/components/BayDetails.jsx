/**
 * What one bay is, and whether it can be booked.
 *
 * Opens for every bay -- free, taken or held -- so a driver can see why a bay
 * they wanted is unavailable. Operator contact lives in the lot header instead,
 * where it is reachable without tapping a bay first.
 */
import { Car, CheckCircle2, Clock, Truck, Zap } from "lucide-react";
import { bayKind } from "../lib/layout";
import { money } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { Button, Modal } from "./ui";

const KIND_ICONS = { standard: Car, ev: Zap, heavy: Truck };

const STATUS_TONES = {
  vacant: "bg-teal-50 text-teal-700",
  occupied: "bg-red-50 text-red-600",
  reserved: "bg-sand-200 text-ink-700",
};

export default function BayDetails({ bay, location, vehicleKind, onClose, onChoose }) {
  const { t } = useI18n();
  if (!bay) return null;

  const kind = bayKind(bay.kind);
  const KindIcon = KIND_ICONS[kind] || Car;
  const isVacant = bay.status === "vacant";
  const kindOk = kind === vehicleKind;
  const bookable = isVacant && kindOk;

  // Why this bay cannot be booked right now -- the taken/held case first,
  // because a wrong-vehicle warning on an occupied bay would be misleading.
  const blockedReason = isVacant
    ? kindOk
      ? null
      : t("bay.blocked.kind", { kind: t(`lot.kind.${kind}`) })
    : t(`bay.blocked.${bay.status}`);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("bay.title", { code: bay.code })}
      description={location?.name}
      closeLabel={t("bay.close")}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              STATUS_TONES[bay.status] || STATUS_TONES.reserved
            }`}
          >
            {isVacant ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            {t(`bay.status.${bay.status}`)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-700">
            <KindIcon className="h-3.5 w-3.5" />
            {t(`lot.kind.${kind}`)}
          </span>
          {location ? (
            <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-700">
              {money(location.price_per_hour)} {t("home.hour")}
            </span>
          ) : null}
        </div>

        {blockedReason ? (
          <p className="rounded-xl bg-sand-50 px-3 py-2.5 text-sm text-ink-700">{blockedReason}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {bookable ? (
            <Button className="flex-1" onClick={() => onChoose(bay)}>
              {t("bay.choose", { code: bay.code })}
            </Button>
          ) : null}
          <Button variant="ghost" className={bookable ? "" : "flex-1"} onClick={onClose}>
            {t("bay.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
