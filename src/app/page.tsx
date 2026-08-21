"use client";
import { useAppStore } from "@/store/app-store";
import { PublicLayout } from "@/components/fifayiti/public/public-layout";
import { AdminLogin } from "@/components/fifayiti/admin/login";
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

export default function Home() {
  const { view, adminAuthed } = useAppStore();

  // Admin login flow — separate from public site
  if (view === "admin-login" && !adminAuthed) {
    return <AdminLogin />;
  }

  // If the user is trying to access any admin view but isn't authed, send them to login.
  if (view.startsWith("admin-") && !adminAuthed) {
    return <AdminLogin />;
  }

  // Authenticated admin views
  if (view.startsWith("admin-") && adminAuthed) {
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

  // Default: public site
  return <PublicLayout />;
}
