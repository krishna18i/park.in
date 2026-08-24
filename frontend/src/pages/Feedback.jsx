/**
 * The post-visit feedback screen.
 *
 * Reached from the popup that fires on check-out (or from a booking in the
 * dashboard). Only the star rating is required -- everything below it is
 * optional detail that makes a report actionable: aspect scores, the tag chips
 * that say *what* went wrong or right, free text (typed or spoken), and a
 * call-me-back request that routes a serious problem to the care desk.
 *
 * A report can be edited for a day; after that it is a record and the screen
 * turns into a read-only receipt.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Headphones,
  LayoutDashboard,
  Lock,
  MapPin,
  MessageSquareHeart,
  Mic,
  MicOff,
  PencilLine,
  Phone,
  Send,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Ticket as TicketIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import { useSpeechInput } from "../hooks/useSpeechInput";
import StarRating from "../components/StarRating";
import { Badge, Button, Card, Field, Input, Spinner, Textarea } from "../components/ui";
import { duration, money, when } from "../lib/format";
import {
  ASPECTS,
  PRIORITY_STYLES,
  RATING_TONES,
  clearDraft,
  completeness,
  isNegative,
  readDraft,
  tagIcon,
  tagLabel,
  writeDraft,
} from "../lib/feedback";

const COMMENT_MAX = 1000;

const BLANK = {
  rating: 0,
  cleanliness: 0,
  safety: 0,
  staff: 0,
  value: 0,
  issues: [],
  highlights: [],
  comment: "",
  would_recommend: null,
  contact_me: false,
  contact_phone: "",
};

function formFrom(existing) {
  if (!existing) return BLANK;
  return {
    rating: existing.rating ?? 0,
    cleanliness: existing.cleanliness ?? 0,
    safety: existing.safety ?? 0,
    staff: existing.staff ?? 0,
    value: existing.value ?? 0,
    issues: existing.issues ?? [],
    highlights: existing.highlights ?? [],
    comment: existing.comment ?? "",
    would_recommend: existing.would_recommend ?? null,
    contact_me: Boolean(existing.contact_me),
    contact_phone: existing.contact_phone ?? "",
  };
}

/** One selectable chip. Severe problems read red even before submitting. */
function TagChip({ tag, selected, severe, onToggle, t }) {
  const Icon = tagIcon(tag.id);
  const tone = selected
    ? severe
      ? "border-red-400 bg-red-50 text-red-700"
      : "border-brand-500 bg-brand-50 text-brand-700"
    : "border-sand-200 text-ink-700 hover:border-brand-300 hover:bg-sand-50";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(tag.id)}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {tagLabel(t, tag)}
    </button>
  );
}

function TagSection({ title, hint, tags, selected, severeIds, onToggle, t }) {
  if (!tags.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            t={t}
            selected={selected.includes(tag.id)}
            severe={severeIds.has(tag.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

/** The read-only receipt shown once the edit window has closed. */
function LockedReport({ report, t }) {
  const priority = PRIORITY_STYLES[report.priority] ?? PRIORITY_STYLES.low;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">{t("fb.yourReport")}</h2>
          <p className="mt-0.5 text-xs text-ink-500">{when(report.created_at)}</p>
        </div>
        <Badge className={priority.className}>{t(`fb.status.${report.status}`)}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <StarRating value={report.rating} size="md" label={t("fb.overall")} />
        <span className={`text-sm font-semibold ${RATING_TONES[report.rating]}`}>
          {t(`fb.score.${report.rating}`)}
        </span>
      </div>

      {report.comment && (
        <p className="mt-3 rounded-xl bg-sand-50 px-4 py-3 text-sm text-ink-700">{report.comment}</p>
      )}

      {[...report.issues, ...report.highlights].length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...report.issues, ...report.highlights].map((id) => (
            <Badge key={id} className="bg-sand-100 text-ink-700">
              {t(`fb.tag.${id}`) === `fb.tag.${id}` ? id : t(`fb.tag.${id}`)}
            </Badge>
          ))}
        </div>
      )}

      {report.operator_note && (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            {t("fb.operatorNote")}
          </p>
          <p className="mt-1 text-sm text-ink-700">{report.operator_note}</p>
        </div>
      )}

      <p className="mt-4 flex items-center gap-2 text-xs text-ink-500">
        <Lock className="h-3.5 w-3.5" />
        {t("fb.lockedBody", { code: report.reference_code })}
      </p>
    </Card>
  );
}

