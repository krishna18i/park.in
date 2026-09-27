import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  CircleParking,
  Clock3,
  ExternalLink,
  Gauge,
  Leaf,
  Map,
  Pause,
  Play,
  Presentation,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Server,
  ShieldCheck,
  Sparkles,
  Truck,
  Wifi,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { useLive } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import { Spinner } from "../components/ui";

const STEPS = [
  { time: "0:00", duration: 35, title: "The urban pressure", route: "/", icon: Presentation, action: "Open redesigned landing", script: "Cities do not lack parking apps. They lack a shared operating layer for curb capacity, logistics and intervention.", proof: "Four stakeholders, one live network" },
  { time: "0:35", duration: 45, title: "Explainable driver decision", route: "/#mobility-search", icon: Route, action: "Demonstrate ParkScore", script: "Park.in ranks capacity using distance, availability, prediction, price and vehicle compatibility—and explains every decision.", proof: "Five-factor server-side ranking" },
  { time: "1:20", duration: 45, title: "Urban logistics", route: "/logistics", icon: Truck, action: "Reserve loading window", script: "Delivery vehicles reserve a legal dwell window instead of double-parking and blocking a transport corridor.", proof: "Real heavy-bay inventory and QR lifecycle" },
  { time: "2:05", duration: 65, title: "Sensor-to-city moment", route: "/city", icon: Radio, action: "Run Sensor Lab", script: "One authenticated observation changes a physical bay, records an audit event, and updates every connected view in real time.", proof: "Device auth, confidence gate, WebSocket fan-out" },
  { time: "3:10", duration: 55, title: "Authority intervention", route: "/city", icon: Building2, action: "Show diversion and allocation", script: "AI recommends a lower-pressure target; the authority approves the diversion or reallocates capacity for a time-bound public need.", proof: "Human-in-the-loop governance" },
  { time: "4:05", duration: 35, title: "Close with evidence", route: "/showcase#evidence", icon: BarChart3, action: "Present feasibility", script: "This is not a slideshow prototype: booking, payments, QR, sensors, logistics, predictions and governance share one tested state machine.", proof: "64 backend tests and production build" },
];

const ARCHITECTURE = [
  { icon: Radio, title: "Edge layer", body: "Ultrasonic · camera · QR · operator", tone: "orange" },
  { icon: Server, title: "Decision layer", body: "FastAPI · atomic state · prediction", tone: "cyan" },
  { icon: Wifi, title: "Realtime layer", body: "WebSockets · audit events · alerts", tone: "green" },
  { icon: Building2, title: "Action layer", body: "Driver · logistics · operator · city", tone: "violet" },
];

