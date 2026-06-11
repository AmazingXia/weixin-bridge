import os from "node:os";
import path from "node:path";

/** Resolve the standalone state directory. */
export function resolveStateDir(): string {
  return (
    process.env.WEIXIN_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".weixin-bridge")
  );
}
