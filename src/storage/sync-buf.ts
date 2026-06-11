import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "./state-dir.js";

function resolveSyncDir(): string {
  return path.join(resolveStateDir(), "sync");
}

export function getSyncBufFilePath(accountId: string): string {
  return path.join(resolveSyncDir(), `${accountId}.json`);
}

export function loadGetUpdatesBuf(filePath: string): string | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { get_updates_buf?: string };
    return typeof data.get_updates_buf === "string" ? data.get_updates_buf : undefined;
  } catch {
    return undefined;
  }
}

export function saveGetUpdatesBuf(filePath: string, getUpdatesBuf: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ get_updates_buf: getUpdatesBuf }), "utf-8");
}
