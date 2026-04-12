import type { ReactElement } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

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

  return <AppShell initialSessionUser={user} initialTab={getInitialTab(params?.tab)} />;
}
