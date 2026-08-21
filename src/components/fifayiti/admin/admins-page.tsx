"use client";
import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Crown,
  Megaphone,
  Users,
  Lock,
  UserPlus,
  Mail,
  Clock,
  MoreVertical,
  AlertTriangle,
  CheckCircle2,
  Ban,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  name: string;
  role: "Prezidan" | "Direktè Konpetisyon" | "Operatè live" | "Team Admin";
  email: string;
  lastActive: string;
  status: "Aktif" | "Dezaktyalize";
  avatar: string;
  initials: string;
  color: string;
}

const INITIAL: AdminUser[] = [
  {
    id: "adm-1",
    name: "Mr. Pierre Saintilus",
    role: "Prezidan",
    email: "president@fifayiti.ht",
    lastActive: "Kounye a",
    status: "Aktif",
    avatar: "PS",
    initials: "PS",
    color: "#F4C400",
  },
  {
    id: "adm-2",
    name: "Mrs. Marie Lafortune",
    role: "Direktè Konpetisyon",
    email: "director@fifayiti.ht",
    lastActive: "2 minit",
    status: "Aktif",
    avatar: "ML",
    initials: "ML",
    color: "#116B3A",
  },
  {
    id: "adm-3",
    name: "Mr. Jamesley Telfort",
    role: "Operatè live",
    email: "operator@fifayiti.ht",
    lastActive: "10 minit",
    status: "Aktif",
    avatar: "JT",
    initials: "JT",
    color: "#084C2A",
  },
  {
    id: "adm-4",
    name: "Mr. Frantz Nazon",
    role: "Team Admin",
    email: "teamadmin@fifayiti.ht",
    lastActive: "1è",
    status: "Aktif",
    avatar: "FN",
    initials: "FN",
    color: "#D92D20",
  },
];

