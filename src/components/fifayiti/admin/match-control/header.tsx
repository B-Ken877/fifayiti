"use client";
import { type Match } from "@/lib/fifayiti-data";
import { Trophy, MapPin, Megaphone, User } from "lucide-react";

/**
 * MatchControlHeader — the 4-column match info bar:
 * Konpetisyon · Stad · Arbit · Komisè.
 *
 * Renders inside the scoreboard card (composed by MatchControlPage).
 */
export function MatchControlHeader({ match }: { match: Match }) {
  return (
    <div className="mt-5 pt-4 border-t border-[#E4E7EC] grid grid-cols-2 md:grid-cols-4 gap-3">
      <Info icon={<Trophy size={12} className="text-[#116B3A]" />} label="Konpetisyon" value={match.competition} />
      <Info icon={<MapPin size={12} className="text-[#116B3A]" />} label="Stad" value={match.venue} />
      <Info icon={<Megaphone size={12} className="text-[#116B3A]" />} label="Arbit" value={match.referee ?? "—"} />
      <Info icon={<User size={12} className="text-[#116B3A]" />} label="Komisè" value={match.commissioner ?? "—"} />
    </div>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="inline-flex items-center gap-1 eyebrow text-[#667085] mb-0.5">
        {icon}
        {label}
      </p>
      <p className="body-sm font-bold text-[#101828] truncate">{value}</p>
    </div>
  );
}
