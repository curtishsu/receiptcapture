import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createDataUrl, parseDataUrl } from "@/lib/data-url";
import { isHeicLikeUpload } from "@/lib/image-format";
import { parseReceiptFromUpload } from "@/lib/receipt-parser";

async function convertHeicToJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: convert } = await import("heic-convert");
  return convert({
    buffer: bytes,
    format: "JPEG",
    quality: 0.92
  });
}

async function normalizeReceiptImageDataUrl(imageDataUrl: string): Promise<string> {
  const { mimeType, bytes } = parseDataUrl(imageDataUrl);

  if (!isHeicLikeUpload({ mimeType, bytes })) {
    return imageDataUrl;
  }

  const jpegBytes = await convertHeicToJpeg(bytes);
  return createDataUrl("image/jpeg", jpegBytes);
}

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
    const normalizedImageDataUrl = await normalizeReceiptImageDataUrl(body.image_data_url);
    const parsed = await parseReceiptFromUpload(user.id, normalizedImageDataUrl, uploadDate);
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