/** What the driver sees after sending -- reference code and what happens next. */
function SentScreen({ report, booking, onEdit, t }) {
  const navigate = useNavigate();
  const priority = PRIORITY_STYLES[report.priority] ?? PRIORITY_STYLES.low;
  const PriorityIcon = priority.icon;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-6 py-12 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-600">
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <h1 className="font-display text-3xl font-bold text-ink-900">{t("fb.sent.title")}</h1>
      <p className="text-sm text-ink-700">
        {t("fb.sent.lead", { lot: booking.location_name })}
      </p>

      <Card className="p-5 text-left">
        <div className="flex items-center justify-between gap-3">
          <StarRating value={report.rating} size="md" label={t("fb.overall")} />
          <Badge className={priority.className}>
            <PriorityIcon className="h-3.5 w-3.5" />
            {t(`fb.sent.priority.${report.priority}`)}
          </Badge>
        </div>

        <p className="mt-4 text-sm text-ink-700">{t(`fb.sent.next.${report.priority}`)}</p>

        {report.contact_me && report.contact_phone && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-700">
            <Phone className="h-3.5 w-3.5 text-teal-600" />
            {t("fb.sent.callback", { phone: report.contact_phone })}
          </p>
        )}

        <div className="mt-4 rounded-xl bg-sand-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t("fb.sent.ref")}
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold tracking-widest text-ink-900">
            {report.reference_code}
          </p>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
          <Clock className="h-3.5 w-3.5" />
          {t("fb.editWindow")}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <Button onClick={() => navigate("/dashboard")}>
          <LayoutDashboard className="h-4 w-4" />
          {t("fb.sent.bookings")}
        </Button>
        <Button variant="outline" onClick={onEdit}>
          <PencilLine className="h-4 w-4" />
          {t("fb.sent.edit")}
        </Button>
        <Link
          to="/help"
          className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50"
        >
          <Headphones className="h-4 w-4" />
          {t("fb.sent.help")}
        </Link>
      </div>
    </div>
  );
}

