import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Car,
  CircleAlert,
  Clock,
  ConciergeBell,
  MapPin,
  Navigation,
  Receipt,
  Truck,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { bayKind } from "../lib/layout";
import { directionsUrl } from "../lib/maps";
import { useI18n } from "../context/I18nContext";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import SlotGrid, { Legend } from "../components/SlotGrid";
import BayDetails from "../components/BayDetails";
import NearbyPanel from "../components/NearbyPanel";
import OperatorCard from "../components/OperatorCard";
import OccupancyChart from "../components/OccupancyChart";
import RatingSummary from "../components/RatingSummary";
import { Button, Card, Field, Input, Photo, Spinner } from "../components/ui";
import { duration, fromLocalInput, money, toLocalInput } from "../lib/format";

const FLASH_MS = 1600;

const KINDS = [
  { id: "standard", icon: Car },
  { id: "ev", icon: Zap },
  { id: "heavy", icon: Truck },
];

function ValetToggle({ checked, disabled, extra, hint, onChange, t }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border-2 px-3 py-3 ${
        disabled
          ? "cursor-not-allowed border-sand-200 bg-sand-50 opacity-60"
          : "cursor-pointer border-sand-200 hover:border-brand-200"
      } ${checked && !disabled ? "border-brand-400 bg-brand-50" : ""}`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-semibold text-ink-900">{t("lot.valet")}</span>
        <span className="text-xs text-ink-500">{disabled ? t("lot.valetNoTruck") : hint}</span>
        {extra && !disabled ? (
          <span className="mt-1 block text-xs font-semibold text-brand-700">{extra}</span>
        ) : null}
      </span>
    </label>
  );
}

function quote(start, end, rate, valetRate = 0) {
  const rawHours = (end - start) / 3_600_000;
  if (!Number.isFinite(rawHours) || rawHours <= 0) return null;
  const hours = Math.max(1, Math.ceil(rawHours / 0.5) * 0.5);
  const valetFee = valetRate;
  return { hours, valetFee, amount: hours * rate + valetFee };
}

function defaultWindow() {
  const start = new Date(Date.now() + 10 * 60_000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

export default function Lot() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();

  const [location, setLocation] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState(null);
  // The bay whose details sheet is open. Any bay can be inspected; only a free
  // one of the right type can then be chosen.
  const [inspecting, setInspecting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [flashing, setFlashing] = useState(() => new Set());
  const [vehicleKind, setVehicleKind] = useState("standard");
  const [wantValet, setWantValet] = useState(false);
  const [nearby, setNearby] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [ratings, setRatings] = useState(null);

  const initial = useMemo(defaultWindow, []);
  const [vehicle, setVehicle] = useState("");
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);

  const flashTimers = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loc, slotList] = await Promise.all([
          api.location(locationId),
          api.slots(locationId),
        ]);
        if (cancelled) return;
        setLocation(loc);
        setSlots(slotList);
        api.nearby(locationId).then((data) => !cancelled && setNearby(data)).catch(() => {
          if (!cancelled) setNearby({ available: false, amenities: [] });
        });
        api.predictOccupancy(locationId).then((data) => !cancelled && setForecast(data)).catch(() => {});
        // Ratings are nice-to-have context; a failure here must not block booking.
        api.locationFeedback(locationId).then((data) => !cancelled && setRatings(data)).catch(() => {});
      } catch (error) {
        if (!cancelled) toast.error(error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, toast]);

  const flash = useCallback((slotId) => {
    setFlashing((current) => new Set(current).add(slotId));
    clearTimeout(flashTimers.current.get(slotId));
    flashTimers.current.set(
      slotId,
      setTimeout(() => {
        setFlashing((current) => {
          const next = new Set(current);
          next.delete(slotId);
          return next;
        });
        flashTimers.current.delete(slotId);
      }, FLASH_MS),
    );
  }, []);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useLiveEvent("slot.updated", (slot) => {
    if (slot.location_id !== locationId) return;
    setSlots((current) =>
      current.map((existing) =>
        existing.id === slot.id
          ? { ...existing, status: slot.status, kind: slot.kind || existing.kind }
          : existing,
      ),
    );
    flash(slot.id);
    setInspecting((current) =>
      current?.id === slot.id
        ? { ...current, status: slot.status, kind: slot.kind || current.kind }
        : current,
    );
    setSelected((current) => {
      if (current?.id !== slot.id || slot.status === "vacant") return current;
      toast.toast(`Bay ${slot.code} was just taken - pick another`);
      return null;
    });
  });

  useLiveEvent("location.updated", (payload) => {
    if (payload.id !== locationId) return;
    setLocation((current) => (current ? { ...current, ...payload } : current));
    if (payload.layout) {
      api.slots(locationId).then(setSlots).catch(() => {});
      setSelected(null);
      setInspecting(null);
    }
  });

  // The operator pulled this lot while the driver was looking at it -- booking
  // would only fail at submit, so send them back to the list instead.
  useLiveEvent("location.deleted", (payload) => {
    if (payload.id !== locationId) return;
    toast.toast("This lot was just taken offline by the operator");
    navigate("/");
  });

  const valetOn = Boolean(location?.valet_enabled);
  const selectedKind = selected ? bayKind(selected.kind) : null;
  const truckSelected = vehicleKind === "heavy" || selectedKind === "heavy";
  const valetAllowed = valetOn && !truckSelected;
  const usingValet = Boolean(valetAllowed && wantValet);

  const vacantCount = slots.filter(
    (s) => s.status === "vacant" && bayKind(s.kind) === vehicleKind,
  ).length;
  const livePct =
    slots.length > 0
      ? Math.round((100 * slots.filter((s) => s.status !== "vacant").length) / slots.length)
      : null;
  const priced = location
    ? quote(
        fromLocalInput(start),
        fromLocalInput(end),
        location.price_per_hour,
        usingValet ? location.valet_price_per_hour : 0,
      )
    : null;

  const pickKind = (kind) => {
    setVehicleKind(kind);
    setSelected(null);
    setInspecting(null);
    if (kind === "heavy") setWantValet(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return;

    const startDate = fromLocalInput(start);
    const endDate = fromLocalInput(end);
    if (endDate <= startDate) {
      toast.error("The end time has to be after the start time");
      return;
    }

    setBooking(true);
    try {
      const created = await api.createBooking({
        slot_id: selected.id,
        vehicle_number: vehicle,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        valet: usingValet,
      });
      toast.success(`Bay ${created.slot_code} is held for you`);
      navigate(`/checkout/${created.id}`);
    } catch (error) {
      toast.error(error.message);
      if (error.status === 409) {
        setSelected(null);
        api.slots(locationId).then(setSlots).catch(() => {});
      }
    } finally {
      setBooking(false);
    }
  };

  if (loading) return <Spinner label="Loading the lot" />;
  if (!location) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <CircleAlert className="mx-auto h-10 w-10 text-ink-500" />
        <h2 className="mt-4 font-display text-xl font-bold">We couldn't find that lot</h2>
        <Button className="mt-5" onClick={() => navigate("/")}>
          {t("lot.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <button
        onClick={() => navigate("/")}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 transition hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("lot.back")}
      </button>

      <Card className="mb-6 overflow-hidden">
        <Photo
          src={location.image_url}
          alt={location.name}
          className="h-44 w-full sm:h-56"
        />
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold text-ink-900">{location.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-700">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{location.address}</span>
            </p>
            {location.description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700">
                {location.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={directionsUrl(location)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-100"
              >
                <Navigation className="h-4 w-4" />
                {t("home.directions")}
              </a>
              {valetOn && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
                  <ConciergeBell className="h-3.5 w-3.5" />
                  {t("lot.valetExtra", { price: money(location.valet_price_per_hour) })}
                </span>
              )}
              <span className="rounded-full bg-sand-100 px-3 py-1.5 text-xs font-semibold text-ink-700">
                {location.rows} × {location.cols} {t("home.bays")}
              </span>
            </div>
          </div>
          <div className="shrink-0 space-y-3 sm:w-64">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-teal-50 px-4 py-3">
                <p className="font-display text-2xl font-bold text-teal-700">{vacantCount}</p>
                <p className="text-xs font-medium text-ink-500">
                  {t("lot.available", { n: vacantCount })}
                </p>
              </div>
              <div className="rounded-2xl bg-sand-100 px-4 py-3">
                <p className="font-display text-2xl font-bold text-ink-900">
                  {money(location.price_per_hour)}
                </p>
                <p className="text-xs font-medium text-ink-500">{t("home.hour")}</p>
              </div>
            </div>
            {/* Who to call about this lot, in reach before anyone picks a bay. */}
            <OperatorCard location={location} />
          </div>
        </div>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <OccupancyChart
            forecast={forecast?.hours}
            hint={forecast?.hint}
            model={forecast?.model}
            livePct={livePct}
          />
        </Card>
        <Card className="p-5">
          <NearbyPanel nearby={nearby} location={location} />
        </Card>
      </div>

      {/* What drivers said about this lot, before anyone commits to a bay.
          Rendered only once loaded, so "no ratings yet" never flashes. */}
      {ratings && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 font-display text-lg font-bold text-ink-900">
            {t("fb.summary.title")}
          </h2>
          <RatingSummary summary={ratings} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-5 sm:p-6">
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              {t("lot.vehicle")}
            </p>
            <div className="flex flex-wrap gap-2">
              {KINDS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickKind(id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition ${
                    vehicleKind === id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-sand-200 text-ink-700 hover:border-brand-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(`lot.kind.${id}`)}
                </button>
              ))}
            </div>
            {valetOn ? (
              <div className="mt-3">
                <ValetToggle
                  checked={usingValet}
                  disabled={vehicleKind === "heavy"}
                  extra={t("lot.valetExtra", { price: money(location.valet_price_per_hour) })}
                  hint={t("lot.valetHint")}
                  onChange={setWantValet}
                  t={t}
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-500">{t("lot.valetOff")}</p>
            )}
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-ink-900">{t("lot.choose")}</h2>
            <Legend />
          </div>

          <SlotGrid
            slots={slots}
            rows={location.rows}
            selectedId={selected?.id}
            onSelect={setInspecting}
            flashing={flashing}
            vehicleKind={vehicleKind}
          />

          <p className="mt-6 rounded-xl bg-sand-100 px-4 py-3 text-center text-xs font-medium text-ink-500">
            {t("lot.live")}
          </p>
        </Card>

        <Card className="h-fit p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-xl font-bold text-ink-900">{t("lot.booking")}</h2>

          {selected ? (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500 text-white">
                  <Car className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-lg font-bold text-ink-900">
                    Bay {selected.code}
                  </p>
                  <p className="text-xs font-medium text-teal-600">
                    {t(`lot.kind.${selectedKind || "standard"}`)}
                  </p>
                </div>
              </div>

              <Field label={t("lot.plate")} htmlFor="vehicle" hint="Spaces and dashes are fine.">
                <Input
                  id="vehicle"
                  required
                  placeholder="RJ14 AB 1234"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider"
                />
              </Field>

              <Field label={t("lot.from")} htmlFor="start">
                <Input
                  id="start"
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>

              <Field label={t("lot.until")} htmlFor="end">
                <Input
                  id="end"
                  type="datetime-local"
                  required
                  min={start}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>

              {valetOn ? (
                <ValetToggle
                  checked={usingValet}
                  disabled={selectedKind === "heavy"}
                  extra={t("lot.valetExtra", { price: money(location.valet_price_per_hour) })}
                  hint={t("lot.valetOn")}
                  onChange={setWantValet}
                  t={t}
                />
              ) : (
                <p className="text-xs text-ink-500">{t("lot.valetOff")}</p>
              )}

              {priced && (
                <div className="space-y-1.5 rounded-xl border border-sand-200 bg-sand-50 p-4">
                  <div className="flex items-center justify-between text-sm text-ink-700">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {duration(priced.hours)}
                    </span>
                    <span>
                      {money(location.price_per_hour)} x {priced.hours}
                    </span>
                  </div>
                  {usingValet && (
                    <div className="flex items-center justify-between text-sm text-ink-700">
                      <span>{t("checkout.valet")}</span>
                      <span>{money(priced.valetFee)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-sand-200 pt-1.5">
                    <span className="text-sm font-semibold text-ink-900">{t("lot.total")}</span>
                    <span className="font-display text-xl font-bold text-brand-600">
                      {money(priced.amount)}
                    </span>
                  </div>
                </div>
              )}

              <Button type="submit" busy={booking} className="w-full">
                <Receipt className="h-4 w-4" />
                {booking ? t("lot.holding") : t("lot.hold")}
              </Button>
            </form>
          ) : (
            <div className="mt-4 rounded-xl border-2 border-dashed border-sand-300 px-4 py-12 text-center">
              <Car className="mx-auto h-9 w-9 text-ink-500/50" />
              <p className="mt-3 text-sm font-medium text-ink-700">{t("lot.pick")}</p>
              <p className="mt-1 text-xs text-ink-500">{t("lot.available", { n: vacantCount })}</p>
            </div>
          )}
        </Card>
      </div>

      <BayDetails
        bay={inspecting}
        location={location}
        vehicleKind={vehicleKind}
        onClose={() => setInspecting(null)}
        onChoose={(bay) => {
          setSelected(bay);
          if (bayKind(bay.kind) === "heavy") setWantValet(false);
          setInspecting(null);
        }}
      />
    </div>
  );
}
