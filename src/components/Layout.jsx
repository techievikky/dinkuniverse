import React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { CalendarDays, BarChart3, PlusCircle, Dumbbell, UserCircle2, CalendarClock, MessageCircle, Building2, Trophy, Users } from "lucide-react";
import PickleballIcon from "@/components/PickleballIcon";
import PlayerTabPanels from "@/components/PlayerTabPanels";
import UserAvatar from "@/components/UserAvatar";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useChatNotifications } from "@/lib/ChatNotificationsContext";

const navForType = (type) => {
  if (type === "club_owner") {
    return [
      { to: "/club", label: "Club", icon: Building2, end: true },
      { to: "/club/reports", label: "Reports", icon: BarChart3 },
    ];
  }
  if (type === "tournament_organizer") {
    return [{ to: "/tournaments", label: "Events", icon: Trophy, end: true }];
  }
  return [
    { to: "/", label: "Plays", icon: CalendarDays, end: true },
    { to: "/new", label: "New Play", icon: PlusCircle },
    { to: "/stats", label: "My Stats", icon: BarChart3 },
    { to: "/profile", label: "Profile", icon: UserCircle2 },
    { to: "/clubs", label: "Clubs", icon: Building2 },
    { to: "/players", label: "Players", icon: Users },
    { to: "/events", label: "Tournaments", icon: Trophy },
    { to: "/availability", label: "Free Times", icon: CalendarClock },
    { to: "/chats", label: "Chats", icon: MessageCircle },
  ];
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { totalUnread } = useChatNotifications();
  const location = useLocation();
  const navItems = navForType(user?.user_type || "player");
  const isPlayer = user?.user_type === "player";

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0b1220]/80 border-b border-white/5 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-lime-500/20">
              <PickleballIcon className="w-5 h-5 text-slate-900" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <div className="font-display font-semibold tracking-tight text-white">Dink & Rally</div>
              <div className="text-[11px] text-slate-400 -mt-0.5">Pickleball plays</div>
            </div>
          </NavLink>

          <div className="flex items-center gap-3">
            <UserAvatar name={user?.full_name || user?.email} photo_url={user?.photo_url} size="md" className="hidden sm:flex" />
            <div className="hidden sm:block text-right">
              <div className="text-sm font-medium text-white">{user?.full_name || "Player"}</div>
              <div className="text-[11px] text-slate-400">{user?.email}</div>
            </div>
            {user?.role === "admin" && (
              <NavLink to="/admin" className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 transition">
                Admin
              </NavLink>
            )}
            <NavLink to="/account" className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 transition">
              Role
            </NavLink>
            <button
              onClick={() => logout()}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {isPlayer && <PlayerTabPanels />}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Bottom nav (mobile-first) */}
      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-white/5 bg-[#0b1220]/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-5xl mx-auto px-1 sm:px-4 h-16 flex items-center justify-around overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 px-2 sm:px-4 py-1.5 rounded-xl shrink-0 transition ${
                  active ? "text-lime-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                  {item.to === "/chats" && totalUnread > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium whitespace-nowrap hidden sm:block">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}