export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string; bytes: Buffer } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const [, mimeType, base64] = match;
  return {
    mimeType,
    base64,
    bytes: Buffer.from(base64, "base64")
  };
}

export function createDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}
