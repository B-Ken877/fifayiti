// /login — standalone login page route (NOT part of the SPA view-switching).
//
// This route exists so middleware can redirect unauthenticated users
// from /operator/* paths to a real URL the SPA doesn't own.
//
// On successful login: redirect to the SPA root with `view=admin-dashboard`
// already set on the zustand store (via a `?next=` query param + client
// boot logic in app/page.tsx).

import { AdminLoginPage } from "@/components/fifayiti/admin/login-page";

export default function Page() {
  return <AdminLoginPage />;
}
