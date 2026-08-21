"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import { teamStatusLabels } from "@/lib/fifayiti-data";
import { TeamCrest } from "../team-crest";
import {
  ArrowLeft,
  RefreshCw,
  Save,
  Wifi,
  WifiOff,
  MapPin,
  Calendar,
  Globe,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Circle,
  X,
  Plus,
  Trash2,
  Upload,
  ImageIcon,
  Pencil,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const FLOW = [
  "PRE_KREYE",
  "ENSKRIPSYON_OUVE",
  "SOUMET",
  "AN_VERIFIKASYON",
  "VERIFYE",
  "AKTIF",
] as const;

const POSITION_LABEL: Record<string, string> = {
  GK: "Gardyen",
  DEF: "Defans",
  MID: "Milye",
  FWD: "Atakan",
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PRE_KREYE: { bg: "#E4E7EC", fg: "#667085" },
  ENSKRIPSYON_OUVE: { bg: "#F4C400", fg: "#084C2A" },
  SOUMET: { bg: "#116B3A", fg: "#FFFFFF" },
  AN_VERIFIKASYON: { bg: "#F4C400", fg: "#084C2A" },
  VERIFYE: { bg: "#116B3A", fg: "#FFFFFF" },
  AKTIF: { bg: "#116B3A", fg: "#FFFFFF" },
};

interface PlayerRow {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  dateOfBirth?: string | null;
  idNumber?: string | null;
  photoUrl?: string | null;
  status: string;
}

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  founded?: string | null;
  homeVenue?: string | null;
  venueAddress?: string | null;
  venueRouter?: string | null;
  venueConnectivity?: string;
  status: string;
  registeredAt?: string | null;
  group: string;
  logoUrl?: string | null;
  photoUrl?: string | null;
  players: PlayerRow[];
}

interface PlayerForm {
  id?: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | "";
  position: "GK" | "DEF" | "MID" | "FWD";
  dateOfBirth: string;
  idNumber: string;
  photoUrl: string;
}

const EMPTY_PLAYER_FORM: PlayerForm = {
  firstName: "",
  lastName: "",
  jerseyNumber: "",
  position: "FWD",
  dateOfBirth: "",
  idNumber: "",
  photoUrl: "",
};

