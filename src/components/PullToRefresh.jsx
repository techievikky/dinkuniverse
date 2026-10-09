import React, { useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";

// Reusable pull-to-refresh wrapper for dashboard feeds.
// Uses the window scroll position: only pulls when scrolled to the top,
// then calls `onRefresh`. Disables the native rubber-band via overscroll CSS.
export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const THRESHOLD = 70;
  const MAX = 120;

  const handleStart = (e) => {
    if (refreshing) return;
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
  };

  const handleMove = (e) => {
    if (startY.current == null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) return;
    if (window.scrollY > 0) {
      startY.current = null;
      return;
    }
    setPull(Math.min(dy * 0.5, MAX));
  };

  const handleEnd = async () => {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const handleCancel = () => {
    startY.current = null;
    if (!refreshing) setPull(0);
  };

  const ready = pull >= THRESHOLD;
  const settling = startY.current === null && !refreshing;

  return (
    <div
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleCancel}
    >
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: pull,
          opacity: pull > 0 ? 1 : 0,
          transition: settling ? "height .2s ease, opacity .2s" : "none",
        }}
      >
        {refreshing ? (
          <Loader2 className="w-6 h-6 text-lime-400 animate-spin" />
        ) : (
          <ArrowDown
            className={`w-6 h-6 text-slate-400 transition-transform ${ready ? "rotate-180 text-lime-400" : ""}`}
          />
        )}
      </div>
      {children}
    </div>
  );
}