"use client";
import { type LocalEvent, KIND_META } from "./types";
import { History, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MatchAuditTrail } from "./audit-trail";

/**
 * MatchEventTimeline — the live event feed (reverse chronological).
 *
 * Shows the section header with event count, an empty state when no events,
 * and the list of events. Each event row has the kind icon, label, minute,
 * description, and (if not corrected) a "Korije" button to open the
 * correction dialog. Corrected events get a strikethrough + correction note
 * rendered by MatchAuditTrail.
 *
 * The parent owns the events list and the onCorrect handler.
 */
export function MatchEventTimeline({
  events,
  onCorrect,
}: {
  events: LocalEvent[];
  onCorrect: (event: LocalEvent) => void;
}) {
  return (
    <section className="fifayiti-card overflow-hidden">
      <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#116B3A] flex items-center justify-center">
            <History size={16} className="text-white" />
          </div>
          <div>
            <p className="eyebrow text-[#667085]">Audit trail</p>
            <h3 className="heading-md text-[#084C2A]">Flux evenman an dirèk</h3>
            <p className="meta text-[#667085] mt-0.5">
              <span className="tnum">{events.length}</span> evenman · nan rèd kronolojik inèvè
            </p>
          </div>
        </div>
      </div>
      {events.length === 0 ? (
        <div className="p-8 text-center">
          <History size={24} className="mx-auto text-[#E4E7EC]" />
          <p className="mt-2 body-sm font-bold text-[#101828]">
            Pa gen evenman anko
          </p>
          <p className="meta text-[#667085] mt-1">
            Klike sou yon bouton pou anrejistre premye evenman an.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#E4E7EC] max-h-[480px] overflow-y-auto">
          {events.map((e) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            const corrected = e.corrected;
            return (
              <li
                key={e.id}
                className="px-4 md:px-5 py-3 flex items-center gap-3"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: meta.bg, color: meta.color === "#F4C400" ? "#084C2A" : "#FFFFFF" }}
                >
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "body-sm font-bold text-[#101828] truncate",
                      corrected && "line-through opacity-60"
                    )}
                  >
                    {meta.label} — <span className="tnum">{e.minute}'</span>
                  </p>
                  <p
                    className={cn(
                      "meta text-[#667085] truncate",
                      corrected && "line-through opacity-60"
                    )}
                  >
                    {e.description}
                  </p>
                  <MatchAuditTrail event={e} />
                </div>
                <span className="meta text-[#667085] tnum shrink-0 hidden md:block">
                  {new Date(e.recordedAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {!corrected && (
                  <button
                    onClick={() => onCorrect(e)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md eyebrow bg-[#F4C400]/20 text-[#084C2A] hover:bg-[#F4C400]/40"
                    style={{ minHeight: 32 }}
                  >
                    <Undo2 size={11} /> Korije
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
