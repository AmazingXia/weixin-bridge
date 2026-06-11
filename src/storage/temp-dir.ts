import os from "node:os";
import path from "node:path";

/** Resolve a writable temp directory. */
export function resolvePreferredTempDir(): string {
  return (
    process.env.WEIXIN_TMP_DIR?.trim() ||
    path.join(os.tmpdir(), "weixin-bridge")
  );
}
