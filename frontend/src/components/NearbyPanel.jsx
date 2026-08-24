import { useNavigate } from "react-router-dom";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { ArrowRight } from "lucide-react";
import { useI18n } from "../context/I18nContext";
import { AROUND_CATEGORIES, placesForTab } from "../lib/around";
import AroundTabs from "./AroundTabs";
import "leaflet/dist/leaflet.css";

const COLORS = {
  hospital: "#00695c",
  restaurant: "#c44100",
  amenities: "#7a2900",
  market: "#e65100",
  tourist: "#1c8b7d",
  lot: "#241d18",
};

export default function NearbyPanel({ nearby, location }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  if (!location?.latitude) return null;

  const amenities = nearby?.amenities || [];
  const available = nearby?.available;
  const counts = Object.fromEntries(
    AROUND_CATEGORIES.map((id) => [id, placesForTab(amenities, id).length]),
  );

  const openTab = (category) => {
    navigate(`/lot/${location.id}/around/${category}`);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">{t("lot.around")}</h3>
        <p className="text-sm text-ink-700">{t("lot.aroundHint")}</p>
      </div>
      <AroundTabs active={null} counts={counts} onSelect={openTab} t={t} />
      <div className="overflow-hidden rounded-2xl border border-sand-200">
        <MapContainer
          center={[location.latitude, location.longitude]}
          zoom={15}
          scrollWheelZoom={false}
          className="z-0 h-56 w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CircleMarker
            center={[location.latitude, location.longitude]}
            radius={12}
            pathOptions={{ color: COLORS.lot, fillColor: COLORS.lot, fillOpacity: 1, weight: 2 }}
          />
          {amenities.map((place) => (
            <CircleMarker
              key={`${place.category}-${place.name}`}
              center={[place.latitude, place.longitude]}
              radius={6}
              pathOptions={{
                color: COLORS[place.category] || COLORS.tourist,
                fillColor: COLORS[place.category] || COLORS.tourist,
                fillOpacity: 0.9,
                weight: 2,
              }}
              eventHandlers={{ click: () => openTab(place.category) }}
            />
          ))}
        </MapContainer>
      </div>
      {available === false ? (
        <p className="text-xs text-ink-500">{t("lot.amenitiesDown")}</p>
      ) : null}
      <button
        type="button"
        onClick={() => openTab("restaurant")}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800"
      >
        {t("lot.aroundSeeAll")}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
