import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Car,
  ChevronDown,
  CircleHelp,
  Clock,
  CreditCard,
  Headphones,
  Mail,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  QrCode,
  ScanLine,
  Search,
  Shield,
  Ticket,
  UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import { useSpeechInput } from "../hooks/useSpeechInput";
import { Button, Card, Field, Input } from "../components/ui";

const CARE = {
  phoneDisplay: "1800 202 7275",
  phoneTel: "18002027275",
  whatsapp: "911414007275",
  email: "care@parkin.app",
};

const ISSUE_KEY = "parkin.support.issues";

const TOPICS = [
  { id: "all", icon: CircleHelp },
  { id: "booking", icon: Car },
  { id: "payment", icon: CreditCard },
  { id: "ticket", icon: QrCode },
  { id: "valet", icon: Ticket },
  { id: "ops", icon: ScanLine },
];

const ISSUE_CATEGORIES = ["payment", "booking", "gate", "valet", "lot", "ops", "other"];

// Structure only -- the question and answer text lives in the locale files as
// faq.<id>.q / faq.<id>.a, so a new language picks these up automatically and
// falls back to English for anything still untranslated.
const FAQS = [
  { id: "book", topic: "booking", roles: ["driver"] },
  { id: "pay", topic: "payment", roles: ["driver"] },
  { id: "qr", topic: "ticket", roles: ["driver"] },
  { id: "cancel", topic: "booking", roles: ["driver"] },
  { id: "valet-d", topic: "valet", roles: ["driver"] },
  { id: "plate", topic: "booking", roles: ["driver"] },
  { id: "lost", topic: "ticket", roles: ["driver"] },
  { id: "scan", topic: "ops", roles: ["operator"] },
  { id: "layout", topic: "ops", roles: ["operator"] },
  { id: "valet-o", topic: "valet", roles: ["operator"] },
  { id: "gate-issue", topic: "ops", roles: ["operator"] },
  { id: "occ", topic: "ops", roles: ["operator"] },
];

