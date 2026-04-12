import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseReceiptFromUpload } from "@/lib/receipt-parser";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { image_data_url?: string; upload_date?: string };
  if (!body.image_data_url) {
    return NextResponse.json({ error: "image_data_url is required" }, { status: 400 });
  }

  const uploadDate = body.upload_date?.trim() || new Date().toISOString().slice(0, 10);

  try {
    const parsed = await parseReceiptFromUpload(user.id, body.image_data_url, uploadDate);
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Receipt parsing failed"
      },
      { status: 500 }
    );
  }
}
