import React from "react";

// A pickleball paddle and ball (no luc equivalent exists).
// Accepts className + strokeWidth like a lucide icon; uses currentColor.
export default function PickleballIcon({ className, strokeWidth = 2, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Paddle face */}
      <rect x="3.5" y="2" width="10.5" height="13.5" rx="5" />
      {/* Handle */}
      <rect x="7.75" y="13" width="2" height="8" rx="1" />
      {/* Grip wrap line */}
      <line x1="7.9" y1="16" x2="9.6" y2="16" />
      {/* Ball */}
      <circle cx="18" cy="17" r="3.2" />
      {/* Ball holes */}
      <circle cx="17" cy="16" r="0.45" fill="currentColor" stroke="none" />
      <circle cx="19" cy="16.4" r="0.45" fill="currentColor" stroke="none" />
      <circle cx="17.6" cy="18.4" r="0.45" fill="currentColor" stroke="none" />
      <circle cx="19.1" cy="18.2" r="0.45" fill="currentColor" stroke="none" />
    </svg>
  );
}