function loadIssues() {
  try {
    const raw = JSON.parse(localStorage.getItem(ISSUE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveIssue(issue) {
  const next = [issue, ...loadIssues()].slice(0, 20);
  localStorage.setItem(ISSUE_KEY, JSON.stringify(next));
  return next;
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div className="border-b border-sand-200 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-1 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-ink-900">{item.q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <p className="pb-4 pr-8 text-sm leading-relaxed text-ink-700">{item.a}</p>}
    </div>
  );
}

export default function Help() {
  const { t, lang, meta } = useI18n();
  const { isAdmin, user } = useAuth();
  const { success, error } = useToast();

  const audience = isAdmin ? "operator" : "driver";
  const [topic, setTopic] = useState("all");
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  const [category, setCategory] = useState("booking");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [interim, setInterim] = useState("");
  const [issues, setIssues] = useState(loadIssues);

  const { supported: speechOk, listening, toggle: toggleMic, stop: stopMic } = useSpeechInput({
    lang,
    onTranscript: ({ finalChunk, interim: live }) => {
      if (finalChunk) {
        setMessage((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${finalChunk.trim()} `);
      }
      setInterim(live);
    },
  });

  function flushSpeech() {
    stopMic();
    setInterim((live) => {
      const extra = live.trim();
      if (extra) {
        setMessage((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${extra} `);
      }
      return "";
    });
  }

  useEffect(() => {
    setTopic("all");
    setOpenFaq(null);
    setCategory(audience === "operator" ? "ops" : "booking");
  }, [audience]);

  const faqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.map((item) => ({
      ...item,
      q: t(`faq.${item.id}.q`),
      a: t(`faq.${item.id}.a`),
    })).filter((item) => {
      if (!item.roles.includes(audience)) return false;
      if (topic !== "all" && item.topic !== topic) return false;
      if (!q) return true;
      return item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
    });
  }, [audience, query, t, topic]);

  const visibleTopics =
    audience === "operator"
      ? TOPICS.filter((x) => x.id !== "booking" && x.id !== "payment")
      : TOPICS.filter((x) => x.id !== "ops");

  const issueCategories =
    audience === "operator"
      ? ISSUE_CATEGORIES.filter((id) => id !== "booking" && id !== "payment")
      : ISSUE_CATEGORIES.filter((id) => id !== "ops");

  function submitIssue(event) {
    event.preventDefault();
    const body = `${message}${interim}`.trim();
    if (body.length < 8) {
      error(t("help.issue.short"));
      return;
    }
    flushSpeech();
    const ticket = {
      id: `HLP-${Date.now().toString(36).toUpperCase()}`,
      at: new Date().toISOString(),
      audience,
      category,
      code: code.trim().toUpperCase(),
      message: body,
      email: user?.email || null,
    };
    setIssues(saveIssue(ticket));
    setMessage("");
    setCode("");
    success(t("help.issue.sent", { id: ticket.id }));
  }

  const waHref = `https://wa.me/${CARE.whatsapp}?text=${encodeURIComponent(
    audience === "operator" ? "Park.in operator help" : "Park.in driver help",
  )}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <Headphones className="h-3.5 w-3.5" />
          {t("help.badge")}
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900">{t("help.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          {audience === "operator" ? t("help.lead.operator") : t("help.lead.driver")}
        </p>
        <p
          className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            audience === "operator"
              ? "border-teal-200 bg-teal-50 text-teal-700"
              : "border-brand-200 bg-brand-50 text-brand-700"
          }`}
        >
          {audience === "operator" ? (
            <Shield className="h-3.5 w-3.5" />
          ) : (
            <UserRound className="h-3.5 w-3.5" />
          )}
          {audience === "operator" ? t("help.role.operator") : t("help.role.driver")}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">{t("help.need")}</h2>
        <p className="mt-1 text-sm text-ink-500">
          {audience === "operator" ? t("help.needHint.operator") : t("help.needHint.driver")}
        </p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("help.search")}
            className="pl-10"
            aria-label={t("help.search")}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleTopics.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTopic(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                topic === id ? "bg-ink-900 text-white" : "bg-sand-100 text-ink-700 hover:bg-sand-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`help.topic.${id}`)}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {faqs.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">{t("help.faq.empty")}</p>
          ) : (
            faqs.map((item) => (
              <FaqItem
                key={item.id}
                item={item}
                open={openFaq === item.id}
                onToggle={() => setOpenFaq((cur) => (cur === item.id ? null : item.id))}
              />
            ))
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-brand-500 to-teal-600 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{t("help.care.kicker")}</p>
          <h2 className="mt-1 font-display text-2xl font-bold">{t("help.care.title")}</h2>
          <p className="mt-1 text-sm text-white/85">{t("help.care.hours")}</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <a
            href={`tel:${CARE.phoneTel}`}
            className="flex flex-col gap-1 rounded-xl border border-sand-200 p-3 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <Phone className="h-4 w-4 text-brand-600" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("help.care.call")}</span>
            <span className="font-display text-lg font-bold text-ink-900">{CARE.phoneDisplay}</span>
          </a>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col gap-1 rounded-xl border border-sand-200 p-3 transition hover:border-teal-300 hover:bg-teal-50"
          >
            <MessageCircle className="h-4 w-4 text-teal-600" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("help.care.whatsapp")}</span>
            <span className="font-display text-lg font-bold text-ink-900">+91 141 400 7275</span>
          </a>
          <a
            href={`mailto:${CARE.email}`}
            className="flex flex-col gap-1 rounded-xl border border-sand-200 p-3 transition hover:border-sand-300 hover:bg-sand-50"
          >
            <Mail className="h-4 w-4 text-ink-700" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("help.care.email")}</span>
            <span className="break-all text-sm font-semibold text-ink-900">{CARE.email}</span>
          </a>
        </div>
        <p className="flex items-start gap-2 border-t border-sand-200 px-5 py-3 text-xs text-ink-500">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("help.care.emergency")}
        </p>
      </Card>

      <Card className="p-5" id="report">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sand-100 text-brand-600">
            <AlertCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">{t("help.issue.title")}</h2>
            <p className="mt-1 text-sm text-ink-500">{t("help.issue.lead")}</p>
          </div>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submitIssue}>
          <Field label={t("help.issue.category")} htmlFor="issue-cat">
            <select
              id="issue-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-11 w-full rounded-xl border-2 border-sand-200 bg-white px-4 text-sm outline-none focus:border-brand-400"
            >
              {issueCategories.map((id) => (
                <option key={id} value={id}>
                  {t(`help.issue.cat.${id}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("help.issue.code")} hint={t("help.issue.codeHint")} htmlFor="issue-code">
            <Input
              id="issue-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="PKN-XXXXXX"
              autoComplete="off"
            />
          </Field>

          <Field label={t("help.issue.message")} htmlFor="issue-msg">
            <div className="relative">
              <textarea
                id="issue-msg"
                value={listening ? `${message}${interim}` : message}
                onChange={(e) => {
                  if (!listening) setMessage(e.target.value);
                }}
                rows={5}
                placeholder={t("help.issue.placeholder")}
                className="w-full resize-y rounded-xl border-2 border-sand-200 bg-white px-4 py-3 pr-14 text-sm outline-none placeholder:text-ink-500/60 focus:border-brand-400"
              />
              <button
                type="button"
                onClick={() => {
                  if (!speechOk) {
                    error(t("help.issue.noMic"));
                    return;
                  }
                  if (listening) flushSpeech();
                  else toggleMic();
                }}
                className={`absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full transition ${
                  listening ? "bg-red-500 text-white shadow-md" : "bg-sand-100 text-ink-700 hover:bg-sand-200"
                }`}
                aria-pressed={listening}
                aria-label={listening ? t("help.issue.stopSpeak") : t("help.issue.speak")}
                title={listening ? t("help.issue.stopSpeak") : t("help.issue.speak")}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-500">
              {listening ? t("help.issue.listening") : speechOk ? t("help.issue.speakHint") : t("help.issue.noMic")}
            </p>
          </Field>

          <Button type="submit">{t("help.issue.submit")}</Button>
        </form>

        {issues.length > 0 && (
          <div className="mt-6 border-t border-sand-200 pt-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              <BookOpen className="h-3.5 w-3.5" />
              {t("help.issue.recent")}
            </p>
            <ul className="mt-3 space-y-2">
              {issues.slice(0, 5).map((item) => (
                <li key={item.id} className="rounded-xl bg-sand-50 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-brand-700">{item.id}</span>
                    <span className="text-[11px] text-ink-500">
                      {new Date(item.at).toLocaleString(meta.locale)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-ink-700">{item.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
