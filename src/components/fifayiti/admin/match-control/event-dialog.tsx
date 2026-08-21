"use client";
import { type Match, type Team, type Player, type MatchEventKind } from "@/lib/fifayiti-data";
import { teamById, playerById } from "@/lib/fifayiti-data";
import { TeamCrest } from "../../team-crest";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { KIND_META, NO_TEAM_KINDS } from "./types";

/**
 * MatchEventDialog — the event confirmation flow:
 * team selector → player selector → preview → Konfime.
 *
 * The parent owns all selection state (selectedTeam, selectedPlayerIn,
 * selectedPlayerOut, openEvent). The parent also handles confirmEvent.
 */
export function MatchEventDialog({
  open,
  kind,
  match,
  home,
  away,
  selectedTeam,
  selectedPlayerIn,
  selectedPlayerOut,
  clock,
  homePlayers,
  awayPlayers,
  onSelectTeam,
  onSelectPlayerIn,
  onSelectPlayerOut,
  onClose,
  onConfirm,
}: {
  open: boolean;
  kind: MatchEventKind | null;
  match: Match;
  home: Team;
  away: Team;
  selectedTeam: string;
  selectedPlayerIn: string;
  selectedPlayerOut: string;
  clock: number;
  homePlayers: Player[];
  awayPlayers: Player[];
  onSelectTeam: (teamId: string) => void;
  onSelectPlayerIn: (id: string) => void;
  onSelectPlayerOut: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const selectOptions =
    selectedTeam === home.id
      ? homePlayers
      : selectedTeam === away.id
      ? awayPlayers
      : [];

  return (
    <Dialog
      open={open && kind !== null}
      onOpenChange={(o) => !o && onClose()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#084C2A]">
            {kind && (
              <>
                {(() => {
                  const Icon = KIND_META[kind].icon;
                  return <Icon size={18} style={{ color: KIND_META[kind].color }} />;
                })()}
                {KIND_META[kind].label}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            Konfime aksyon pou match {home.name} vs {away.name}. Minit kouran:{" "}
            <strong className="text-[#084C2A] tnum">{clock}'</strong>.
          </DialogDescription>
        </DialogHeader>

        {kind && !NO_TEAM_KINDS.includes(kind) && (
          <div className="space-y-3 py-2">
            <div>
              <label className="block eyebrow text-[#667085] mb-1.5">
                Ekip
              </label>
              <div className="grid grid-cols-2 gap-2">
                <TeamChoice
                  team={home}
                  selected={selectedTeam === home.id}
                  onClick={() => onSelectTeam(home.id)}
                />
                <TeamChoice
                  team={away}
                  selected={selectedTeam === away.id}
                  onClick={() => onSelectTeam(away.id)}
                />
              </div>
            </div>

            {selectedTeam && (
              <div>
                <label className="block eyebrow text-[#667085] mb-1.5">
                  {kind === "RANPLASMAN" ? "Jwè k ap antre" : "Jwè"}
                </label>
                <select
                  value={selectedPlayerIn}
                  onChange={(e) => onSelectPlayerIn(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-white body-sm text-[#101828]"
                  style={{ minHeight: 44 }}
                >
                  <option value="">— Chwazi jwè —</option>
                  {selectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.jerseyNumber} · {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {kind === "RANPLASMAN" && selectedPlayerIn && (
              <div>
                <label className="block eyebrow text-[#667085] mb-1.5">
                  Jwè k ap soti
                </label>
                <select
                  value={selectedPlayerOut}
                  onChange={(e) => onSelectPlayerOut(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-white body-sm text-[#101828]"
                  style={{ minHeight: 44 }}
                >
                  <option value="">— Chwazi jwè —</option>
                  {selectOptions
                    .filter((p) => p.id !== selectedPlayerIn)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jerseyNumber} · {p.firstName} {p.lastName}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {selectedTeam &&
              selectedPlayerIn &&
              (kind !== "RANPLASMAN" || selectedPlayerOut) && (
                <div className="rounded-xl border border-[#116B3A]/30 bg-[#116B3A]/5 p-3">
                  <p className="eyebrow text-[#116B3A] mb-1">
                    Apwèsi
                  </p>
                  <p className="body-sm font-bold text-[#101828]">
                    {kind && KIND_META[kind].label} · <span className="tnum">{clock}'</span> ·{" "}
                    {teamById(selectedTeam)?.shortName}
                  </p>
                  <p className="meta text-[#667085] mt-0.5">
                    {selectedPlayerIn &&
                      (() => {
                        const p = playerById(selectedPlayerIn);
                        return p ? `${p.firstName} ${p.lastName}` : "";
                      })()}
                    {selectedPlayerOut &&
                      ` ⇄ ${(() => {
                        const p = playerById(selectedPlayerOut);
                        return p ? `${p.firstName} ${p.lastName}` : "";
                      })()}`}
                  </p>
                </div>
              )}
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
            className="btn-primary"
          >
            <Check size={14} /> Konfime
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamChoice({
  team,
  selected,
  onClick,
}: {
  team: Team;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-2 rounded-[10px] border-2 transition-all",
        selected ? "border-[#116B3A] bg-[#116B3A]/5" : "border-[#E4E7EC] hover:border-[#667085]"
      )}
      style={{ minHeight: 44 }}
    >
      <TeamCrest
        teamId={team.id}
        shortName={team.shortName}
        primary={team.primaryColor}
        secondary={team.secondaryColor}
        size="xs"
      />
      <div className="text-left flex-1">
        <p className="body-sm font-bold text-[#101828]">{team.shortName}</p>
      </div>
      {selected && <Check size={14} className="text-[#116B3A]" />}
    </button>
  );
}
