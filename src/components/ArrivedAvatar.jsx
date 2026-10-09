import React from "react";
import UserAvatar from "@/components/UserAvatar";
import { CheckCircle2 } from "lucide-react";

// Wraps UserAvatar with a small green "arrived" badge so organizers can scan a
// bracket or roster and instantly see who has checked in on site.
export default function ArrivedAvatar({ arrived, name, photo_url, size = "sm", className = "" }) {
  return (
    <div className="relative shrink-0">
      <UserAvatar name={name} photo_url={photo_url} size={size} className={className} />
      {arrived && (
        <span
          title="Checked in"
          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-2 ring-[#0b1220]"
        >
          <CheckCircle2 className="w-3 h-3" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}