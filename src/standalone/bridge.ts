import path from "node:path";

import { getUpdates } from "../api/api.js";
import type { WeixinMessage, MessageItem } from "../api/types.js";
import { MessageItemType, MessageType } from "../api/types.js";
import { CDN_BASE_URL, DEFAULT_BASE_URL } from "../auth/accounts.js";
import { downloadRemoteImageToTemp } from "../cdn/upload.js";
import { downloadMediaFromItem } from "../media/media-download.js";
import {
  getContextToken,
  restoreContextTokens,
  setContextToken,
  weixinMessageToInboundContext,
  isMediaItem,
} from "../messaging/inbound.js";
import type { WeixinInboundMediaOpts } from "../messaging/inbound.js";
import { sendWeixinMediaFile } from "../messaging/send-media.js";
import { sendMessageWeixin } from "../messaging/send.js";
import { getSyncBufFilePath, loadGetUpdatesBuf, saveGetUpdatesBuf } from "../storage/sync-buf.js";
import { resolvePreferredTempDir } from "../storage/temp-dir.js";
import { logger } from "../util/logger.js";

import { saveStandaloneMediaBuffer } from "./media-store.js";

const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const RETRY_DELAY_MS = 2_000;
const BACKOFF_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

const MEDIA_OUTBOUND_TEMP_DIR = path.join(resolvePreferredTempDir(), "weixin/media/outbound-temp");

export type WeixinReply =
  | string
  | {
      text?: string;
      mediaUrl?: string;
      mediaPath?: string;
    };

export type WeixinBridgeMessage = {
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
  raw: WeixinMessage;
  reply: (reply: WeixinReply) => Promise<{ messageId: string } | void>;
};

