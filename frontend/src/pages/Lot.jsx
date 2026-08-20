import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Car, CircleAlert, Clock, MapPin, Receipt } from "lucide-react";
import { api } from "../lib/api";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import SlotGrid, { Legend } from "../components/SlotGrid";
import { Button, Card, Field, Input, Photo, Spinner } from "../components/ui";
import { duration, fromLocalInput, money, toLocalInput } from "../lib/format";

const FLASH_MS = 1600;

/** Mirrors `price_booking` on the server: half-hour blocks, minimum one hour.
 *  Kept in sync so the quote shown before booking matches the amount charged. */
function quote(start, end, rate) {
  const rawHours = (end - start) / 3_600_000;
  if (!Number.isFinite(rawHours) || rawHours <= 0) return null;
  const hours = Math.max(1, Math.ceil(rawHours / 0.5) * 0.5);
  return { hours, amount: hours * rate };
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

  const [location, setLocation] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [flashing, setFlashing] = useState(() => new Set());

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

  // Live feed: repaint a bay the moment anyone anywhere changes it.
  useLiveEvent("slot.updated", (slot) => {
    if (slot.location_id !== locationId) return;

    setSlots((current) =>
      current.map((existing) =>
        existing.id === slot.id ? { ...existing, status: slot.status } : existing,
      ),
    );
    flash(slot.id);

    // If the bay you had highlighted just went to someone else, drop it rather
    // than letting the form submit against a slot that will be rejected.
    setSelected((current) => {
      if (current?.id !== slot.id || slot.status === "vacant") return current;
      toast.toast(`Bay ${slot.code} was just taken - pick another`);
      return null;
    });
  });

  const vacantCount = slots.filter((s) => s.status === "vacant").length;
  const priced = location
    ? quote(fromLocalInput(start), fromLocalInput(end), location.price_per_hour)
    : null;

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
          Back to locations
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
        All locations
      </button>

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <Photo
            src={location.image_url}
            alt={location.name}
            className="h-32 w-full shrink-0 rounded-xl sm:h-24 sm:w-40"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold text-ink-900">{location.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-700">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{location.address}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-6 sm:flex-col sm:gap-1 sm:text-right">
            <div>
              <p className="font-display text-2xl font-bold text-teal-600">{vacantCount}</p>
              <p className="text-xs font-medium text-ink-500">of {slots.length} free</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-ink-900">
                {money(location.price_per_hour)}
              </p>
              <p className="text-xs font-medium text-ink-500">per hour</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-ink-900">Choose a bay</h2>
            <Legend />
          </div>

          <SlotGrid
            slots={slots}
            rows={location.rows}
            selectedId={selected?.id}
            onSelect={setSelected}
            flashing={flashing}
          />

          <p className="mt-6 rounded-xl bg-sand-100 px-4 py-3 text-center text-xs font-medium text-ink-500">
            Bays repaint live as other drivers book, arrive and leave.
          </p>
        </Card>

        <Card className="h-fit p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-xl font-bold text-ink-900">Your booking</h2>

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
                  <p className="text-xs font-medium text-teal-600">Available now</p>
                </div>
              </div>

              <Field
                label="Vehicle number"
                htmlFor="vehicle"
                hint="Spaces and dashes are fine."
              >
                <Input
                  id="vehicle"
                  required
                  placeholder="RJ14 AB 1234"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider"
                />
              </Field>

              <Field label="From" htmlFor="start">
                <Input
                  id="start"
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>

              <Field label="Until" htmlFor="end">
                <Input
                  id="end"
                  type="datetime-local"
                  required
                  min={start}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>

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
                  <div className="flex items-center justify-between border-t border-sand-200 pt-1.5">
                    <span className="text-sm font-semibold text-ink-900">Total</span>
                    <span className="font-display text-xl font-bold text-brand-600">
                      {money(priced.amount)}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-ink-500">
                    Billed in half-hour blocks, one hour minimum.
                  </p>
                </div>
              )}

              <Button type="submit" busy={booking} className="w-full">
                <Receipt className="h-4 w-4" />
                {booking ? "Holding your bay" : "Reserve and pay"}
              </Button>
            </form>
          ) : (
            <div className="mt-4 rounded-xl border-2 border-dashed border-sand-300 px-4 py-12 text-center">
              <Car className="mx-auto h-9 w-9 text-ink-500/50" />
              <p className="mt-3 text-sm font-medium text-ink-700">
                Pick a green bay to get started
              </p>
              <p className="mt-1 text-xs text-ink-500">{vacantCount} available right now</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
