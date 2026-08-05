import { requireAdmin } from "../lib/auth";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAdmin("/");
  return <DashboardClient session={user} />;
}
