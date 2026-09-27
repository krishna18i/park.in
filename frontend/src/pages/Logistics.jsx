import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  Radio,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Button, Card, Field, Input, Spinner } from "../components/ui";
import { fromLocalInput, money, toLocalInput } from "../lib/format";

const CARGO = [
  ["Retail supplies", Box],
  ["Food & perishables", PackageCheck],
  ["Courier parcels", Warehouse],
  ["Service equipment", ShieldCheck],
];

function defaultWindow() {
  const start = new Date(Date.now() + 15 * 60_000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  return {
    start: toLocalInput(start),
    end: toLocalInput(new Date(start.getTime() + 45 * 60_000)),
  };
}

export default function Logistics() {
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedBay, setSelectedBay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cargo, setCargo] = useState("Retail supplies");
  const [vehicle, setVehicle] = useState("");
  const [reference, setReference] = useState("");
  const initial = useMemo(defaultWindow, []);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locations = await api.locations();
        const withBays = await Promise.all(locations.map(async (location) => {
          const slots = await api.slots(location.id);
          const loadingBays = slots.filter((slot) => slot.kind === "heavy");
          return { ...location, loadingBays, freeLoadingBays: loadingBays.filter((slot) => slot.status === "vacant") };
        }));
        if (!cancelled) {
          const usable = withBays.filter((zone) => zone.loadingBays.length);
          setZones(usable);
          setSelectedZone(usable[0] || null);
        }
      } catch (error) {
        if (!cancelled) toast.error(error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => { setSelectedBay(null); }, [selectedZone?.id]);

  const minutes = Math.round((fromLocalInput(end) - fromLocalInput(start)) / 60_000);
  const durationValid = Number.isFinite(minutes) && minutes >= 15 && minutes <= 120;
  const estimatedAmount = selectedZone && durationValid
    ? Math.max(1, Math.ceil((minutes / 60) / 0.5) * 0.5) * selectedZone.price_per_hour
    : 0;

  const reserve = async (event) => {
    event.preventDefault();
    if (!selectedBay || !selectedZone) return;
    if (!durationValid) {
      toast.error("Choose a loading window between 15 minutes and 2 hours");
      return;
    }
    setBusy(true);
    try {
      const booking = await api.createBooking({
        slot_id: selectedBay.id,
        vehicle_number: vehicle,
        start_time: fromLocalInput(start).toISOString(),
        end_time: fromLocalInput(end).toISOString(),
        booking_type: "logistics",
        cargo_type: cargo,
        delivery_reference: reference,
        valet: false,
      });
      toast.success(`Loading bay ${booking.slot_code} held for your delivery`);
      navigate(`/checkout/${booking.id}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading city logistics zones" />;

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="logistics-hero">
        <div className="logistics-road" aria-hidden="true"><i /><i /><i /></div>
        <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-orange-200"><Radio className="h-3.5 w-3.5" /> Urban logistics network</span>
          <div className="mt-6 grid gap-9 lg:grid-cols-[1fr_.7fr] lg:items-end">
            <div><h1 className="max-w-4xl font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">Deliver goods.<br /><span className="text-orange-400">Not congestion.</span></h1><p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">Reserve a legal loading window before arrival, verify at the gate and keep city curbs moving.</p></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="logistics-hero-stat"><b>{zones.reduce((sum, zone) => sum + zone.freeLoadingBays.length, 0)}</b><span>Free bays</span></div>
              <div className="logistics-hero-stat"><b>120</b><span>Max minutes</span></div>
              <div className="logistics-hero-stat"><b>QR</b><span>Verified entry</span></div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-9 grid gap-3 sm:grid-cols-3">
          {[[MapPin, "1. Choose zone", "Pick capacity nearest your delivery"], [Clock3, "2. Reserve window", "15–120 minutes of controlled dwell"], [CheckCircle2, "3. Verify and unload", "QR check-in keeps the event auditable"]].map(([Icon, title, body]) => <div key={title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-cyan-300"><Icon className="h-4 w-4" /></span><span><b className="block text-sm text-slate-950">{title}</b><small className="text-xs text-slate-500">{body}</small></span></div>)}
        </div>

        <form onSubmit={reserve} className="grid gap-7 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-6">
            <section><div className="mb-4 flex items-end justify-between"><div><span className="section-kicker">LOADING ZONES</span><h2 className="mt-2 font-display text-2xl font-bold text-slate-950">Choose a logistics node</h2></div><span className="text-xs text-slate-500">Live availability</span></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {zones.map((zone) => <button key={zone.id} type="button" onClick={() => setSelectedZone(zone)} className={`rounded-2xl border-2 p-5 text-left transition ${selectedZone?.id === zone.id ? "border-cyan-500 bg-cyan-50 shadow-lg shadow-cyan-900/5" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-orange-300"><Warehouse className="h-5 w-5" /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${zone.freeLoadingBays.length ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{zone.freeLoadingBays.length} FREE</span></div><h3 className="mt-4 font-display text-lg font-bold text-slate-950">{zone.name}</h3><p className="mt-1 flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{zone.address}</p><p className="mt-4 text-xs font-semibold text-slate-700">{zone.loadingBays.length} loading bays · {money(zone.price_per_hour)}/hr</p></button>)}
              </div>
            </section>

            {selectedZone && <section><h2 className="font-display text-xl font-bold text-slate-950">Select a heavy/loading bay</h2><div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">{selectedZone.loadingBays.map((bay) => { const free = bay.status === "vacant"; return <button key={bay.id} type="button" disabled={!free} onClick={() => setSelectedBay(bay)} className={`relative min-h-20 rounded-xl border-2 font-display font-bold transition ${selectedBay?.id === bay.id ? "border-orange-500 bg-orange-50 text-orange-700 shadow-md" : free ? "border-emerald-200 bg-white text-slate-800 hover:border-emerald-400" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}><Truck className="mx-auto mb-1 h-5 w-5" />{bay.code}<small className="block font-sans text-[9px] font-semibold uppercase">{free ? "Available" : bay.status}</small></button>; })}</div></section>}
          </div>

          <Card className="h-fit border-slate-200 p-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between"><div><span className="text-[10px] font-extrabold tracking-[.16em] text-orange-600">DELIVERY WINDOW</span><h2 className="mt-1 font-display text-2xl font-bold text-slate-950">Reservation details</h2></div><Truck className="h-7 w-7 text-slate-400" /></div>
            <div className="mt-6 space-y-5">
              <Field label="Commercial vehicle number" htmlFor="logistics-vehicle"><Input id="logistics-vehicle" required placeholder="RJ14AB1234" value={vehicle} onChange={(event) => setVehicle(event.target.value)} /></Field>
              <div><span className="mb-2 block text-sm font-semibold text-slate-700">Cargo type</span><div className="grid grid-cols-2 gap-2">{CARGO.map(([label, Icon]) => <button key={label} type="button" onClick={() => setCargo(label)} className={`flex min-h-16 items-center gap-2 rounded-xl border-2 px-3 text-left text-xs font-semibold transition ${cargo === label ? "border-orange-400 bg-orange-50 text-orange-800" : "border-slate-200"}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>)}</div></div>
              <Field label="Manifest / delivery reference" hint="Optional, visible to the gate operator" htmlFor="delivery-reference"><Input id="delivery-reference" maxLength={80} placeholder="INV-2026-1042" value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Arrival" htmlFor="logistics-start"><Input id="logistics-start" required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label="Departure" htmlFor="logistics-end"><Input id="logistics-end" required type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></Field></div>
              <div className={`rounded-xl border p-4 ${durationValid ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Controlled dwell</span><b className={durationValid ? "text-emerald-700" : "text-red-700"}>{Number.isFinite(minutes) ? `${minutes} min` : "—"}</b></div><p className="mt-1 text-xs text-slate-500">Maximum 120 minutes protects curb turnover.</p></div>
              <div className="flex items-end justify-between border-t border-slate-200 pt-5"><span><small className="block text-xs text-slate-500">Estimated total</small><b className="font-display text-2xl text-slate-950">{money(estimatedAmount)}</b></span><span className="text-right text-xs text-slate-500">Bay<br /><b className="text-slate-800">{selectedBay?.code || "Not selected"}</b></span></div>
              <Button type="submit" busy={busy} disabled={!selectedBay || !durationValid} className="w-full">Reserve loading window <ArrowRight className="h-4 w-4" /></Button>
              <p className="text-center text-[10px] leading-relaxed text-slate-400">Overstay alerts begin after the reserved departure time. The authority retains manual override control.</p>
            </div>
          </Card>
        </form>
      </main>
    </div>
  );
}
