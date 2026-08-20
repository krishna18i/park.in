import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, QrCode, ScanLine, Timer, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, Photo, Spinner } from "../components/ui";
import { money } from "../lib/format";

const FEATURES = [
  {
    icon: Zap,
    title: "Live availability",
    body: "Every bay updates the instant someone books, arrives or drives away. No refresh, no guesswork.",
  },
  {
    icon: QrCode,
    title: "QR entry",
    body: "Your booking becomes a scannable ticket. Show it at the gate and the barrier lifts.",
  },
  {
    icon: Timer,
    title: "Held for 10 minutes",
    body: "A reserved bay is yours while you pay. Change your mind and it returns to the pool automatically.",
  },
];

function LocationCard({ location, onOpen, index }) {
  const soldOut = location.available_slots === 0;

  return (
    <button
      onClick={() => onOpen(location)}
      className="group animate-rise relative h-72 overflow-hidden rounded-2xl border border-sand-200 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <Photo
        src={location.image_url}
        alt={location.name}
        className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 via-ink-900/30 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex justify-end p-4">
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur-sm ${
            soldOut ? "bg-red-500/90 text-white" : "bg-white/90 text-teal-700"
          }`}
        >
          {soldOut ? "Full" : `${location.available_slots} free`}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 text-white">
        <h3 className="font-display text-2xl font-bold">{location.name}</h3>
        <p className="flex items-center gap-1.5 text-xs opacity-90">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{location.address}</span>
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-semibold">
            {money(location.price_per_hour)}
            <span className="text-xs font-normal opacity-80"> / hour</span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            Book
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const refreshTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      setLocations(await api.locations());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // A burst of slot changes (a whole row freeing up) should cost one refetch,
  // not one per bay.
  useLiveEvent("slot.updated", () => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(load, 250);
  });

  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const open = (location) => {
    if (!user) {
      toast.toast("Sign in to reserve a bay");
      navigate("/login", { state: { from: `/lot/${location.id}` } });
      return;
    }
    navigate(`/lot/${location.id}`);
  };

  const totalFree = locations.reduce((sum, l) => sum + l.available_slots, 0);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-sand-200">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-teal-100/50 blur-3xl"
        />

        <div className="relative mx-auto max-w-5xl px-6 py-20 text-center sm:py-28">
          <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-sand-200 bg-white px-4 py-1.5 text-xs font-semibold text-ink-700 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
            </span>
            {loading ? "Checking availability" : `${totalFree} bays free right now`}
          </span>

          <h1
            className="animate-rise mt-6 font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-ink-900 sm:text-7xl"
            style={{ animationDelay: "60ms" }}
          >
            Park at the
            <br />
            <span className="text-brand-500">Pink City</span> gates.
          </h1>

          <p
            className="animate-rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-700"
            style={{ animationDelay: "120ms" }}
          >
            Reserve a bay at Jaipur's heritage sites before you leave home. Live
            availability, a QR ticket at the gate, and no circling the block.
          </p>

          <div
            className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Button
              size="lg"
              onClick={() =>
                document.getElementById("locations")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Find a bay
              <ArrowRight className="h-5 w-5" />
            </Button>
            {!user && (
              <Button size="lg" variant="outline" onClick={() => navigate("/login")}>
                I have an account
              </Button>
            )}
          </div>
        </div>
      </section>

      <section id="locations" className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="mb-10 text-center">
          <h2 className="font-display text-4xl font-bold text-ink-900">
            Where are you <span className="text-teal-500">headed?</span>
          </h2>
          <p className="mt-2 text-ink-700">Four lots across the city's most-visited monuments.</p>
        </div>

        {loading ? (
          <Spinner label="Loading locations" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {locations.map((location, index) => (
              <LocationCard
                key={location.id}
                location={location}
                index={index}
                onOpen={open}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-sand-200 bg-white/60 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-500">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-ink-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:text-left">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-600">
              <ScanLine className="h-7 w-7" />
            </span>
            <div className="flex-1">
              <h3 className="font-display text-xl font-bold text-ink-900">
                Running the lot, not parking in it?
              </h3>
              <p className="mt-1 text-sm text-ink-700">
                The operator console shows live occupancy, revenue and a gate scanner that
                checks vehicles in and out from a ticket code.
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate("/login")}>
              Operator sign in
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
