"use client";

// FIFAYITI PARIAJ — bettor login/register page.

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { ArrowLeft, Flame, Loader2, Mail, Lock, User, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../brand-mark";

export function BettorAuthPage() {
  const { setView } = useAppStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === "login" ? "/api/betting/auth/login" : "/api/betting/auth/register";
      const body = mode === "login"
        ? { email, password }
        : { email, password, displayName, phone };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erè.");
      } else {
        setView("betting");
        // Reload to pick up the new session cookie.
        window.location.reload();
      }
    } catch {
      setError("Erè rezo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#064E2A] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2">
        <button onClick={() => setView("home")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition">
          <ArrowLeft size={18} className="text-white" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm">
          {/* Logo — normal FIFAYITI ball + PARIAJ label */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center mb-3">
              <BrandMark size="md" variant="white" showTagline={false} />
              <span
                className="ml-2 font-extrabold tracking-tight"
                style={{
                  fontSize: 22,
                  color: "#F4C400",
                  letterSpacing: "-0.02em",
                  fontFamily: "var(--font-archivo), var(--font-manrope), sans-serif",
                }}
              >
                PARIAJ
              </span>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 mb-4">
            <button
              onClick={() => setMode("login")}
              className={cn("py-2 rounded-lg text-xs font-bold transition",
                mode === "login" ? "bg-[#F4C400] text-[#064E2A]" : "text-white/60")}
            >
              Konekte
            </button>
            <button
              onClick={() => setMode("register")}
              className={cn("py-2 rounded-lg text-xs font-bold transition",
                mode === "register" ? "bg-[#F4C400] text-[#064E2A]" : "text-white/60")}
            >
              Enskri
            </button>
          </div>

          {/* Form */}
          <div className="rounded-2xl bg-white shadow-xl p-5 space-y-3">
            {mode === "register" && (
              <>
                <Field icon={<User size={15} className="text-[#667085]" />} placeholder="Non ou (opsyonèl)">
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-transparent outline-none text-sm text-[#101828] font-medium" placeholder="Non ou" />
                </Field>
                <Field icon={<Phone size={15} className="text-[#667085]" />} placeholder="Telefòn (opsyonèl)">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-transparent outline-none text-sm text-[#101828] font-medium" placeholder="+509 ..." />
                </Field>
              </>
            )}
            <Field icon={<Mail size={15} className="text-[#667085]" />}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent outline-none text-sm text-[#101828] font-medium" placeholder="Imèl" />
            </Field>
            <Field icon={<Lock size={15} className="text-[#667085]" />}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-transparent outline-none text-sm text-[#101828] font-medium" placeholder="Modpas (min 8 karaktè, 1 chif)" />
            </Field>

            {mode === "register" && password && password.length < 8 && (
              <p className="text-[10px] text-[#667085] px-1">Modpas dwe gen omwen 8 karaktè ak omwen yon chif.</p>
            )}

            {error && (
              <p className="text-xs text-[#D92D20] font-semibold bg-[#D92D20]/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              onClick={submit}
              disabled={loading || !email || !password || (mode === "register" && password.length < 8)}
              className="w-full py-3 rounded-xl bg-[#064E2A] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : (mode === "login" ? "Konekte" : "Kreye kont")}
            </button>

            {mode === "register" && (
              <p className="text-[10px] text-[#667085] text-center">
                Ou ap resevwa 500 HTG demo pou w eseye pariaj.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, children, placeholder }: { icon: React.ReactNode; children: React.ReactNode; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#E4E7EC] bg-[#F8F9FA] focus-within:border-[#F4C400] transition">
      {icon}
      {children}
    </div>
  );
}
