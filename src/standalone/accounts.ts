import { CDN_BASE_URL, DEFAULT_BASE_URL, listWeixinAccountIds, loadWeixinAccount } from "../auth/accounts.js";

export type StandaloneAccount = {
  accountId: string;
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  userId?: string;
  configured: boolean;
};

export function listStandaloneAccounts(): StandaloneAccount[] {
  return listWeixinAccountIds().map((accountId) => {
    const data = loadWeixinAccount(accountId);
    const token = data?.token?.trim() || undefined;
    return {
      accountId,
      baseUrl: data?.baseUrl?.trim() || DEFAULT_BASE_URL,
      cdnBaseUrl: CDN_BASE_URL,
      token,
      userId: data?.userId,
      configured: Boolean(token),
    };
  });
}

export function resolveStandaloneAccount(accountId?: string): StandaloneAccount {
  const accounts = listStandaloneAccounts().filter((account) => account.configured);
  const selected = accountId
    ? accounts.find((account) => account.accountId === accountId)
    : accounts[0];

  if (!selected) {
    throw new Error(
      accountId
        ? `未找到账号 ${accountId}，请先运行 login。`
        : "未找到已登录账号，请先运行 login。",
    );
  }

  return selected;
}
