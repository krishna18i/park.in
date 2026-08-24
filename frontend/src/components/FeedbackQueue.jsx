/**
 * Operator view of everything drivers reported.
 *
 * Sorted newest-first by the API, filterable by lot, state and priority, and
 * every card can be marked reviewed or resolved with a note the driver sees on
 * their own report. A high-priority row (safety, damage, money, or a 1-2 star
 * visit) is called out at the top so it does not get lost in a good week.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Car,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  Star,
  TriangleAlert,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import { ASPECTS, PRIORITY_STYLES, STATUS_TONES, tagIcon } from "../lib/feedback";
import { when } from "../lib/format";
import StarRating from "./StarRating";
import { Badge, Button, Card, Input } from "./ui";

const STATUSES = ["", "new", "reviewed", "resolved"];
const PRIORITIES = ["", "high", "medium", "low"];

function Chips({ ids, tone, t }) {
  if (!ids.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const Icon = tagIcon(id);
        const translated = t(`fb.tag.${id}`);
        return (
          <span
            key={id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
          >
            <Icon className="h-3 w-3" />
            {translated === `fb.tag.${id}` ? id : translated}
          </span>
        );
      })}
    </div>
  );
}

function ReportCard({ item, onTriaged }) {
  const { t } = useI18n();
  const toast = useToast();
  const { feedback: report } = item;
  const [note, setNote] = useState(report.operator_note || "");
  const [busy, setBusy] = useState(false);

  const priority = PRIORITY_STYLES[report.priority] ?? PRIORITY_STYLES.low;
  const PriorityIcon = priority.icon;

  const triage = async (status) => {
    setBusy(true);
    try {
      await api.triageFeedback(report.id, { status, operator_note: note });
      toast.success(t("fb.admin.saved"));
      await onTriaged();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const scored = ASPECTS.filter(({ id }) => report[id] > 0);

  return (
    <Card
      className={`p-4 ${report.priority === "high" && report.status !== "resolved" ? "border-red-200" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StarRating value={report.rating} size="sm" label={t("fb.overall")} />
            <Badge className={priority.className}>
              <PriorityIcon className="h-3 w-3" />
              {t(`fb.sent.priority.${report.priority}`)}
            </Badge>
            <Badge className={STATUS_TONES[report.status]}>{t(`fb.status.${report.status}`)}</Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span className="font-semibold text-ink-900">{item.location_name}</span>
            <span className="inline-flex items-center gap-1">
              <Car className="h-3 w-3" />
              {t("fb.bay", { bay: item.slot_code })} · {item.vehicle_number}
            </span>
            <span>{when(report.created_at)}</span>
            <span className="font-mono">{report.reference_code}</span>
          </p>
        </div>
      </div>

      {report.comment && (
        <p className="mt-2.5 rounded-xl bg-sand-50 px-3 py-2 text-sm leading-snug text-ink-700">
          {report.comment}
        </p>
      )}

      <Chips ids={report.issues} tone="bg-amber-50 text-amber-800" t={t} />
      <Chips ids={report.highlights} tone="bg-teal-50 text-teal-700" t={t} />

      {scored.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-500">
          {scored.map(({ id }) => (
            <span key={id} className="inline-flex items-center gap-1">
              {t(`fb.aspect.${id}`)}
              <span className="inline-flex items-center gap-0.5 font-semibold text-ink-700">
                {report[id]}
                <Star className="h-3 w-3 fill-brand-500 text-brand-500" />
              </span>
            </span>
          ))}
        </p>
      )}

      {/* A callback request is the part that actually needs a human. */}
      {report.contact_me && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("fb.admin.wantsCall")}
          </span>
          {item.holder_phone && (
            <a href={`tel:${item.holder_phone}`} className="inline-flex items-center gap-1 underline">
              <Phone className="h-3.5 w-3.5" />
              {item.holder_phone}
            </a>
          )}
          <a href={`mailto:${item.holder_email}`} className="inline-flex items-center gap-1 underline">
            <Mail className="h-3.5 w-3.5" />
            {item.holder_name}
          </a>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={400}
          placeholder={t("fb.admin.notePlaceholder")}
          className="h-9 min-w-[12rem] flex-1 text-xs"
        />
        {report.status !== "reviewed" && (
          <Button size="sm" variant="outline" busy={busy} onClick={() => triage("reviewed")}>
            {t("fb.admin.markReviewed")}
          </Button>
        )}
        {report.status !== "resolved" && (
          <Button size="sm" busy={busy} onClick={() => triage("resolved")}>
            {t("fb.admin.markResolved")}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function FeedbackQueue({ locations = [] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ location_id: "", status: "", priority: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.adminFeedback(filters));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const select = (key) => (event) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));

  const selectClass =
    "h-9 rounded-xl border-2 border-sand-200 bg-white px-2.5 text-xs font-medium outline-none focus:border-brand-400";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">{t("fb.admin.title")}</h2>
          {data && (
            <p className="mt-0.5 text-xs text-ink-500">
              {t("fb.admin.summary", { n: data.total, avg: data.average.toFixed(1) })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClass} value={filters.location_id} onChange={select("location_id")}>
            <option value="">{t("fb.admin.allLots")}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={filters.status} onChange={select("status")}>
            {STATUSES.map((value) => (
              <option key={value || "any"} value={value}>
                {value ? t(`fb.status.${value}`) : t("fb.admin.anyStatus")}
              </option>
            ))}
          </select>
          <select className={selectClass} value={filters.priority} onChange={select("priority")}>
            {PRIORITIES.map((value) => (
              <option key={value || "any"} value={value}>
                {value ? t(`fb.sent.priority.${value}`) : t("fb.admin.anyPriority")}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            aria-label={t("fb.admin.refresh")}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-sand-100"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {data && data.open_high_priority > 0 && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2.5 text-xs font-semibold text-red-700">
          <TriangleAlert className="h-4 w-4" />
          {t("fb.admin.openHigh", { n: data.open_high_priority })}
        </div>
      )}

      <div className="max-h-[36rem] space-y-3 overflow-y-auto p-4">
        {data?.items.length ? (
          data.items.map((item) => (
            <ReportCard key={item.feedback.id} item={item} onTriaged={load} />
          ))
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-center text-sm text-ink-500">
            <MessageSquare className="h-4 w-4" />
            {t("fb.admin.empty")}
          </p>
        )}
      </div>
    </Card>
  );
}
