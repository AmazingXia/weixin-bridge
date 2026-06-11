import fs from "node:fs/promises";

import { resolveStandaloneAccount, startWeixinBridge } from "@tencent-weixin/weixin-bridge";

const BASE_URL = process.env.BASE_URL;
const API_KEY = process.env.API_KEY;

if (!BASE_URL || !API_KEY) {
  console.error("请先设置 BASE_URL 和 API_KEY");
  console.error("示例：BASE_URL='https://*.*.com' API_KEY='sk-...' node test.js");
  process.exit(1);
}

function getMimeType(filePath, fallback) {
  if (fallback && fallback !== "image/*") return fallback;
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return fallback === "image/*" ? "image/png" : "application/octet-stream";
}

async function fileToDataUrl(filePath, mimeType) {
  const data = await fs.readFile(filePath);
  return `data:${getMimeType(filePath, mimeType)};base64,${data.toString("base64")}`;
}

async function callResponses(body) {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }
  return json.output?.[0]?.content?.[0]?.text ?? JSON.stringify(json);
}

async function askModel(message) {
  if (message.media?.path && message.media.type?.startsWith("image/")) {
    const imageUrl = await fileToDataUrl(message.media.path, message.media.type);
    return await callResponses({
      model: "default",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: message.text || "识别图片中的文字，只输出识别结果。",
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
    });
  }

  return await callResponses({
    model: "default",
    instructions: "你是一个简洁的中文助手。",
    input: message.text || "",
  });
}

const account = resolveStandaloneAccount();

console.log(`weixin-bridge AI test started, accountId=${account.accountId}`);

await startWeixinBridge({
  accountId: account.accountId,
  token: account.token,
  baseUrl: account.baseUrl,
  cdnBaseUrl: account.cdnBaseUrl,
  async onMessage(message) {
    try {
      console.log(`[inbound] from=${message.from} text=${message.text} media=${message.media?.path ?? "none"}`);
      return await askModel(message);
    } catch (err) {
      console.error(err);
      return `调用模型失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
