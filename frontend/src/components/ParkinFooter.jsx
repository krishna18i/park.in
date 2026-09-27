import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, CircleHelp, MapPin, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";

const LINKS = [
  ["Find capacity", "/#mobility-search", MapPin],
  ["Urban logistics", "/logistics", Truck],
  ["City network", "/city", Building2],
  ["Help centre", "/help", CircleHelp],
];

const LANDMARKS = [
  "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=2400&q=88",
  "https://images.unsplash.com/photo-1607160913575-9854cbecca02?auto=format&fit=crop&w=2400&q=88",
  "https://images.unsplash.com/photo-1701087366618-112f1b333a9f?auto=format&fit=crop&w=2400&q=88",
  "https://images.unsplash.com/photo-1609137144813-7d9921338f24?auto=format&fit=crop&w=2400&q=88",
];

export default function ParkinFooter() {
  const { tl } = useI18n();
  const [landmark, setLandmark] = useState(0);
  const [previousLandmark, setPreviousLandmark] = useState(LANDMARKS.length - 1);

  useEffect(() => {
    const timer = setInterval(() => {
      setLandmark((value) => {
        setPreviousLandmark(value);
        return (value + 1) % LANDMARKS.length;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="parkin-footer">
      <div className="mx-auto max-w-7xl px-6">
        <div className="parkin-footer-top">
          <div>
            <span className="parkin-footer-kicker">{tl("ONE NETWORK · EVERY CURB DECISION")}</span>
            <p>{tl("Live parking, legal logistics and governed city movement—working as one shared operating layer.")}</p>
          </div>
          <div className="parkin-footer-links">
            {LINKS.map(([label, to, Icon]) => <Link key={label} to={to}><Icon />{tl(label)}<ArrowUpRight /></Link>)}
          </div>
        </div>
        <div className="parkin-footer-meta">
          <span>{tl("Urban mobility intelligence")}</span>
          <span>{tl("Jaipur pilot · built for city scale")}</span>
          <span>© 2026 Park.in</span>
        </div>
      </div>
      <div className="parkin-footer-signature-wrap" aria-label="Park.in">
        <div
          className="parkin-footer-signature parkin-footer-signature-previous"
          style={{ "--footer-image": `url(${LANDMARKS[previousLandmark]})` }}
          aria-hidden="true"
        ><span>Park</span><b>.in</b></div>
        <div
          key={landmark}
          className="parkin-footer-signature parkin-footer-signature-current"
          style={{ "--footer-image": `url(${LANDMARKS[landmark]})` }}
          aria-hidden="true"
        ><span>Park</span><b>.in</b></div>
      </div>
    </footer>
  );
}
