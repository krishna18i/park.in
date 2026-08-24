import { useCallback, useEffect, useRef, useState } from "react";
import { langMeta } from "../i18n/languages";

function SpeechEngine() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function speechLang(lang) {
  return langMeta(lang).speech;
}

/**
 * Browser speech-to-text for the Help issue form.
 * Returns no-ops when the Web Speech API is missing (Firefox, some Safari).
 */
export function useSpeechInput({ lang = "en", onTranscript } = {}) {
  const Engine = SpeechEngine();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  const langRef = useRef(lang);
  onTranscriptRef.current = onTranscript;
  langRef.current = lang;

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Engine) return;
    stop();
    const rec = new Engine();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = speechLang(langRef.current);
    rec.onresult = (event) => {
      let finalChunk = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalChunk += piece;
        else interim += piece;
      }
      onTranscriptRef.current?.({ finalChunk, interim });
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      if (recognitionRef.current === rec) {
        recognitionRef.current = null;
        setListening(false);
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }, [Engine, stop]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => stop, [stop]);

  return { supported: Boolean(Engine), listening, toggle, stop };
}
