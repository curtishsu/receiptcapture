import type { ReactElement } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getStats } from "@/lib/firestore-db";
import type { StatsResponse } from "@/lib/types";

function getInitialTab(tab: string | string[] | undefined): "photo" | "stats" | "history" | "mapping" {
  const value = Array.isArray(tab) ? tab[0] : tab;
  return value === "stats" || value === "history" || value === "mapping" ? value : "photo";
}

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string | string[] }>;
}): Promise<ReactElement> {
  const user = await requireUser();
  const params = await searchParams;
  const initialTab = getInitialTab(params?.tab);
  let initialStats: StatsResponse | null = null;

  if (user && initialTab === "stats") {
    initialStats = await getStats(user.id);
  }

  return <AppShell initialSessionUser={user} initialTab={initialTab} initialStats={initialStats} />;
}
