import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CarFront,
  Grid3x3,
  IndianRupee,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  ScanLine,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { api } from "../lib/api";
import { emptyLayout, toPayload } from "../lib/layout";
import { useI18n } from "../context/I18nContext";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import CameraScan from "../components/CameraScan";
import LayoutPainter from "../components/LayoutPainter";
import OccupancyChart from "../components/OccupancyChart";
import FeedbackQueue from "../components/FeedbackQueue";
import { Badge, Button, Card, Field, Input, Spinner, Stat, Textarea } from "../components/ui";
import { STATUS_STYLES, money, when } from "../lib/format";

const BLANK_LOCATION = {
  name: "",
  address: "",
  description: "",
  image_url: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  rows: 4,
  cols: 6,
  price_per_hour: 50,
  valet_enabled: true,
  valet_price_per_hour: 80,
};

/** Gate console: type or scan a ticket code. The same endpoint checks a
 *  vehicle in the first time and out the second, so one control runs the gate. */
function Scanner({ onSettled }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();
  const { t } = useI18n();
  const inflight = useRef(false);

  const verify = useCallback(
    async (raw) => {
      const ticket = raw.trim().toUpperCase();
      if (!ticket || inflight.current) return;
      inflight.current = true;
      setBusy(true);
      try {
        const outcome = await api.verifyTicket(ticket);
        setResult(outcome);
        toast.success(outcome.message);
        setCode("");
        onSettled();
      } catch (error) {
        setResult(null);
        toast.error(error.message);
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [onSettled, toast],
  );

  const submit = async (event) => {
    event.preventDefault();
    await verify(code);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-600">
          <ScanLine className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">{t("admin.scanner")}</h2>
          <p className="text-xs text-ink-500">{t("admin.scannerHint")}</p>
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

      <CameraScan onScan={verify} />

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
            {result.booking.booking_type === "logistics" && (
              <p className="mt-1 text-xs font-semibold">
                Logistics · {result.booking.cargo_type}
                {result.booking.delivery_reference ? ` · ${result.booking.delivery_reference}` : ""}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function NewLocationForm({ onCreated }) {
  const [form, setForm] = useState(BLANK_LOCATION);
  const [layout, setLayout] = useState(() => emptyLayout(BLANK_LOCATION.rows, BLANK_LOCATION.cols));
  const [brush, setBrush] = useState("ev");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const update = (key, cast = (v) => v) => (event) => {
    const next = { ...form, [key]: cast(event.target.value) };
    setForm(next);
    if (key === "rows" || key === "cols") {
      setLayout(emptyLayout(next.rows, next.cols));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api.createLocation({ ...form, slot_layout: toPayload(layout) });
      toast.success(`${created.name} added with ${created.total_slots} bays`);
      setForm(BLANK_LOCATION);
      setLayout(emptyLayout(BLANK_LOCATION.rows, BLANK_LOCATION.cols));
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
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="loc-desc" hint="Shown on the lot page.">
            <Textarea id="loc-desc" value={form.description} onChange={update("description")} />
          </Field>
        </div>
        <Field label="Image URL" htmlFor="loc-image" hint="Optional.">
          <Input id="loc-image" value={form.image_url} onChange={update("image_url")} />
        </Field>
        <Field
          label="Contact desk"
          htmlFor="loc-contact-name"
          hint="Who picks up. Shown on every bay."
        >
          <Input
            id="loc-contact-name"
            value={form.contact_name}
            onChange={update("contact_name")}
            placeholder="Hawa Mahal Parking Desk"
          />
        </Field>
        <Field label="Contact phone" htmlFor="loc-contact-phone" hint="Drivers tap to call.">
          <Input
            id="loc-contact-phone"
            type="tel"
            value={form.contact_phone}
            onChange={update("contact_phone")}
            placeholder="+91 98290 10101"
          />
        </Field>
        <Field label="Contact email" htmlFor="loc-contact-email" hint="Drivers tap to write.">
          <Input
            id="loc-contact-email"
            type="email"
            value={form.contact_email}
            onChange={update("contact_email")}
            placeholder="desk@lot.example"
          />
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
        <Field label="Valet fee ₹ (once per booking)" htmlFor="loc-valet-rate">
          <Input
            id="loc-valet-rate"
            type="number"
            min="0"
            value={form.valet_price_per_hour}
            onChange={update("valet_price_per_hour", Number)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.valet_enabled}
            onChange={(e) => setForm({ ...form, valet_enabled: e.target.checked })}
          />
          Offer valet at this lot
        </label>

        <LayoutPainter
          rows={form.rows}
          cols={form.cols}
          layout={layout}
          onChange={setLayout}
          brush={brush}
          onBrush={setBrush}
        />

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

function locationToForm(location) {
  return {
    name: location.name,
    address: location.address,
    description: location.description || "",
    image_url: location.image_url || "",
    contact_name: location.contact_name || "",
    contact_phone: location.contact_phone || "",
    contact_email: location.contact_email || "",
    price_per_hour: location.price_per_hour,
    valet_enabled: Boolean(location.valet_enabled),
    valet_price_per_hour: location.valet_price_per_hour ?? 80,
    latitude: location.latitude ?? "",
    longitude: location.longitude ?? "",
  };
}

function LocationEditor({ location, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => locationToForm(location));
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const start = () => {
    setForm(locationToForm(location));
    setOpen(true);
  };

  const update = (key, cast = (v) => v) => (event) => {
    setForm({ ...form, [key]: cast(event.target.value) });
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        description: form.description,
        image_url: form.image_url,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email,
        price_per_hour: Number(form.price_per_hour),
        valet_enabled: Boolean(form.valet_enabled),
        valet_price_per_hour: Number(form.valet_price_per_hour),
      };
      if (form.latitude !== "" && form.longitude !== "") {
        payload.latitude = Number(form.latitude);
        payload.longitude = Number(form.longitude);
      }
      await api.updateLocation(location.id, payload);
      toast.success(`${form.name} updated`);
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={start}>
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl border border-sand-200 bg-sand-50 p-3 sm:grid-cols-2">
      <Field label="Name" htmlFor={`edit-name-${location.id}`}>
        <Input
          id={`edit-name-${location.id}`}
          required
          value={form.name}
          onChange={update("name")}
        />
      </Field>
      <Field label="Address" htmlFor={`edit-address-${location.id}`}>
        <Input
          id={`edit-address-${location.id}`}
          required
          value={form.address}
          onChange={update("address")}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description" htmlFor={`edit-desc-${location.id}`}>
          <Textarea
            id={`edit-desc-${location.id}`}
            value={form.description}
            onChange={update("description")}
          />
        </Field>
      </div>
      <Field label="Image URL" htmlFor={`edit-image-${location.id}`}>
        <Input
          id={`edit-image-${location.id}`}
          value={form.image_url}
          onChange={update("image_url")}
        />
      </Field>
      <Field label="Contact desk" htmlFor={`edit-contact-name-${location.id}`}>
        <Input
          id={`edit-contact-name-${location.id}`}
          value={form.contact_name}
          onChange={update("contact_name")}
          placeholder="Parking desk"
        />
      </Field>
      <Field
        label="Contact phone"
        htmlFor={`edit-contact-phone-${location.id}`}
        hint="Shown on every bay."
      >
        <Input
          id={`edit-contact-phone-${location.id}`}
          type="tel"
          value={form.contact_phone}
          onChange={update("contact_phone")}
          placeholder="+91 98290 10101"
        />
      </Field>
      <Field label="Contact email" htmlFor={`edit-contact-email-${location.id}`}>
        <Input
          id={`edit-contact-email-${location.id}`}
          type="email"
          value={form.contact_email}
          onChange={update("contact_email")}
          placeholder="desk@lot.example"
        />
      </Field>
      <Field label="Rate per hour" htmlFor={`edit-rate-${location.id}`}>
        <Input
          id={`edit-rate-${location.id}`}
          type="number"
          min="1"
          required
          value={form.price_per_hour}
          onChange={update("price_per_hour", Number)}
        />
      </Field>
      <Field label="Valet fee ₹ (once)" htmlFor={`edit-valet-${location.id}`}>
        <Input
          id={`edit-valet-${location.id}`}
          type="number"
          min="0"
          value={form.valet_price_per_hour}
          onChange={update("valet_price_per_hour", Number)}
        />
      </Field>
      <Field label="Latitude" htmlFor={`edit-lat-${location.id}`} hint="Optional. Maps pin.">
        <Input
          id={`edit-lat-${location.id}`}
          type="number"
          step="any"
          value={form.latitude}
          onChange={update("latitude")}
        />
      </Field>
      <Field label="Longitude" htmlFor={`edit-lng-${location.id}`}>
        <Input
          id={`edit-lng-${location.id}`}
          type="number"
          step="any"
          value={form.longitude}
          onChange={update("longitude")}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-700 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.valet_enabled}
          onChange={(e) => setForm({ ...form, valet_enabled: e.target.checked })}
        />
        Offer valet at this lot
      </label>
      <p className="text-xs text-ink-500 sm:col-span-2">
        Changing the address looks up a new map pin unless you set latitude and longitude. Bay
        types stay in Lanes.
      </p>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" busy={busy}>
          Save details
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LayoutEditor({ location, onSaved }) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState([]);
  const [brush, setBrush] = useState("ev");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const loadSlots = async () => {
    try {
      const slots = await api.slots(location.id);
      setLayout(
        slots.map((slot) => ({
          row: slot.row,
          col: slot.col,
          kind: slot.kind === "valet" ? "standard" : slot.kind || "standard",
          code: slot.code,
        })),
      );
      setOpen(true);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.updateLayout(location.id, toPayload(layout));
      toast.success(`${location.name}: bay types saved`);
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={loadSlots}>
        <Grid3x3 className="h-3.5 w-3.5" />
        Lanes
      </Button>
    );
  }

  return (
    <div className="mt-3 w-full space-y-3 rounded-xl border border-sand-200 bg-sand-50 p-3">
      <LayoutPainter
        rows={location.rows}
        cols={location.cols}
        layout={layout}
        onChange={setLayout}
        brush={brush}
        onBrush={setBrush}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" busy={busy} onClick={save}>
          Save lanes
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ValetEditor({ location, onSaved }) {
  const [enabled, setEnabled] = useState(Boolean(location.valet_enabled));
  const [rate, setRate] = useState(location.valet_price_per_hour ?? 80);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { t } = useI18n();

  const save = async () => {
    setBusy(true);
    try {
      await api.updateValet(location.id, {
        valet_enabled: enabled,
        valet_price_per_hour: Number(rate),
      });
      toast.success(`${location.name}: valet ${enabled ? "on" : "off"} at ${money(rate)} once`);
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
          enabled ? "bg-teal-50 text-teal-700" : "bg-sand-100 text-ink-500"
        }`}
      >
        {enabled ? t("admin.valetOn") : t("admin.valetOff")}
      </button>
      <Input
        type="number"
        min="1"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        className="h-8 w-24 px-2 text-xs"
        aria-label="Valet fee once per booking"
      />
      <Button size="sm" variant="ghost" busy={busy} onClick={save}>
        {t("admin.saveValet")}
      </Button>
    </div>
  );
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [locations, setLocations] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { t } = useI18n();
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
      if (nextLocations[0]) {
        api.predictOccupancy(nextLocations[0].id).then(setForecast).catch(() => {});
      }
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

      {forecast && (
        <Card className="p-5">
          <h2 className="mb-2 font-display text-lg font-bold text-ink-900">
            {t("lot.busy")} · {locations[0]?.name}
          </h2>
          <OccupancyChart forecast={forecast.hours} hint={forecast.hint} model={forecast.model} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(20rem,38rem)_1fr]">
        <div className="space-y-4">
          <Scanner onSettled={load} />

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-ink-900">Locations</h2>
              <span className="text-xs font-medium text-ink-500">{locations.length} sites</span>
            </div>

            <ul className="mt-3 space-y-2">
              {locations.map((location) => (
                <li key={location.id} className="rounded-xl border border-sand-200 px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{location.name}</p>
                      <p className="truncate text-xs text-ink-500">{location.address}</p>
                      <p className="text-xs text-ink-500">
                        {location.available_slots}/{location.total_slots} free -{" "}
                        {money(location.price_per_hour)}/hr
                      </p>
                      <ValetEditor location={location} onSaved={load} />
                    </div>
                    <button
                      onClick={() => removeLocation(location)}
                      className="shrink-0 rounded-lg p-2 text-ink-500 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${location.name}`}
                      title="Delete location"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <LocationEditor location={location} onSaved={load} />
                  <LayoutEditor location={location} onSaved={load} />
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
                  {["Location", "Bay", "Vehicle", "Type", "From", "Amount", "Valet", "Rating", "Status"].map((heading) => (
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
                      <td className="px-4 py-2.5 text-xs">
                        {booking.booking_type === "logistics" ? (
                          <span className="font-semibold text-orange-700" title={booking.delivery_reference || booking.cargo_type}>Logistics · {booking.cargo_type}</span>
                        ) : "Parking"}
                      </td>
                      <td className="px-4 py-2.5 text-ink-500">{when(booking.start_time)}</td>
                      <td className="px-4 py-2.5 font-semibold">{money(booking.amount)}</td>
                      <td className="px-4 py-2.5 text-xs">{booking.valet ? "Yes" : "—"}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {booking.rating ? `${booking.rating}/5` : "—"}
                      </td>
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

      {/* Driver feedback, with the triage controls next to each report. */}
      <FeedbackQueue locations={locations} />
    </div>
  );
}
