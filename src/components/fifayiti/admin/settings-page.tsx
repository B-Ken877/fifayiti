"use client";
import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import { BrandMark } from "../brand-mark";
import {
  User,
  Mail,
  Shield,
  Lock,
  Globe,
  Clock,
  Languages,
  Building2,
  Info,
  Bell,
  Smartphone,
  Database,
  Scale,
  Save,
  Crown,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function SettingsPage() {
  const { adminRole } = useAppStore();
  const { toast } = useToast();
  const [mfa, setMfa] = useState(false);
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);

  const roleLabel =
    adminRole === "president"
      ? "Prezidan"
      : adminRole === "director"
      ? "Direktè Konpetisyon"
      : adminRole === "live_operator"
      ? "Operatè live"
      : adminRole === "cameraman" || adminRole === "cameraman1" ||
        adminRole === "cameraman2" || adminRole === "cameraman3"
      ? `Kameraman${adminRole === "cameraman" ? "" : adminRole.slice(-1)}`
      : "Team Admin";

  const adminName =
    adminRole === "president"
      ? "Mr. Pierre Saintilus"
      : adminRole === "director"
      ? "Mrs. Marie Lafortune"
      : adminRole === "live_operator"
      ? "Mr. Jamesley Telfort"
      : adminRole === "cameraman"
      ? "Mr. Carlo Joseph"
      : adminRole === "cameraman1"
      ? "Mr. Carlo Joseph"
      : adminRole === "cameraman2"
      ? "Mr. Davidson Pierre"
      : adminRole === "cameraman3"
      ? "Mr. Joseph Daniel"
      : "Mr. Frantz Nazon";

  const adminEmail = `${adminRole}@fifayiti.com`;

  const save = () => {
    toast({
      title: "Paramèt sove",
      description: "tout chanjman nan profil ak sekirite sove.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Federation banner */}
      <section className="fifayiti-card border p-4 md:p-6 text-white" style={{ borderColor: "#084C2A", background: "linear-gradient(135deg, #084C2A, #116B3A)" }}>
        <div className="flex items-start gap-4">
          <BrandMark size="md" variant="white" />
          <div className="flex-1">
            <p className="eyebrow text-white/60 mb-1">Federasyon</p>
            <h2 className="heading-lg text-white">Federation Inter Football Ayiti</h2>
            <p className="body-sm text-white/80 mt-0.5">
              "Senp pou moun yo. Pwofesyonèl pou FIFAYITI."
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 eyebrow">
                <Globe size={11} /> Ayiti
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F4C400] text-[#084C2A] eyebrow">
                <Languages size={11} /> Kreyòl Ayisyen
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 eyebrow">
                <Clock size={11} /> America/Port-au-Prince
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Profile */}
      <section className="fifayiti-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <User size={18} className="text-[#116B3A]" />
          <h3 className="heading-md text-[#084C2A]">
            Profil
          </h3>
        </div>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-[#116B3A] flex items-center justify-center text-white heading-md">
            {adminName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          <div>
            <p className="heading-md text-[#084C2A]">{adminName}</p>
            <p className="meta text-[#667085] inline-flex items-center gap-1">
              <Mail size={11} /> {adminEmail}
            </p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Non konplè" icon={<User size={14} className="text-[#667085]" />}>
            <input
              defaultValue={adminName}
              className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#101828] focus:outline-none focus:border-[#116B3A]"
              style={{ minHeight: 44 }}
            />
          </Field>
          <Field label="Imèl" icon={<Mail size={14} className="text-[#667085]" />}>
            <input
              defaultValue={adminEmail}
              readOnly
              className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#667085] cursor-not-allowed"
              style={{ minHeight: 44 }}
            />
          </Field>
          <Field label="Wòl" icon={<Shield size={14} className="text-[#667085]" />}>
            <div className="flex items-center gap-2">
              <input
                value={roleLabel}
                readOnly
                className="flex-1 px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#667085] cursor-not-allowed"
                style={{ minHeight: 44 }}
              />
              {adminRole === "president" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md eyebrow bg-[#F4C400] text-[#084C2A]">
                  <Crown size={10} /> Prezidan
                </span>
              )}
            </div>
          </Field>
          <Field label="Zòn orè" icon={<Clock size={14} className="text-[#667085]" />}>
            <select
              defaultValue="America/Port-au-Prince"
              className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#101828]"
              style={{ minHeight: 44 }}
            >
              <option>America/Port-au-Prince</option>
              <option>America/New_York</option>
            </select>
          </Field>
        </div>
      </section>

      {/* Security */}
      <section className="fifayiti-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} className="text-[#116B3A]" />
          <h3 className="heading-md text-[#084C2A]">
            Sekirite
          </h3>
        </div>
        <div className="divide-y divide-[#E4E7EC]">
          <SettingRow
            icon={<Lock size={14} className="text-[#667085]" />}
            label="MFA (2-faktè)"
            description="Ap vini pita — MFA ap obligatwa pou tout administratè."
            badge="Ap vini"
          >
            <Switch checked={mfa} onCheckedChange={setMfa} disabled />
          </SettingRow>
          <SettingRow
            icon={<Bell size={14} className="text-[#667085]" />}
            label="Notifikasyon imèl"
            description="Resevwa imèl pou chak aksyon enpòtan."
          >
            <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
          </SettingRow>
          <SettingRow
            icon={<Smartphone size={14} className="text-[#667085]" />}
            label="Notifikasyon SMS"
            description="Resevwa SMS pou match an dirèk ak apwovasyon Prezidan."
          >
            <Switch checked={smsNotif} onCheckedChange={setSmsNotif} />
          </SettingRow>
        </div>
        <div className="mt-4 pt-4 border-t border-[#E4E7EC]">
          <p className="meta text-[#667085] inline-flex items-center gap-1.5">
            <Info size={12} className="text-[#116B3A]" />
            MFA ap vini pita — tout kont administratè ap gen 2-faktè.
          </p>
        </div>
      </section>

      {/* Federation info */}
      <section className="fifayiti-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} className="text-[#116B3A]" />
          <h3 className="heading-md text-[#084C2A]">
            Enfòmasyon federasyon
          </h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <InfoRowStatic
            label="Non federasyon"
            value="FIFAYITI"
            sub="Federation Inter Football Ayiti"
          />
          <InfoRowStatic
            label="Slogan"
            value='"Senp pou moun yo. Pwofesyonèl pou FIFAYITI."'
          />
          <InfoRowStatic
            label="Lang"
            value="Kreyòl Ayisyen"
            sub="Fikse — pa gen bouton pou chanje"
          />
          <InfoRowStatic
            label="Zòn orè"
            value="America/Port-au-Prince"
            sub="UTC-5 (EST)"
          />
          <InfoRowStatic
            label="Peyi"
            value="Ayiti"
            sub="Port-au-Prince, Delmas"
          />
          <InfoRowStatic
            label="Ane pilot"
            value="2026"
            sub="Sazon favori 2026"
          />
        </div>
      </section>

      {/* Pilot scale note */}
      <section className="fifayiti-card border-2 p-4 md:p-5" style={{ borderColor: "#F4C400", background: "rgba(244,196,0,0.10)" }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F4C400] flex items-center justify-center shrink-0">
            <Scale size={20} className="text-[#084C2A]" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085] mb-1">Echèl</p>
            <h3 className="heading-md text-[#084C2A]">
              Echèl pilot — 6 ekip
            </h3>
            <p className="body-sm text-[#101828] mt-1 leading-relaxed">
              <strong className="text-[#084C2A]">
                Pilot lajè: 6 ekip.
              </strong>{" "}
              Sistèm la fèt pou elaji a 30 ekip ak plis. Achitekti la
              jeneryik: tout modèl (ekip, jwè, match, replay, finans, disiplin)
              kapab eskalab san chanjman nan baz done.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ScaleBox label="Pilot" value="6 ekip" tone="#F4C400" />
              <ScaleBox label="Echèl 1" value="30 ekip" tone="#116B3A" />
              <ScaleBox label="Echèl 2" value="60+ ekip" tone="#084C2A" />
            </div>
          </div>
        </div>
      </section>

      {/* Storage / data */}
      <section className="fifayiti-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-[#116B3A]" />
          <h3 className="heading-md text-[#084C2A]">
            Done ak depo
          </h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <InfoRowStatic
            label="Baz done"
            value="SQLite"
            sub="Pilot — migrasyon nan PostgreSQL pita"
          />
          <InfoRowStatic
            label="Kach"
            value="Memwa lokòm"
            sub="Pa gen Redis/MySQL adisyonèl"
          />
          <InfoRowStatic
            label="Backup replay"
            value="Pèmanè"
            sub="tout replay ofisyèl sove pou tout tan"
          />
          <InfoRowStatic
            label="Senkronizasyon offline"
            value="Bouffer lokal"
            sub="Evenman yo sove epi senkronize lè online"
          />
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={save}
          className="btn-primary"
        >
          <Save size={14} /> Sove paramèt
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 eyebrow text-[#667085] mb-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function SettingRow({
  icon,
  label,
  description,
  badge,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="body-sm font-bold text-[#101828] inline-flex items-center gap-2">
            {label}
            {badge && (
              <span className="px-1.5 py-0.5 rounded eyebrow bg-[#F4C400] text-[#084C2A]">
                {badge}
              </span>
            )}
          </p>
          <p className="meta text-[#667085]">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function InfoRowStatic({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E4E7EC] bg-[#F4F7F3] p-3">
      <p className="eyebrow text-[#667085]">
        {label}
      </p>
      <p className="body-sm font-extrabold text-[#101828] mt-0.5">{value}</p>
      {sub && <p className="meta text-[#667085] mt-0.5">{sub}</p>}
    </div>
  );
}

function ScaleBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-lg p-2 text-center"
      style={{ background: tone, color: tone === "#F4C400" ? "#084C2A" : "#FFFFFF" }}
    >
      <p className="body-sm font-extrabold tnum">{value}</p>
      <p className="eyebrow opacity-80 mt-0.5">
        {label}
      </p>
    </div>
  );
}
