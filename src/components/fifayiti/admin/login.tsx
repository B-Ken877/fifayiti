"use client";
import { useState } from "react";
import { Lock, Mail, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";

export function AdminLogin() {
  const { setAdminAuthed, setAdminRole, setView } = useAppStore();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pwd) {
      toast({
        title: "Mannya",
        description: "Tanpri bay imèl ak modpas.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setAdminAuthed(true);
      // Determine role from email — pilot heuristic
      const role = email.includes("president") ? "president" : email.includes("director") ? "director" : email.includes("operator") ? "live_operator" : "team_admin";
      setAdminRole(role);
      setView("admin-dashboard");
      toast({
        title: "Byenveni",
        description: "Ou konektye nan administrasyon FIFAYITI.",
      });
    }, 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#084C2A] p-4">
      <div className="absolute inset-0 bg-pitch-texture-dark opacity-50" />
      <div className="relative w-full max-w-[420px]">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#116B3A] flex items-center justify-center mb-3">
              <ShieldCheck size={28} className="text-[#F4C400]" />
            </div>
            <BrandMark size="md" variant="primary" />
            <h1 className="mt-5 heading-lg text-[#084C2A] text-center">
              Antre nan administrasyon FIFAYITI
            </h1>
            <p className="mt-1 meta text-[#667085]">
              Aksè rezève pou administratè FIFAYITI. MFA disponib pita.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block eyebrow text-[#667085] mb-1.5">
                Imèl
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ou@fifayiti.ht"
                  className="w-full pl-10 pr-4 py-3 rounded-[10px] border border-[#E4E7EC] bg-white body-md text-[#101828] focus:outline-none focus:border-[#116B3A] focus:ring-2 focus:ring-[#116B3A]/10"
                  style={{ minHeight: 44 }}
                />
              </div>
            </div>

            <div>
              <label className="block eyebrow text-[#667085] mb-1.5">
                Modpas
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
                <input
                  type={show ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-[10px] border border-[#E4E7EC] bg-white body-md text-[#101828] focus:outline-none focus:border-[#116B3A]"
                  style={{ minHeight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#084C2A]"
                  style={{ minWidth: 24, minHeight: 24 }}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-60"
            >
              {loading ? "Konekte..." : "Konekte"}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                className="meta font-semibold text-[#116B3A] hover:underline"
              >
                Mwen bliye modpas mwen
              </button>
            </div>
          </form>

          {/* Pilot hint */}
          <div className="mt-6 pt-5 border-t border-[#E4E7EC]">
            <p className="meta text-[#667085] text-center">
              MFA ap vini — tout kont administratè ap gen 2-faktè.
            </p>
            <div className="mt-3 rounded-lg bg-[#F4F7F3] p-3">
              <p className="eyebrow text-[#667085] mb-1">
                Mwod (pilot)
              </p>
              <ul className="meta text-[#667085] space-y-0.5">
                <li>· president@fifayiti.ht — Prezidan</li>
                <li>· director@fifayiti.ht — Direktè Konpetisyon</li>
                <li>· operator@fifayiti.ht — Operatè live</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={() => setView("home")}
          className="mt-4 mx-auto block meta font-semibold text-white/70 hover:text-white"
        >
          ← Retounen sou sit piblik
        </button>
      </div>
    </div>
  );
}
