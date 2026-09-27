import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import en from "../i18n/en.json";
import hi from "../i18n/hi.json";
import mr from "../i18n/mr.json";
import ta from "../i18n/ta.json";
import pa from "../i18n/pa.json";
import { DEFAULT_LANG, LANGUAGES, isLang, langMeta } from "../i18n/languages";

const DICTS = { en, hi, mr, ta, pa };
const STORAGE_KEY = "parkin.lang";

const LITERAL_OVERRIDES = {
  hi: {
    "Demo": "डेमो", "Command": "कमांड", "Logistics": "लॉजिस्टिक्स",
    "Welcome back": "वापसी पर स्वागत है", "Sign in to reserve and manage your bays.": "अपने बे आरक्षित और प्रबंधित करने के लिए साइन इन करें।",
    "Email": "ईमेल", "Password": "पासवर्ड", "Your password": "आपका पासवर्ड", "Sign in": "साइन इन करें", "Signing in": "साइन इन हो रहा है",
    "Demo accounts": "डेमो खाते", "Driver": "ड्राइवर", "Operator": "ऑपरेटर", "New here?": "यहाँ नए हैं?", "Create an account": "खाता बनाएँ",
    "One journey. One trusted network.": "एक यात्रा। एक भरोसेमंद नेटवर्क।", "DISCOVER": "खोजें", "VERIFY": "सत्यापित करें", "SYNCHRONIZE": "समन्वय करें",
    "Live capacity found": "लाइव क्षमता मिली", "Exact bay secured": "सटीक बे सुरक्षित", "City network updated": "शहर का नेटवर्क अपडेट हुआ", "Park.in is opening": "Park.in खुल रहा है",
    "ONE NETWORK · EVERY CURB DECISION": "एक नेटवर्क · हर कर्ब निर्णय",
    "Live parking, legal logistics and governed city movement—working as one shared operating layer.": "लाइव पार्किंग, वैध लॉजिस्टिक्स और नियंत्रित शहरी आवागमन—एक साझा संचालन परत के रूप में।",
    "Find capacity": "क्षमता खोजें", "Urban logistics": "शहरी लॉजिस्टिक्स", "City network": "शहर नेटवर्क", "Help centre": "सहायता केंद्र",
    "Urban mobility intelligence": "शहरी गतिशीलता बुद्धिमत्ता", "Jaipur pilot · built for city scale": "जयपुर पायलट · शहर के स्तर के लिए निर्मित",
    "Predict demand.": "मांग का पूर्वानुमान करें।", "Allocate smarter.": "बेहतर आवंटन करें।", "Move cities faster.": "शहरों को तेज़ चलाएँ।",
    "Live bays free": "लाइव खाली बे", "Network utilized": "नेटवर्क उपयोग", "Event sync target": "इवेंट सिंक लक्ष्य",
    "NETWORK, RIGHT NOW": "नेटवर्क, अभी", "Measured from the live pilot state—not decorative numbers.": "लाइव पायलट स्थिति से मापा गया—सजावटी आंकड़े नहीं।",
    "bays available": "बे उपलब्ध", "Across connected facilities": "जुड़ी सुविधाओं में", "mobility nodes": "मोबिलिटी नोड", "Parking and loading capacity": "पार्किंग और लोडिंग क्षमता",
    "network utilized": "नेटवर्क उपयोग", "Calculated from live bay state": "लाइव बे स्थिति से गणना", "sync target": "सिंक लक्ष्य", "Event to every connected view": "हर जुड़े दृश्य तक इवेंट",
    "THE URBAN OPERATING LAYER": "शहरी संचालन परत", "From a parking action to a city decision.": "पार्किंग कार्रवाई से शहर के निर्णय तक।",
    "The differentiator is not another booking screen. It is a shared intelligence layer that sees pressure forming and helps every stakeholder act.": "यह केवल एक और बुकिंग स्क्रीन नहीं है। यह साझा बुद्धिमत्ता परत दबाव को बनते देखती है और हर हितधारक को कार्रवाई में मदद करती है।",
    "DRIVER NETWORK": "ड्राइवर नेटवर्क", "Choose a destination.": "गंतव्य चुनें।", "We find the capacity.": "क्षमता हम खोजेंगे।",
    "Search the live network or explore every connected mobility node below.": "लाइव नेटवर्क खोजें या नीचे हर जुड़े मोबिलिटी नोड को देखें।",
    "ONE NETWORK · FOUR VIEWS": "एक नेटवर्क · चार दृश्य", "Built for the whole movement chain.": "पूरी आवागमन शृंखला के लिए निर्मित।",
    "OPERATIONS READY": "संचालन के लिए तैयार", "See the network from the control side.": "नेटवर्क को नियंत्रण पक्ष से देखें।",
    "Manage live occupancy, scan gate passes, configure layouts and act on driver feedback from one operational console.": "एक संचालन कंसोल से लाइव अधिभोग संभालें, गेट पास स्कैन करें, लेआउट बनाएं और ड्राइवर प्रतिक्रिया पर कार्रवाई करें।",
    "Open operations": "संचालन खोलें", "Open node": "नोड खोलें",
    "LIVE SYSTEM WALKTHROUGH": "लाइव सिस्टम प्रदर्शन", "Describe one journey.": "एक यात्रा बताइए।", "Watch the network do the rest.": "बाकी काम नेटवर्क को करते देखें।",
    "This is the actual Park.in workflow—from driver intent to a verified physical bay and synchronized city state.": "यह वास्तविक Park.in कार्यप्रवाह है—ड्राइवर की जरूरत से सत्यापित बे और समन्वित शहर स्थिति तक।",
    "Describe": "बताएँ", "Evaluate": "मूल्यांकन", "Recommend": "सुझाव", "Reserve": "आरक्षित", "Verify": "सत्यापन", "Synchronize": "समन्वय",
    "Driver intent received": "ड्राइवर की जरूरत मिली", "Live capacity evaluated": "लाइव क्षमता का मूल्यांकन हुआ", "ParkScore explains the choice": "ParkScore चयन समझाता है",
    "Exact bay claimed": "सटीक बे सुरक्षित हुआ", "Physical arrival verified": "वास्तविक आगमन सत्यापित", "Every view updated": "हर दृश्य अपडेट हुआ",
    "Find a safe bay near Jantar Mantar for RJ14 AB 1234.": "RJ14 AB 1234 के लिए जंतर मंतर के पास सुरक्षित बे खोजें।",
    "Checking 10 connected nodes against distance, price, pressure and compatibility…": "दूरी, मूल्य, दबाव और अनुकूलता के आधार पर 10 जुड़े नोड जाँचे जा रहे हैं…",
    "City Palace ranked #1: 80 m away, strong live availability, predicted pressure stable.": "सिटी पैलेस प्रथम स्थान पर: 80 मीटर दूर, अच्छी लाइव उपलब्धता और स्थिर अनुमानित दबाव।",
    "Bay A-04 held atomically. A second driver cannot claim the same capacity.": "बे A-04 सुरक्षित रूप से होल्ड है। दूसरा ड्राइवर इसी क्षमता को नहीं ले सकता।",
    "Gate code matched. Edge sensor reports 32 cm at 99.8% confidence.": "गेट कोड मिला। एज सेंसर 99.8% विश्वसनीयता के साथ 32 सेमी बता रहा है।",
    "Driver, operator and City Command received the trusted occupancy event.": "ड्राइवर, ऑपरेटर और सिटी कमांड को विश्वसनीय अधिभोग घटना मिल गई।",
    "Destination · vehicle · arrival window": "गंतव्य · वाहन · आगमन समय", "180 bays queried in parallel": "180 बे एक साथ जाँचे गए",
    "ParkScore 71 · explainable ranking": "ParkScore 71 · स्पष्ट रैंकिंग", "10 minute hold · QR pass prepared": "10 मिनट होल्ड · QR पास तैयार",
    "Bay state: occupied": "बे स्थिति: भरा हुआ", "WebSocket fan-out · 84 ms": "WebSocket प्रसारण · 84 मिलीसेकंड",
    "Park.in workflow stages": "Park.in कार्यप्रवाह चरण",
    "Live event moving through the Park.in network": "लाइव घटना Park.in नेटवर्क से गुजर रही है",
    "Understand": "समझें", "Rank": "रैंक",
    "One intent enters the network": "एक जरूरत नेटवर्क में प्रवेश करती है", "Live capacity becomes intelligence": "लाइव क्षमता बुद्धिमत्ता बनती है",
    "ParkScore explains the best choice": "ParkScore सर्वोत्तम चयन समझाता है", "Exact capacity is secured": "सटीक क्षमता सुरक्षित होती है",
    "The physical arrival is trusted": "वास्तविक आगमन विश्वसनीय बनता है", "The whole city responds": "पूरा शहर प्रतिक्रिया देता है",
    "Find parking near Jantar Mantar—or a legal loading window for a delivery vehicle.": "जंतर मंतर के पास पार्किंग—या डिलीवरी वाहन के लिए वैध लोडिंग समय—खोजें।",
    "Checking connected parking and loading nodes against distance, price, pressure and vehicle fit…": "दूरी, मूल्य, दबाव और वाहन अनुकूलता पर जुड़े पार्किंग और लोडिंग नोड जाँचे जा रहे हैं…",
    "City Palace ranks #1: 80 m away, strong availability, fair price and stable predicted pressure.": "सिटी पैलेस प्रथम: 80 मीटर दूर, अच्छी उपलब्धता, उचित मूल्य और स्थिर अनुमानित दबाव।",
    "Bay A-04 is held atomically—or a loading window is reserved—so capacity cannot be double-booked.": "बे A-04 सुरक्षित रूप से होल्ड है—या लोडिंग समय आरक्षित है—इसलिए दोहरी बुकिंग नहीं हो सकती।",
    "QR identity matches. The edge sensor confirms occupancy at 99.8% confidence.": "QR पहचान मिलती है। एज सेंसर 99.8% विश्वसनीयता के साथ अधिभोग की पुष्टि करता है।",
    "Every view updates live. City Command predicts pressure, diverts demand and governs temporary curb allocation.": "हर दृश्य लाइव अपडेट होता है। सिटी कमांड दबाव का अनुमान, मांग का मार्ग परिवर्तन और अस्थायी कर्ब आवंटन नियंत्रित करता है।",
    "Driver · logistics · destination · arrival": "ड्राइवर · लॉजिस्टिक्स · गंतव्य · आगमन", "Live bays · prediction · compatibility": "लाइव बे · पूर्वानुमान · अनुकूलता",
    "Explainable five-factor ParkScore": "समझने योग्य पाँच-कारक ParkScore", "Atomic hold · payment · QR pass": "सुरक्षित होल्ड · भुगतान · QR पास",
    "QR gate · sensor · immutable audit": "QR गेट · सेंसर · अपरिवर्तनीय ऑडिट", "84 ms sync · alerts · human approval": "84 मिलीसेकंड सिंक · अलर्ट · मानवीय स्वीकृति",
    "PLAYING": "चल रहा है", "PAUSED": "रुका हुआ", "CURRENT SYSTEM THOUGHT": "वर्तमान सिस्टम विचार", "Pause walkthrough": "प्रदर्शन रोकें", "Continue walkthrough": "प्रदर्शन जारी रखें", "Replay": "फिर चलाएँ",
    "CONNECTED NODES": "जुड़े नोड", "BAY STATE": "बे स्थिति", "CONFIDENCE": "विश्वसनीयता", "SYNC LATENCY": "सिंक विलंब", "OCCUPIED": "भरा हुआ", "VACANT": "खाली"
  },
};

