import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Image as ImageIcon, Loader2, Upload, Trash2 } from "lucide-react";
import { Image } from "@/components/ui/image";

// Reusable logo uploader: uploads a file via Core.UploadFile and reports the
// resulting URL back through onChange. Used by club owners and tournament
// organizers to attach a logo to their profile.
export default function LogoUploader({ logoUrl, onChange, label = "logo" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange(file_url);
    } catch (err) {
      alert("Upload failed: " + (err.message || err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center overflow-hidden shrink-0">
        {busy ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : logoUrl ? (
          <Image src={logoUrl} alt={label} fittingType="fill" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-slate-500" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold transition disabled:opacity-60"
        >
          <Upload className="w-3.5 h-3.5" /> {logoUrl ? "Change" : "Upload"} {label}
        </button>
        {logoUrl && (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-rose-400 transition"
          >
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handle} className="hidden" />
    </div>
  );
}