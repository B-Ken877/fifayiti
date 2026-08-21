"use client";
import { Wifi, WifiOff, Cloud } from "lucide-react";

/**
 * MatchSyncStatus — the top sync indicator strip:
 * Online · Senkronize pill (green) when online,
 * OFFLINE · X evenman an atant pill (yellow) when offline,
 * and a "Simile pèt koneksyon / retou online" toggle button.
 *
 * The parent owns the online state and the toggle handler.
 */
export function MatchSyncStatus({
  online,
  pendingSync,
  onToggle,
}: {
  online: boolean;
  pendingSync: number;
  onToggle: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 fifayiti-card p-3 md:p-4">
      <div className="flex items-center gap-3">
        {online ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#116B3A]/10">
            <Cloud size={14} className="text-[#116B3A]" />
            <span className="body-sm font-bold text-[#116B3A]">
              Online · Senkronize
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F4C400]/15">
            <WifiOff size={14} className="text-[#F4C400]" />
            <span className="body-sm font-bold text-[#084C2A]">
              OFFLINE · <span className="tnum">{pendingSync}</span> evenman an atant
            </span>
          </div>
        )}
      </div>
      <button
        onClick={onToggle}
        className="btn-secondary"
      >
        {online ? <WifiOff size={14} /> : <Wifi size={14} />}
        Simile {online ? "pèt koneksyon" : "retou online"}
      </button>
    </section>
  );
}
