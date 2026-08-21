"use client";
import { type MatchEventKind } from "@/lib/fifayiti-data";
import { CONTROL_BUTTONS } from "./types";
import { cn } from "@/lib/utils";

/**
 * MatchPhaseControls — 4 control buttons for match state transitions:
 *   Kòmanse · Mwatye tan · Dezyèm mitan · Fen match
 *
 * Each button is enabled/disabled based on the current `half`:
 *   - PRE → only Kòmanse enabled
 *   - 1   → only Mwatye tan + Fen match enabled (cannot start second half yet)
 *   - HT  → only Dezyèm mitan + Fen match enabled
 *   - 2   → only Fen match enabled (chronometer auto-stops at 30:00)
 *   - POST→ all disabled (match ended)
 */
export function MatchPhaseControls({
  onPick,
  disabled,
  currentHalf,
  isLive,
  running,
}: {
  onPick: (kind: MatchEventKind) => void;
  disabled?: boolean;
  currentHalf: string; // "PRE" | "1" | "HT" | "2" | "POST"
  isLive: boolean;
  running?: boolean;
}) {
  const canPick = (kind: MatchEventKind): boolean => {
    if (disabled) return false;
    if (kind === "KOMANSE") return currentHalf === "PRE";
    if (kind === "MWATYE_TAN") return currentHalf === "1";
    if (kind === "DEZYEM_MITAN") return currentHalf === "HT";
    if (kind === "FEN_MATCH") return currentHalf === "1" || currentHalf === "2" || currentHalf === "HT";
    return false;
  };

  return (
    <section className="fifayiti-card p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="eyebrow text-[#667085]">Etap match</p>
          <h3 className="heading-md text-[#084C2A]">Kontwòl match</h3>
        </div>
        <span className="meta text-[#667085]">
          {running
            ? "Chronometer ap konte"
            : currentHalf === "PRE"
            ? "Tann kòmanse"
            : currentHalf === "HT"
            ? "Mwatye tan — tann 2yèm mitan"
            : currentHalf === "POST"
            ? "Match fini"
            : "Kanpe"}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {CONTROL_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const fg = btn.color === "#F4C400" ? "#084C2A" : "#FFFFFF";
          const enabled = canPick(btn.kind);
          return (
            <button
              key={btn.kind}
              onClick={() => enabled && onPick(btn.kind)}
              disabled={!enabled}
              className={cn(
                "flex items-center justify-center gap-2.5 rounded-xl heading-md transition-all",
                enabled
                  ? "hover:brightness-110 hover:-translate-y-0.5"
                  : "opacity-40 cursor-not-allowed"
              )}
              style={{
                background: btn.color,
                color: fg,
                minHeight: 64,
              }}
            >
              <Icon size={22} />
              {btn.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
