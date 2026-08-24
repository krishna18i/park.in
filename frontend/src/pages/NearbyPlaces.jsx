import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Navigation,
  Phone,
  Star,
} from "lucide-react";
import { api } from "../lib/api";
import { AROUND_CATEGORIES, formatDistance, placeImage, placesForTab } from "../lib/around";
import { directionsUrl, mapsPlaceUrl } from "../lib/maps";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import AroundTabs from "../components/AroundTabs";
import { Card, Photo, Spinner } from "../components/ui";

export default function NearbyPlaces() {
  const { locationId, category } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const tab = AROUND_CATEGORIES.includes(category) ? category : "restaurant";

  const [location, setLocation] = useState(null);
  const [nearby, setNearby] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loc, places] = await Promise.all([
          api.location(locationId),
          api.nearby(locationId).catch(() => ({ available: false, amenities: [] })),
        ]);
        if (cancelled) return;
        setLocation(loc);
        setNearby(places);
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

  const amenities = nearby?.amenities || [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        AROUND_CATEGORIES.map((id) => [id, placesForTab(amenities, id).length]),
      ),
    [amenities],
  );
  const places = placesForTab(amenities, tab);

  if (loading) return <Spinner label={t("lot.aroundLoading")} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={() => navigate(`/lot/${locationId}`)}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 transition hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("lot.aroundBack")}
      </button>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{location?.name}</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink-900">
          {t(`lot.aroundTitle.${tab}`)}
        </h1>
        <p className="mt-1 text-sm text-ink-700">{t(`lot.aroundLead.${tab}`)}</p>
      </div>

      <AroundTabs
        active={tab}
        counts={counts}
        onSelect={(id) => navigate(`/lot/${locationId}/around/${id}`)}
        t={t}
      />

      {nearby?.available === false ? (
        <p className="mt-6 text-sm text-ink-500">{t("lot.amenitiesDown")}</p>
      ) : null}

      {places.length === 0 && nearby?.available !== false ? (
        <Card className="mt-6 p-10 text-center text-sm text-ink-500">{t("lot.aroundEmpty")}</Card>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {places.map((place) => {
            const key = `${place.category}-${place.name}`;
            const expanded = openId === key;
            const kindKey = `lot.kindPlace.${place.kind || place.category}`;
            return (
              <li key={key}>
                <Card className="overflow-hidden">
                  <Photo src={placeImage(place)} alt={place.name} className="h-40 w-full" />
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                          {t(kindKey)}
                        </p>
                        <h2 className="font-display text-lg font-bold text-ink-900">{place.name}</h2>
                      </div>
                      {place.distance_m != null ? (
                        <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
                          {formatDistance(place.distance_m)}
                        </span>
                      ) : null}
                    </div>
                    {place.address ? (
                      <p className="flex items-start gap-1.5 text-sm text-ink-700">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{place.address}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-ink-500">{t("lot.aroundNoAddress")}</p>
                    )}
                    {place.description ? (
                      <p className="text-sm text-ink-700">{place.description}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={directionsUrl(place)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
                      >
                        <Navigation className="h-4 w-4" />
                        {t("home.directions")}
                      </a>
                      <a
                        href={mapsPlaceUrl(place)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-sand-200 px-4 text-sm font-semibold text-ink-700 hover:border-brand-300"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t("lot.aroundMap")}
                      </a>
                      <button
                        type="button"
                        onClick={() => setOpenId(expanded ? null : key)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-sand-200 px-4 text-sm font-semibold text-ink-700 hover:border-brand-300"
                      >
                        <Star className="h-4 w-4" />
                        {expanded ? t("lot.aroundLess") : t("lot.aroundMore")}
                      </button>
                    </div>
                    {expanded ? (
                      <dl className="space-y-2 rounded-xl bg-sand-50 px-3 py-3 text-sm text-ink-700">
                        {place.opening_hours ? (
                          <InfoRow icon={Clock} label={t("lot.aroundHours")} value={place.opening_hours} />
                        ) : null}
                        {place.cuisine ? (
                          <InfoRow icon={Star} label={t("lot.aroundCuisine")} value={place.cuisine} />
                        ) : null}
                        {place.phone ? (
                          <InfoRow
                            icon={Phone}
                            label={t("lot.aroundPhone")}
                            value={
                              <a className="font-semibold text-teal-700" href={`tel:${place.phone}`}>
                                {place.phone}
                              </a>
                            }
                          />
                        ) : null}
                        {place.website ? (
                          <InfoRow
                            icon={Globe}
                            label={t("lot.aroundWeb")}
                            value={
                              <a
                                className="break-all font-semibold text-teal-700"
                                href={place.website}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {place.website.replace(/^https?:\/\//, "")}
                              </a>
                            }
                          />
                        ) : null}
                        <InfoRow
                          icon={MapPin}
                          label={t("lot.aroundCoords")}
                          value={`${Number(place.latitude).toFixed(5)}, ${Number(place.longitude).toFixed(5)}`}
                        />
                        {!place.opening_hours && !place.phone && !place.website && !place.cuisine ? (
                          <p className="text-xs text-ink-500">{t("lot.aroundSparse")}</p>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}
