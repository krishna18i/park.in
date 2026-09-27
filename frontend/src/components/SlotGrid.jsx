import { Car, Truck, Zap } from "lucide-react";
import { bayKind } from "../lib/layout";

// Every bay is clickable -- a taken one opens its details so the driver can
// reach the operator about it, so nothing here is styled as dead.
const STYLES = {
  vacant:
    "border-teal-400 bg-white text-teal-700 hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md",
  occupied: "border-red-200 bg-red-50 text-red-300 hover:border-red-300",
  reserved: "border-sand-300 bg-sand-200 text-ink-500 hatched hover:border-sand-400",
};

const SELECTED =
  "border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/30 scale-105 ring-4 ring-brand-200";

const DIMMED = "border-sand-200 bg-sand-50 text-ink-500/40 opacity-50 hover:opacity-75";

export const LEGEND = [
  { label: "Available", className: "border-teal-400 bg-white" },
  { label: "Taken", className: "border-red-200 bg-red-50" },
  { label: "Held", className: "border-sand-300 bg-sand-200 hatched" },
  { label: "Your pick", className: "border-brand-500 bg-brand-500" },
];

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {LEGEND.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2 text-xs font-medium text-ink-700">
          <span className={`h-3.5 w-3.5 rounded border-2 ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function KindIcon({ kind, className = "h-3.5 w-3.5" }) {
  if (kind === "ev") return <Zap className={className} />;
  if (kind === "heavy") return <Truck className={className} />;
  return <Car className={className} />;
}

export default function SlotGrid({
  slots,
  rows,
  selectedId,
  onSelect,
  flashing,
  vehicleKind = "standard",
}) {
  // `onSelect` receives every bay, free or not. The lot page opens the bay
  // sheet and only books the ones that are actually bookable.
  const byRow = Array.from({ length: rows }, (_, row) =>
    slots.filter((slot) => slot.row === row).sort((a, b) => a.col - b.col),
  );
  const laneAfter = Math.ceil(rows / 2) - 1;

  return (
    <div className="space-y-3">
      {byRow.map((rowSlots, rowIndex) => (
        <div key={rowIndex}>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="w-4 shrink-0 text-center font-display text-xs font-bold text-ink-500">
              {String.fromCharCode(65 + rowIndex)}
            </span>
            <div className="flex flex-1 justify-center gap-1.5 sm:gap-2.5">
              {rowSlots.map((slot) => {
                const isSelected = slot.id === selectedId;
                const isVacant = slot.status === "vacant";
                const kind = bayKind(slot.kind);
                const kindOk = kind === vehicleKind;
                const selectable = isVacant && kindOk;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => onSelect(slot)}
                    aria-label={`Bay ${slot.code}, ${slot.status}, ${kind}. Open bay details`}
                    aria-pressed={isSelected}
                    className={`flex aspect-[3/4] w-full max-w-[3.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-[11px] font-bold transition-all duration-200 ${
                      isSelected ? SELECTED : selectable ? STYLES[slot.status] : DIMMED
                    } ${flashing?.has(slot.id) ? "animate-pulse-ring" : ""}`}
                  >
                    <KindIcon kind={kind} />
                    <span>{slot.code}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {rowIndex === laneAfter && rowIndex < rows - 1 && (
            <div className="my-3 flex items-center gap-3 pl-6" aria-hidden="true">
              <div className="h-px flex-1 border-t-2 border-dashed border-sand-300" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-500/70">
                Drive lane
              </span>
              <div className="h-px flex-1 border-t-2 border-dashed border-sand-300" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