export function AdminTeamDetailPage() {
  const { activeTeamId, setView } = useAppStore();
  const { toast } = useToast();

  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [playerForm, setPlayerForm] = useState<PlayerForm>(EMPTY_PLAYER_FORM);
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamEdit, setTeamEdit] = useState<Partial<TeamData>>({});

  const fetchTeam = async () => {
    if (!activeTeamId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${activeTeamId}`);
      if (!res.ok) throw new Error("echwe");
      const data = await res.json();
      setTeam(data.team);
      setTeamEdit(data.team);
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, [activeTeamId]);

  const uploadFile = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "upload echwe");
    }
    const data = await res.json();
    return data.url;
  };

  const saveTeamEdit = async () => {
    if (!team) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamEdit),
      });
      if (!res.ok) throw new Error("echwe");
      toast({ title: "Sove", description: "Enfòmasyon ekip aktyalize" });
      setEditingTeam(false);
      await fetchTeam();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const onPlayerPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await uploadFile(f);
      setPlayerForm({ ...playerForm, photoUrl: url });
      toast({ title: "Foto monte", description: url });
    } catch (err: any) {
      toast({ title: "Erè", description: err.message, variant: "destructive" });
    }
  };

  const submitPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team) return;
    if (!playerForm.firstName.trim() || !playerForm.lastName.trim() || !playerForm.jerseyNumber) {
      toast({ title: "Mannya", description: "Tanpri bay non, siyati, ak nimewo", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        firstName: playerForm.firstName,
        lastName: playerForm.lastName,
        jerseyNumber: Number(playerForm.jerseyNumber),
        position: playerForm.position,
        dateOfBirth: playerForm.dateOfBirth || null,
        idNumber: playerForm.idNumber || null,
        photoUrl: playerForm.photoUrl || null,
      };
      let res;
      if (playerForm.id) {
        res = await fetch(`/api/players/${playerForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/teams/${team.id}/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "echwe");
      }
      toast({
        title: playerForm.id ? "Jwè modifye" : "Jwè ajoute",
        description: `${playerForm.firstName} ${playerForm.lastName} (#${playerForm.jerseyNumber})`,
      });
      setPlayerForm(EMPTY_PLAYER_FORM);
      setShowPlayerForm(false);
      await fetchTeam();
    } catch (err: any) {
      toast({ title: "Erè", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const editPlayer = (p: PlayerRow) => {
    setPlayerForm({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
      dateOfBirth: p.dateOfBirth ?? "",
      idNumber: p.idNumber ?? "",
      photoUrl: p.photoUrl ?? "",
    });
    setShowPlayerForm(true);
  };

  const deletePlayer = async (p: PlayerRow) => {
    if (!confirm(`Efase ${p.firstName} ${p.lastName}?`)) return;
    try {
      const res = await fetch(`/api/players/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("echwe");
      toast({ title: "Jwè efase", description: `${p.firstName} ${p.lastName} retire` });
      await fetchTeam();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  const cycleStatus = async () => {
    if (!team) return;
    const flow = FLOW as readonly string[];
    const idx = flow.indexOf(team.status);
    const next = flow[(idx + 1) % flow.length] as any;
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("echwe");
      toast({ title: "Estati chanje", description: `${team.name}: ${teamStatusLabels(next as any)}` });
      await fetchTeam();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="fifayiti-card border-dashed p-10 text-center">
        <p className="body-sm text-[#667085]">Ap charger ekip la...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E4E7EC] bg-white p-10 text-center">
        <p className="font-bold text-[#084C2A]">Pa gen ekip chwezi</p>
        <button
          onClick={() => setView("admin-teams")}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#116B3A] text-white body-sm font-bold"
          style={{ minHeight: 44 }}
        >
          <ArrowLeft size={14} /> Retounen nan lis ekip yo
        </button>
      </div>
    );
  }

  const tone = STATUS_TONE[team.status] ?? STATUS_TONE.PRE_KREYE;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="fifayiti-card p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView("admin-teams")}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[#F4F7F3]"
              aria-label="Retounen"
            >
              <ArrowLeft size={16} className="text-[#084C2A]" />
            </button>
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={team.name} className="w-16 h-16 object-contain rounded-xl" />
            ) : (
              <TeamCrest
                teamId={team.id}
                shortName={team.shortName}
                primary={team.primaryColor}
                secondary={team.secondaryColor}
                size="lg"
              />
            )}
            <div>
              <p className="eyebrow text-[#667085] mb-1">Detay ekip</p>
              <h2 className="heading-xl text-[#084C2A]">{team.name}</h2>
              <p className="body-sm text-[#667085]">
                {team.shortName} · Group {team.group} · Enskri {team.registeredAt ?? "—"}
              </p>
              <span
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md eyebrow"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.fg, opacity: 0.7 }} />
                {teamStatusLabels(team.status as any)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setEditingTeam(!editingTeam)} className="btn-secondary">
              <Pencil size={14} /> Modifye ekip
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="btn-featured">
                  <RefreshCw size={14} /> Chanje estati
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Chanje estati pou {team.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Estati aktyèl: <strong className="text-[#084C2A]">{teamStatusLabels(team.status as any)}</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anile</AlertDialogCancel>
                  <AlertDialogAction onClick={cycleStatus} className="bg-[#116B3A] text-white hover:bg-[#0a5a30]">
                    Konfime chanjman
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>

      {/* Edit team inline panel */}
      {editingTeam && (
        <section className="fifayiti-card p-4 md:p-6" style={{ borderColor: "#F4C400" }}>
          <p className="eyebrow text-[#667085] mb-2">Modifye enfòmasyon ekip</p>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block">
              <span className="block eyebrow text-[#667085] mb-1">Non</span>
              <input
                value={teamEdit.name ?? ""}
                onChange={(e) => setTeamEdit({ ...teamEdit, name: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block eyebrow text-[#667085] mb-1">Ti non</span>
              <input
                value={teamEdit.shortName ?? ""}
                onChange={(e) => setTeamEdit({ ...teamEdit, shortName: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block eyebrow text-[#667085] mb-1">Koulè prensipal</span>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={teamEdit.primaryColor ?? "#116B3A"}
                  onChange={(e) => setTeamEdit({ ...teamEdit, primaryColor: e.target.value })}
                  className="w-12 h-10 rounded border border-[#E4E7EC]"
                />
                <input
                  value={teamEdit.primaryColor ?? ""}
                  onChange={(e) => setTeamEdit({ ...teamEdit, primaryColor: e.target.value })}
                  className="input flex-1 font-mono"
                />
              </div>
            </label>
            <label className="block">
              <span className="block eyebrow text-[#667085] mb-1">Koulè segondè</span>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={teamEdit.secondaryColor ?? "#F4C400"}
                  onChange={(e) => setTeamEdit({ ...teamEdit, secondaryColor: e.target.value })}
                  className="w-12 h-10 rounded border border-[#E4E7EC]"
                />
                <input
                  value={teamEdit.secondaryColor ?? ""}
                  onChange={(e) => setTeamEdit({ ...teamEdit, secondaryColor: e.target.value })}
                  className="input flex-1 font-mono"
                />
              </div>
            </label>
            <label className="block">
              <span className="block eyebrow text-[#667085] mb-1">Stad</span>
              <input
                value={teamEdit.homeVenue ?? ""}
                onChange={(e) => setTeamEdit({ ...teamEdit, homeVenue: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block eyebrow text-[#667085] mb-1">Adrès</span>
              <input
                value={teamEdit.venueAddress ?? ""}
                onChange={(e) => setTeamEdit({ ...teamEdit, venueAddress: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditingTeam(false)} className="btn-secondary">Anile</button>
            <button onClick={saveTeamEdit} disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? "Ap sove..." : "Sove chanjman"}
            </button>
          </div>
        </section>
      )}

      {/* Roster + info */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <section className="fifayiti-card overflow-hidden">
          <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between">
            <div>
              <p className="eyebrow text-[#667085] mb-1">Lis jwè</p>
              <h3 className="heading-md text-[#084C2A]">
                Lis jwè (<span className="tnum">{team.players.length}</span>)
              </h3>
              <p className="meta text-[#667085]">
                <span className="tnum">{team.players.filter((p) => p.status === "VERIFYE").length}</span> verifye ·{" "}
                <span className="tnum">{team.players.filter((p) => p.status === "AN_ATANT").length}</span> ap tann
              </p>
            </div>
            <button
              onClick={() => {
                setPlayerForm(EMPTY_PLAYER_FORM);
                setShowPlayerForm(true);
              }}
              className="btn-featured"
            >
              <Plus size={14} /> Ajoute jwè
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            {team.players.length === 0 ? (
              <div className="p-8 text-center body-sm text-[#667085]">
                Pa gen jwè pou kounye a. Klike "Ajoute jwè" pou ajoute premye jwè a.
              </div>
            ) : (
              <table className="w-full body-sm">
                <thead className="sticky top-0 bg-[#F4F7F3] z-10">
                  <tr className="eyebrow text-[#667085]">
                    <th className="py-2 px-3 text-left">#</th>
                    <th className="py-2 px-3 text-left">Jwè</th>
                    <th className="py-2 px-3 text-left hidden md:table-cell">Pòs</th>
                    <th className="py-2 px-3 text-left hidden md:table-cell">CIN</th>
                    <th className="py-2 px-3 text-left">Estati</th>
                    <th className="py-2 px-3 text-right">Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {team.players.map((p) => (
                    <tr key={p.id} className="border-t border-[#E4E7EC] hover:bg-[#F4F7F3]">
                      <td className="py-2.5 px-3 text-[#667085] font-bold tnum">{p.jerseyNumber}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {p.photoUrl ? (
                            <img src={p.photoUrl} alt={p.firstName} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center eyebrow text-white shrink-0"
                              style={{ background: team.primaryColor }}
                            >
                              {p.firstName[0]}{p.lastName[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-[#101828]">{p.firstName} {p.lastName}</p>
                            <p className="meta text-[#667085]">{p.dateOfBirth ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-[#667085]">
                        {POSITION_LABEL[p.position] ?? p.position}
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-[#667085] font-mono meta">
                        {p.idNumber ?? "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <PlayerStatusChip status={p.status} />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => editPlayer(p)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-[#116B3A]/10"
                            aria-label="Modifye"
                          >
                            <Pencil size={14} className="text-[#116B3A]" />
                          </button>
                          <button
                            onClick={() => deletePlayer(p)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-[#D92D20]/10"
                            aria-label="Efase"
                          >
                            <Trash2 size={14} className="text-[#D92D20]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {/* Team photo */}
          {team.photoUrl && (
            <div className="fifayiti-card p-4">
              <p className="eyebrow text-[#667085] mb-2">Foto ekip</p>
              <img src={team.photoUrl} alt={team.name} className="w-full rounded-lg" />
            </div>
          )}

          {/* Team info */}
          <div className="fifayiti-card p-4 md:p-5">
            <h3 className="heading-md text-[#084C2A] mb-3">Enfòmasyon ekip</h3>
            <ul className="space-y-3">
              <InfoRow icon={<MapPin size={14} className="text-[#116B3A]" />} label="Stad" value={team.homeVenue || "—"} />
              <InfoRow icon={<MapPin size={14} className="text-[#116B3A]" />} label="Adrès" value={team.venueAddress || "—"} />
              <InfoRow icon={<Calendar size={14} className="text-[#116B3A]" />} label="Fondasyon" value={team.founded || "—"} />
              <InfoRow icon={<Globe size={14} className="text-[#116B3A]" />} label="Route" value={team.venueRouter || "—"} />
              <li className="flex items-center justify-between border-t border-[#E4E7EC] pt-3">
                <span className="meta text-[#667085]">Konektivite</span>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md eyebrow"
                  style={{
                    background: team.venueConnectivity === "BON" ? "#116B3A" : team.venueConnectivity === "MOYEN" ? "#F4C400" : "#D92D20",
                    color: team.venueConnectivity === "MOYEN" ? "#084C2A" : "#FFFFFF",
                  }}
                >
                  {team.venueConnectivity === "BON" ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {team.venueConnectivity === "BON" ? "Bon" : team.venueConnectivity === "MOYEN" ? "Mwayen" : "Fèb"}
                </span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      {/* Player form modal */}
      {showPlayerForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E4E7EC] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="eyebrow text-[#667085]">Fòm</p>
                <h2 className="heading-md text-[#084C2A]">
                  {playerForm.id ? "Modifye jwè" : "Ajoute nouvo jwè"}
                </h2>
              </div>
              <button
                onClick={() => setShowPlayerForm(false)}
                className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[#F4F7F3]"
                aria-label="Fèmen"
              >
                <X size={18} className="text-[#084C2A]" />
              </button>
            </div>
            <form onSubmit={submitPlayer} className="px-6 py-5 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block eyebrow text-[#667085] mb-1">Non *</span>
                  <input
                    value={playerForm.firstName}
                    onChange={(e) => setPlayerForm({ ...playerForm, firstName: e.target.value })}
                    className="input"
                    required
                  />
                </label>
                <label className="block">
                  <span className="block eyebrow text-[#667085] mb-1">Siyati *</span>
                  <input
                    value={playerForm.lastName}
                    onChange={(e) => setPlayerForm({ ...playerForm, lastName: e.target.value })}
                    className="input"
                    required
                  />
                </label>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block eyebrow text-[#667085] mb-1">Nimewo maillot *</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={playerForm.jerseyNumber}
                    onChange={(e) => setPlayerForm({ ...playerForm, jerseyNumber: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="input"
                    required
                  />
                </label>
                <label className="block">
                  <span className="block eyebrow text-[#667085] mb-1">Pòs *</span>
                  <select
                    value={playerForm.position}
                    onChange={(e) => setPlayerForm({ ...playerForm, position: e.target.value as any })}
                    className="input"
                  >
                    <option value="GK">Gardyen</option>
                    <option value="DEF">Defans</option>
                    <option value="MID">Milye</option>
                    <option value="FWD">Atakan</option>
                  </select>
                </label>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block eyebrow text-[#667085] mb-1">Dat nesans</span>
                  <input
                    type="date"
                    value={playerForm.dateOfBirth}
                    onChange={(e) => setPlayerForm({ ...playerForm, dateOfBirth: e.target.value })}
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block eyebrow text-[#667085] mb-1">Nimewo CIN</span>
                  <input
                    value={playerForm.idNumber}
                    onChange={(e) => setPlayerForm({ ...playerForm, idNumber: e.target.value })}
                    placeholder="CIN-XXXXXX"
                    className="input font-mono"
                  />
                </label>
              </div>
              {/* Player photo upload */}
              <label className="block">
                <span className="block eyebrow text-[#667085] mb-1">Foto jwè (opsyonèl)</span>
                <div className="flex items-center gap-3">
                  {playerForm.photoUrl ? (
                    <img src={playerForm.photoUrl} alt="player" className="w-12 h-12 object-cover rounded-full border border-[#E4E7EC]" />
                  ) : (
                    <div className="w-12 h-12 rounded-full border border-dashed border-[#E4E7EC] flex items-center justify-center text-[#667085]">
                      <ImageIcon size={18} />
                    </div>
                  )}
                  <label className="btn-secondary cursor-pointer">
                    <Upload size={14} /> Monte foto
                    <input type="file" accept="image/*" onChange={onPlayerPhoto} className="hidden" />
                  </label>
                  {playerForm.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPlayerForm({ ...playerForm, photoUrl: "" })}
                      className="meta text-[#D92D20] hover:underline"
                    >
                      Retire
                    </button>
                  )}
                </div>
              </label>
              <div className="pt-4 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowPlayerForm(false)} className="btn-secondary">
                  Anile
                </button>
                <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
                  {saving ? "Ap sove..." : playerForm.id ? "Sove chanjman" : "Ajoute jwè"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="inline-flex items-center gap-2 meta text-[#667085]">{icon}{label}</span>
      <span className="body-sm font-bold text-[#101828] text-right">{value}</span>
    </li>
  );
}

function PlayerStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    AN_ATANT: { bg: "#F4C400", fg: "#084C2A" },
    VERIFYE: { bg: "#116B3A", fg: "#FFFFFF" },
    REFIZE: { bg: "#D92D20", fg: "#FFFFFF" },
    DEMANDE_KOREKSYON: { bg: "#F4C400", fg: "#084C2A" },
  };
  const tone = map[status] ?? map.AN_ATANT;
  const label = status === "AN_ATANT" ? "Ap tann"
    : status === "VERIFYE" ? "Verifye"
    : status === "REFIZE" ? "Refize"
    : "Koreksyon";
  const Icon = status === "VERIFYE" ? CheckCircle2 : status === "REFIZE" ? X : AlertTriangle;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md eyebrow"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}
