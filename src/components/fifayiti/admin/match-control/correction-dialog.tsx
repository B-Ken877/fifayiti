"use client";
import { type LocalEvent, KIND_META } from "./types";
import { Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * MatchCorrectionDialog — the correction / Anile dialog.
 *
 * Shows the target event info (description + minute), a reason textarea,
 * and Anile / Konfime koreksyon buttons. Confirming marks the event as
 * corrected (parent handles the state update + score decrement).
 */
export function MatchCorrectionDialog({
  open,
  target,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  target: LocalEvent | null;
  reason: string;
  onReasonChange: (s: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open && target !== null}
      onOpenChange={(o) => !o && onClose()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D92D20]">
            <Undo2 size={18} /> Korije / Anile evenman
          </DialogTitle>
          <DialogDescription>
            {target && (
              <>
                Ou ap korije evenman:{" "}
                <strong className="text-[#084C2A]">
                  {KIND_META[target.kind].label} · <span className="tnum">{target.minute}'</span>
                </strong>
                . Evenman original rete nan flux la (barye), men koreksyon
                anrejistre nan audit.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-[#E4E7EC] bg-[#F4F7F3] p-3 meta text-[#667085]">
              <p className="font-bold text-[#084C2A]">
                {target.description}
              </p>
            </div>
            <div>
              <label className="block eyebrow text-[#667085] mb-1.5">
                Rezon koreksyon
              </label>
              <textarea
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Egz: aksidan, arbitr deside anile kat jòn a..."
                className="w-full px-3 py-2 rounded-[10px] border border-[#E4E7EC] bg-white body-sm text-[#101828]"
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn-secondary">
              Anile
            </button>
          </DialogClose>
          <button
            onClick={onConfirm}
            className="btn-danger"
          >
            <Undo2 size={14} /> Konfime koreksyon
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
