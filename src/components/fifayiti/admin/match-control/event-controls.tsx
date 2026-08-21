"use client";
import { type MatchEventKind } from "@/lib/fifayiti-data";
import { EVENT_BUTTONS } from "./types";
import { cn } from "@/lib/utils";

/**
 * MatchEventControls — 4 operational event buttons:
 *   Gòl · Kat jòn · Kat wouj · Ranplasman
 *
 * Disabled when the match isn't live (operator can't record events
 * during pre-match or after the match has ended).
 */
export function MatchEventControls({
  onPick,
  disabled,
}: {
  onPick: (kind: MatchEventKind) => void;
  disabled?: boolean;
}) {
  return (
    <section className="fifayiti-card p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="eyebrow text-[#667085]">Aksè rapid</p>
          <h3 className="heading-md text-[#084C2A]">Bouton evenman</h3>
        </div>
        <span className="meta text-[#667085]">
          {disabled ? "Aktive lè match an dirèk" : "Itilize pandan jwèt la"}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {EVENT_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const fg = btn.color === "#F4C400" ? "#084C2A" : "#FFFFFF";
          return (
            <button
              key={btn.kind}
              onClick={() => !disabled && onPick(btn.kind)}
              disabled={disabled}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl heading-md transition-all",
                disabled
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:brightness-110 hover:-translate-y-0.5"
              )}
              style={{
                background: btn.color,
                color: fg,
                minHeight: 80,
                padding: "14px 8px",
              }}
            >
              <Icon size={28} />
              {btn.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