function formatTimer(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function CheckCard({ label, ok, value, icon: Icon }) {
  return <div className={`showcase-check ${ok ? "is-ready" : "is-down"}`}><span><Icon className="h-4 w-4" /></span><div><small>{label}</small><b>{value}</b></div>{ok ? <CheckCircle2 className="ml-auto h-4 w-4" /> : <XCircle className="ml-auto h-4 w-4" />}</div>;
}

export default function Showcase() {
  const [current, setCurrent] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState(null);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rehearsed, setRehearsed] = useState(() => new Set());
  const { connected } = useLive();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const checkSystem = async () => {
    setChecks(null);
    try {
      const [health, locations, stats, sensorEvents] = await Promise.all([api.health(), api.locations(), api.stats(), api.sensorEvents(5)]);
      const fresh = { health, locations, stats, sensorEvents };
      setChecks(fresh);
      setSnapshotMode(false);
      localStorage.setItem("parkin.showcase.snapshot", JSON.stringify(fresh));
      toast.success("Presentation systems verified");
    } catch (error) {
      const cached = localStorage.getItem("parkin.showcase.snapshot");
      if (cached) {
        setChecks({ ...JSON.parse(cached), error: error.message });
        setSnapshotMode(true);
        toast.error("Server unavailable. Showing the last rehearsal snapshot.");
      } else {
        toast.error(error.message);
        setChecks({ error: error.message, locations: [], stats: null, sensorEvents: [] });
      }
    }
  };

  useEffect(() => { checkSystem(); }, []);

  const readiness = useMemo(() => checks ? [
    { label: "Core API", ok: checks.health?.status === "ok", value: checks.health?.status === "ok" ? "Operational" : "Unavailable", icon: Server },
    { label: "Realtime channel", ok: connected, value: connected ? "Connected" : "Reconnecting", icon: Wifi },
    { label: "Mobility data", ok: checks.locations?.length > 0, value: `${checks.locations?.length || 0} zones loaded`, icon: Map },
    { label: "Capacity state", ok: Boolean(checks.stats?.total_slots), value: `${checks.stats?.total_slots || 0} bays synchronized`, icon: CircleParking },
    { label: "Sensor audit", ok: Array.isArray(checks.sensorEvents), value: `${checks.sensorEvents?.length || 0} recent events`, icon: Radio },
  ] : [], [checks, connected]);

  const openStage = (step, index) => {
    setCurrent(index);
    setRehearsed((value) => new Set(value).add(index));
    if (step.route.includes("#")) {
      const [path, hash] = step.route.split("#");
      navigate(`${path}#${hash}`);
    } else navigate(step.route);
  };

  const openSecondWindow = () => {
    window.open("/admin", "parkin-operator", "width=1180,height=800");
  };

  const restoreScenario = async () => {
    if (!resetArmed) {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 5000);
      return;
    }
    setResetting(true);
    try {
      await api.resetDemo();
      setResetArmed(false);
      setRehearsed(new Set());
      setSeconds(0);
      setCurrent(0);
      await checkSystem();
      toast.success("Clean judging scenario restored");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResetting(false);
    }
  };

  if (!checks) return <div className="min-h-screen bg-slate-950"><Spinner label="Preparing presentation control room" /></div>;

  const currentStep = STEPS[current];
  const baselineTrips = checks.stats?.total_bookings || 0;
  const model = { distance: Math.round(baselineTrips * 1.7), minutes: Math.round(baselineTrips * 7.1), co2: Math.round(baselineTrips * 0.289) };

  return (
    <div className="min-h-screen bg-[#070f1d] text-slate-100">
      <header className="showcase-header">
        <div><span><Presentation className="h-4 w-4" /> EXTERNAL ROUND CONTROL ROOM</span><h1>Park.in Presentation Mode</h1><p>A deterministic five-minute story—from urban pressure to measurable intervention.</p></div>
        <div className="showcase-timer"><span>{snapshotMode ? "SNAPSHOT" : running ? "LIVE TIMER" : "READY"}</span><b>{formatTimer(seconds)}</b><div><button onClick={() => setRunning((value) => !value)}>{running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><button onClick={() => { setRunning(false); setSeconds(0); setCurrent(0); }}><RotateCcw className="h-4 w-4" /></button></div></div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-5 py-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {readiness.map((item) => <CheckCard key={item.label} {...item} />)}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <div className="showcase-panel">
            <div className="showcase-panel-head"><div><span>GUIDED STORYLINE</span><h2>Five-minute judge journey</h2></div><div className="flex gap-4"><button onClick={restoreScenario} disabled={resetting}>{resetting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} {resetArmed ? "Confirm reset" : "Reset scenario"}</button><button onClick={checkSystem}><RefreshCw className="h-4 w-4" /> Recheck</button></div></div>
            <div className="p-4 sm:p-5">
              {STEPS.map((step, index) => { const Icon = step.icon; const active = index === current; const done = rehearsed.has(index); return <button key={step.title} type="button" onClick={() => setCurrent(index)} className={`showcase-step ${active ? "is-active" : ""}`}><span className="showcase-step-time">{done ? <Check className="h-4 w-4" /> : step.time}</span><span className="showcase-step-icon"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><b>{step.title}</b><small>{step.proof}</small></span><ArrowRight className="h-4 w-4 text-slate-600" /></button>; })}
            </div>
          </div>

          <div className="showcase-stage-card">
            <div className="showcase-stage-number">0{current + 1}</div>
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-cyan-300"><Sparkles className="h-3.5 w-3.5" /> Presenter prompt</span>
            <h2>{currentStep.title}</h2>
            <blockquote>“{currentStep.script}”</blockquote>
            <div className="showcase-proof"><ShieldCheck className="h-5 w-5" /><span><small>PROOF TO POINT AT</small><b>{currentStep.proof}</b></span></div>
            <button onClick={() => openStage(currentStep, current)} className="showcase-primary">{currentStep.action}<ArrowRight className="h-4 w-4" /></button>
            {current === 3 && <button onClick={openSecondWindow} className="showcase-secondary"><ExternalLink className="h-4 w-4" /> Open operator second window</button>}
            <p className="mt-4 text-center text-[10px] text-slate-500">Target stage duration: {currentStep.duration} seconds</p>
          </div>
        </section>

        <section id="evidence" className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
          <div className="showcase-panel">
            <div className="showcase-panel-head"><div><span>TRACEABLE IMPACT</span><h2>Modelled pilot evidence</h2></div><Leaf className="h-5 w-5 text-emerald-300" /></div>
            <div className="grid grid-cols-3 gap-px bg-white/[0.07]">
              <div className="showcase-impact"><Route /><b>{model.distance} km</b><span>search travel avoided</span></div>
              <div className="showcase-impact"><Clock3 /><b>{model.minutes} min</b><span>driver time saved</span></div>
              <div className="showcase-impact"><Leaf /><b>{model.co2} kg</b><span>CO₂ avoided</span></div>
            </div>
            <p className="p-4 text-[10px] leading-relaxed text-slate-500">Explicitly modelled, not measured field results: {baselineTrips} platform bookings × 1.7 km baseline search avoidance; 4.2 minutes/km; 0.17 kg CO₂/km. Replace with pilot telemetry after deployment.</p>
          </div>

          <div className="showcase-panel">
            <div className="showcase-panel-head"><div><span>DEPLOYABLE ARCHITECTURE</span><h2>One event, four operational layers</h2></div><Gauge className="h-5 w-5 text-cyan-300" /></div>
            <div className="showcase-architecture">{ARCHITECTURE.map(({ icon: Icon, title, body, tone }, index) => <div key={title} className={`architecture-node tone-${tone}`}><span><Icon className="h-5 w-5" /></span><b>{title}</b><small>{body}</small>{index < ARCHITECTURE.length - 1 && <ArrowRight className="architecture-arrow h-4 w-4" />}</div>)}</div>
          </div>
        </section>

        <section className="showcase-panel p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><span className="text-[10px] font-black uppercase tracking-[.16em] text-orange-300">BEFORE YOU PRESENT</span><h2 className="mt-2 font-display text-2xl font-bold">Final rehearsal gate</h2><div className="mt-4 flex flex-wrap gap-2">{["Backend running", "Admin signed in", "Sensor Lab tested", "Operator window open", "QR camera permitted", "Backup recording ready"].map((item, index) => <button key={item} onClick={() => setRehearsed((currentSet) => { const next = new Set(currentSet); const key = `check-${index}`; next.has(key) ? next.delete(key) : next.add(key); return next; })} className={`rounded-full border px-3 py-2 text-xs font-semibold ${rehearsed.has(`check-${index}`) ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300" : "border-white/10 text-slate-400"}`}>{rehearsed.has(`check-${index}`) && <Check className="mr-1 inline h-3 w-3" />}{item}</button>)}</div></div><button onClick={() => { setRunning(true); setSeconds(0); setCurrent(0); toast.success("Presentation timer started. You've got this."); }} className="showcase-primary min-w-52"><Play className="h-4 w-4" /> Start full rehearsal</button></div>
        </section>
      </main>
    </div>
  );
}