const inverseEnglish = new Map(Object.entries(en).map(([key, value]) => [value, key]));

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLang(saved) ? saved : DEFAULT_LANG;
  });

  const setLang = useCallback((next) => {
    const value = isLang(next) ? next : DEFAULT_LANG;
    localStorage.setItem(STORAGE_KEY, value);
    setLangState(value);
    document.documentElement.lang = value;
  }, []);

  // Look a key up in an explicit language. The picker uses this to preview a
  // language before the driver commits to it.
  const tIn = useCallback((code, key, vars) => {
    const dict = DICTS[code] || en;
    let text = dict[key] ?? en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }, []);

  const t = useCallback((key, vars) => tIn(lang, key, vars), [lang, tIn]);
  const tl = useCallback((source) => {
    if (lang === "en" || typeof source !== "string") return source;
    const direct = LITERAL_OVERRIDES[lang]?.[source];
    if (direct) return direct;
    const key = inverseEnglish.get(source);
    return key ? tIn(lang, key) : source;
  }, [lang, tIn]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      tIn,
      tl,
      languages: LANGUAGES,
      meta: langMeta(lang),
    }),
    [lang, setLang, t, tIn, tl],
  );
  return <I18nContext.Provider value={value}><DocumentTranslator lang={lang} tl={tl} />{children}</I18nContext.Provider>;
}

