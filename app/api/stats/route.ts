import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getStats } from "@/lib/firestore-db";
import type { StatsDateBucket, StatsMetric, StatsSubjectKind } from "@/lib/types";

function getMetric(value: string | null): StatsMetric {
  return value === "dollars" || value === "total_amount" ? value : "quantity";
}

function getDateBucket(value: string | null): StatsDateBucket {
  return value === "day" || value === "week" || value === "year" ? value : "month";
}

function getSubjectKind(value: string | null): StatsSubjectKind | null {
  return value === "item" || value === "type" || value === "category" ? value : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const subjectKind = getSubjectKind(searchParams.get("subjectKind"));
  const subjectValue = searchParams.get("subjectValue");
  const stats = await getStats(user.id, {
    metric: getMetric(searchParams.get("metric")),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    subjectKind: subjectKind && subjectValue ? subjectKind : null,
    subjectValue: subjectKind && subjectValue ? subjectValue : null,
    dateBucket: getDateBucket(searchParams.get("dateBucket"))
  });
  return NextResponse.json(stats);
}
