import { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { useI18n } from "../context/I18nContext";
import { Button, Modal } from "./ui";

/**
 * Navbar language tab. Shows the active language in its own script, and opens a
 * menu of every language Park.in ships.
 */
export function LanguageTab() {
  const { lang, setLang, t, languages, meta } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("lang.tab")}
        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
          open ? "bg-brand-50 text-brand-600" : "text-ink-700 hover:bg-sand-100"
        }`}
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">{meta.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-slide-in absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-sand-200 bg-white p-1.5 shadow-xl shadow-ink-900/10"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            {t("lang.tab")}
          </p>
          {languages.map((item) => (
            <button
              key={item.code}
              type="button"
              role="menuitemradio"
              aria-checked={item.code === lang}
              onClick={() => {
                setLang(item.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${
                item.code === lang
                  ? "bg-brand-50 font-bold text-brand-600"
                  : "font-semibold text-ink-700 hover:bg-sand-100"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                {item.label !== item.english && (
                  <span className="block truncate text-[11px] font-medium text-ink-500">
                    {item.english}
                  </span>
                )}
              </span>
              {item.code === lang && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Language chooser shown once, right after a driver or operator signs in, so
 * the rest of the app lands in the language they actually read.
 */
export function LanguagePrompt({ open, onClose }) {
  const { lang, setLang, tIn, languages } = useI18n();
  // Local until they confirm, so tapping through options previews each one
  // without committing a half-made choice if they dismiss the dialog.
  const [choice, setChoice] = useState(lang);

  useEffect(() => {
    if (open) setChoice(lang);
  }, [open, lang]);

  const confirm = () => {
    setLang(choice);
    onClose?.();
  };

  // Every string in the dialog follows the highlighted option, so the driver
  // can read the language back before committing to it.
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tIn(choice, "lang.title")}
      description={tIn(choice, "lang.lead")}
      closeLabel={tIn(choice, "home.close")}
    >
      <div className="grid grid-cols-2 gap-2">
        {languages.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => setChoice(item.code)}
            aria-pressed={item.code === choice}
            className={`flex flex-col items-start gap-0.5 rounded-xl border-2 px-3.5 py-3 text-left transition ${
              item.code === choice
                ? "border-brand-500 bg-brand-50"
                : "border-sand-200 hover:border-brand-300 hover:bg-sand-100"
            }`}
          >
            <span className="font-display text-base font-bold text-ink-900">{item.label}</span>
            <span className="text-[11px] font-medium text-ink-500">{item.english}</span>
          </button>
        ))}
      </div>

      <Button className="mt-4 w-full" onClick={confirm}>
        {tIn(choice, "lang.continue")}
      </Button>
    </Modal>
  );
}
