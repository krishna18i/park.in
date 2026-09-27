import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function FitNetwork({ nodes }) {
  const map = useMap();
  useEffect(() => {
    if (!nodes.length) return;
    if (nodes.length === 1) {
      map.setView([nodes[0].latitude, nodes[0].longitude], 14);
      return;
    }
    map.fitBounds(nodes.map((node) => [node.latitude, node.longitude]), { padding: [42, 42] });
  }, [map, nodes]);
  return null;
}

function pressureColor(level) {
  if (level === "critical") return "#ef4444";
  if (level === "high") return "#f97316";
  if (level === "moderate") return "#facc15";
  return "#22d3ee";
}

export default function CityNetworkMap({ nodes, diversion, selectedId, onSelect }) {
  const mapped = nodes.filter((node) => node.latitude != null && node.longitude != null);
  const centre = mapped.length
    ? [mapped.reduce((sum, node) => sum + node.latitude, 0) / mapped.length, mapped.reduce((sum, node) => sum + node.longitude, 0) / mapped.length]
    : [20.5937, 78.9629];
  const from = mapped.find((node) => node.id === diversion?.from?.id);
  const to = mapped.find((node) => node.id === diversion?.to?.id);

  return (
    <div className="city-map-shell">
      <MapContainer center={centre} zoom={13} scrollWheelZoom className="h-full min-h-[430px] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitNetwork nodes={mapped} />
        {from && to && (
          <Polyline
            positions={[[from.latitude, from.longitude], [to.latitude, to.longitude]]}
            pathOptions={{ color: "#22d3ee", dashArray: "7 9", weight: 4, opacity: 0.85 }}
          />
        )}
        {mapped.map((node) => {
          const active = selectedId === node.id;
          const color = pressureColor(node.pressure);
          return (
            <CircleMarker
              key={node.id}
              center={[node.latitude, node.longitude]}
              radius={active ? 18 : 13}
              pathOptions={{ color: active ? "#ffffff" : color, fillColor: color, fillOpacity: 0.88, weight: active ? 4 : 2 }}
              eventHandlers={{ click: () => onSelect(node.id) }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <div className="min-w-36 py-1">
                  <b>{node.name}</b>
                  <div>{node.occupancy}% occupied · {node.available_slots} free</div>
                  <div>Next peak: {Math.round(node.peak)}%</div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="city-map-legend">
        {[["#22d3ee", "Stable"], ["#facc15", "Moderate"], ["#f97316", "High"], ["#ef4444", "Critical"]].map(([color, label]) => (
          <span key={label}><i style={{ background: color }} />{label}</span>
        ))}
      </div>
      <div className="city-map-live"><i /> LIVE NETWORK</div>
    </div>
  );
}
