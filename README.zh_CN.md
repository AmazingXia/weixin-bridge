# 微信 AI Bridge

[English](./README.md)

这个项目只保留一条真实微信链路：

```txt
微信用户
  -> 微信 iLink 后端
  -> weixin-bridge
  -> 你的 AI/业务逻辑
  -> weixin-bridge
  -> 微信 iLink 后端
  -> 微信用户
```

它不实现自有 IM 后端，也不再提供 webhook 分支。你的业务代码直接通过 `startWeixinBridge({ onMessage })` 接入。

## 安装与构建

```bash
npm install
npm run build
```

## 扫码登录

```bash
node dist/cli.js login
```

终端会显示二维码，用微信扫码并在手机端确认。登录凭证默认保存在：

```txt
~/.weixin-bridge/accounts
```

查看已登录账号：

```bash
node dist/cli.js accounts
```

## 回声测试

```bash
node dist/cli.js test-chat
```

用微信给已登录账号发消息，bridge 会回复：

```txt
收到：<你的消息>
```

## 接入 AI/业务逻辑

根目录的 `test.js` 演示了真实微信消息接入 Responses 兼容 API：

```bash
export BASE_URL='https://ai-demo-dev.kuaiman.com/ai'
export API_KEY='sk-...'
node test.js
```

核心代码：

```js
import { resolveStandaloneAccount, startWeixinBridge } from "@tencent-weixin/weixin-bridge";

const account = resolveStandaloneAccount();

await startWeixinBridge({
  accountId: account.accountId,
  token: account.token,
  baseUrl: account.baseUrl,
  cdnBaseUrl: account.cdnBaseUrl,
  async onMessage(message) {
    // message.text 是微信文本。
    // message.media?.path 是微信图片/文件下载后的本地路径。
    const reply = await callYourAiOrBusiness(message);
    return reply;
  },
});
```

`onMessage` 可以返回文本：

```js
return "回复给微信用户的文本";
```

也可以返回媒体：

```js
return {
  text: "生成好了",
  mediaPath: "/tmp/generated.png",
};
```

```js
return {
  text: "生成好了",
  mediaUrl: "https://example.com/generated.png",
};
```

## 当前能力

- 微信扫码登录
- 长轮询接收微信消息
- 接收文本消息
- 下载并解密微信入站图片、语音、文件、视频到本地
- 回复文本消息
- 回复图片、视频、文件：`onMessage` 返回 `{ text, mediaPath }` 或 `{ text, mediaUrl }`
