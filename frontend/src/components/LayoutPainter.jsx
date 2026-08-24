import { Car, Truck, Zap } from "lucide-react";
import { bayKind, fillByCounts, tally } from "../lib/layout";
import { Field, Input } from "./ui";

const BRUSHES = [
  { id: "standard", label: "Car", icon: Car, tone: "border-sand-300 bg-white text-ink-700" },
  { id: "ev", label: "EV", icon: Zap, tone: "border-teal-400 bg-teal-50 text-teal-700" },
  { id: "heavy", label: "Truck", icon: Truck, tone: "border-amber-400 bg-amber-50 text-amber-800" },
];

const CELL_TONE = {
  standard: "border-sand-300 bg-white text-ink-700",
  ev: "border-teal-400 bg-teal-50 text-teal-700",
  heavy: "border-amber-400 bg-amber-50 text-amber-800",
};

function KindIcon({ kind, className = "h-3.5 w-3.5" }) {
  if (kind === "ev") return <Zap className={className} />;
  if (kind === "heavy") return <Truck className={className} />;
  return <Car className={className} />;
}

export default function LayoutPainter({ rows, cols, layout, onChange, brush, onBrush }) {
  const counts = tally(layout);
  const total = rows * cols;
  const byRow = Array.from({ length: rows }, (_, row) =>
    layout.filter((cell) => cell.row === row).sort((a, b) => a.col - b.col),
  );

  const setCount = (kind, raw) => {
    const next = Math.max(0, Math.min(total, Number(raw) || 0));
    onChange(fillByCounts(rows, cols, { ...counts, [kind]: next }));
  };

  const paint = (target) => {
    onChange(
      layout.map((cell) =>
        cell.row === target.row && cell.col === target.col ? { ...cell, kind: brush } : cell,
      ),
    );
  };

  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="text-sm font-semibold text-ink-700">Bay types</p>
      <p className="text-xs text-ink-500">
        Set how many EV, car and truck bays, then click the grid to place them. Truck count fills
        lanes from the back of the lot; EV fills from the left. Valet is a lot-wide service, not a
        bay type.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="EV bays" htmlFor="layout-ev">
          <Input
            id="layout-ev"
            type="number"
            min="0"
            max={total}
            value={counts.ev}
            onChange={(e) => setCount("ev", e.target.value)}
          />
        </Field>
        <Field label="Car bays" htmlFor="layout-car" hint="Filled automatically">
          <Input id="layout-car" type="number" readOnly value={counts.standard} className="bg-sand-50" />
        </Field>
        <Field label="Truck bays" htmlFor="layout-truck">
          <Input
            id="layout-truck"
            type="number"
            min="0"
            max={total}
            value={counts.heavy}
            onChange={(e) => setCount("heavy", e.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Paint</span>
        {BRUSHES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onBrush(id)}
            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition ${
              brush === id ? "border-ink-900 bg-ink-900 text-white" : "border-sand-200 text-ink-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-sand-200 bg-sand-50 p-3">
        {byRow.map((rowSlots, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-center font-display text-xs font-bold text-ink-500">
              {String.fromCharCode(65 + rowIndex)}
            </span>
            <div className="flex flex-1 justify-center gap-1.5">
              {rowSlots.map((cell) => {
                const kind = bayKind(cell.kind);
                return (
                  <button
                    key={`${cell.row}-${cell.col}`}
                    type="button"
                    onClick={() => paint(cell)}
                    aria-label={`Bay ${cell.code}, ${kind}`}
                    className={`flex aspect-[3/4] w-full max-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-[10px] font-bold ${CELL_TONE[kind]}`}
                  >
                    <KindIcon kind={kind} />
                    <span>{cell.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
