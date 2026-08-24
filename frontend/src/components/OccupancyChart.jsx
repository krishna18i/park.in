import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";
import { useI18n } from "../context/I18nContext";

const BAND_FILL = {
  quiet: "#4fb0a4",
  busy: "#fb7333",
  peak: "#c44100",
};

function occupancyOf(row) {
  return Number(row.occupancy_pct ?? row.occupancy_pct ?? 0);
}

function bandOf(row) {
  return row.band || row.band || "busy";
}

export default function OccupancyChart({ forecast, hint, model, livePct }) {
  const { t } = useI18n();
  const data = (forecast || []).map((row) => {
    const band = bandOf(row);
    return {
      ...row,
      occupancy: occupancyOf(row),
      band,
      fill: BAND_FILL[band] || BAND_FILL.busy,
    };
  });

  if (!data.length) {
    return <p className="text-sm text-ink-500">{t("lot.pred.loading")}</p>;
  }

  const now = data[0];
  const upcoming = data.slice(0, 5);
  const quietest = data.reduce((best, row) => (row.occupancy < best.occupancy ? row : best));
  const busiest = data.reduce((best, row) => (row.occupancy > best.occupancy ? row : best));

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">
            <Sparkles className="h-3.5 w-3.5" />
            {t("lot.pred.badge")}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-ink-900">{t("lot.busy")}</h2>
        </div>
        {model ? (
          <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            {t("lot.pred.model", { model })}
          </span>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <PredStat
          label={t("lot.pred.now")}
          value={`${Math.round(livePct ?? now.occupancy)}%`}
          hint={t(`lot.pred.band.${now.band}`)}
        />
        <PredStat
          label={t("lot.pred.quiet")}
          value={quietest.label}
          hint={`${Math.round(quietest.occupancy)}%`}
        />
        <PredStat
          label={t("lot.pred.peak")}
          value={busiest.label}
          hint={`${Math.round(busiest.occupancy)}%`}
        />
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {upcoming.map((row) => (
          <div
            key={row.hour}
            className="min-w-[4.25rem] rounded-xl border border-sand-200 bg-sand-50 px-2 py-2 text-center"
          >
            <p className="text-[10px] font-semibold text-ink-500">{row.label}</p>
            <p className="font-display text-sm font-bold text-ink-900">{Math.round(row.occupancy)}%</p>
            <p className="text-[10px] font-semibold" style={{ color: BAND_FILL[row.band] }}>
              {t(`lot.pred.band.${row.band}`)}
            </p>
          </div>
        ))}
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(value) => [`${value}%`, t("lot.pred.occupancy")]}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
            <Bar dataKey="occupancy" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.hour} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hint ? <p className="mt-2 text-xs font-medium text-ink-700">{hint}</p> : null}
      <p className="mt-1 text-[11px] text-ink-500">{t("lot.pred.disclaimer")}</p>
    </div>
  );
}

function PredStat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-sand-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink-900">{value}</p>
      {hint ? <p className="text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}
