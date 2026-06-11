import http from "node:http";

import type { WeixinBridgeMessage, WeixinReply } from "./bridge.js";

export type WebhookBridgeOptions = {
  url: string;
  secret?: string;
};

export type WebhookPayload = {
  accountId: string;
  from: string;
  to: string;
  text: string;
  messageId?: number;
  timestamp?: number;
  contextToken?: string;
  media?: {
    path: string;
    type?: string;
  };
  raw: unknown;
};

/** Forward an inbound Weixin message to an HTTP JSON endpoint. */
export async function postMessageToWebhook(
  message: WeixinBridgeMessage,
  opts: WebhookBridgeOptions,
): Promise<WeixinReply | void> {
  const payload: WebhookPayload = {
    accountId: message.accountId,
    from: message.from,
    to: message.to,
    text: message.text,
    messageId: message.messageId,
    timestamp: message.timestamp,
    contextToken: message.contextToken,
    media: message.media,
    raw: message.raw,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.secret) {
    headers.Authorization = `Bearer ${opts.secret}`;
  }

  const res = await fetch(opts.url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`webhook failed: HTTP ${res.status} ${res.statusText} ${text}`);
  }
  if (!text.trim()) {
    return;
  }
  const parsed = JSON.parse(text) as WeixinReply | { reply?: WeixinReply };
  if (typeof parsed === "object" && parsed && "reply" in parsed) {
    return parsed.reply;
  }
  return parsed as WeixinReply;
}

/** Start a tiny local HTTP endpoint that can receive generic realtime callbacks. */
export function startReplyReceiver(params: {
  port: number;
  onReply: (body: unknown) => Promise<void> | void;
}): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("method not allowed");
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        await params.onReply(raw ? JSON.parse(raw) : {});
        res.writeHead(204);
        res.end();
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(err));
      }
    });
  });
  server.listen(params.port);
  return server;
}
