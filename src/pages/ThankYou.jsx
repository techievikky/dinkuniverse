import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

export default function ThankYou() {
  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-lime-400/15 flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8 text-lime-400" />
      </div>
      <h1 className="font-display text-2xl font-bold text-white">Payment received</h1>
      <p className="text-slate-400 text-sm mt-2 max-w-sm">
        Your tournament registration is being confirmed. You'll see your entry under Tournaments shortly.
      </p>
      <Link
        to="/events"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm transition"
      >
        Back to Tournaments
      </Link>
    </div>
  );
}