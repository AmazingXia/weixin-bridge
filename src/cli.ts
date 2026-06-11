#!/usr/bin/env node
import { listStandaloneAccounts, resolveStandaloneAccount } from "./standalone/accounts.js";
import { startWeixinBridge } from "./standalone/bridge.js";
import { loginWeixinStandalone } from "./standalone/login.js";

type CliOptions = Record<string, string | boolean>;

function usage(): string {
  return [
    "Usage:",
    "  weixin-bridge login [--base-url <url>] [--account-id <id>] [--force]",
    "  weixin-bridge accounts",
    "  weixin-bridge test-chat [--account-id <id>] [--reply-prefix <text>]",
    "",
    "Environment:",
    "  WEIXIN_STATE_DIR   Standalone credential/state directory",
    "  WEIXIN_TMP_DIR     Temp directory for media/log files",
  ].join("\n");
}

function parseArgs(argv: string[]): { command?: string; options: CliOptions } {
  const [command, ...rest] = argv;
  const options: CliOptions = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      i++;
    }
  }
  return { command, options };
}

function optionString(options: CliOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function runLogin(options: CliOptions): Promise<void> {
  const result = await loginWeixinStandalone({
    accountId: optionString(options, "accountId"),
    baseUrl: optionString(options, "baseUrl"),
    force: options.force === true,
    verbose: options.verbose === true,
  });
  console.log(`\n登录成功 accountId=${result.accountId}`);
}

function runAccounts(): void {
  const accounts = listStandaloneAccounts();
  if (accounts.length === 0) {
    console.log("暂无已登录账号。");
    return;
  }
  for (const account of accounts) {
    console.log(
      [
        account.accountId,
        account.configured ? "configured" : "missing-token",
        account.userId ? `userId=${account.userId}` : "",
        `baseUrl=${account.baseUrl}`,
      ].filter(Boolean).join("  "),
    );
  }
}

async function runTestChat(options: CliOptions): Promise<void> {
  const account = resolveStandaloneAccount(optionString(options, "accountId"));
  const prefix = optionString(options, "replyPrefix") ?? "收到：";
  console.log(`测试聊天已启动 accountId=${account.accountId}`);
  console.log("请用微信给已扫码账号发消息；收到后会自动回一条测试消息。按 Ctrl+C 退出。");

  await startWeixinBridge({
    accountId: account.accountId,
    token: account.token,
    baseUrl: account.baseUrl,
    cdnBaseUrl: account.cdnBaseUrl,
    onMessage: async (message) => {
      const text = message.text || (message.media ? `[${message.media.type ?? "media"}]` : "");
      console.log(`[inbound] from=${message.from} text=${text}`);
      return `${prefix}${text || "我看到你的消息了"}`;
    },
  });
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (command === "login") {
    await runLogin(options);
    return;
  }
  if (command === "accounts") {
    runAccounts();
    return;
  }
  if (command === "test-chat") {
    await runTestChat(options);
    return;
  }

  throw new Error(`未知命令: ${command}\n${usage()}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
