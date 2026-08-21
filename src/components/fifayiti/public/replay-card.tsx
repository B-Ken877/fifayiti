"use client";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";
import { TeamCrest } from "../team-crest";
import { teamById, playerById, type Replay } from "@/lib/fifayiti-data";

interface ReplayCardProps {
  replay: Replay;
  className?: string;
  onClick?: () => void;
}

const KIND_LABELS: Record<Replay["kind"], { label: string; color: string; bg: string }> = {
  GOL:             { label: "Gòl",        color: "#F4C400", bg: "#F4C400" },
  SAV:             { label: "Sov",        color: "#FFFFFF", bg: "#116B3A" },
  KAT:             { label: "Kat jòn",    color: "#FFFFFF", bg: "#667085" },
  KADON:           { label: "Kat wouj",   color: "#FFFFFF", bg: "#D92D20" },
  SUBSTITUSYON:    { label: "Ranplasman", color: "#FFFFFF", bg: "#1B3A6B" },
};

export function ReplayCard({ replay, className, onClick }: ReplayCardProps) {
  const team = replay.teamId ? teamById(replay.teamId) : undefined;
  const player = replay.playerId ? playerById(replay.playerId) : undefined;
  const kindInfo = KIND_LABELS[replay.kind];

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-xl overflow-hidden bg-white border border-[#E4E7EC] hover:border-[#F4C400] hover:shadow-lg transition-all text-left",
        className
      )}
    >
      {/* Thumbnail — broadcast style */}
      <div className="relative aspect-video bg-pitch-texture-deep overflow-hidden">
        {/* Faint team crest watermark */}
        {team && (
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <TeamCrest
              teamId={team.id}
              shortName={team.shortName}
              primary={team.primaryColor}
              secondary={team.secondaryColor}
              size="lg"
            />
          </div>
        )}

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl"
            style={{ background: kindInfo.bg }}
          >
            <Play size={18} className="ml-0.5" fill={kindInfo.color} style={{ color: kindInfo.color }} />
          </div>
        </div>

        {/* Minute chip — top left, yellow */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold tnum bg-[#F4C400] text-[#084C2A]">
            {replay.minute}'
          </span>
        </div>

        {/* Kind chip — top right */}
        <div className="absolute top-2 right-2">
          <span
            className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md"
            style={{ background: "rgba(0,0,0,0.55)", color: kindInfo.color === "#FFFFFF" ? "#FFFFFF" : kindInfo.color }}
          >
            {kindInfo.label}
          </span>
        </div>
      </div>

      {/* Body — title, player, team */}
      <div className="p-3 space-y-1">
        <p className="font-bold text-sm text-[#084C2A] truncate">{replay.title}</p>
        {player && (
          <p className="fifayiti-small text-[#667085] truncate">
            {player.firstName} {player.lastName}
          </p>
        )}
        {team && (
          <p className="fifayiti-meta text-[#667085] truncate uppercase tracking-wider">
            {team.name}
          </p>
        )}
      </div>
    </button>
  );
}
