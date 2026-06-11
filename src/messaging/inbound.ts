import fs from "node:fs";
import path from "node:path";

import type { MessageItem, WeixinMessage } from "../api/types.js";
import { MessageItemType } from "../api/types.js";
import { resolveStateDir } from "../storage/state-dir.js";
import { logger } from "../util/logger.js";

const contextTokenStore = new Map<string, string>();

function contextTokenKey(accountId: string, userId: string): string {
  return `${accountId}:${userId}`;
}

function resolveContextTokenFilePath(accountId: string): string {
  return path.join(resolveStateDir(), "context-tokens", `${accountId}.json`);
}

function persistContextTokens(accountId: string): void {
  const prefix = `${accountId}:`;
  const tokens: Record<string, string> = {};
  for (const [key, token] of contextTokenStore) {
    if (key.startsWith(prefix)) tokens[key.slice(prefix.length)] = token;
  }
  try {
    const filePath = resolveContextTokenFilePath(accountId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(tokens), "utf-8");
  } catch (err) {
    logger.warn(`persistContextTokens failed: ${String(err)}`);
  }
}

export function restoreContextTokens(accountId: string): void {
  try {
    const tokens = JSON.parse(fs.readFileSync(resolveContextTokenFilePath(accountId), "utf-8")) as Record<string, string>;
    for (const [userId, token] of Object.entries(tokens)) {
      if (token) contextTokenStore.set(contextTokenKey(accountId, userId), token);
    }
  } catch {
    // no persisted tokens yet
  }
}

export function setContextToken(accountId: string, userId: string, token: string): void {
  contextTokenStore.set(contextTokenKey(accountId, userId), token);
  persistContextTokens(accountId);
}

export function getContextToken(accountId: string, userId: string): string | undefined {
  return contextTokenStore.get(contextTokenKey(accountId, userId));
}

export function isMediaItem(item: MessageItem): boolean {
  return (
    item.type === MessageItemType.IMAGE ||
    item.type === MessageItemType.VIDEO ||
    item.type === MessageItemType.FILE ||
    item.type === MessageItemType.VOICE
  );
}

function bodyFromItemList(itemList?: MessageItem[]): string {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text);
      const ref = item.ref_msg;
      if (!ref) return text;
      if (ref.message_item && isMediaItem(ref.message_item)) return text;
      const parts = [ref.title, ref.message_item ? bodyFromItemList([ref.message_item]) : ""]
        .filter(Boolean);
      return parts.length ? `[引用: ${parts.join(" | ")}]\n${text}` : text;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}

export type WeixinInboundMediaOpts = {
  decryptedPicPath?: string;
  decryptedVoicePath?: string;
  voiceMediaType?: string;
  decryptedFilePath?: string;
  fileMediaType?: string;
  decryptedVideoPath?: string;
};

export type WeixinInboundContext = {
  text: string;
  mediaPath?: string;
  mediaType?: string;
};

export function weixinMessageToInboundContext(
  msg: WeixinMessage,
  opts?: WeixinInboundMediaOpts,
): WeixinInboundContext {
  if (opts?.decryptedPicPath) return { text: bodyFromItemList(msg.item_list), mediaPath: opts.decryptedPicPath, mediaType: "image/*" };
  if (opts?.decryptedVideoPath) return { text: bodyFromItemList(msg.item_list), mediaPath: opts.decryptedVideoPath, mediaType: "video/mp4" };
  if (opts?.decryptedFilePath) return { text: bodyFromItemList(msg.item_list), mediaPath: opts.decryptedFilePath, mediaType: opts.fileMediaType ?? "application/octet-stream" };
  if (opts?.decryptedVoicePath) return { text: bodyFromItemList(msg.item_list), mediaPath: opts.decryptedVoicePath, mediaType: opts.voiceMediaType ?? "audio/wav" };
  return { text: bodyFromItemList(msg.item_list) };
}
