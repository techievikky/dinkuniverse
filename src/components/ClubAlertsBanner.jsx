import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Tag, CalendarCheck, Megaphone, X } from "lucide-react";

// Active club alerts shown to all players on the home page (members + non-members).
// Dismissal is permanent per player: once closed, an alert stays hidden across
// reloads and future sessions until a new alert is posted.
const iconFor = (type) => (type === "discount" ? Tag : type === "booking" ? CalendarCheck : Megaphone);
const dismissedKey = (userId) => `dinkrally_dismissed_alerts_${userId}`;

export default function ClubAlertsBanner() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(dismissedKey(user.id));
      setDismissed(new Set(raw ? JSON.parse(raw) : []));
    } catch {
      setDismissed(new Set());
    }
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const all = await base44.entities.ClubAlert.list("-created_date", 50);
        setAlerts(all.filter((a) => a.active && (!a.expires || a.expires >= today)));
      } catch {
        setAlerts([]);
      }
    })();
  }, []);

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      if (user) {
        try {
          localStorage.setItem(dismissedKey(user.id), JSON.stringify([...next]));
        } catch {
          /* best-effort */
        }
      }
      return next;
    });
  };

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <div className="space-y-2 mb-5">
      {visible.map((a) => {
        const Icon = iconFor(a.type);
        return (
          <div key={a.id} className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 to-orange-400/10 p-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white text-sm">{a.title}</span>
                {a.discount != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-200 font-bold">{a.discount}% OFF</span>
                )}
                {a.club_name && <span className="text-[10px] text-slate-400">· {a.club_name}</span>}
              </div>
              {a.message && <p className="text-xs text-slate-300 mt-0.5 whitespace-pre-wrap">{a.message}</p>}
            </div>
            <button onClick={() => dismiss(a.id)} className="text-slate-400 hover:text-white shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}