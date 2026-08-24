/**
 * What drivers make of a lot, condensed: the headline average, the star
 * spread, the aspects they scored, the tags that keep coming up, and a few
 * recent comments.
 *
 * Anonymous by design -- the API never sends a name with a published comment.
 */
import { MessageSquare, Star, ThumbsUp, TrendingDown, TrendingUp } from "lucide-react";
import { useI18n } from "../context/I18nContext";
import { ASPECTS, tagIcon } from "../lib/feedback";
import { when } from "../lib/format";
import StarRating from "./StarRating";

function Bar({ label, value, total, tone = "bg-brand-500" }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 shrink-0 text-right text-[11px] font-semibold text-ink-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-[11px] text-ink-500">{value}</span>
    </div>
  );
}

function TagRow({ tags, tone, icon: FallbackIcon, t }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const Icon = tagIcon(tag.id) ?? FallbackIcon;
        const translated = t(`fb.tag.${tag.id}`);
        return (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}
          >
            <Icon className="h-3 w-3" />
            {translated === `fb.tag.${tag.id}` ? tag.label : translated}
            <span className="opacity-70">{tag.count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function RatingSummary({ summary, compact = false }) {
  const { t } = useI18n();

  if (!summary || summary.count === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-sand-50 px-4 py-3">
        <Star className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
        <p className="text-xs text-ink-500">{t("fb.summary.none")}</p>
      </div>
    );
  }

  const { average, count, distribution, aspect_averages: aspects, recommend_pct: recommend } = summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-4xl font-bold text-ink-900">{average.toFixed(1)}</p>
          <div className="mt-1 flex items-center gap-2">
            <StarRating value={Math.round(average)} size="sm" label={t("fb.summary.title")} />
            <span className="text-xs text-ink-500">{t("fb.summary.count", { n: count })}</span>
          </div>
        </div>
        {recommend !== null && recommend !== undefined && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">
            <ThumbsUp className="h-3.5 w-3.5" />
            {t("fb.summary.recommend", { pct: Math.round(recommend) })}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {[5, 4, 3, 2, 1].map((star) => (
          <Bar
            key={star}
            label={star}
            value={distribution[String(star)] ?? 0}
            total={count}
            tone={star >= 4 ? "bg-teal-500" : star === 3 ? "bg-amber-400" : "bg-red-400"}
          />
        ))}
      </div>

      {!compact && Object.keys(aspects || {}).length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {ASPECTS.filter(({ id }) => aspects[id]).map(({ id, icon: Icon }) => (
            <div
              key={id}
              className="flex items-center justify-between rounded-xl bg-sand-50 px-3 py-2"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-700">
                <Icon className="h-3.5 w-3.5 text-ink-500" />
                {t(`fb.aspect.${id}`)}
              </span>
              <span className="text-xs font-bold text-ink-900">{aspects[id].toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      {summary.top_highlights.length > 0 && (
        <div>
          <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
            {t("fb.summary.topHighlights")}
          </p>
          <TagRow tags={summary.top_highlights} tone="bg-teal-50 text-teal-700" t={t} />
        </div>
      )}

      {summary.top_issues.length > 0 && (
        <div>
          <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
            {t("fb.summary.topIssues")}
          </p>
          <TagRow tags={summary.top_issues} tone="bg-amber-50 text-amber-800" t={t} />
        </div>
      )}

      {!compact && summary.recent.length > 0 && (
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <MessageSquare className="h-3.5 w-3.5 text-ink-500" />
            {t("fb.summary.recent")}
          </p>
          {summary.recent.slice(0, 3).map((entry, index) => (
            <div
              key={`${entry.created_at}-${index}`}
              className="rounded-xl border border-sand-200 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <StarRating value={entry.rating} size="sm" label={t("fb.summary.title")} />
                <span className="text-[11px] text-ink-500">{when(entry.created_at)}</span>
              </div>
              <p className="mt-1 text-sm leading-snug text-ink-700">{entry.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
