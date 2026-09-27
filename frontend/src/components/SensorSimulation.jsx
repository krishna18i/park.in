import { useEffect, useState } from "react";
import { Activity, Car, Check, Play, Radio, RotateCcw, Satellite, ScanLine } from "lucide-react";

const PHASES = [
  { label: "Bay vacant", detail: "Sensor distance: 248 cm", status: "vacant" },
  { label: "Vehicle approaching", detail: "Edge camera detects motion", status: "approaching" },
  { label: "Identity verified", detail: "QR / ANPR booking matched", status: "verified" },
  { label: "Bay occupied", detail: "Sensor distance: 32 cm", status: "occupied" },
  { label: "Network synchronized", detail: "Driver, operator and city updated", status: "synced" },
];

export default function SensorSimulation() {
  const [phase, setPhase] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    if (phase >= PHASES.length - 1) {
      setRunning(false);
      return undefined;
    }
    const timer = setTimeout(() => setPhase((value) => value + 1), 1250);
    return () => clearTimeout(timer);
  }, [phase, running]);

  const start = () => {
    setPhase(0);
    setRunning(true);
  };

  const reset = () => {
    setRunning(false);
    setPhase(0);
  };

  const occupied = phase >= 3;

  return (
    <section id="sensor-demo" className="relative overflow-hidden bg-slate-950 py-20 text-white sm:py-24">
      <div className="absolute inset-0 sensor-section-grid" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            <Radio className="h-3.5 w-3.5" /> Live sensor simulation
          </span>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl">
            Watch one parking event update an entire city network.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">
            Park.in is sensor-agnostic. Ultrasonic hardware, cameras, QR gates and operator actions all publish the same trusted occupancy event.
          </p>

          <div className="mt-8 space-y-3">
            {PHASES.map((item, index) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-500 ${
                  index === phase
                    ? "border-cyan-300/50 bg-cyan-300/10"
                    : index < phase
                      ? "border-emerald-400/20 bg-emerald-400/5"
                      : "border-white/5 bg-white/[0.025] opacity-55"
                }`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${index <= phase ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-slate-400"}`}>
                  {index < phase ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span>
                  <b className="block text-sm">{item.label}</b>
                  <small className="text-slate-400">{item.detail}</small>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={start}
              disabled={running}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-orange-500 px-6 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-400 disabled:opacity-60"
            >
              <Play className="h-4 w-4" /> {running ? "Simulation running" : "Run arrival simulation"}
            </button>
            <button type="button" onClick={reset} className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>

        <div className="sensor-stage" aria-live="polite">
          <div className="sensor-stage-head">
            <span><Activity className="h-4 w-4" /> EDGE NODE P-042</span>
            <span className={occupied ? "text-orange-300" : "text-emerald-300"}>
              {occupied ? "OCCUPIED" : "VACANT"}
            </span>
          </div>

          <div className="sensor-world">
            <div className="sensor-beam" data-active={phase >= 1} />
            <div className="sensor-device">
              <Satellite className="h-5 w-5" />
              <i /><i /><i />
            </div>
            <div className="sensor-bay" data-occupied={occupied}>
              <span>P-042</span>
              <b>{occupied ? "OCCUPIED" : "VACANT"}</b>
            </div>
            <div className="sim-car" data-phase={phase}>
              <Car className="h-12 w-12" />
            </div>
            <div className="sensor-gate" data-open={phase >= 2}>
              <ScanLine className="h-4 w-4" />
            </div>
          </div>

          <div className="sensor-telemetry">
            <div><span>ULTRASONIC</span><b>{occupied ? "32 cm" : "248 cm"}</b></div>
            <div><span>CONFIDENCE</span><b>{phase === 0 ? "99.2%" : phase < 3 ? "Analyzing" : "99.8%"}</b></div>
            <div><span>SYNC LATENCY</span><b>{phase >= 4 ? "84 ms" : "—"}</b></div>
          </div>

          <div className={`sensor-event-toast ${phase >= 4 ? "is-visible" : ""}`}>
            <Check className="h-4 w-4" /> Occupancy event broadcast to all dashboards
          </div>
        </div>
      </div>
    </section>
  );
}
