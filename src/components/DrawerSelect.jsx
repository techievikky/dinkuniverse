import React, { useState } from "react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ChevronDown, Check } from "lucide-react";

// options: string[] or { value, label }[]
export default function DrawerSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  title = "Choose an option",
  triggerClassName = "",
}) {
  const [open, setOpen] = useState(false);

  const normalize = (o) =>
    typeof o === "object" && o !== null ? { value: o.value, label: o.label ?? o.value } : { value: o, label: o };
  const normOptions = options.map(normalize);
  const selected = normOptions.find((o) => o.value === value);
  const display = selected ? selected.label : value || placeholder;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={`${triggerClassName} text-left flex items-center justify-between gap-2`}
        >
          <span className={selected ? "" : "text-slate-500"}>{display}</span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-slate-900 border-white/10 text-white max-h-[75vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-white">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] overflow-y-auto">
          {normOptions.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition ${
                  active ? "bg-lime-400/15 text-lime-300" : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <span className="font-medium">{o.label}</span>
                {active && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}