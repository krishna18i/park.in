import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CarFront,
  IndianRupee,
  LogIn,
  LogOut,
  Plus,
  ScanLine,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { api } from "../lib/api";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import { Badge, Button, Card, Field, Input, Spinner, Stat } from "../components/ui";
import { STATUS_STYLES, money, when } from "../lib/format";

const BLANK_LOCATION = {
  name: "",
  address: "",
  description: "",
  image_url: "",
  rows: 4,
  cols: 6,
  price_per_hour: 50,
};

/** Gate console: type or scan a ticket code. The same endpoint checks a
 *  vehicle in the first time and out the second, so one control runs the gate. */
function Scanner({ onSettled }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();

  const submit = async (event) => {
    event.preventDefault();
    if (!code.trim()) return;

    setBusy(true);
    try {
      const outcome = await api.verifyTicket(code.trim());
      setResult(outcome);
      toast.success(outcome.message);
      setCode("");
      onSettled();
    } catch (error) {
      setResult(null);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-600">
          <ScanLine className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">Gate scanner</h2>
          <p className="text-xs text-ink-500">Scans in, then scans out.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="PKN-XXXXXX"
          aria-label="Ticket code"
          className="font-mono tracking-widest"
        />
        <Button type="submit" busy={busy} variant="secondary" className="shrink-0">
          Verify
        </Button>
      </form>

      {result && (
        <div
          className={`animate-rise mt-4 flex items-start gap-3 rounded-xl px-4 py-3 ${
            result.action === "checked_in"
              ? "bg-teal-50 text-teal-700"
              : "bg-brand-50 text-brand-700"
          }`}
        >
          {result.action === "checked_in" ? (
            <LogIn className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <LogOut className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{result.message}</p>
            <p className="mt-0.5 text-xs opacity-80">
              {result.booking.location_name} - {result.booking.vehicle_number}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function NewLocationForm({ onCreated }) {
  const [form, setForm] = useState(BLANK_LOCATION);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const update = (key, cast = (v) => v) => (event) =>
    setForm({ ...form, [key]: cast(event.target.value) });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api.createLocation(form);
      toast.success(`${created.name} added with ${created.total_slots} bays`);
      setForm(BLANK_LOCATION);
      setOpen(false);
      onCreated();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add location
      </Button>
    );
  }

  return (
    <Card className="animate-rise w-full p-5">
      <h3 className="font-display text-lg font-bold text-ink-900">New location</h3>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="loc-name">
          <Input id="loc-name" required value={form.name} onChange={update("name")} />
        </Field>
        <Field label="Address" htmlFor="loc-address">
          <Input id="loc-address" required value={form.address} onChange={update("address")} />
        </Field>
        <Field label="Image URL" htmlFor="loc-image" hint="Optional.">
          <Input id="loc-image" value={form.image_url} onChange={update("image_url")} />
        </Field>
        <Field label="Rate per hour" htmlFor="loc-rate">
          <Input
            id="loc-rate"
            type="number"
            min="1"
            required
            value={form.price_per_hour}
            onChange={update("price_per_hour", Number)}
          />
        </Field>
        <Field label="Rows" htmlFor="loc-rows" hint="1-12">
          <Input
            id="loc-rows"
            type="number"
            min="1"
            max="12"
            required
            value={form.rows}
            onChange={update("rows", Number)}
          />
        </Field>
        <Field label="Bays per row" htmlFor="loc-cols" hint="1-12">
          <Input
            id="loc-cols"
            type="number"
            min="1"
            max="12"
            required
            value={form.cols}
            onChange={update("cols", Number)}
          />
        </Field>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" busy={busy}>
            Create {form.rows * form.cols} bays
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [locations, setLocations] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const refreshTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const [nextStats, nextLocations, nextBookings] = await Promise.all([
        api.stats(),
        api.locations(),
        api.allBookings(),
      ]);
      setStats(nextStats);
      setLocations(nextLocations);
      setBookings(nextBookings);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvent("slot.updated", () => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(load, 400);
  });

  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const removeLocation = async (location) => {
    try {
      await api.deleteLocation(location.id);
      toast.success(`${location.name} removed`);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading) return <Spinner label="Loading operations" />;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Operations</h1>
        <p className="mt-1 text-sm text-ink-700">
          Live across {stats.total_locations} locations and {stats.total_slots} bays.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="Occupancy"
          value={`${stats.occupancy_rate}%`}
          sub={`${stats.occupied_slots} parked, ${stats.reserved_slots} held`}
        />
        <Stat
          icon={CarFront}
          label="Bays free"
          value={stats.vacant_slots}
          tone="teal"
          sub={`of ${stats.total_slots} total`}
        />
        <Stat
          icon={IndianRupee}
          label="Revenue today"
          value={money(stats.revenue_today)}
          tone="teal"
          sub={`${money(stats.total_revenue)} all time`}
        />
        <Stat
          icon={Building2}
          label="Bookings"
          value={stats.total_bookings}
          tone="sand"
          sub={`${stats.active_bookings} vehicles parked`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <div className="space-y-4">
          <Scanner onSettled={load} />

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-ink-900">Locations</h2>
              <span className="text-xs font-medium text-ink-500">{locations.length} sites</span>
            </div>

            <ul className="mt-3 space-y-2">
              {locations.map((location) => (
                <li
                  key={location.id}
                  className="flex items-center gap-3 rounded-xl border border-sand-200 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{location.name}</p>
                    <p className="text-xs text-ink-500">
                      {location.available_slots}/{location.total_slots} free -{" "}
                      {money(location.price_per_hour)}/hr
                    </p>
                  </div>
                  <button
                    onClick={() => removeLocation(location)}
                    className="shrink-0 rounded-lg p-2 text-ink-500 transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${location.name}`}
                    title="Delete location"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-3">
              <NewLocationForm onCreated={load} />
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-5 py-4">
            <h2 className="font-display text-lg font-bold text-ink-900">Recent bookings</h2>
            <span className="text-xs font-medium text-ink-500">
              showing {Math.min(bookings.length, 40)} of {bookings.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="bg-sand-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  {["Location", "Bay", "Vehicle", "From", "Amount", "Status"].map((heading) => (
                    <th key={heading} className="px-4 py-2.5 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {bookings.slice(0, 40).map((booking) => {
                  const style = STATUS_STYLES[booking.status] ?? STATUS_STYLES.completed;
                  return (
                    <tr key={booking.id} className="transition hover:bg-sand-50">
                      <td className="px-4 py-2.5 font-medium text-ink-900">
                        {booking.location_name}
                      </td>
                      <td className="px-4 py-2.5 font-semibold">{booking.slot_code}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{booking.vehicle_number}</td>
                      <td className="px-4 py-2.5 text-ink-500">{when(booking.start_time)}</td>
                      <td className="px-4 py-2.5 font-semibold">{money(booking.amount)}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={style.className}>{style.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {bookings.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-ink-500">No bookings yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
