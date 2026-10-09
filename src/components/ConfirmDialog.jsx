import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

// Reusable confirm dialog built on the shadcn AlertDialog, replacing
// native window.confirm() calls with dark-themed app UI.
export default function ConfirmDialog({
  open,
  onOpenChange,
  title = "Are you sure?",
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
}) {
  const actionClass = destructive
    ? "bg-rose-500 hover:bg-rose-600 text-white border-0"
    : "bg-lime-400 hover:bg-lime-300 text-slate-900 border-0";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-slate-900 border-white/10 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription className="text-slate-400">{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 text-slate-200 hover:bg-white/5">{cancelText}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={actionClass}>
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}