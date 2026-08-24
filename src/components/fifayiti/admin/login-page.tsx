"use client";

// Standalone login form rendered at the /login route.
// Differences vs the in-SPA <AdminLogin />:
//   - Posts to /api/auth/login (real server-side credential check).
//   - Redirects via window.location.href on success (so middleware-
//     protected routes can resume) rather than flipping a zustand view.
//   - Lists ALL 5 roles with their emails (passwords are the role +
//     "fifAYITI.com", documented in plain Creole to operators).

import { useState } from "react";
import { Lock, Mail, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { useToast } from "@/hooks/use-toast";

const ROLE_HINTS: Array<{ role: string; email: string; label: string }> = [
  { role: "president",     email: "president@fifayiti.com",     label: "Prezidan" },
  { role: "director",      email: "director@fifayiti.com",      label: "Direktè Konpetisyon" },
  { role: "live_operator", email: "live_operator@fifayiti.com", label: "Operatè live (kontwòl TV)" },
  { role: "cameraman",     email: "cameraman@fifayiti.com",     label: "Kameraman" },
  { role: "team_admin",    email: "team_admin@fifayiti.com",    label: "Administratè ekip" },
];

export function AdminLoginPage() {
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
      // Server set the session cookie. Redirect to the SPA root so the
      // SPA picks up the session via /api/auth/me and routes to admin.
      toast({
        title: "Byenveni",
        description: "Ou konektye nan administrasyon FIFAYITI.",
      });
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") || "/";
      // Hard navigation so the SPA reboots with a fresh /api/auth/me fetch.
      window.location.href = next;
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
                  placeholder="role@fifayiti.com"
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

          {/* Credential reference — documented in Creole for operators */}
          <div className="mt-6 pt-5 border-t border-[#E4E7EC]">
            <p className="eyebrow text-[#667085] mb-2">
              Kont ou ka itilize
            </p>
            <div className="rounded-lg bg-[#F4F7F3] p-3">
              <ul className="meta text-[#667085] space-y-1.5">
                {ROLE_HINTS.map((h) => (
                  <li key={h.role}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(h.email);
                        setPwd(`${h.role}fifAYITI.com`);
                      }}
                      className="text-left hover:text-[#084C2A] w-full"
                    >
                      <span className="font-semibold text-[#116B3A]">·</span>{" "}
                      <span className="font-mono text-[11px]">{h.email}</span>
                      {" — "}
                      <span>{h.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="meta text-[#667085] mt-3 pt-2 border-t border-[#E4E7EC]">
                Modpas se: <span className="font-mono text-[11px]">[wòl]fifAYITI.com</span>
              </p>
            </div>
          </div>
        </div>

        <a
          href="/"
          className="mt-4 mx-auto block meta font-semibold text-white/70 hover:text-white text-center"
        >
          ← Retounen sou sit piblik
        </a>
      </div>
    </div>
  );
}
