import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Car,
  Leaf,
  MapPin,
  Network,
  Radio,
  Route,
  ShieldCheck,
  Truck,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, Photo, Spinner } from "../components/ui";
import LotsMap from "../components/LotsMap";
import SearchBay from "../components/SearchBay";
import UrbanNetworkVisual from "../components/UrbanNetworkVisual";
import SensorSimulation from "../components/SensorSimulation";
import { money } from "../lib/format";

const PLATFORM_FEATURES = [
  {
    icon: Route,
    eyebrow: "PREDICT",
    title: "Demand before congestion",
    body: "Forecast occupancy, identify pressure zones and redirect arrivals before a road starts choking.",
  },
  {
    icon: Truck,
    eyebrow: "ALLOCATE",
    title: "One curb, many needs",
    body: "Coordinate car, EV and heavy-vehicle capacity today—with timed logistics zones next.",
  },
  {
    icon: Network,
    eyebrow: "SYNCHRONIZE",
    title: "Every stakeholder, live",
    body: "One event updates the driver, gate operator and city network without refreshing a screen.",
  },
];

const STAKEHOLDERS = [
  { icon: Car, label: "DRIVERS", title: "Find, reserve and arrive", body: "Guided parking with live capacity, exact bays, QR entry and transparent pricing." },
  { icon: Truck, label: "LOGISTICS", title: "Move goods without blocking roads", body: "Heavy-vehicle bays create the foundation for scheduled loading and delivery windows." },
  { icon: ShieldCheck, label: "OPERATORS", title: "Run every bay in real time", body: "Gate automation, live layouts, incidents, pricing, feedback and revenue in one console." },
  { icon: Building2, label: "CITY AUTHORITIES", title: "Intervene where pressure forms", body: "Network visibility, predictive alerts and data-backed diversion recommendations." },
];

