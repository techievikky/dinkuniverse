import React from "react";
import { Plus, Trash2, Layers, Users } from "lucide-react";
import DrawerSelect from "@/components/DrawerSelect";
import { CATEGORIES, BRACKETS, bracketFor } from "./divisions";

// Manages the divisions array on a tournament: category (singles / men's, women's,
// mixed doubles) × DUPR bracket × number of teams. Controlled by `value`/`onChange`.
export default function DivisionsBuilder({ value = [], onChange, inputCls }) {
  const divisions = Array.isArray(value) ? value : [];

  const update = (idx, patch) =>
    onChange(divisions.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const remove = (idx) => onChange(divisions.filter((_, i) => i !== idx));
  const add = () =>
    onChange([
      ...divisions,
      { category: "singles", dupr_min: 0, dupr_max: 8.0, teams: 8 },
    ]);

  return (
    <div className="space-y-3">
      {divisions.length === 0 && (
        <p className="text-xs text-slate-500">
          Add at least one division — pick a category, a DUPR rating bracket, and how many teams it holds.
        </p>
      )}

      {divisions.map((d, idx) => (
        <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Division {idx + 1}</span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="w-9 h-9 rounded-lg border border-white/10 hover:bg-rose-500/15 hover:text-rose-300 text-slate-300 flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-400 mb-1 block">Category</label>
            <DrawerSelect
              triggerClassName={inputCls}
              value={d.category}
              onChange={(v) => update(idx, { category: v })}
              options={CATEGORIES}
              title="Division category"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-400 mb-1 block">DUPR bracket</label>
            <DrawerSelect
              triggerClassName={inputCls}
              value={bracketFor(d)}
              onChange={(v) => {
                const b = BRACKETS.find((x) => x.value === v) || BRACKETS[BRACKETS.length - 1];
                update(idx, { dupr_min: b.min, dupr_max: b.max });
              }}
              options={BRACKETS.map((b) => ({ value: b.value, label: b.label }))}
              title="DUPR rating bracket"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
              <Users className="w-3 h-3" /> Teams in this division
            </label>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              className={`${inputCls} no-select`}
              placeholder="e.g. 8"
              value={d.teams ?? ""}
              onChange={(e) => update(idx, { teams: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-dashed border-lime-400/40 hover:bg-lime-400/10 text-lime-300 font-semibold text-sm transition"
      >
        <Plus className="w-4 h-4" /> Add division
      </button>
    </div>
  );
}