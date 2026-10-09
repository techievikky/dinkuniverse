import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2, CameraOff } from "lucide-react";

// Camera-based QR scanner. Mounts only while open (parent conditionally
// renders it), starts the rear camera, and calls onScan(decodedText) once a
// code is read. Cleans up (stops + clears the camera) on unmount.
export default function CheckInScanner({ onScan, onError }) {
  const [status, setStatus] = useState("starting"); // starting | ready | error
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let active = true;
    let scanner = null;
    const start = async () => {
      try {
        scanner = new Html5Qrcode("ph-qr-reader");
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (active) onScanRef.current?.(decoded);
          },
          () => { /* per-frame decode miss — ignore */ }
        );
        if (active) setStatus("ready");
      } catch (e) {
        if (active) {
          setStatus("error");
          onErrorRef.current?.(e);
        }
      }
    };
    start();
    return () => {
      active = false;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {
            try { scanner.clear(); } catch { /* already cleared */ }
          });
      }
    };
  }, []);

  return (
    <div>
      <div id="ph-qr-reader" className="w-full overflow-hidden rounded-2xl bg-black" />
      {status === "starting" && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Starting camera…
        </div>
      )}
      {status === "error" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-rose-400">
          <CameraOff className="w-4 h-4" /> Could not access the camera. Grant camera permission and try again.
        </div>
      )}
    </div>
  );
}