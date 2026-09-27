import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  Building2,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudCog,
  Fuel,
  Gauge,
  Leaf,
  Navigation,
  Radio,
  RefreshCw,
  Route,
  Satellite,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Truck,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import CityNetworkMap from "../components/CityNetworkMap";
import { Spinner } from "../components/ui";

function pressureFor(value) {
  if (value >= 90) return "critical";
  if (value >= 75) return "high";
  if (value >= 55) return "moderate";
  return "stable";
}

function pct(location) {
  return location.total_slots
    ? Math.round(((location.total_slots - location.available_slots) / location.total_slots) * 100)
    : 0;
}

function timeLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CommandStat({ icon: Icon, label, value, sub, tone = "cyan" }) {
  return (
    <div className="command-stat">
      <span className={`command-stat-icon command-stat-${tone}`}><Icon className="h-5 w-5" /></span>
      <div><p>{label}</p><b>{value}</b><small>{sub}</small></div>
    </div>
  );
}

function PressureBadge({ level }) {
  return <span className={`pressure-badge pressure-${level}`}><i />{level}</span>;
}

function MiniForecast({ hours }) {
  const items = (hours || []).slice(0, 12);
  if (!items.length) return <div className="py-10 text-center text-sm text-slate-500">Forecast unavailable</div>;
  return (
    <div className="forecast-bars" aria-label="Next 12 hours occupancy forecast">
      {items.map((item, index) => (
        <div key={`${item.hour}-${index}`} className="forecast-column" title={`${item.label || timeLabel(item.hour)}: ${Math.round(item.occupancy_pct)}%`}>
          <span>{Math.round(item.occupancy_pct)}%</span>
          <div><i style={{ height: `${Math.max(8, item.occupancy_pct)}%` }} data-band={item.band} /></div>
          <small>{index % 2 === 0 ? (item.label || timeLabel(item.hour)) : ""}</small>
        </div>
      ))}
    </div>
  );
}

