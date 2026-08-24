import { Hospital, Landmark, Sparkles, Store, UtensilsCrossed } from "lucide-react";
import { AROUND_CATEGORIES } from "../lib/around";

const ICONS = {
  hospital: Hospital,
  restaurant: UtensilsCrossed,
  amenities: Sparkles,
  market: Store,
  tourist: Landmark,
};

export default function AroundTabs({ active, counts, onSelect, t }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t("lot.around")}>
      {AROUND_CATEGORIES.map((id) => {
        const Icon = ICONS[id];
        const selected = active === id;
        const count = counts?.[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border-2 px-3.5 py-2 text-sm font-semibold transition ${
              selected
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-sand-200 bg-white text-ink-700 hover:border-brand-200"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(`lot.tab.${id}`)}
            {typeof count === "number" ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  selected ? "bg-brand-500 text-white" : "bg-sand-100 text-ink-500"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
