/** Normalize an account id so it is safe to use as a filename. */
export function normalizeAccountId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("accountId is required");
  }
  return trimmed
    .replace(/@/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}
