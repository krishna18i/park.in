import { Activity, MapPin, Navigation, Radio, Truck, Zap } from "lucide-react";

const NODES = [
  { x: 16, y: 22, label: "North hub", tone: "cyan" },
  { x: 76, y: 18, label: "EV zone", tone: "orange" },
  { x: 56, y: 72, label: "Logistics", tone: "cyan" },
  { x: 22, y: 76, label: "Civic zone", tone: "orange" },
];

export default function UrbanNetworkVisual({ free = 0 }) {
  return (
    <div className="network-console" aria-label="Live urban mobility network visualization">
      <div className="network-grid" aria-hidden="true" />
      <svg className="network-routes" viewBox="0 0 100 100" aria-hidden="true">
        <path d="M 8 28 C 30 18, 40 42, 52 48 S 76 56, 94 34" />
        <path d="M 12 82 C 30 66, 42 74, 55 55 S 72 26, 91 18" />
        <path d="M 24 8 C 28 30, 46 32, 42 51 S 38 82, 72 91" />
      </svg>

      {NODES.map((node, index) => (
        <div
          key={node.label}
          className={`network-node network-node-${node.tone}`}
          style={{ left: `${node.x}%`, top: `${node.y}%`, animationDelay: `${index * 350}ms` }}
          aria-hidden="true"
        >
          <span />
        </div>
      ))}

      <div className="route-vehicle route-car" aria-hidden="true">
        <Navigation className="h-3.5 w-3.5" />
      </div>
      <div className="route-vehicle route-truck" aria-hidden="true">
        <Truck className="h-3.5 w-3.5" />
      </div>

      <div className="network-topbar">
        <span className="inline-flex items-center gap-2">
          <Radio className="h-4 w-4 text-cyan-300" />
          CITY NETWORK / LIVE
        </span>
        <span className="network-signal"><i /><i /><i /><i /></span>
      </div>

      <div className="network-card network-card-main">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Network availability
          </span>
          <Activity className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-2 font-display text-4xl font-bold text-white">{free || 126}</p>
        <p className="mt-1 text-xs text-slate-300">bays ready across the active grid</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" />
        </div>
      </div>

      <div className="network-card network-card-alert">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-400/15 text-orange-300">
          <Zap className="h-4 w-4" />
        </span>
        <span>
          <b className="block text-xs text-white">Demand shift detected</b>
          <small className="text-[10px] text-slate-400">Diversion ready · 2 routes</small>
        </span>
      </div>

      <div className="network-card network-card-route">
        <MapPin className="h-4 w-4 text-cyan-300" />
        <span>
          <b className="block text-xs text-white">ParkScore 94</b>
          <small className="text-[10px] text-slate-400">6 min · low congestion</small>
        </span>
      </div>
    </div>
  );
}