export default function Feedback() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const routeState = useLocation().state;
  const toast = useToast();
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [booking, setBooking] = useState(null);
  const [options, setOptions] = useState(null);
  const [existing, setExisting] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);
  const [showOther, setShowOther] = useState(false);
  const [interim, setInterim] = useState("");

  const set = useCallback((patch) => setForm((current) => ({ ...current, ...patch })), []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.booking(bookingId),
      api.feedbackOptions(),
      api.myFeedback(bookingId).catch(() => null),
    ])
      .then(([nextBooking, nextOptions, nextExisting]) => {
        if (cancelled) return;
        setBooking(nextBooking);
        setOptions(nextOptions);
        setExisting(nextExisting);

        if (nextExisting) {
          setForm(formFrom(nextExisting));
          return;
        }
        // A fresh report starts from any saved draft, then takes the star the
        // driver already tapped in the popup.
        const draft = readDraft(bookingId);
        setForm({
          ...BLANK,
          ...(draft || {}),
          contact_phone: draft?.contact_phone || user?.phone || "",
          ...(routeState?.rating ? { rating: routeState.rating } : {}),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error.message);
        navigate("/dashboard", { replace: true });
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [bookingId, navigate, routeState?.rating, toast, user?.phone]);

  // Keep a local draft so a refresh mid-review costs nothing. Submitted
  // reports live on the server, so only unsent ones are worth saving.
  useEffect(() => {
    if (loading || existing || sent) return;
    writeDraft(bookingId, form);
  }, [bookingId, existing, form, loading, sent]);

  const speech = useSpeechInput({
    lang,
    onTranscript: ({ finalChunk, interim: partial }) => {
      setInterim(partial);
      if (!finalChunk) return;
      setForm((current) => ({
        ...current,
        comment: `${current.comment} ${finalChunk}`.trim().slice(0, COMMENT_MAX),
      }));
    },
  });

  const severeIds = useMemo(
    () => new Set((options?.issues ?? []).filter((tag) => tag.severe).map((tag) => tag.id)),
    [options],
  );

  const hasSevere = form.issues.some((id) => severeIds.has(id));

  const toggleTag = (field) => (id) =>
    setForm((current) => {
      const list = current[field];
      const next = list.includes(id) ? list.filter((tag) => tag !== id) : [...list, id];
      if (next.length > (options?.max_tags ?? 8)) {
        toast.error(t("fb.tooMany", { n: options?.max_tags ?? 8 }));
        return current;
      }
      // Reporting something serious opts the driver into a callback by
      // default -- they can still turn it off.
      const escalating = field === "issues" && !list.includes(id) && severeIds.has(id);
      return {
        ...current,
        [field]: next,
        ...(escalating
          ? { contact_me: true, contact_phone: current.contact_phone || user?.phone || "" }
          : {}),
      };
    });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.rating) {
      toast.error(t("fb.required"));
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, comment: form.comment.trim() };
      if (!payload.contact_me) payload.contact_phone = "";
      const saved = existing
        ? await api.updateFeedback(bookingId, payload)
        : await api.feedback(bookingId, payload);
      clearDraft(bookingId);
      setExisting(saved);
      setSent(saved);
      toast.success(existing ? t("fb.updated") : t("fb.thanks"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label={t("fb.loading")} />;
  if (!booking || !options) return null;

  // Rating a visit only makes sense once the car has left the bay.
  if (booking.status !== "completed") {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sand-100 text-ink-500">
          <TicketIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">{t("fb.notReady")}</h1>
        <p className="mt-2 text-sm text-ink-700">{t("fb.notReadyLead")}</p>
        <Button className="mt-6" onClick={() => navigate(`/ticket/${booking.id}`)}>
          {t("fb.notReadyCta")}
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <SentScreen
        report={sent}
        booking={booking}
        t={t}
        onEdit={() => {
          setSent(null);
          setForm(formFrom(sent));
        }}
      />
    );
  }

  const editable =
    !existing || !existing.editable_until || new Date(existing.editable_until) > new Date();

  if (existing && !editable) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-6 py-10">
        <BackLink t={t} />
        <LockedReport report={existing} t={t} />
      </div>
    );
  }

  const negative = isNegative(form.rating);
  const problems = options.issues;
  const goods = options.highlights;
  const percent = completeness(form);

  // Lead with whichever set matches the score; the other one stays one tap away.
  const primary = negative
    ? { title: t("fb.issues"), hint: t("fb.issuesHint"), tags: problems, field: "issues" }
    : { title: t("fb.highlights"), hint: t("fb.highlightsHint"), tags: goods, field: "highlights" };
  const secondary = negative
    ? { title: t("fb.alsoGood"), tags: goods, field: "highlights" }
    : { title: t("fb.alsoBad"), tags: problems, field: "issues" };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5 px-6 py-10">
      <BackLink t={t} />

      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <MessageSquareHeart className="h-6 w-6" />
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900">
          {existing ? t("fb.editTitle") : t("fb.title")}
        </h1>
        <p className="mt-1 text-sm text-ink-700">
          {existing ? t("fb.editLead") : t("fb.lead")}
        </p>
      </div>

      {/* What is being rated -- so a driver with several visits is never confused. */}
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-ink-900">{booking.location_name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {t("fb.bay", { bay: booking.slot_code })}
            </span>
            <span className="font-mono">{booking.vehicle_number}</span>
            <span>{when(booking.start_time)}</span>
            <span>{duration(booking.hours)}</span>
            <span>{money(booking.amount)}</span>
          </p>
        </div>
        <Link
          to={`/ticket/${booking.id}`}
          className="text-xs font-semibold text-teal-700 hover:text-teal-800"
        >
          {t("fb.viewTicket")}
        </Link>
      </Card>

      {/* Overall rating -- the only required answer. */}
      <Card className="p-5 text-center">
        <h3 className="font-display text-lg font-bold text-ink-900">{t("fb.overall")}</h3>
        <p className="mt-0.5 text-xs text-ink-500">{t("fb.overallHint")}</p>
        <div className="mt-3 flex justify-center">
          <StarRating
            value={form.rating}
            onChange={(rating) => set({ rating })}
            size="lg"
            label={t("fb.overall")}
          />
        </div>
        <p className={`mt-2 h-5 text-sm font-semibold ${RATING_TONES[form.rating] ?? "text-ink-500"}`}>
          {form.rating ? t(`fb.score.${form.rating}`) : t("fb.overallEmpty")}
        </p>
      </Card>

      {form.rating > 0 && (
        <>
          {/* Aspect scores. Optional -- tapping a lit star again clears it. */}
          <Card className="p-5">
            <h3 className="font-display text-lg font-bold text-ink-900">{t("fb.aspects")}</h3>
            <p className="mt-0.5 text-xs text-ink-500">{t("fb.aspectsHint")}</p>
            <div className="mt-3 divide-y divide-sand-200">
              {ASPECTS.map(({ id, icon: Icon }) => (
                <div key={id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-700">
                    <Icon className="h-4 w-4 text-ink-500" />
                    {t(`fb.aspect.${id}`)}
                  </span>
                  <StarRating
                    value={form[id]}
                    onChange={(value) => set({ [id]: value })}
                    size="sm"
                    clearable
                    label={t(`fb.aspect.${id}`)}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* The chips that turn a score into something an operator can fix. */}
          <Card className="space-y-4 p-5">
            <TagSection
              title={primary.title}
              hint={primary.hint}
              tags={primary.tags}
              selected={form[primary.field]}
              severeIds={severeIds}
              onToggle={toggleTag(primary.field)}
              t={t}
            />

            {hasSevere && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="text-sm font-semibold text-red-700">{t("fb.severe")}</p>
                  <p className="mt-0.5 text-xs leading-snug text-red-700/90">{t("fb.severeBody")}</p>
                </div>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowOther((open) => !open)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showOther ? "rotate-180" : ""}`}
                />
                {secondary.title}
              </button>
              {showOther && (
                <div className="mt-3">
                  <TagSection
                    title=""
                    tags={secondary.tags}
                    selected={form[secondary.field]}
                    severeIds={severeIds}
                    onToggle={toggleTag(secondary.field)}
                    t={t}
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Free text, typed or spoken. */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold text-ink-900">{t("fb.comment")}</h3>
                <p className="mt-0.5 text-xs text-ink-500">{t("fb.commentHint")}</p>
              </div>
              {speech.supported ? (
                <Button
                  type="button"
                  size="sm"
                  variant={speech.listening ? "danger" : "outline"}
                  onClick={speech.toggle}
                >
                  {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {speech.listening ? t("fb.stopSpeak") : t("fb.speak")}
                </Button>
              ) : null}
            </div>

            <Textarea
              value={form.comment}
              maxLength={COMMENT_MAX}
              onChange={(event) => set({ comment: event.target.value })}
              placeholder={t("fb.commentPlaceholder")}
              className="mt-3"
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-500">
              <span>
                {speech.listening ? t("fb.listening") : !speech.supported ? t("fb.noMic") : ""}
                {interim && <em className="ml-1 text-ink-500/80">{interim}</em>}
              </span>
              <span>{t("fb.chars", { n: form.comment.length, max: COMMENT_MAX })}</span>
            </div>
          </Card>

          {/* Recommendation + callback request. */}
          <Card className="space-y-4 p-5">
            <div>
              <h3 className="font-display text-lg font-bold text-ink-900">{t("fb.recommend")}</h3>
              <div className="mt-2.5 flex gap-2">
                {[
                  { value: true, icon: ThumbsUp, label: t("fb.yes") },
                  { value: false, icon: ThumbsDown, label: t("fb.no") },
                ].map(({ value, icon: Icon, label }) => {
                  const picked = form.would_recommend === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => set({ would_recommend: picked ? null : value })}
                      className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${
                        picked
                          ? value
                            ? "border-teal-500 bg-teal-50 text-teal-700"
                            : "border-red-400 bg-red-50 text-red-700"
                          : "border-sand-200 text-ink-700 hover:border-brand-300"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-sand-200 px-4 py-3 hover:border-brand-200">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.contact_me}
                onChange={(event) => set({ contact_me: event.target.checked })}
              />
              <span>
                <span className="block text-sm font-semibold text-ink-900">{t("fb.contact")}</span>
                <span className="text-xs text-ink-500">{t("fb.contactHint")}</span>
              </span>
            </label>

            {form.contact_me && (
              <Field label={t("fb.phone")} hint={t("fb.phoneHint")} htmlFor="contact-phone">
                <Input
                  id="contact-phone"
                  type="tel"
                  inputMode="tel"
                  value={form.contact_phone}
                  onChange={(event) => set({ contact_phone: event.target.value })}
                  placeholder="98765 43210"
                />
              </Field>
            )}
          </Card>

          {/* Gentle completeness nudge -- never a gate. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-ink-500">
              <span>{t("fb.progress", { n: percent })}</span>
              <span>{t("fb.optional")}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" size="lg" busy={saving} disabled={!form.rating} className="flex-1">
          <Send className="h-4 w-4" />
          {saving ? t("fb.sending") : existing ? t("fb.update") : t("fb.submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => navigate("/dashboard")}
        >
          {t("fb.notNow")}
        </Button>
      </div>

      {!existing && <p className="text-center text-[11px] text-ink-500">{t("fb.draftSaved")}</p>}
    </form>
  );
}

function BackLink({ t }) {
  return (
    <Link
      to="/dashboard"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:text-brand-600"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("fb.back")}
    </Link>
  );
}
