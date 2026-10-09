import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import NewPlay from "@/pages/NewPlay";
import Stats from "@/pages/Stats";
import Profile from "@/pages/Profile";
import Clubs from "@/pages/Clubs";
import Availability from "@/pages/Availability";
import Chats from "@/pages/Chats";
import PlayerTournaments from "@/pages/PlayerTournaments";
import Players from "@/pages/Players";

// Persistent tab panels: keep each bottom-tab page mounted *once visited*
// and toggle visibility by route so view state & scroll are preserved across
// tab switches. Panels lazy-mount on first visit to avoid fetching everything
// at login.
const PANELS = [
  { path: "/", Component: Home },
  { path: "/new", Component: NewPlay },
  { path: "/stats", Component: Stats },
  { path: "/profile", Component: Profile },
  { path: "/clubs", Component: Clubs },
  { path: "/players", Component: Players },
  { path: "/availability", Component: Availability },
  { path: "/chats", Component: Chats },
  { path: "/events", Component: PlayerTournaments },
];

export default function PlayerTabPanels() {
  const { pathname } = useLocation();
  const [mounted, setMounted] = useState(() => new Set());

  useEffect(() => {
    const panel = PANELS.find((p) => p.path === pathname);
    if (!panel) return;
    setMounted((prev) => {
      if (prev.has(panel.path)) return prev;
      const next = new Set(prev);
      next.add(panel.path);
      return next;
    });
  }, [pathname]);

  return (
    <>
      {PANELS.map(({ path, Component }) => {
        if (!mounted.has(path)) return null;
        const active = pathname === path;
        return (
          <div key={path} className={active ? "" : "hidden"} aria-hidden={!active}>
            <Component />
          </div>
        );
      })}
    </>
  );
}