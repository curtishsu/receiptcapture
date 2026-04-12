const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const JPEG_MIME_TYPES = new Set(["image/jpeg", "image/jpg"]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || start + length > bytes.length) {
    return "";
  }

  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function getHeicBrand(bytes: Uint8Array): string | null {
  if (bytes.length < 12 || readAscii(bytes, 4, 4) !== "ftyp") {
    return null;
  }

  const brands: string[] = [];
  const majorBrand = readAscii(bytes, 8, 4);
  if (majorBrand) {
    brands.push(majorBrand);
  }

  for (let offset = 16; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
    const brand = readAscii(bytes, offset, 4);
    if (brand) {
      brands.push(brand);
    }
  }

  return brands.find((brand) => HEIC_BRANDS.has(brand.toLowerCase())) ?? null;
}

export function isHeicLikeUpload({
  fileName,
  mimeType,
  bytes
}: {
  fileName?: string | null;
  mimeType?: string | null;
  bytes?: Uint8Array | null;
}): boolean {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? "";
  const normalizedFileName = fileName?.trim().toLowerCase() ?? "";

  if (HEIC_MIME_TYPES.has(normalizedMimeType)) {
    return true;
  }

  if (/\.(heic|heif)$/.test(normalizedFileName)) {
    return true;
  }

  if (bytes?.length) {
    const heicBrand = getHeicBrand(bytes);
    if (heicBrand) {
      return true;
    }

    if (JPEG_MIME_TYPES.has(normalizedMimeType) && !hasJpegSignature(bytes)) {
      return true;
    }
  }

  return false;
}
