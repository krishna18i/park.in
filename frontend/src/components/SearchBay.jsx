import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Check, Loader2, MapPin, Navigation, ParkingSquare, Search, Sparkles, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import { Button } from "./ui";

function distanceLabel(km, t) {
  if (km == null || Number.isNaN(Number(km))) return "";
  if (km < 1) {
    return t("home.search.mAway", { m: Math.max(1, Math.round(km * 1000)) });
  }
  return t("home.search.kmAway", { km: Number(km).toFixed(km < 10 ? 1 : 0) });
}

export default function SearchBay({ locations = [], onOpen }) {
  const { t } = useI18n();
  const toast = useToast();
  const boxRef = useRef(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [hints, setHints] = useState([]);
  const [rawLots, setRawLots] = useState(null);
  const [destLabel, setDestLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vehicleKind, setVehicleKind] = useState("standard");

  // Nearby results are a snapshot from the search call. `locations` is kept
  // live by Home over the websocket, so re-read each lot's counts from it --
  // a bay freed by a check-out shows here without re-running the search.
  const lots = useMemo(() => {
    if (rawLots === null) return null;
    return rawLots.map((item) => {
      const live = (locations || []).find((l) => l.id === item.location.id);
      return live ? { ...item, location: live } : item;
    });
  }, [rawLots, locations]);

  const showingLots = lots !== null && hints.length === 0;

  const matchedLots = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    if (picked && needle === picked.label.toLowerCase()) return [];
    return (locations || []).filter((location) => {
      if (!location.available_slots) return false;
      return `${location.name} ${location.address}`.toLowerCase().includes(needle);
    });
  }, [locations, query, picked]);

  useEffect(() => {
    const typed = query.trim();
    if (picked && typed === picked.label) {
      setHints([]);
      return undefined;
    }
    if (typed.length < 2) {
      setHints([]);
      setRawLots(null);
      setOpen(false);
      return undefined;
    }

    let ignore = false;
    setLooking(true);
    const timer = setTimeout(async () => {
      try {
        const places = await api.places(typed);
        if (ignore) return;
        setRawLots(null);
        setHints(places);
        setOpen(places.length > 0 || matchedLots.length > 0);
        setActive(-1);
      } catch {
        if (!ignore) {
          setHints([]);
          setOpen(matchedLots.length > 0);
        }
      } finally {
        if (!ignore) setLooking(false);
      }
    }, 280);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, picked, matchedLots.length]);

  useEffect(() => {
    const onDoc = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const loadLots = async (place) => {
    const destination = (place?.label || query).trim();
    if (destination.length < 2) {
      toast.error(t("home.search.short"));
      return;
    }
    setBusy(true);
    setHints([]);
    try {
      const result = await api.nearbyBays({
        q: destination,
        lat: place?.latitude,
        lng: place?.longitude,
        vehicleKind,
      });
      setDestLabel(result.destination);
      setQuery(result.destination);
      setPicked(place || { label: result.destination, latitude: result.destination_latitude, longitude: result.destination_longitude });
      setRawLots(result.lots || []);
      setOpen(true);
      setActive(result.lots?.length ? 0 : -1);
      if (!result.lots?.length) {
        toast.error(t("home.search.noneNear"));
      }
    } catch (error) {
      setRawLots([]);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const choosePlace = (place) => {
    setPicked(place);
    setQuery(place.label);
    setHints([]);
    loadLots(place);
  };

  const chooseLot = (item) => {
    const km = Number(item.distance_km);
    const kmText = Number.isFinite(km)
      ? km < 1
        ? `${Math.round(km * 1000)} m`
        : km.toFixed(1)
      : "0";
    toast.success(
      t("home.search.found", {
        dest: destLabel || query,
        name: item.location.name,
        km: kmText,
      }),
    );
    setOpen(false);
    onOpen(item.location);
  };

  const submit = (event) => {
    event.preventDefault();
    if (showingLots && lots[active]) {
      chooseLot(lots[active]);
      return;
    }
    if (!showingLots && active >= 0) {
      if (active < hints.length) {
        choosePlace(hints[active]);
        return;
      }
      const match = matchedLots[active - hints.length];
      if (match) {
        chooseLot({ location: match, distance_km: null });
        return;
      }
    }
    if (showingLots && lots.length === 1) {
      chooseLot(lots[0]);
      return;
    }
    loadLots(picked && picked.label === query.trim() ? picked : null);
  };

  const onKey = (event) => {
    const extra = showingLots ? 0 : matchedLots.length;
    const listLength = showingLots ? lots.length : hints.length + extra;
    if (!open || !listLength) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % listLength);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? listLength - 1 : i - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-sand-200 bg-white/95 p-4 text-left shadow-xl shadow-slate-950/10 backdrop-blur"
    >
      <label htmlFor="search-bay" className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <MapPin className="h-4 w-4 text-brand-500" />
        {t("home.search.title")}
      </label>
      <p className="mt-1 text-xs text-ink-500">{t("home.search.hint")}</p>
      <div className="mt-3 flex items-center gap-2" aria-label="Vehicle type">
        {[["standard", Car, "Car"], ["ev", Zap, "EV"]].map(([kind, Icon, label]) => (
          <button key={kind} type="button" onClick={() => { setVehicleKind(kind); setRawLots(null); }} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${vehicleKind === kind ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
            <Icon className="h-3.5 w-3.5" />{label}{vehicleKind === kind && <Check className="h-3 w-3 text-cyan-300" />}
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1 text-[10px] font-bold uppercase tracking-[.12em] text-cyan-700 sm:inline-flex"><Sparkles className="h-3 w-3" /> ParkScore ranking</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div ref={boxRef} className="relative min-w-0 flex-1">
          <input
            id="search-bay"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
              setRawLots(null);
              setDestLabel("");
            }}
            onFocus={() => {
              if (hints.length || lots?.length || matchedLots.length) setOpen(true);
            }}
            onKeyDown={onKey}
            placeholder={t("home.search.placeholder")}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="search-bay-list"
            aria-autocomplete="list"
            className="h-12 w-full rounded-xl border-2 border-sand-200 bg-white px-4 pr-10 text-sm outline-none transition-colors placeholder:text-ink-500/60 focus:border-brand-400"
          />
          {(looking || busy) && (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-500" />
          )}

          {open && !showingLots && (hints.length > 0 || matchedLots.length > 0) && (
            <ul
              id="search-bay-list"
              role="listbox"
              className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-sand-200 bg-white py-1 shadow-xl"
            >
              {hints.length > 0 && (
                <li className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {t("home.search.places")}
                </li>
              )}
              {hints.map((place, index) => (
                <li key={`${place.label}-${place.latitude}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${
                      index === active ? "bg-brand-50 text-brand-700" : "text-ink-900 hover:bg-sand-100"
                    }`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choosePlace(place)}
                  >
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    <span>{place.label}</span>
                  </button>
                </li>
              ))}
              {matchedLots.length > 0 && (
                <li className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {t("home.search.lots")}
                </li>
              )}
              {matchedLots.map((location, index) => {
                const rowIndex = hints.length + index;
                return (
                  <li key={location.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={rowIndex === active}
                      className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm ${
                        rowIndex === active ? "bg-brand-50 text-brand-700" : "text-ink-900 hover:bg-sand-100"
                      }`}
                      onMouseEnter={() => setActive(rowIndex)}
                      onClick={() => chooseLot({ location, distance_km: null })}
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <ParkingSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        <span className="truncate font-semibold">{location.name}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-teal-700">
                        {t("home.search.free", { n: location.available_slots })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {open && showingLots && (
            <div
              id="search-bay-list"
              className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-sand-200 bg-white shadow-xl"
            >
              <p className="border-b border-sand-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                {t("home.search.lotsTitle")}
                {destLabel ? ` · ${destLabel.split(",")[0]}` : ""}
              </p>
              {lots.length === 0 ? (
                <p className="px-3 py-3 text-sm text-ink-700">{t("home.search.noneNear")}</p>
              ) : (
                <ul role="listbox" className="max-h-72 overflow-auto py-1">
                  {lots.map((item, index) => (
                    <li key={item.location.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left ${
                          index === active ? "bg-brand-50" : "hover:bg-sand-100"
                        }`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => chooseLot(item)}
                      >
                        <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-black ${index === 0 ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-600"}`}>#{item.rank || index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                            {item.location.name}
                            {index === 0 && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-cyan-800">Recommended</span>}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-500">
                            {item.location.address}
                          </span>
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {(item.reasons || []).map((reason) => <span key={reason} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">{reason}</span>)}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[9px] text-slate-400">
                            <span>Distance {Math.round(item.factors?.distance || 0)}</span>
                            <span>Capacity {Math.round(item.factors?.availability || 0)}</span>
                            <span>Forecast {Math.round(item.factors?.prediction || 0)}</span>
                            <span>Price {Math.round(item.factors?.price || 0)}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-display text-xl font-extrabold text-cyan-700">{Math.round(item.park_score || 0)}</span>
                          <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">ParkScore</span>
                          <span className="mt-1 block text-xs font-bold text-teal-700">{distanceLabel(item.distance_km, t)}</span>
                          <span className="text-[11px] text-ink-500">{item.compatible_bays ?? item.location.available_slots} compatible</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <Button type="submit" size="lg" busy={busy} className="sm:shrink-0">
          <Search className="h-4 w-4" />
          {t("home.search.cta")}
        </Button>
      </div>
    </form>
  );
}
