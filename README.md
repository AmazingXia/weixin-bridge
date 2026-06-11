# Weixin AI Bridge

[简体中文](./README.zh_CN.md)

This project keeps one real Weixin path only:

```txt
Weixin user
  -> Weixin iLink backend
  -> weixin-bridge
  -> your AI/business logic
  -> weixin-bridge
  -> Weixin iLink backend
  -> Weixin user
```

It does not implement a custom IM backend and does not expose a webhook branch. Your code plugs in directly through `startWeixinBridge({ onMessage })`.

## Build

```bash
npm install
npm run build
```

## Login

```bash
node dist/cli.js login
```

Scan the QR code with Weixin and confirm on your phone. Credentials are stored under:

```txt
~/.weixin-bridge/accounts
```

List accounts:

```bash
node dist/cli.js accounts
```

## Echo Test

```bash
node dist/cli.js test-chat
```

Send a Weixin message to the logged-in account. The bridge replies with:

```txt
收到：<your message>
```

## AI / Business Logic

`test.js` connects real Weixin messages to a Responses-compatible API:

```bash
export BASE_URL='https://ai-demo-dev.kuaiman.com/ai'
export API_KEY='sk-...'
node test.js
```

Core usage:

```js
import { resolveStandaloneAccount, startWeixinBridge } from "@tencent-weixin/weixin-bridge";

const account = resolveStandaloneAccount();

await startWeixinBridge({
  accountId: account.accountId,
  token: account.token,
  baseUrl: account.baseUrl,
  cdnBaseUrl: account.cdnBaseUrl,
  async onMessage(message) {
    // message.text is Weixin text.
    // message.media?.path is the local path of downloaded inbound media.
    const reply = await callYourAiOrBusiness(message);
    return reply;
  },
});
```

Return text:

```js
return "Text reply to the Weixin user";
```

Return media:

```js
return {
  text: "Done",
  mediaPath: "/tmp/generated.png",
};
```

```js
return {
  text: "Done",
  mediaUrl: "https://example.com/generated.png",
};
```

## Capabilities

- QR login
- Long-poll Weixin messages
- Receive text messages
- Download/decrypt inbound image, voice, file, and video messages to local files
- Reply with text
- Reply with image/video/file via `{ text, mediaPath }` or `{ text, mediaUrl }`
