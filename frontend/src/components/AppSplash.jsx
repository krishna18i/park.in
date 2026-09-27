import { useEffect, useState } from "react";
import { MapPin, Radio, Route, ShieldCheck } from "lucide-react";

const NODES = [
  [MapPin, "DISCOVER", "Live capacity found"],
  [ShieldCheck, "VERIFY", "Exact bay secured"],
  [Radio, "SYNCHRONIZE", "City network updated"],
];

export default function AppSplash({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leave = setTimeout(() => setLeaving(true), 2700);
    const done = setTimeout(onDone, 3100);
    return () => { clearTimeout(leave); clearTimeout(done); };
  }, [onDone]);

  return (
    <div className={`app-splash ${leaving ? "is-leaving" : ""}`} role="status" aria-label="Park.in is opening">
      <div className="app-splash-grid" />
      <div className="app-splash-inner">
        <div className="app-splash-brand"><img src="/parkin-mark.svg" alt="" /><span>Park<b>.in</b></span></div>
        <p>One journey. One trusted network.</p>
        <div className="app-splash-flow">
          <div className="app-splash-track"><i /></div>
          {NODES.map(([Icon, label, detail], index) => <div key={label} className="app-splash-node" style={{ "--node-index": index }}><span><Icon /></span><b>{label}</b><small>{detail}</small></div>)}
          <Route className="app-splash-pulse" />
        </div>
      </div>
    </div>
  );
}