export type WeixinBridgeOptions = {
  accountId: string;
  token?: string;
  baseUrl?: string;
  cdnBaseUrl?: string;
  abortSignal?: AbortSignal;
  longPollTimeoutMs?: number;
  downloadMedia?: boolean;
  log?: (message: string) => void;
  errLog?: (message: string) => void;
  onMessage: (message: WeixinBridgeMessage) => Promise<WeixinReply | void> | WeixinReply | void;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

function resolveReplyText(reply: WeixinReply): string {
  return typeof reply === "string" ? reply : reply.text ?? "";
}

function resolveReplyMedia(reply: WeixinReply): string | undefined {
  return typeof reply === "string" ? undefined : reply.mediaPath ?? reply.mediaUrl;
}

function resolveLocalPath(mediaUrl: string): string {
  if (mediaUrl.startsWith("file://")) return new URL(mediaUrl).pathname;
  return path.isAbsolute(mediaUrl) ? mediaUrl : path.resolve(mediaUrl);
}

async function sendReply(params: {
  reply: WeixinReply;
  to: string;
  contextToken?: string;
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
}): Promise<{ messageId: string } | void> {
  const text = resolveReplyText(params.reply);
  const media = resolveReplyMedia(params.reply);

  if (!text && !media) {
    return;
  }

  if (!media) {
    return await sendMessageWeixin({
      to: params.to,
      text,
      opts: {
        baseUrl: params.baseUrl,
        token: params.token,
        contextToken: params.contextToken,
      },
    });
  }

  let filePath: string;
  if (!media.includes("://") || media.startsWith("file://")) {
    filePath = resolveLocalPath(media);
  } else if (media.startsWith("http://") || media.startsWith("https://")) {
    filePath = await downloadRemoteImageToTemp(media, MEDIA_OUTBOUND_TEMP_DIR);
  } else {
    throw new Error(`unsupported media URL: ${media}`);
  }

  return await sendWeixinMediaFile({
    filePath,
    to: params.to,
    text,
    opts: {
      baseUrl: params.baseUrl,
      token: params.token,
      contextToken: params.contextToken,
    },
    cdnBaseUrl: params.cdnBaseUrl,
  });
}

function findDownloadableMediaItem(msg: WeixinMessage): MessageItem | undefined {
  const itemList = msg.item_list ?? [];
  return (
    itemList.find(
      (i) => i.type === MessageItemType.IMAGE && i.image_item?.media?.encrypt_query_param,
    ) ??
    itemList.find(
      (i) => i.type === MessageItemType.VIDEO && i.video_item?.media?.encrypt_query_param,
    ) ??
    itemList.find(
      (i) => i.type === MessageItemType.FILE && i.file_item?.media?.encrypt_query_param,
    ) ??
    itemList.find(
      (i) =>
        i.type === MessageItemType.VOICE &&
        i.voice_item?.media?.encrypt_query_param &&
        !i.voice_item.text,
    ) ??
    itemList.find(
      (i) =>
        i.type === MessageItemType.TEXT &&
        i.ref_msg?.message_item &&
        isMediaItem(i.ref_msg.message_item),
    )?.ref_msg?.message_item
  );
}

async function normalizeInboundMessage(params: {
  raw: WeixinMessage;
  accountId: string;
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  downloadMedia: boolean;
  log: (message: string) => void;
  errLog: (message: string) => void;
}): Promise<WeixinBridgeMessage> {
  const { raw, accountId, baseUrl, cdnBaseUrl, token, downloadMedia, log, errLog } = params;
  const mediaOpts: WeixinInboundMediaOpts = {};

  if (downloadMedia) {
    const mediaItem = findDownloadableMediaItem(raw);
    if (mediaItem) {
      Object.assign(
        mediaOpts,
        await downloadMediaFromItem(mediaItem, {
          cdnBaseUrl,
          saveMedia: saveStandaloneMediaBuffer,
          log,
          errLog,
          label: "standalone inbound",
        }),
      );
    }
  }

  const ctx = weixinMessageToInboundContext(raw, mediaOpts);
  const from = raw.from_user_id ?? "";
  if (raw.context_token && from) {
    setContextToken(accountId, from, raw.context_token);
  }

  return {
    accountId,
    from,
    to: raw.to_user_id ?? "",
    text: ctx.text,
    messageId: raw.message_id,
    timestamp: raw.create_time_ms,
    contextToken: raw.context_token,
    media: ctx.mediaPath ? { path: ctx.mediaPath, type: ctx.mediaType } : undefined,
    raw,
    reply: (reply) =>
      sendReply({
        reply,
        to: from,
        contextToken: raw.context_token ?? getContextToken(accountId, from),
        baseUrl,
        cdnBaseUrl,
        token,
      }),
  };
}

/** Start a standalone long-poll bridge from Weixin to any user supplied handler. */
export async function startWeixinBridge(opts: WeixinBridgeOptions): Promise<void> {
  const baseUrl = opts.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = opts.cdnBaseUrl || CDN_BASE_URL;
  const log = opts.log ?? ((message: string) => console.log(message));
  const errLog = opts.errLog ?? ((message: string) => console.error(message));
  const timeoutMs = opts.longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS;

  restoreContextTokens(opts.accountId);

  const syncFilePath = getSyncBufFilePath(opts.accountId);
  let getUpdatesBuf = loadGetUpdatesBuf(syncFilePath) ?? "";
  let consecutiveFailures = 0;

  log(`[weixin] bridge started account=${opts.accountId}`);

  while (!opts.abortSignal?.aborted) {
    try {
      const resp = await getUpdates({
        baseUrl,
        token: opts.token,
        get_updates_buf: getUpdatesBuf,
        timeoutMs,
      });
      const isApiError =
        (resp.ret !== undefined && resp.ret !== 0) ||
        (resp.errcode !== undefined && resp.errcode !== 0);

      if (isApiError) {
        consecutiveFailures += 1;
        errLog(
          `[weixin] getUpdates failed ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`,
        );
        await sleep(
          consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? BACKOFF_DELAY_MS : RETRY_DELAY_MS,
          opts.abortSignal,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          consecutiveFailures = 0;
        }
        continue;
      }

      consecutiveFailures = 0;
      if (resp.get_updates_buf != null && resp.get_updates_buf !== "") {
        getUpdatesBuf = resp.get_updates_buf;
        saveGetUpdatesBuf(syncFilePath, getUpdatesBuf);
      }

      for (const raw of resp.msgs ?? []) {
        if (raw.message_type === MessageType.BOT || !raw.from_user_id) {
          continue;
        }

        const message = await normalizeInboundMessage({
          raw,
          accountId: opts.accountId,
          baseUrl,
          cdnBaseUrl,
          token: opts.token,
          downloadMedia: opts.downloadMedia !== false,
          log,
          errLog,
        });

        logger.info(
          `standalone inbound: account=${opts.accountId} from=${message.from} textLen=${message.text.length}`,
        );
        const reply = await opts.onMessage(message);
        if (reply) {
          await message.reply(reply);
        }
      }
    } catch (err) {
      if (opts.abortSignal?.aborted) {
        return;
      }
      consecutiveFailures += 1;
      errLog(`[weixin] bridge error: ${String(err)}`);
      logger.error(`standalone bridge error: ${String(err)}`);
      await sleep(
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? BACKOFF_DELAY_MS : RETRY_DELAY_MS,
        opts.abortSignal,
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
      }
    }
  }
}
