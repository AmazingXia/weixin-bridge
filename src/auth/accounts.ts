import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "../storage/state-dir.js";

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export type WeixinAccountData = {
  token?: string;
  savedAt?: string;
  baseUrl?: string;
  userId?: string;
};

function resolveAccountsDir(): string {
  return path.join(resolveStateDir(), "accounts");
}

function resolveLegacyAccountsDir(): string {
  return path.join(resolveStateDir(), "openclaw-weixin", "accounts");
}

function resolveAccountIndexPath(): string {
  return path.join(resolveStateDir(), "accounts.json");
}

function resolveLegacyAccountIndexPath(): string {
  return path.join(resolveStateDir(), "openclaw-weixin", "accounts.json");
}

function resolveAccountPath(accountId: string): string {
  return path.join(resolveAccountsDir(), `${accountId}.json`);
}

function resolveLegacyAccountPath(accountId: string): string {
  return path.join(resolveLegacyAccountsDir(), `${accountId}.json`);
}

export function listWeixinAccountIds(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveAccountIndexPath(), "utf-8"));
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && id.trim() !== "")
      : [];
  } catch {
    try {
      const parsed = JSON.parse(fs.readFileSync(resolveLegacyAccountIndexPath(), "utf-8"));
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string" && id.trim() !== "")
        : [];
    } catch {
      return [];
    }
  }
}

export function registerWeixinAccountId(accountId: string): void {
  fs.mkdirSync(resolveStateDir(), { recursive: true });
  const existing = listWeixinAccountIds();
  if (existing.includes(accountId)) return;
  fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify([...existing, accountId], null, 2), "utf-8");
}

export function loadWeixinAccount(accountId: string): WeixinAccountData | null {
  try {
    return JSON.parse(fs.readFileSync(resolveAccountPath(accountId), "utf-8")) as WeixinAccountData;
  } catch {
    try {
      return JSON.parse(fs.readFileSync(resolveLegacyAccountPath(accountId), "utf-8")) as WeixinAccountData;
    } catch {
      return null;
    }
  }
}

export function saveWeixinAccount(
  accountId: string,
  update: { token?: string; baseUrl?: string; userId?: string },
): void {
  fs.mkdirSync(resolveAccountsDir(), { recursive: true });
  const existing = loadWeixinAccount(accountId) ?? {};
  const data: WeixinAccountData = {
    token: update.token?.trim() || existing.token,
    savedAt: new Date().toISOString(),
    baseUrl: update.baseUrl?.trim() || existing.baseUrl || DEFAULT_BASE_URL,
    userId: update.userId?.trim() || existing.userId,
  };
  const filePath = resolveAccountPath(accountId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }
}

export function loadConfigRouteTag(): string | undefined {
  return process.env.WEIXIN_ROUTE_TAG?.trim() || undefined;
}
