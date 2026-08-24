import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { ConciergeBell, MapPin, Navigation, X } from "lucide-react";
import { useI18n } from "../context/I18nContext";
import { directionsUrl } from "../lib/maps";
import { money } from "../lib/format";
import { Button, Photo } from "./ui";
import "leaflet/dist/leaflet.css";

const JAIPUR = [26.9124, 75.7873];

function pinLabel(location, t) {
  const soldOut = location.available_slots === 0;
  const availability = soldOut
    ? t("home.full")
    : t("home.free", { n: location.available_slots });
  return `${location.name}. ${availability}. ${money(location.price_per_hour)}${t("home.hour")}`;
}

function LotPin({ location, selected, onSelect, t }) {
  const soldOut = location.available_slots === 0;
  const active = selected?.id === location.id;

  return (
    <CircleMarker
      center={[location.latitude, location.longitude]}
      radius={active ? 14 : 11}
      pathOptions={{
        color: active ? "#003f37" : "#c44100",
        fillColor: soldOut ? "#9c3400" : active ? "#00695c" : "#e65100",
        fillOpacity: 0.92,
        weight: active ? 3 : 2,
      }}
      eventHandlers={{
        add: (event) => {
          const el = event.target.getElement();
          if (!el) return;
          el.setAttribute("tabindex", "0");
          el.setAttribute("role", "button");
          el.setAttribute("aria-label", pinLabel(location, t));
        },
        click: () => onSelect(location),
        keydown: (event) => {
          const key = event.originalEvent?.key;
          if (key === "Enter" || key === " ") {
            event.originalEvent?.preventDefault();
            onSelect(location);
          }
        },
      }}
    />
  );
}

function LotPreview({ location, onClose, onBook, t }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const soldOut = location.available_slots === 0;

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const nodes = [...dialogRef.current.querySelectorAll("button, a[href]")].filter(
        (node) => !node.hasAttribute("disabled")
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink-900/50"
        aria-label={t("home.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-sand-200 bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="relative">
          <Photo
            src={location.image_url}
            alt=""
            className="h-40 w-full sm:h-44"
          />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-ink-700 shadow-sm"
            aria-label={t("home.close")}
          >
            <X className="h-4 w-4" />
          </button>
          <span
            className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-xs font-bold ${
              soldOut ? "bg-red-500 text-white" : "bg-white/95 text-teal-700"
            }`}
          >
            {soldOut ? t("home.full") : t("home.free", { n: location.available_slots })}
          </span>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <h3 id={titleId} className="font-display text-2xl font-bold text-ink-900">
              {location.name}
            </h3>
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{location.address}</span>
            </p>
            {location.description ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{location.description}</p>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-sand-100 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                {t("home.rate")}
              </dt>
              <dd className="mt-0.5 font-semibold text-ink-900">
                {money(location.price_per_hour)}
                <span className="text-xs font-normal text-ink-500"> {t("home.hour")}</span>
              </dd>
            </div>
            <div className="rounded-xl bg-sand-100 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                {t("home.bays")}
              </dt>
              <dd className="mt-0.5 font-semibold text-ink-900">
                {t("home.baysCount", {
                  free: location.available_slots,
                  total: location.total_slots,
                })}
              </dd>
            </div>
          </dl>

          {location.valet_enabled ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <ConciergeBell className="h-3.5 w-3.5" />
              {t("lot.valetExtra", { price: money(location.valet_price_per_hour) })}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => onBook(location)}>
              {t("home.book")}
            </Button>
            <a
              href={directionsUrl(location)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border-2 border-brand-500 px-6 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              <Navigation className="h-4 w-4" />
              {t("home.directions")}
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function LotsMap({ locations, onOpen }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(null);
  const pins = (locations || []).filter((l) => l.latitude != null && l.longitude != null);
  if (!pins.length) return null;

  return (
    <div>
      <p className="mb-3 text-sm text-ink-700">{t("home.mapHint")}</p>
      <div className="overflow-hidden rounded-2xl border border-sand-200">
        <MapContainer
          center={JAIPUR}
          zoom={13}
          scrollWheelZoom={false}
          className="z-0 h-72 w-full sm:h-80"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pins.map((location) => (
            <LotPin
              key={location.id}
              location={location}
              selected={selected}
              onSelect={setSelected}
              t={t}
            />
          ))}
        </MapContainer>
      </div>
      <ul className="sr-only">
        {pins.map((location) => (
          <li key={location.id}>
            <button type="button" onClick={() => setSelected(location)}>
              {pinLabel(location, t)}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <LotPreview
          location={selected}
          onClose={() => setSelected(null)}
          onBook={onOpen}
          t={t}
        />
      )}
    </div>
  );
}
