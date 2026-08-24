"use client";
// In-SPA login form — rendered at view="admin-login" (e.g. when user clicks
// the "Antre" button on the public site header). For direct URL access to
// /operator/* a standalone /login route exists with its own page component
// (src/components/fifayiti/admin/login-page.tsx). Both forms hit the same
// /api/auth/login endpoint.
//
// Production-grade — no credential hints, no camera shortcuts. The
// operator must know their email + password.

import { useState } from "react";
import { Lock, Mail, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { useAppStore } from "@/store/app-store";
import { useAuthSessionStore } from "@/store/auth-session-store";
import { useToast } from "@/hooks/use-toast";

export function AdminLogin() {
  const { setView } = useAppStore();
  const { syncFromServer } = useAuthSessionStore();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
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
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const msg =
          data?.error === "missing_fields"
            ? "I manke yon champ."
            : data?.error === "invalid_json"
            ? "Fòma a pa valid."
            : "Imèl oswa modpas la pa kòrèk.";
        toast({
          title: "Echèk koneksyon",
          description: msg,
          variant: "destructive",
        });
        return;
      }
      // Server set the session cookie. Pull the trusted role into the store
      // and route to the role's destination:
      //   - cameraman / cameraman1 → /operator/camera/1
      //   - cameraman2              → /operator/camera/2
      //   - cameraman3              → /operator/camera/3
      //   - everyone else          → admin-dashboard
      await syncFromServer();
      toast({
        title: "Byenveni",
        description: "Ou konektye nan administrasyon FIFAYITI.",
      });
      const r = data.role as string;
      if (r === "cameraman" || r === "cameraman1") {
        window.location.href = "/operator/camera/1";
      } else if (r === "cameraman2") {
        window.location.href = "/operator/camera/2";
      } else if (r === "cameraman3") {
        window.location.href = "/operator/camera/3";
      } else {
        setView("admin-dashboard");
      }
    } catch (err) {
      toast({
        title: "Erè rezo",
        description: "Pa konektye. Eseye ankò.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#084C2A] p-4">
      <div className="absolute inset-0 bg-pitch-texture-dark opacity-50" />
      <div className="relative w-full max-w-[460px]">
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
              Aksè rezève pou administratè FIFAYITI. Imèl ak modpas obligatwa.
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
                  placeholder="ou@fifayiti.com"
                  autoComplete="username"
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
                  autoComplete="current-password"
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
          </form>
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
