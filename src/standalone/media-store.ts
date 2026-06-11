import fs from "node:fs/promises";
import path from "node:path";

import { resolveStateDir } from "../storage/state-dir.js";
import { tempFileName } from "../util/random.js";

function extensionFromContentType(contentType?: string): string {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "audio/wav") return ".wav";
  if (normalized === "audio/silk") return ".silk";
  if (normalized === "video/mp4") return ".mp4";
  return ".bin";
}

/** Save inbound media to the standalone state directory. */
export async function saveStandaloneMediaBuffer(
  buffer: Buffer,
  contentType?: string,
  subdir = "inbound",
  maxBytes = 100 * 1024 * 1024,
  originalFilename?: string,
): Promise<{ path: string }> {
  if (buffer.length > maxBytes) {
    throw new Error(`media too large: ${buffer.length} > ${maxBytes}`);
  }

  const mediaDir = path.join(resolveStateDir(), "media", subdir);
  await fs.mkdir(mediaDir, { recursive: true });
  const safeOriginal = originalFilename
    ?.replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.\./g, "_");
  const fileName = safeOriginal || tempFileName("weixin-media", extensionFromContentType(contentType));
  const filePath = path.join(mediaDir, fileName);
  await fs.writeFile(filePath, buffer);
  return { path: filePath };
}