function DocumentTranslator({ lang, tl }) {
  const originals = useRef(new WeakMap());
  const rendered = useRef(new WeakMap());
  useEffect(() => {
    document.documentElement.lang = lang;
    const translateText = (node) => {
      if (!node.parentElement || ["SCRIPT", "STYLE"].includes(node.parentElement.tagName)) return;
      const current = node.nodeValue;
      if (!originals.current.has(node) || (rendered.current.has(node) && current !== rendered.current.get(node))) {
        originals.current.set(node, current);
      }
      const raw = originals.current.get(node);
      const source = raw.trim();
      if (!source) return;
      const leading = raw.match(/^\s*/)?.[0] || "";
      const trailing = raw.match(/\s*$/)?.[0] || "";
      const translated = `${leading}${tl(source)}${trailing}`;
      rendered.current.set(node, translated);
      if (current !== translated) node.nodeValue = translated;
    };
    const translateTree = (root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) translateText(node);
      root.querySelectorAll?.("[placeholder],[title],[aria-label]").forEach((element) => {
        ["placeholder", "title", "aria-label"].forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          const marker = `data-i18n-${attribute.replace("aria-", "aria")}`;
          const source = element.getAttribute(marker) || element.getAttribute(attribute);
          if (!element.hasAttribute(marker)) element.setAttribute(marker, source);
          element.setAttribute(attribute, tl(source));
        });
      });
    };
    translateTree(document.body);
    const observer = new MutationObserver((records) => records.forEach((record) => {
      if (record.type === "characterData") translateText(record.target);
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) translateTree(node);
        else if (node.nodeType === Node.TEXT_NODE) translateText(node);
      });
    }));
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [lang, tl]);
  return null;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
