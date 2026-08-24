export const AROUND_CATEGORIES = [
  "hospital",
  "restaurant",
  "amenities",
  "market",
  "tourist",
];

const FALLBACK_IMAGES = {
  hospital:
    "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=80",
  restaurant:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
  cafe: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80",
  hotel:
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
  market:
    "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=900&q=80",
  tourist:
    "https://images.unsplash.com/photo-1477587458883-47145f9c1132?auto=format&fit=crop&w=900&q=80",
  landmark:
    "https://images.unsplash.com/photo-1477587458883-47145f9c1132?auto=format&fit=crop&w=900&q=80",
  amenities:
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80",
  petrol:
    "https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?auto=format&fit=crop&w=900&q=80",
};

export function placeImage(place) {
  if (place?.image_url) return place.image_url;
  return (
    FALLBACK_IMAGES[place?.kind] ||
    FALLBACK_IMAGES[place?.category] ||
    FALLBACK_IMAGES.amenities
  );
}

export function formatDistance(meters) {
  if (meters == null || Number.isNaN(Number(meters))) return "";
  const m = Number(meters);
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function placesForTab(amenities, category) {
  return (amenities || [])
    .filter((place) => place.category === category)
    .sort((a, b) => (a.distance_m ?? 9e9) - (b.distance_m ?? 9e9));
}
