import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import UserAvatar from "@/components/UserAvatar";
import AvailabilityBadge from "@/components/players/AvailabilityBadge";
import { Loader2, Search, Star, X, MapPin } from "lucide-react";

export default function Players() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [favorites, setFavorites] = useState([]);
  const [availByPlayer, setAvailByPlayer] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const loadFavorites = async () => {
    try {
      const recs = await base44.entities.FavoritePlayer.filter({ created_by_id: user.id });
      setFavorites(recs);
      const entries = await Promise.all(
        recs.map(async (f) => {
          try {
            const a = await base44.entities.Availability.forPlayer(f.player_user_id);
            return [f.player_user_id, a];
          } catch {
            return [f.player_user_id, []];
          }
        })
      );
      setAvailByPlayer(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const isFavorite = (uid) => favorites.some((f) => f.player_user_id === uid);

  const toggleFavorite = async (player) => {
    const existing = favorites.find((f) => f.player_user_id === player.user_id);
    setBusyId(player.user_id);
    try {
      if (existing) {
        await base44.entities.FavoritePlayer.delete(existing.id);
        setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
        toast({ title: `Removed ${player.name} from favorites` });
      } else {
        const rec = await base44.entities.FavoritePlayer.create({
          player_user_id: player.user_id,
          player_name: player.name,
          player_photo: player.photo_url || "",
        });
        setFavorites((prev) => [...prev, rec]);
        try {
          const a = await base44.entities.Availability.forPlayer(player.user_id);
          setAvailByPlayer((m) => ({ ...m, [player.user_id]: a }));
        } catch { /* ignore */ }
        toast({ title: `Added ${player.name} to favorites` });
      }
    } catch (err) {
      toast({ title: "Could not update favorite", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const runSearch = async (e) => {
    e?.preventDefault?.();
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setSearching(true);
    try {
      const all = await base44.entities.Player.list("-created_date", 500);
      const ql = q.toLowerCase();
      setResults(
        all.filter(
          (p) =>
            p.user_id !== user.id &&
            ((p.name && p.name.toLowerCase().includes(ql)) ||
              (p.city && p.city.toLowerCase().includes(ql)) ||
              (p.home_club && p.home_club.toLowerCase().includes(ql)))
        )
      );
    } catch (err) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Players</h1>
      <p className="text-slate-400 text-sm mt-1 mb-5">Find players and favorite them to see who's free at a glance.</p>

      <h2 className="font-display text-lg font-semibold text-white mb-3 flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-400" /> Favorites
      </h2>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : favorites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400 mb-8">
          No favorites yet. Search for a player below and tap the star to add them.
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {favorites.map((f) => (
            <div key={f.id} className="paddle-card border border-lime-300/60 bg-white/[0.03] p-4 shadow-[0_0_18px_-6px_#d4ff3a]">
              <div className="flex items-center gap-3">
                <UserAvatar name={f.player_name} photo_url={f.player_photo} size="lg" className="rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white truncate">{f.player_name}</div>
                  <div className="mt-1">
                    <AvailabilityBadge records={availByPlayer[f.player_user_id] || []} />
                  </div>
                </div>
                <button
                  onClick={() => toggleFavorite({ user_id: f.player_user_id, name: f.player_name, photo_url: f.player_photo })}
                  disabled={busyId === f.player_user_id}
                  className="shrink-0 w-11 h-11 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 flex items-center justify-center disabled:opacity-60"
                  title="Remove from favorites"
                >
                  {busyId === f.player_user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-5 h-5 fill-current" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-display text-lg font-semibold text-white mb-3">Find a player</h2>
      <form onSubmit={runSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            className={inputCls + " pl-10"}
            placeholder="Search by name, city or club"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setResults(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button type="submit" disabled={searching} className="shrink-0 px-5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold flex items-center gap-2 disabled:opacity-60">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
        </button>
      </form>

      {results && (
        results.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">No players found. Try a different name or city.</div>
        ) : (
          <div className="space-y-2">
            {results.map((p) => {
              const fav = isFavorite(p.user_id);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                  <UserAvatar name={p.name} photo_url={p.photo_url} size="md" className="rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white truncate">{p.name}</div>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3">
                      {p.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.city}</span>}
                      {p.home_club && <span>{p.home_club}</span>}
                      {p.dupr_score != null && <span>DUPR {p.dupr_score}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleFavorite(p)}
                    disabled={busyId === p.user_id}
                    className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-60 transition ${
                      fav ? "bg-amber-400/15 text-amber-300 hover:bg-amber-400/25" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-amber-300"
                    }`}
                    title={fav ? "Remove from favorites" : "Add to favorites"}
                  >
                    {busyId === p.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className={`w-5 h-5 ${fav ? "fill-current" : ""}`} />}
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}