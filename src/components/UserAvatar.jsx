import React from "react";
import { Image } from "@/components/ui/image";

const sizeMap = {
  xs: "w-5 h-5 text-[10px]",
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-14 h-14 text-lg",
};

// Reusable avatar: shows a profile photo when available, otherwise an
// initials (or group icon) chip on the lime/emerald gradient used app-wide.
export default function UserAvatar({ name, photo_url, size = "md", className = "", groupIcon: GroupIcon }) {
  const sz = sizeMap[size] || sizeMap.md;
  const initial = (name || "?").charAt(0).toUpperCase();

  if (photo_url) {
    return (
      <div className={`${sz} shrink-0 rounded-full overflow-hidden bg-white/5 ${className}`}>
        <Image
          src={photo_url}
          alt={name || "avatar"}
          fittingType="fill"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sz} shrink-0 rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-lime-400 to-emerald-500 text-slate-900 ${className}`}
    >
      {GroupIcon ? <GroupIcon className="w-1/2 h-1/2" /> : initial}
    </div>
  );
}