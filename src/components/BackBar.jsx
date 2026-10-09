import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Native-like back bar for sub-screens; pops browser history instead of
// hard-linking to a specific route.
export default function BackBar({ label = "Back" }) {
  const navigate = useNavigate();
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" /> {label}
      </button>
    </div>
  );
}