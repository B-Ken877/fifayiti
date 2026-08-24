"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useAuthSessionStore } from "@/store/auth-session-store";
import { PublicLayout } from "@/components/fifayiti/public/public-layout";
import { AdminShell } from "@/components/fifayiti/admin/shell";
import { AdminDashboard } from "@/components/fifayiti/admin/dashboard";
import { AdminTeamsPage } from "@/components/fifayiti/admin/teams-page";
import { AdminTeamDetailPage } from "@/components/fifayiti/admin/team-detail-page";
import { PlayerVerificationPage } from "@/components/fifayiti/admin/player-verification-page";
import { CompetitionPage } from "@/components/fifayiti/admin/competition-page";
import { SchedulePage } from "@/components/fifayiti/admin/schedule-page";
import { MatchControlPage } from "@/components/fifayiti/admin/match-control-page";
import { ReplayArchivePage } from "@/components/fifayiti/admin/replay-page";
import { FinancesPage } from "@/components/fifayiti/admin/finances-page";
import { DisciplinePage } from "@/components/fifayiti/admin/discipline-page";
import { AdminsPage } from "@/components/fifayiti/admin/admins-page";
import { SettingsPage } from "@/components/fifayiti/admin/settings-page";
import { AdminLogin } from "@/components/fifayiti/admin/login";

export default function Home() {
  const { view, setView } = useAppStore();
  const { adminAuthed, adminRole, syncFromServer } = useAuthSessionStore();

  // Reconcile local auth state against the server's session on every mount.
  // If we say "authed" locally but the server disagrees, send to /login
  // (hard redirect — let the standalone route handle the new login flow).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const serverRole = await syncFromServer();
      if (cancelled) return;
      // If on an admin view but server says no session → bail to /login.
      if (view.startsWith("admin-") && !serverRole) {
        const next = encodeURIComponent("/?view=" + view);
        window.location.href = `/login?next=${next}`;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cameraman has no admin SPA access (their role is camera-streaming
  // only). If they try to reach an admin view, fall through to the
  // public site rather than rendering AdminShell with nav items they
  // can't act on. Cameraman only accesses /operator/camera/[slot]
  // directly via the /login?next=... flow.
  const isCameraman = adminAuthed && adminRole === "cameraman";

  // Old in-SPA login screen still used when user navigates here via
  // "Antre" button (no separate route). The form will POST to
  // /api/auth/login and reconcile via syncFromServer.
  if (view === "admin-login" && !adminAuthed) {
    return <AdminLogin />;
  }

  // Any admin view requested without auth → login form.
  if (view.startsWith("admin-") && !adminAuthed) {
    return <AdminLogin />;
  }

  // Authed admin user requesting an admin view → render AdminShell.
  // Cameraman is excluded — they have no admin SPA access.
  if (view.startsWith("admin-") && adminAuthed && !isCameraman) {
    return (
      <AdminShell>
        {view === "admin-dashboard" && <AdminDashboard />}
        {view === "admin-teams" && <AdminTeamsPage />}
        {view === "admin-team-detail" && <AdminTeamDetailPage />}
        {view === "admin-players" && <PlayerVerificationPage />}
        {view === "admin-competitions" && <CompetitionPage />}
        {view === "admin-schedule" && <SchedulePage />}
        {view === "admin-match-control" && <MatchControlPage />}
        {view === "admin-replays" && <ReplayArchivePage />}
        {view === "admin-finances" && <FinancesPage />}
        {view === "admin-discipline" && <DisciplinePage />}
        {view === "admin-admins" && <AdminsPage />}
        {view === "admin-settings" && <SettingsPage />}
      </AdminShell>
    );
  }

  // Default: public site (also serves as the fallback for cameraman
  // when they try to reach an admin view).
  return <PublicLayout />;
}
