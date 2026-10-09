import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Loader2 } from "lucide-react";

// Renders a unique QR code for the signed-in player. The QR encodes a compact
// JSON payload ({ u: user_id, n: name }) that a club owner scans at check-in.
export default function PlayerQR({ user }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState(false);
  const name = user?.full_name || user?.email || "Player";

  useEffect(() => {
    if (!user?.id) return;
    const payload = JSON.stringify({ u: user.id, n: name });
    QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setUrl)
      .catch(() => setErr(true));
  }, [user?.id, name]);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 mb-6">
      <div className="flex items-center gap-2 mb-1.5">
        <QrCode className="w-4 h-4 text-lime-400" />
        <h3 className="font-semibold text-white">My check-in QR code</h3>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Show this to a club owner at check-in — they'll scan it to mark you in.
      </p>
      <div className="flex flex-col items-center">
        <div className="rounded-2xl bg-white p-3 shadow-lg">
          {url ? (
            <img src={url} alt="Your check-in QR code" className="w-56 h-56" />
          ) : err ? (
            <div className="w-56 h-56 flex items-center justify-center text-sm text-rose-400 text-center px-4">
              Could not generate QR
            </div>
          ) : (
            <div className="w-56 h-56 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
            </div>
          )}
        </div>
        <div className="mt-3 text-center">
          <div className="text-white font-medium">{name}</div>
          <div className="text-xs text-slate-500">Scan to check in</div>
        </div>
      </div>
    </div>
  );
}