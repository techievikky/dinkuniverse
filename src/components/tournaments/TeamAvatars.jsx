import React from "react";
import { UserPlus } from "lucide-react";
import ArrivedAvatar from "@/components/ArrivedAvatar";

// Renders the avatars for a tournament entry's team. For doubles it shows the
// registering player plus their nominated partner (or a "needs partner" hint);
// for singles it shows the single player. A green badge appears on each avatar
// once that player has checked in on site (entry.arrived / partner_arrived).
// `players` is a map of user_id -> Player record (for photo_url lookup).
export default function TeamAvatars({ entry, isDoubles, players = {} }) {
  const p1 = entry.user_id ? players[entry.user_id] : null;
  const p1Name = p1?.name || entry.name;

  if (!isDoubles) {
    return <ArrivedAvatar arrived={!!entry.arrived} name={p1Name} photo_url={p1?.photo_url} size="sm" />;
  }

  const partnerName = entry.partner_name;
  const partnerPhoto = entry.partner_user_id ? players[entry.partner_user_id]?.photo_url : null;

  return (
    <div className="flex items-center gap-1 shrink-0">
      <ArrivedAvatar arrived={!!entry.arrived} name={p1Name} photo_url={p1?.photo_url} size="sm" />
      {partnerName ? (
        <ArrivedAvatar arrived={!!entry.partner_arrived} name={partnerName} photo_url={partnerPhoto} size="sm" />
      ) : (
        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 border border-dashed border-white/20 text-slate-400">
          <UserPlus className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
}