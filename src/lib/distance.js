// Lightweight client-side distance helpers: browser geolocation + OSM Nominatim geocoding + Haversine.

export function haversine(lat1, lon1, lat2, lon2, unit = "mi") {
  const R = unit === "km" ? 6371 : 3958.8; // earth radius
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

const geoCache = new Map(); // query(lowercased) -> { lat, lon } | null

export async function geocode(query) {
  if (!query) return null;
  const key = query.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) {
      geoCache.set(key, null);
      return null;
    }
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    const coords = hit ? { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) } : null;
    geoCache.set(key, coords);
    return coords;
  } catch {
    return null;
  }
}

export function formatDistance(mi) {
  if (mi == null) return "";
  if (mi < 0.1) return `${Math.round(mi * 5280)} ft`;
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}