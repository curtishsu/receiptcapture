import "client-only";
import { isHeicLikeUpload } from "@/lib/image-format";

function replaceFileExtension(fileName: string, nextExtension: string): string {
  return /\.[^.]+$/.test(fileName) ? fileName.replace(/\.[^.]+$/, nextExtension) : `${fileName}${nextExtension}`;
}

async function readFileSignature(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 64).arrayBuffer());
}

function blobToJpegFile(blob: Blob, originalFileName: string): File {
  return new File([blob], replaceFileExtension(originalFileName, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

function drawImageToJpeg(image: CanvasImageSource, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Canvas is unavailable for image conversion."));
      return;
    }

    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas could not export the converted image."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.92
    );
  });
}

function loadImageElement(blobUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The browser could not decode this HEIC image."));
    image.src = blobUrl;
  });
}

async function convertHeicWithBrowserDecoder(file: File): Promise<File> {
  const blobUrl = URL.createObjectURL(file);

  try {
    if ("createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(file);

        try {
          const jpegBlob = await drawImageToJpeg(bitmap, bitmap.width, bitmap.height);
          return blobToJpegFile(jpegBlob, file.name);
        } finally {
          bitmap.close();
        }
      } catch {
        // Fall through to the HTMLImageElement path below.
      }
    }

    const image = await loadImageElement(blobUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error("The browser decoded the image but reported invalid dimensions.");
    }

    const jpegBlob = await drawImageToJpeg(image, width, height);
    return blobToJpegFile(jpegBlob, file.name);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function convertHeicWithLibrary(file: File): Promise<File> {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92
  });
  const convertedBlob = Array.isArray(result) ? result[0] : result;

  if (!(convertedBlob instanceof Blob)) {
    throw new Error("HEIC conversion produced an invalid image.");
  }

  return blobToJpegFile(convertedBlob, file.name);
}

export async function normalizeUploadImage(
  file: File
): Promise<{ file: File; wasConverted: boolean; fallbackToServer: boolean }> {
  const signature = await readFileSignature(file);
  const shouldNormalize = isHeicLikeUpload({
    fileName: file.name,
    mimeType: file.type,
    bytes: signature
  });

  if (!shouldNormalize) {
    return { file, wasConverted: false, fallbackToServer: false };
  }

  try {
    return {
      file: await convertHeicWithBrowserDecoder(file),
      wasConverted: true,
      fallbackToServer: false
    };
  } catch (nativeError) {
    try {
      return {
        file: await convertHeicWithLibrary(file),
        wasConverted: true,
        fallbackToServer: false
      };
    } catch (libraryError) {
      console.warn("Client-side HEIC conversion failed; falling back to server normalization.", {
        nativeError,
        libraryError
      });
      return {
        file,
        wasConverted: false,
        fallbackToServer: true
      };
    }
  }
}