function LocationCard({ location, onOpen, index, t }) {
  const soldOut = location.available_slots === 0;
  return (
    <button
      onClick={() => onOpen(location)}
      className="group animate-rise relative h-72 overflow-hidden rounded-3xl border border-slate-200 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <Photo src={location.image_url} alt={location.name} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex justify-between p-4">
        <span className="rounded-full border border-white/15 bg-slate-950/45 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">
          Live node
        </span>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur-sm ${soldOut ? "bg-red-500/90 text-white" : "bg-emerald-400 text-slate-950"}`}>
          {soldOut ? t("home.full") : t("home.free", { n: location.available_slots })}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 text-white">
        <h3 className="font-display text-2xl font-bold">{location.name}</h3>
        <p className="flex items-center gap-1.5 text-xs text-slate-200"><MapPin className="h-3.5 w-3.5" /><span className="truncate">{location.address}</span></p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-semibold">{money(location.price_per_hour)}<span className="text-xs font-normal opacity-75"> {t("home.hour")}</span></span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold">Open node <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const refreshTimer = useRef(null);

  const load = useCallback(async () => {
    try { setLocations(await api.locations()); }
    catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(load, 250);
  }, [load]);
  useLiveEvent("slot.updated", refresh);
  useLiveEvent("location.updated", refresh);
  useLiveEvent("location.created", refresh);
  useLiveEvent("location.deleted", refresh);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  useEffect(() => {
    if (hash === "#locations") document.getElementById("locations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, loading]);

  const open = (location) => {
    if (!user) {
      toast.toast("Sign in to reserve a bay");
      navigate("/login", { state: { from: `/lot/${location.id}` } });
      return;
    }
    navigate(`/lot/${location.id}`);
  };

  const openLogistics = () => {
    if (user) {
      navigate("/logistics");
      return;
    }
    toast.toast("Sign in to reserve a loading zone");
    navigate("/login", { state: { from: "/logistics" } });
  };

  const totalFree = locations.reduce((sum, location) => sum + location.available_slots, 0);
  const totalBays = locations.reduce((sum, location) => sum + location.total_slots, 0);
  const occupied = Math.max(0, totalBays - totalFree);
  const utilization = totalBays ? Math.round((occupied / totalBays) * 100) : 0;

  return (
    <div className="overflow-hidden bg-slate-50">
      <section className="mobility-hero relative border-b border-white/10 bg-slate-950 text-white">
        <div className="mobility-orbit mobility-orbit-one" aria-hidden="true" />
        <div className="mobility-orbit mobility-orbit-two" aria-hidden="true" />
        <div className="relative mx-auto grid min-h-[720px] max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
          <div className="relative z-10">
            <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-70" /><span className="relative h-2 w-2 rounded-full bg-cyan-300" /></span>
              Urban mobility network online
            </span>
            <h1 className="animate-rise mt-7 max-w-3xl font-display text-5xl font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl" style={{ animationDelay: "70ms" }}>
              Predict demand.<br />Allocate smarter.<br /><span className="hero-gradient-text">Move cities faster.</span>
            </h1>
            <p className="animate-rise mt-7 max-w-2xl text-lg leading-relaxed text-slate-300" style={{ animationDelay: "130ms" }}>
              Park.in connects drivers, logistics fleets, operators and city authorities to reduce search traffic, prevent curbside chaos and turn every bay into an intelligent urban resource.
            </p>
            <div className="animate-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "180ms" }}>
              <Button size="lg" onClick={() => document.getElementById("mobility-search")?.scrollIntoView({ behavior: "smooth" })}>
                Find smart parking <ArrowRight className="h-5 w-5" />
              </Button>
              <button type="button" onClick={openLogistics} className="inline-flex h-13 items-center gap-2 rounded-full bg-cyan-400 px-7 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300">
                <Truck className="h-4 w-4" /> Book loading zone
              </button>
              <button type="button" onClick={() => document.getElementById("sensor-demo")?.scrollIntoView({ behavior: "smooth" })} className="inline-flex h-13 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 text-sm font-bold text-white backdrop-blur transition hover:bg-white/10">
                <Radio className="h-4 w-4 text-cyan-300" /> Run sensor demo
              </button>
            </div>
            <div className="animate-rise mt-10 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/10 pt-6" style={{ animationDelay: "220ms" }}>
              <div><b className="font-display text-2xl text-white">{loading ? "—" : totalFree}</b><span className="mt-1 block text-xs text-slate-400">Live bays free</span></div>
              <div><b className="font-display text-2xl text-white">{loading ? "—" : `${utilization}%`}</b><span className="mt-1 block text-xs text-slate-400">Network utilized</span></div>
              <div><b className="font-display text-2xl text-white">&lt;100ms</b><span className="mt-1 block text-xs text-slate-400">Event sync target</span></div>
            </div>
          </div>
          <div className="animate-rise relative z-10" style={{ animationDelay: "130ms" }}><UrbanNetworkVisual free={totalFree} /></div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-slate-200 px-6 lg:grid-cols-4 lg:divide-y-0">
          {[
            [Radio, "REAL-TIME", "Live occupancy events"],
            [BarChart3, "PREDICTIVE", "Demand forecasting"],
            [Zap, "MULTI-MODAL", "Car, EV and logistics"],
            [Leaf, "IMPACT-LED", "Less circling, lower emissions"],
          ].map(([Icon, label, body]) => (
            <div key={label} className="flex items-center gap-3 px-4 py-5 lg:justify-center">
              <Icon className="h-5 w-5 shrink-0 text-cyan-600" />
              <span><b className="block text-[10px] font-extrabold tracking-[0.16em] text-slate-900">{label}</b><small className="text-xs text-slate-500">{body}</small></span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-3xl">
          <span className="section-kicker">THE URBAN OPERATING LAYER</span>
          <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">From a parking action to a city decision.</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">The differentiator is not another booking screen. It is a shared intelligence layer that sees pressure forming and helps every stakeholder act.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PLATFORM_FEATURES.map(({ icon: Icon, eyebrow, title, body }, index) => (
            <Card key={title} className="group relative overflow-hidden border-slate-200 p-7 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
              <span className="absolute right-5 top-3 font-display text-6xl font-black text-slate-100">0{index + 1}</span>
              <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-cyan-300"><Icon className="h-5 w-5" /></span>
              <span className="relative mt-6 block text-[10px] font-extrabold tracking-[0.18em] text-orange-600">{eyebrow}</span>
              <h3 className="relative mt-2 font-display text-2xl font-bold text-slate-950">{title}</h3>
              <p className="relative mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <SensorSimulation />

      <section id="mobility-search" className="scroll-mt-20 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div>
              <span className="section-kicker">DRIVER NETWORK</span>
              <h2 className="mt-4 font-display text-4xl font-bold text-slate-950">Choose a destination.<br />We find the capacity.</h2>
              <p className="mt-4 text-slate-600">Search the live network or explore every connected mobility node below.</p>
            </div>
            <SearchBay locations={locations} onOpen={open} />
          </div>

          <div id="locations" className="scroll-mt-20 mt-14">
            {!loading && <div className="mb-8"><LotsMap locations={locations} onOpen={open} /></div>}
            {loading ? <Spinner label="Loading mobility network" /> : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {locations.map((location, index) => <LocationCard key={location.id} location={location} index={index} onOpen={open} t={t} />)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-100/70 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center"><span className="section-kicker">ONE NETWORK · FOUR VIEWS</span><h2 className="mt-4 font-display text-4xl font-bold text-slate-950">Built for the whole movement chain.</h2></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STAKEHOLDERS.map(({ icon: Icon, label, title, body }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-orange-600" /><span className="text-[9px] font-extrabold tracking-[0.15em] text-slate-400">{label}</span></div>
                <h3 className="mt-6 font-display text-xl font-bold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl sm:p-12">
            <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div><span className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">OPERATIONS READY</span><h2 className="mt-3 font-display text-3xl font-bold">See the network from the control side.</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">Manage live occupancy, scan gate passes, configure layouts and act on driver feedback from one operational console.</p></div>
              <Button onClick={() => navigate("/login")}>Open operations <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
