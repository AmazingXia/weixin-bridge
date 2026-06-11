import { CDN_BASE_URL, DEFAULT_BASE_URL, loadWeixinAccount, registerWeixinAccountId, saveWeixinAccount } from "../auth/accounts.js";
import { DEFAULT_ILINK_BOT_TYPE, startWeixinLoginWithQr, waitForWeixinLogin } from "../auth/login-qr.js";
import { normalizeAccountId } from "../core/ids.js";

export type StandaloneLoginResult = {
  accountId: string;
  token: string;
  baseUrl: string;
  cdnBaseUrl: string;
  userId?: string;
};

function printQrCode(qrcodeUrl: string): Promise<void> {
  return new Promise((resolve) => {
    import("qrcode-terminal")
      .then((qrcodeTerminal) => {
        qrcodeTerminal.default.generate(qrcodeUrl, { small: true }, (qr: string) => {
          console.log(qr);
          console.log("如果二维码未能成功展示，请用浏览器打开以下链接扫码：");
          console.log(qrcodeUrl);
          resolve();
        });
      })
      .catch(() => {
        console.log("二维码未加载成功，请用浏览器打开以下链接扫码：");
        console.log(qrcodeUrl);
        resolve();
      });
  });
}

/** Run QR login and persist the standalone account credentials. */
export async function loginWeixinStandalone(opts: {
  accountId?: string;
  baseUrl?: string;
  timeoutMs?: number;
  verbose?: boolean;
  force?: boolean;
  botType?: string;
} = {}): Promise<StandaloneLoginResult> {
  const savedBaseUrl = opts.accountId ? loadWeixinAccount(opts.accountId)?.baseUrl?.trim() : "";
  const apiBaseUrl = opts.baseUrl || savedBaseUrl || DEFAULT_BASE_URL;
  const start = await startWeixinLoginWithQr({
    accountId: opts.accountId,
    apiBaseUrl,
    botType: opts.botType || DEFAULT_ILINK_BOT_TYPE,
    verbose: opts.verbose,
    force: opts.force,
  });

  if (!start.qrcodeUrl) {
    throw new Error(start.message);
  }

  console.log("\n使用微信扫描以下二维码，以完成连接：\n");
  await printQrCode(start.qrcodeUrl);
  console.log("\n等待连接结果...\n");

  const result = await waitForWeixinLogin({
    sessionKey: start.sessionKey,
    apiBaseUrl,
    timeoutMs: opts.timeoutMs ?? 480_000,
    verbose: opts.verbose,
    botType: opts.botType || DEFAULT_ILINK_BOT_TYPE,
  });

  if (!result.connected || !result.botToken || !result.accountId) {
    throw new Error(result.message);
  }

  const accountId = normalizeAccountId(result.accountId);
  const baseUrl = result.baseUrl || apiBaseUrl;
  saveWeixinAccount(accountId, {
    token: result.botToken,
    baseUrl,
    userId: result.userId,
  });
  registerWeixinAccountId(accountId);

  return {
    accountId,
    token: result.botToken,
    baseUrl,
    cdnBaseUrl: CDN_BASE_URL,
    userId: result.userId,
  };
}