export default function CityCommand() {
  const [nodes, setNodes] = useState([]);
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [sensorEvents, setSensorEvents] = useState([]);
  const [sensorSlotId, setSensorSlotId] = useState("");
  const [sensorBusy, setSensorBusy] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allocationKind, setAllocationKind] = useState("heavy");
  const [allocationMinutes, setAllocationMinutes] = useState(120);
  const [allocationReason, setAllocationReason] = useState("Predicted demand intervention");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [acknowledged, setAcknowledged] = useState(new Set());
  const toast = useToast();
  const refreshTimer = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [locations, adminStats, allBookings, recentSensorEvents, activeAllocations, openIncidents] = await Promise.all([api.locations(), api.stats(), api.allBookings(), api.sensorEvents(12), api.allocations(true), api.incidents("open")]);
      const enriched = await Promise.all(locations.map(async (location) => {
        const [forecast, slots] = await Promise.all([
          api.predictOccupancy(location.id).catch(() => ({ hours: [], hint: "Forecast unavailable", model: "offline" })),
          api.slots(location.id).catch(() => []),
        ]);
        const occupancy = pct(location);
        const peakPoint = forecast.hours.reduce((best, item) => item.occupancy_pct > (best?.occupancy_pct ?? -1) ? item : best, null);
        const peak = peakPoint?.occupancy_pct ?? occupancy;
        const locationEvents = recentSensorEvents.filter((event) => event.location_id === location.id);
        return {
          ...location,
          occupancy,
          forecast,
          peak,
          peakAt: peakPoint?.label || peakPoint?.hour,
          pressure: pressureFor(Math.max(occupancy, peak)),
          evBays: slots.filter((slot) => slot.kind === "ev").length,
          logisticsBays: slots.filter((slot) => slot.kind === "heavy").length,
          occupiedKinds: slots.filter((slot) => slot.status !== "vacant").length,
          sensorHealth: locationEvents.length
            ? Math.round(locationEvents.reduce((sum, event) => sum + event.confidence * 100, 0) / locationEvents.length)
            : null,
          slots,
        };
      }));
      setNodes(enriched);
      setStats(adminStats);
      setBookings(allBookings);
      setSensorEvents(recentSensorEvents);
      setAllocations(activeAllocations);
      setIncidents(openIncidents);
      setSelectedId((current) => current || enriched[0]?.id || null);
      setUpdatedAt(new Date());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  const queueRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => load({ quiet: true }), 300);
  }, [load]);
  useLiveEvent("slot.updated", queueRefresh);
  useLiveEvent("location.updated", queueRefresh);
  useLiveEvent("location.created", queueRefresh);
  useLiveEvent("location.deleted", queueRefresh);
  useLiveEvent("sensor.event", queueRefresh);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const ordered = useMemo(() => [...nodes].sort((a, b) => Math.max(b.occupancy, b.peak) - Math.max(a.occupancy, a.peak)), [nodes]);
  const selected = nodes.find((node) => node.id === selectedId) || nodes[0];
  useEffect(() => {
    if (!selected?.slots?.some((slot) => slot.id === sensorSlotId)) {
      setSensorSlotId(selected?.slots?.find((slot) => slot.status !== "reserved")?.id || "");
    }
  }, [selected, sensorSlotId]);
  const sensorSlot = selected?.slots?.find((slot) => slot.id === sensorSlotId);
  const source = ordered.find((node) => node.pressure === "critical" || node.pressure === "high") || ordered[0];
  const target = [...nodes].filter((node) => node.id !== source?.id && node.available_slots > 0).sort((a, b) => a.occupancy - b.occupancy)[0];
  const diversion = source && target ? { from: source, to: target } : null;
  const totalEv = nodes.reduce((sum, node) => sum + node.evBays, 0);
  const logistics = nodes.reduce((sum, node) => sum + node.logisticsBays, 0);
  const activeLogistics = bookings.filter((booking) => booking.booking_type === "logistics" && ["pending", "confirmed", "active"].includes(booking.status));
  const overdueLogistics = activeLogistics.filter((booking) => booking.status === "active" && new Date(booking.end_time).getTime() < Date.now());
  const sensorHealthValues = nodes.map((node) => node.sensorHealth).filter((value) => value != null);
  const critical = nodes.filter((node) => node.pressure === "critical" || node.pressure === "high");
  const modelledKm = Math.max(0, Math.round((stats?.total_bookings || 0) * 1.7));
  const impact = {
    minutes: Math.round(modelledKm * 4.2),
    fuel: Math.round(modelledKm * 0.075),
    co2: Math.round(modelledKm * 0.17),
  };

  const alerts = [
    ...critical.map((node) => ({ id: `pressure-${node.id}`, severity: node.pressure, title: `${node.name} approaching saturation`, body: `${node.occupancy}% now · predicted peak ${Math.round(node.peak)}%${node.peakAt ? ` at ${timeLabel(node.peakAt)}` : ""}`, icon: AlertTriangle })),
    ...nodes.filter((node) => node.sensorHealth != null && node.sensorHealth < 95).map((node) => ({ id: `sensor-${node.id}`, severity: "moderate", title: `Sensor confidence degraded at ${node.name}`, body: `${node.sensorHealth}% average confidence · manual verification recommended`, icon: WifiOff })),
    ...overdueLogistics.map((booking) => ({ id: `overstay-${booking.id}`, severity: "critical", title: `Loading-zone overstay · ${booking.vehicle_number}`, body: `${booking.location_name} bay ${booking.slot_code} · reserved departure ${timeLabel(booking.end_time)}`, icon: Truck })),
  ];

  const simulateSensor = async (observedStatus) => {
    if (!sensorSlot || !selected) return;
    setSensorBusy(true);
    try {
      const event = await api.sensorEvent({
        device_id: `EDGE-${selected.id.slice(0, 6).toUpperCase()}-${sensorSlot.code}`,
        slot_id: sensorSlot.id,
        observed_status: observedStatus,
        distance_cm: observedStatus === "occupied" ? 32 : 248,
        confidence: 0.998,
        source: "ultrasonic",
      });
      setSensorEvents((current) => [event, ...current].slice(0, 12));
      toast.success(`${sensorSlot.code}: ${event.action.replaceAll("_", " ")}`);
      await load({ quiet: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSensorBusy(false);
    }
  };

  const allocateBay = async () => {
    if (!sensorSlot) return;
    setSensorBusy(true);
    try {
      await api.createAllocation({ slot_id: sensorSlot.id, allocated_kind: allocationKind, reason: allocationReason, duration_minutes: Number(allocationMinutes) });
      toast.success(`${sensorSlot.code} temporarily allocated as ${allocationKind}`);
      await load({ quiet: true });
    } catch (error) { toast.error(error.message); }
    finally { setSensorBusy(false); }
  };

  const revertAllocation = async (id) => {
    try { await api.revertAllocation(id); toast.success("Allocation restored to its original use"); await load({ quiet: true }); }
    catch (error) { toast.error(error.message); }
  };

  const resolveIncident = async (id) => {
    try { await api.resolveIncident(id); toast.success("Incident resolved"); await load({ quiet: true }); }
    catch (error) { toast.error(error.message); }
  };

  if (loading) return <div className="min-h-[70vh] bg-slate-950"><Spinner label="Connecting to city network" /></div>;

  return (
    <div className="min-h-screen bg-[#07101f] text-slate-100">
      <header className="command-header">
        <div>
          <span className="command-eyebrow"><Building2 className="h-3.5 w-3.5" /> CITY AUTHORITY VIEW</span>
          <h1>Urban Mobility Command Centre</h1>
          <p>Network intelligence, predictive pressure and coordinated intervention.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="command-live"><i /> LIVE · {updatedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <button type="button" onClick={() => load({ quiet: true })} className="command-button"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <CommandStat icon={Gauge} label="Network occupancy" value={`${stats?.occupancy_rate ?? 0}%`} sub={`${stats?.vacant_slots ?? 0} bays available`} />
          <CommandStat icon={Activity} label="Pressure zones" value={critical.length} sub={critical.length ? "Intervention recommended" : "Network operating normally"} tone={critical.length ? "orange" : "green"} />
          <CommandStat icon={Truck} label="Logistics capacity" value={logistics} sub={`${activeLogistics.length} active reservations · ${overdueLogistics.length} overstay`} tone={overdueLogistics.length ? "orange" : "green"} />
          <CommandStat icon={BatteryCharging} label="EV capacity" value={totalEv} sub="Electrified bays online" tone="green" />
          <CommandStat icon={Wifi} label="Sensor confidence" value={sensorHealthValues.length ? `${Math.round(sensorHealthValues.reduce((sum, value) => sum + value, 0) / sensorHealthValues.length)}%` : "Awaiting"} sub={sensorHealthValues.length ? `${sensorHealthValues.length} zones reporting` : "Run Sensor Lab to establish feed"} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
          <div className="command-panel overflow-hidden">
            <div className="command-panel-head"><div><span>LIVE GEOSPATIAL NETWORK</span><h2>Mobility pressure map</h2></div><div className="command-chip"><Radio className="h-3.5 w-3.5" /> {nodes.length} connected zones</div></div>
            <CityNetworkMap nodes={nodes} diversion={diversion} selectedId={selected?.id} onSelect={setSelectedId} />
          </div>

          <div className="command-panel flex flex-col">
            <div className="command-panel-head"><div><span>DECISION ENGINE</span><h2>Recommended intervention</h2></div><Sparkles className="h-5 w-5 text-cyan-300" /></div>
            {diversion ? (
              <div className="flex flex-1 flex-col p-5">
                <div className="rounded-2xl border border-orange-400/20 bg-orange-400/[0.07] p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-orange-300">PRESSURE SOURCE</span>
                  <div className="mt-3 flex items-center justify-between"><div><b className="block text-lg">{diversion.from.name}</b><small className="text-slate-400">{diversion.from.available_slots} bays remaining</small></div><PressureBadge level={diversion.from.pressure} /></div>
                </div>
                <div className="grid place-items-center py-3"><ArrowRight className="h-5 w-5 rotate-90 text-cyan-300" /></div>
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-300">DIVERSION TARGET</span>
                  <div className="mt-3 flex items-center justify-between"><div><b className="block text-lg">{diversion.to.name}</b><small className="text-slate-400">{diversion.to.available_slots} bays ready · {diversion.to.occupancy}% occupied</small></div><Navigation className="h-6 w-6 text-cyan-300" /></div>
                </div>
                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />Divert new arrivals before the predicted peak.</p>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />Preserve heavy-vehicle capacity for timed logistics.</p>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />Push route recommendation to driver search.</p>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-center">
                  <div><b className="block text-sm text-cyan-300">+{Math.max(0, diversion.to.available_slots - diversion.from.available_slots)}</b><small className="text-[9px] text-slate-500">Capacity gain</small></div>
                  <div><b className="block text-sm text-cyan-300">-{Math.max(0, diversion.from.occupancy - diversion.to.occupancy)}%</b><small className="text-[9px] text-slate-500">Pressure shift</small></div>
                  <div><b className="block text-sm text-cyan-300">ParkScore</b><small className="text-[9px] text-slate-500">Aligned ranking</small></div>
                </div>
                <button type="button" onClick={() => toast.success(`Diversion advisory prepared: ${diversion.from.name} → ${diversion.to.name}`)} className="mt-auto command-action"><Route className="h-4 w-4" /> Prepare diversion advisory</button>
                <p className="mt-2 text-center text-[10px] text-slate-500">Human approval required before public routing changes</p>
              </div>
            ) : <div className="grid flex-1 place-items-center p-8 text-center text-slate-400"><div><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-300" /><p className="mt-3">Capacity is balanced across the network.</p></div></div>}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="command-panel">
            <div className="command-panel-head"><div><span>PREDICTIVE LAYER</span><h2>{selected?.name || "Zone"} · next 12 hours</h2></div>{selected && <PressureBadge level={selected.pressure} />}</div>
            <div className="p-5"><MiniForecast hours={selected?.forecast?.hours} /><p className="mt-4 flex items-start gap-2 border-t border-white/[0.07] pt-4 text-xs text-slate-400"><CloudCog className="h-4 w-4 shrink-0 text-cyan-300" />{selected?.forecast?.hint || "Forecast built from historical occupancy patterns."} Model: {selected?.forecast?.model || "unknown"}.</p></div>
          </div>

          <div className="command-panel">
            <div className="command-panel-head"><div><span>ACTION QUEUE</span><h2>Network alerts</h2></div><span className="command-alert-count">{alerts.filter((alert) => !acknowledged.has(alert.id)).length}</span></div>
            <div className="max-h-[330px] space-y-2 overflow-y-auto p-4">
              {alerts.length ? alerts.map((alert) => {
                const Icon = alert.icon;
                const done = acknowledged.has(alert.id);
                return (
                  <div key={alert.id} className={`command-alert ${done ? "opacity-40" : ""}`}>
                    <span className={`command-alert-icon pressure-${alert.severity}`}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><b>{alert.title}</b><p>{alert.body}</p></div>
                    <button type="button" onClick={() => setAcknowledged((current) => new Set(current).add(alert.id))} aria-label={`Acknowledge ${alert.title}`}><X className="h-4 w-4" /></button>
                  </div>
                );
              }) : <div className="py-14 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">No active network alerts</p></div>}
            </div>
          </div>
        </section>

        <section className="command-panel">
          <div className="command-panel-head"><div><span>HARDWARE-IN-THE-LOOP DEMO</span><h2>Sensor Lab · authenticated event pipeline</h2></div><span className="command-chip"><Radio className="h-3.5 w-3.5" /> WebSocket linked</span></div>
          <div className="grid lg:grid-cols-[.8fr_1.2fr]">
            <div className="border-b border-white/[0.07] p-5 lg:border-b-0 lg:border-r">
              <p className="text-xs leading-relaxed text-slate-400">Choose a real bay and publish an ultrasonic observation. The backend authenticates, audits and reconciles it before changing network state.</p>
              <div className="mt-5">
                <label className="text-[10px] font-extrabold uppercase tracking-[.14em] text-slate-500">Zone</label>
                <select value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-slate-200 outline-none focus:border-cyan-400">
                  {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select>
              </div>
              <div className="mt-4">
                <span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-slate-500">Physical bay</span>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {(selected?.slots || []).slice(0, 15).map((slot) => <button key={slot.id} type="button" disabled={slot.status === "reserved"} onClick={() => setSensorSlotId(slot.id)} className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${sensorSlotId === slot.id ? "border-cyan-300 bg-cyan-300/10 text-cyan-200" : slot.status === "reserved" ? "cursor-not-allowed border-white/5 text-slate-700" : "border-white/10 text-slate-400 hover:border-white/25"}`}>{slot.code}<small className="mt-0.5 block text-[8px] font-medium uppercase">{slot.status}</small></button>)}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" disabled={!sensorSlot || sensorBusy} onClick={() => simulateSensor("occupied")} className="sensor-lab-button sensor-lab-arrive"><Car className="h-4 w-4" /> Simulate arrival<small>32 cm · 99.8%</small></button>
                <button type="button" disabled={!sensorSlot || sensorBusy} onClick={() => simulateSensor("vacant")} className="sensor-lab-button sensor-lab-leave"><Route className="h-4 w-4" /> Simulate departure<small>248 cm · 99.8%</small></button>
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between"><div><span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-slate-500">Immutable audit stream</span><p className="mt-1 text-xs text-slate-400">Latest device observations and reconciliation decisions</p></div><Activity className="h-5 w-5 text-cyan-300" /></div>
              <div className="mt-4 max-h-[365px] space-y-2 overflow-y-auto">
                {sensorEvents.length ? sensorEvents.map((event) => <div key={event.id} className="sensor-audit-row"><span className={`sensor-audit-state ${event.observed_status === "occupied" ? "is-occupied" : "is-vacant"}`}><i />{event.observed_status}</span><div className="min-w-0 flex-1"><b>{event.location_name || event.location_id} · {event.slot_code || event.slot_id.slice(0, 6)}</b><p>{event.action.replaceAll("_", " ")} · {(event.confidence * 100).toFixed(1)}% confidence</p></div><span className="text-right"><b className={event.applied ? "text-emerald-300" : "text-slate-500"}>{event.applied ? "APPLIED" : "RECORDED"}</b><small>{new Date(event.received_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></span></div>) : <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-white/10 text-center"><div><Satellite className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-2 text-xs text-slate-500">No sensor events yet. Run the first simulation.</p></div></div>}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="command-panel">
            <div className="command-panel-head"><div><span>DYNAMIC CURB POLICY</span><h2>Temporary infrastructure allocation</h2></div><Zap className="h-5 w-5 text-orange-300" /></div>
            <div className="p-5">
              <p className="text-xs leading-relaxed text-slate-400">Convert a vacant bay for a defined public need. Every change expires automatically and retains a complete authority audit trail.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Selected bay<select value={sensorSlotId} onChange={(event) => setSensorSlotId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm normal-case text-slate-200">{(selected?.slots || []).map((slot) => <option key={slot.id} value={slot.id}>{slot.code} · {slot.kind} · {slot.status}</option>)}</select></label>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Allocate as<select value={allocationKind} onChange={(event) => setAllocationKind(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm normal-case text-slate-200"><option value="heavy">Loading / logistics</option><option value="ev">EV charging</option><option value="accessible">Accessible priority</option><option value="emergency">Emergency response</option></select></label>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Duration<select value={allocationMinutes} onChange={(event) => setAllocationMinutes(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm normal-case text-slate-200"><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option><option value="480">8 hours</option></select></label>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Authority reason<input value={allocationReason} onChange={(event) => setAllocationReason(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm normal-case text-slate-200 outline-none focus:border-cyan-400" /></label>
              </div>
              <button type="button" disabled={sensorBusy || !sensorSlot || sensorSlot.status !== "vacant" || allocationReason.trim().length < 5} onClick={allocateBay} className="command-action w-full disabled:cursor-not-allowed disabled:opacity-40"><Zap className="h-4 w-4" /> Apply governed allocation</button>
              <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4">
                {allocations.length ? allocations.map((allocation) => <div key={allocation.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-orange-400/10 text-orange-300"><Zap className="h-4 w-4" /></span><div className="min-w-0 flex-1"><b className="block truncate text-xs">{allocation.location_name} · {allocation.slot_code}</b><p className="mt-0.5 text-[10px] text-slate-500">{allocation.previous_kind} → {allocation.allocated_kind} · until {new Date(allocation.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><small className="text-[9px] text-slate-600">{allocation.reason}</small></div><button type="button" onClick={() => revertAllocation(allocation.id)} className="rounded-full border border-white/10 px-3 py-1.5 text-[9px] font-bold text-slate-300 hover:bg-white/10">REVERT</button></div>) : <p className="py-4 text-center text-xs text-slate-600">No temporary allocations active</p>}
              </div>
            </div>
          </div>

          <div className="command-panel">
            <div className="command-panel-head"><div><span>RESPONSE WORKFLOW</span><h2>Operational incidents</h2></div><span className="command-alert-count">{incidents.length}</span></div>
            <div className="max-h-[520px] space-y-2 overflow-y-auto p-4">
              {incidents.length ? incidents.map((incident) => <div key={incident.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-start gap-3"><span className={`command-alert-icon pressure-${incident.severity}`}><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-slate-200">{incident.category.replaceAll("_", " ")}</b><PressureBadge level={incident.severity} /></div><p className="mt-1 text-xs leading-relaxed text-slate-400">{incident.description}</p><small className="mt-2 block text-[9px] uppercase tracking-wide text-slate-600">{incident.location_name}{incident.slot_code ? ` · Bay ${incident.slot_code}` : ""} · {incident.source}</small></div></div><button type="button" onClick={() => resolveIncident(incident.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-[9px] font-bold text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Mark resolved</button></div>) : <div className="grid min-h-56 place-items-center text-center"><div><ShieldCheck className="mx-auto h-9 w-9 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">No open operational incidents</p><small className="text-[10px] text-slate-600">Unauthorized sensor presence will appear here automatically.</small></div></div>}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="command-panel lg:col-span-2">
            <div className="command-panel-head"><div><span>MODELED OUTCOME</span><h2>Estimated city impact</h2></div><span className="command-chip"><Leaf className="h-3.5 w-3.5" /> Transparent estimates</span></div>
            <div className="grid gap-px bg-white/[0.07] sm:grid-cols-3">
              {[[Clock3, `${impact.minutes.toLocaleString()} min`, "Search time avoided", "4.2 min per guided km"], [Fuel, `${impact.fuel} L`, "Fuel conserved", "0.075 L per avoided km"], [Leaf, `${impact.co2} kg`, "CO₂ avoided", "0.17 kg per avoided km"]].map(([Icon, value, label, note]) => (
                <div key={label} className="bg-[#0b1628] p-6"><Icon className="h-5 w-5 text-emerald-300" /><b className="mt-5 block font-display text-3xl">{value}</b><span className="mt-1 block text-sm text-slate-300">{label}</span><small className="mt-3 block text-[10px] text-slate-500">Estimated · {note}</small></div>
              ))}
            </div>
          </div>

          <div className="command-panel">
            <div className="command-panel-head"><div><span>INFRASTRUCTURE</span><h2>Edge network</h2></div><ServerCog className="h-5 w-5 text-cyan-300" /></div>
            <div className="space-y-3 p-5">
              {nodes.map((node) => <button key={node.id} type="button" onClick={() => setSelectedId(node.id)} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-left transition hover:bg-white/[0.06]"><span className={`grid h-8 w-8 place-items-center rounded-lg ${node.sensorHealth == null ? "bg-slate-400/10 text-slate-500" : node.sensorHealth < 95 ? "bg-orange-400/10 text-orange-300" : "bg-emerald-400/10 text-emerald-300"}`}>{node.sensorHealth == null || node.sensorHealth < 95 ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs">{node.name}</b><small className="text-[10px] text-slate-500">{node.sensorHealth == null ? "Awaiting telemetry" : `${node.sensorHealth}% confidence`}</small></span><ChevronRight className="h-4 w-4 text-slate-600" /></button>)}
            </div>
          </div>
        </section>

        <p className="pb-4 text-center text-[10px] text-slate-600">Park.in Command Centre · operational data is live; environmental outcomes are explicitly modelled estimates.</p>
      </main>
    </div>
  );
}