export function AdminsPage() {
  const { adminRole } = useAppStore();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>(INITIAL);

  const isPresident = adminRole === "president";

  const toggle = (u: AdminUser) => {
    if (!isPresident) {
      toast({
        title: "Aksyon refize",
        description: "Sèlman Prezidan kapab modifye administratè yo.",
        variant: "destructive",
      });
      return;
    }
    setUsers(
      users.map((x) =>
        x.id === u.id
          ? {
              ...x,
              status: x.status === "Aktif" ? "Dezaktyalize" : "Aktif",
            }
          : x
      )
    );
    toast({
      title: "Estati chanje",
      description: `${u.name}: ${
        u.status === "Aktif" ? "Dezaktyalize" : "Aktif"
      }`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#084C2A] flex items-center justify-center shrink-0">
            <Shield size={20} className="text-[#F4C400]" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085] mb-1">Pilot administratè</p>
            <h2 className="heading-lg text-[#084C2A]">
              Administratè FIFAYITI (<span className="tnum">{users.length}</span>)
            </h2>
            <p className="body-sm text-[#667085] mt-1">
              4 administratè nan pilot la — Prezidan, Direktè, Operatè live, Team
              Admin. Chak wòl gen pwè privilèj ak limit.
            </p>
          </div>
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md eyebrow bg-[#F4C400] text-[#084C2A]">
            <Crown size={12} /> Pilot
          </span>
        </div>
      </section>

      {/* Governance callout */}
      <section className="fifayiti-card p-4 md:p-5" style={{ borderColor: "#F4C400", background: "rgba(244,196,0,0.10)" }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F4C400] flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-[#084C2A]" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085] mb-1">Gouvènans</p>
            <h3 className="heading-md text-[#084C2A]">
              Prezidan sèlman
            </h3>
            <p className="body-sm text-[#101828] mt-1">
              Sèlman Prezidan kapab kreye oswa retire Administratè FIFAYITI. tout
              lòt wòl ka wè lis la, men pa kapab ajoute oswa modifye.
            </p>
          </div>
        </div>
      </section>

      {/* KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          label="Prezidan"
          value={users.filter((u) => u.role === "Prezidan").length}
          tone="#F4C400"
          fg="#084C2A"
          icon={<Crown size={14} />}
        />
        <KPI
          label="Direktè"
          value={users.filter((u) => u.role === "Direktè Konpetisyon").length}
          tone="#116B3A"
          icon={<Users size={14} />}
        />
        <KPI
          label="Operatè"
          value={users.filter((u) => u.role === "Operatè live").length}
          tone="#084C2A"
          icon={<Megaphone size={14} />}
        />
        <KPI
          label="Team Admin"
          value={users.filter((u) => u.role === "Team Admin").length}
          tone="#D92D20"
          icon={<Shield size={14} />}
        />
      </section>

      {/* Add button — president only */}
      <section className="flex items-center justify-between gap-3">
        <p className="body-sm text-[#667085]">
          {isPresident
            ? "W ka ajoute oswa dezaktyalize administratè."
            : "Sèlman Prezidan kapab fè modifikasyon."}
        </p>
        {isPresident ? (
          <button
            onClick={() =>
              toast({
                title: "Pwototip",
                description:
                  "Fòm pou ajoute administratè a ap disponib nan vèsyon pwodiksyon.",
              })
            }
            className="btn-primary"
          >
            <UserPlus size={14} /> Ajoute administratè
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                disabled
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#E4E7EC] text-[#667085] body-sm font-bold cursor-not-allowed"
                style={{ minHeight: 44 }}
                aria-label="Sèlman Prezidan kapab fè sa a"
              >
                <Lock size={14} /> Ajoute administratè
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>Sèlman Prezidan kapab fè sa a</span>
            </TooltipContent>
          </Tooltip>
        )}
      </section>

      {/* Admin cards */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => {
          const RoleIcon =
            u.role === "Prezidan"
              ? Crown
              : u.role === "Direktè Konpetisyon"
              ? Users
              : u.role === "Operatè live"
              ? Megaphone
              : Shield;
          const disabled = u.status === "Dezaktyalize";
          return (
            <div
              key={u.id}
              className={cn(
                "fifayiti-card p-4 md:p-5",
                disabled
                  ? "border-[#E4E7EC] bg-[#F4F7F3] opacity-70"
                  : "bg-white"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center heading-md text-white shrink-0"
                    style={{ background: u.color }}
                  >
                    {u.initials}
                  </div>
                  <div>
                    <p className="body-sm font-extrabold text-[#101828]">{u.name}</p>
                    <p className="meta text-[#667085] inline-flex items-center gap-1">
                      <RoleIcon size={11} /> {u.role}
                    </p>
                  </div>
                </div>
                <button
                  className="p-1 text-[#667085] hover:text-[#084C2A]"
                  aria-label="Plis opsyon"
                >
                  <MoreVertical size={16} />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                <p className="body-sm inline-flex items-center gap-2 text-[#667085]">
                  <Mail size={12} /> {u.email}
                </p>
                <p className="meta inline-flex items-center gap-2 text-[#667085]">
                  <Clock size={12} /> Aktif {u.lastActive}
                </p>
              </div>

              <div className="mt-3 pt-3 border-t border-[#E4E7EC] flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md eyebrow",
                    disabled
                      ? "bg-[#E4E7EC] text-[#667085]"
                      : "bg-[#116B3A] text-white"
                  )}
                >
                  {disabled ? <Ban size={10} /> : <CheckCircle2 size={10} />}
                  {u.status}
                </span>
                <button
                  onClick={() => toggle(u)}
                  disabled={!isPresident}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md eyebrow disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: disabled ? "#116B3A" : "#E4E7EC",
                    color: disabled ? "#FFFFFF" : "#667085",
                    minHeight: 32,
                  }}
                >
                  {disabled ? (
                    <>
                      <CheckCircle2 size={11} /> Reyaktive
                    </>
                  ) : (
                    <>
                      <Ban size={11} /> Dezaktyalize
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Role matrix */}
      <section className="fifayiti-card overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC]">
          <p className="eyebrow text-[#667085] mb-1">Matris privilèj</p>
          <h3 className="heading-md text-[#084C2A]">
            Matris privilèj pa wòl
          </h3>
          <p className="meta text-[#667085]">
            Chak wòl gen aksyon pèmèt oswa entèdi.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full body-sm">
            <thead className="bg-[#F4F7F3]">
              <tr className="eyebrow text-[#667085]">
                <th className="py-2.5 px-3 text-left">Aksyon</th>
                <th className="py-2.5 px-3 text-center">Prezidan</th>
                <th className="py-2.5 px-3 text-center">Direktè</th>
                <th className="py-2.5 px-3 text-center">Operatè</th>
                <th className="py-2.5 px-3 text-center">Team Admin</th>
              </tr>
            </thead>
            <tbody>
              <RoleRow
                action="Kreye/retire administratè"
                perms={[true, false, false, false]}
              />
              <RoleRow
                action="Apwouve orè ofisyèl"
                perms={[true, false, false, false]}
              />
              <RoleRow
                action="Pwograme match"
                perms={[true, true, false, false]}
              />
              <RoleRow
                action="Anrejistre evenman live"
                perms={[false, false, true, false]}
              />
              <RoleRow
                action="Verifye jwè"
                perms={[true, true, false, false]}
              />
              <RoleRow
                action="Modifye enfòmasyon ekip"
                perms={[true, true, false, true]}
              />
              <RoleRow
                action="Peye MonCash"
                perms={[true, true, false, false]}
              />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
  fg = "#FFFFFF",
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  fg?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="fifayiti-card p-4"
      style={{ background: tone, borderColor: tone, color: fg }}
    >
      <div className="opacity-90">{icon}</div>
      <p className="mt-2 heading-lg tnum">{value}</p>
      <p className="mt-1 eyebrow opacity-80">
        {label}
      </p>
    </div>
  );
}

function RoleRow({
  action,
  perms,
}: {
  action: string;
  perms: boolean[];
}) {
  return (
    <tr className="border-t border-[#E4E7EC]">
      <td className="py-2.5 px-3 font-bold text-[#101828]">{action}</td>
      {perms.map((p, idx) => (
        <td key={idx} className="py-2.5 px-3 text-center">
          {p ? (
            <CheckCircle2 size={16} className="mx-auto text-[#116B3A]" />
          ) : (
            <Ban size={16} className="mx-auto text-[#D92D20]" />
          )}
        </td>
      ))}
    </tr>
  );
}
