/** Google Maps directions + OpenStreetMap embed. No API keys required. */

export function directionsUrl({ latitude, longitude, address, name }) {
  const dest =
    latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : address || name || "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

export function mapsPlaceUrl({ latitude, longitude, name, address }) {
  const query =
    name && latitude != null
      ? `${name} ${latitude},${longitude}`
      : latitude != null && longitude != null
        ? `${latitude},${longitude}`
        : address || name || "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function osmEmbedUrl({ latitude, longitude }) {
  if (latitude == null || longitude == null) return null;
  const pad = 0.008;
  const bbox = [
    longitude - pad,
    latitude - pad,
    longitude + pad,
    latitude + pad,
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}
