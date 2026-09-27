import { useEffect, useMemo, useState } from "react";
import { Activity, Check, CircleDot, MapPin, Play, Radio, RotateCcw, Route, ScanLine, Sparkles, Truck, Zap } from "lucide-react";
import { useI18n } from "../context/I18nContext";

const PHASES = [
  { label: "Understand", title: "One intent enters the network", typed: "Find parking near Jantar Mantar—or a legal loading window for a delivery vehicle.", meta: "Driver · logistics · destination · arrival", icon: MapPin, tone: "cyan" },
  { label: "Evaluate", title: "Live capacity becomes intelligence", typed: "Checking connected parking and loading nodes against distance, price, pressure and vehicle fit…", meta: "Live bays · prediction · compatibility", icon: Activity, tone: "cyan" },
  { label: "Rank", title: "ParkScore explains the best choice", typed: "City Palace ranks #1: 80 m away, strong availability, fair price and stable predicted pressure.", meta: "Explainable five-factor ParkScore", icon: Sparkles, tone: "orange" },
  { label: "Reserve", title: "Exact capacity is secured", typed: "Bay A-04 is held atomically—or a loading window is reserved—so capacity cannot be double-booked.", meta: "Atomic hold · payment · QR pass", icon: CircleDot, tone: "orange" },
  { label: "Verify", title: "The physical arrival is trusted", typed: "QR identity matches. The edge sensor confirms occupancy at 99.8% confidence.", meta: "QR gate · sensor · immutable audit", icon: ScanLine, tone: "green" },
  { label: "Command", title: "The whole city responds", typed: "Every view updates live. City Command predicts pressure, diverts demand and governs temporary curb allocation.", meta: "84 ms sync · alerts · human approval", icon: Zap, tone: "green" },
];

const TYPE_SPEED = 34;
const POST_TYPE_HOLD = 220;

function TypedLine({ text, phase }) {
  const [visible, setVisible] = useState("");
  useEffect(() => {
    setVisible("");
    let cursor = 0;
    const timer = setInterval(() => {
      cursor += 1;
      setVisible(text.slice(0, cursor));
      if (cursor >= text.length) clearInterval(timer);
    }, TYPE_SPEED);
    return () => clearInterval(timer);
  }, [phase, text]);
  return <span>{visible}<i className="workflow-caret" aria-hidden="true" /></span>;
}

export default function SensorSimulation() {
  const { tl } = useI18n();
  const [phase, setPhase] = useState(0);
  const [running, setRunning] = useState(true);
  const phases = useMemo(() => PHASES.map((item) => ({ ...item, label: tl(item.label), title: tl(item.title), typed: tl(item.typed), meta: tl(item.meta) })), [tl]);
  const current = phases[phase];
  const phaseDuration = Math.max(2600, current.typed.length * TYPE_SPEED + POST_TYPE_HOLD);

  useEffect(() => {
    if (!running) return undefined;
    if (phase >= phases.length - 1) {
      const restart = setTimeout(() => setPhase(0), phaseDuration);
      return () => clearTimeout(restart);
    }
    const timer = setTimeout(() => setPhase((value) => value + 1), phaseDuration);
    return () => clearTimeout(timer);
  }, [phase, phaseDuration, phases.length, running]);

  const replay = () => { setPhase(0); setRunning(true); };
  const choosePhase = (index) => { setPhase(index); setRunning(false); };

  return (
    <section id="sensor-demo" className="workflow-section">
      <div className="workflow-grid" aria-hidden="true" />
      <div className="workflow-shell">
        <aside className="workflow-story">
          <div className="workflow-heading">
            <span><Radio /> {tl("LIVE SYSTEM WALKTHROUGH")}</span>
            <h2>{tl("Describe one journey.")}<br /><em>{tl("Watch the network do the rest.")}</em></h2>
            <p>{tl("This is the actual Park.in workflow—from driver intent to a verified physical bay and synchronized city state.")}</p>
          </div>

          <div className="workflow-tabs" role="tablist" aria-label={tl("Park.in workflow stages")}>
            <i style={{ height: `${((phase + 1) / phases.length) * 100}%` }} />
            {phases.map((item, index) => {
              const Icon = item.icon;
              return (
                <button key={PHASES[index].label} type="button" role="tab" aria-selected={index === phase} className={index === phase ? "is-active" : index < phase ? "is-complete" : ""} onClick={() => choosePhase(index)}>
                  <span>{index < phase ? <Check /> : <Icon />}</span>
                  <b>{item.label}</b>
                  <small>{item.title}</small>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="workflow-stage">
          <div className="workflow-stage-head"><span><Activity /> PARK.IN ORCHESTRATOR / LIVE</span><b><i /> {tl(running ? "PLAYING" : "PAUSED")}</b></div>
          <div className="workflow-stage-body">
            <div className="workflow-conversation">
              <div className="workflow-prompt-label"><Route /> {tl("CURRENT SYSTEM THOUGHT")}</div>
              <div className="workflow-typed"><TypedLine key={`${phase}-${current.typed}`} text={current.typed} phase={phase} /></div>
              <div className="workflow-meta"><span className={`workflow-tone-${current.tone}`}>{current.title}</span><small>{current.meta}</small></div>
              <div className="workflow-controls">
                <button type="button" onClick={() => setRunning((value) => !value)}><Play />{tl(running ? "Pause walkthrough" : "Continue walkthrough")}</button>
                <button type="button" onClick={replay}><RotateCcw />{tl("Replay")}</button>
              </div>
            </div>

            <div className="workflow-cascade" aria-live="polite" style={{ "--phase-duration": `${phaseDuration}ms` }}>
              <div className="workflow-motion-orbit" aria-hidden="true"><i /><i /><i /></div>
              <div className="workflow-cascade-line"><i /></div>
              <div key={`packet-${phase}`} className={`workflow-packet workflow-tone-${current.tone}`} aria-hidden="true"><Truck /><i /><i /></div>
              {phases.map((item, index) => {
                const Icon = item.icon;
                const state = index === phase ? "is-current" : index === phase - 1 ? "is-previous" : index === phase + 1 ? "is-next" : "is-dormant";
                return <div key={PHASES[index].label} className={`workflow-event ${state}`}><span className={`workflow-event-icon workflow-tone-${item.tone}`}><Icon /></span><div><small>{item.label.toUpperCase()}</small><b>{item.title}</b><p>{item.meta}</p></div>{index < phase && <Check className="workflow-event-check" />}</div>;
              })}
              <div className="workflow-live-caption"><Radio /> {tl("Live event moving through the Park.in network")}</div>
            </div>
          </div>
          <div className="workflow-telemetry">
            <div><span>{tl("CONNECTED NODES")}</span><b>{phase >= 1 ? "10 / 10" : "—"}</b></div>
            <div><span>{tl("BAY STATE")}</span><b className={phase >= 4 ? "text-orange-300" : "text-emerald-300"}>{tl(phase >= 4 ? "OCCUPIED" : "VACANT")}</b></div>
            <div><span>{tl("CONFIDENCE")}</span><b>{phase >= 4 ? "99.8%" : "—"}</b></div>
            <div><span>{tl("SYNC LATENCY")}</span><b>{phase >= 5 ? "84 ms" : "—"}</b></div>
          </div>
        </div>
      </div>
    </section>
  );
}
