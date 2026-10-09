import { useState, useEffect, useRef } from "react";
import { geocode, getUserLocation, haversine, formatDistance } from "@/lib/distance";

// Returns a map of playId -> human distance label (e.g. "2.3 mi") for the given plays,
// computed from the user's current geolocation to each play's geocoded location.
export function useDistances(plays) {
  const [distances, setDistances] = useState({});
  const userRef = useRef(null);
  const coordsCache = useRef({});
  const computedRef = useRef(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      if (!plays || !plays.length) return;
      let user = userRef.current;
      if (!user) {
        user = await getUserLocation().catch(() => null);
        if (!user) return; // permission denied / unavailable
        userRef.current = user;
      }
      for (const play of plays) {
        if (!active) return;
        if (computedRef.current.has(play.id)) continue;
        computedRef.current.add(play.id);
        const q = [play.address, play.location].filter(Boolean).join(", ");
        if (!q.trim()) continue;
        let coords = coordsCache.current[q];
        if (coords === undefined) {
          coords = await geocode(q);
          coordsCache.current[q] = coords ?? null;
          await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim rate limit
        }
        if (!coords) continue;
        const mi = haversine(user.lat, user.lng, coords.lat, coords.lon, "mi");
        setDistances((d) => ({ ...d, [play.id]: formatDistance(mi) }));
      }
    })();
    return () => {
      active = false;
    };
  }, [plays]);

  return distances;
}