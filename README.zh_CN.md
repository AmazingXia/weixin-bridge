# 微信通用 Bridge

[English](./README.md)

这是一个不依赖 OpenClaw 的微信长轮询 Bridge。它保留原有微信 iLink 扫码登录、`getUpdates` 长轮询、`sendMessage` 回复能力，并提供可直接测试聊天的 CLI 和可自定义接入的 Node API / HTTP Webhook。

## 安装依赖与构建

```bash
npm install
npm run build
```

本地命令入口：

```bash
node dist/cli.js --help
```

如果通过 npm link 或作为包安装，也可以使用：

```bash
weixin-bridge --help
```

## 扫码登录

```bash
node dist/cli.js login
```

终端会显示二维码，用微信扫码并在手机端确认。登录成功后，凭证默认保存到：

```bash
~/.weixin-bridge/accounts
```

可用环境变量覆盖状态目录：

```bash
WEIXIN_STATE_DIR=/path/to/state node dist/cli.js login
```

查看已登录账号：

```bash
node dist/cli.js accounts
```

## 测试聊天

扫码登录后运行：

```bash
node dist/cli.js test-chat
```

然后用微信给已扫码账号发消息。程序收到消息后会自动回复 `收到：<你的消息>`，用于验证“扫码登录后能测试聊天”这条链路。

多账号时可指定账号：

```bash
node dist/cli.js test-chat --account-id <accountId>
```

## 接入自定义实时通信

### HTTP Webhook

把每条微信入站消息转发到你的服务：

```bash
node dist/cli.js bridge --webhook http://127.0.0.1:3000/weixin
```

Webhook 会收到 JSON：

```json
{
  "accountId": "xxx-im-bot",
  "from": "user@im.wechat",
  "to": "bot@im.bot",
  "text": "你好",
  "messageId": 123,
  "timestamp": 1710000000000,
  "contextToken": "...",
  "media": { "path": "/local/file", "type": "image/*" },
  "raw": {}
}
```

你的服务可以返回以下任一格式，Bridge 会自动回到微信：

```json
{ "text": "收到" }
```

```json
{ "reply": { "text": "收到", "mediaUrl": "https://example.com/a.png" } }
```

### Node API

```ts
import { resolveStandaloneAccount, startWeixinBridge } from "@tencent-weixin/weixin-bridge";

const account = resolveStandaloneAccount();

await startWeixinBridge({
  accountId: account.accountId,
  token: account.token,
  baseUrl: account.baseUrl,
  cdnBaseUrl: account.cdnBaseUrl,
  async onMessage(message) {
    // 在这里接入 WebSocket、SSE、MQ、自己的 AI 服务等实时通信。
    return `收到：${message.text}`;
  },
});
```

## 后端 API 协议

Bridge 通过 HTTP JSON API 与微信 iLink 后端通信。二次开发者若需对接自有后端，需实现以下接口。

所有接口均为 `POST`，请求和响应均为 JSON。通用请求头：

| Header | 说明 |
|--------|------|
| `Content-Type` | `application/json` |
| `AuthorizationType` | 固定值 `ilink_bot_token` |
| `Authorization` | `Bearer <token>`（登录后获取） |
| `X-WECHAT-UIN` | 随机 uint32 的 base64 编码 |

### 接口列表

| 接口 | 路径 | 说明 |
|------|------|------|
| getUpdates | `getupdates` | 长轮询获取新消息 |
| sendMessage | `sendmessage` | 发送消息（文本/图片/视频/文件） |
| getUploadUrl | `getuploadurl` | 获取 CDN 上传预签名 URL |
| getConfig | `getconfig` | 获取账号配置（typing ticket 等） |
| sendTyping | `sendtyping` | 发送/取消输入状态指示 |

### getUpdates

长轮询接口。服务端在有新消息或超时后返回。

**请求体：**

```json
{
  "get_updates_buf": ""
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `get_updates_buf` | `string` | 上次响应返回的同步游标，首次请求传空字符串 |

**响应体：**

```json
{
  "ret": 0,
  "msgs": [...],
  "get_updates_buf": "<新游标>",
  "longpolling_timeout_ms": 35000
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ret` | `number` | 返回码，`0` = 成功 |
| `errcode` | `number?` | 错误码（如 `-14` = 会话超时） |
| `errmsg` | `string?` | 错误描述 |
| `msgs` | `WeixinMessage[]` | 消息列表（结构见下方） |
| `get_updates_buf` | `string` | 新的同步游标，下次请求时回传 |
| `longpolling_timeout_ms` | `number?` | 服务端建议的下次长轮询超时（ms） |

### sendMessage

发送一条消息给用户。

**请求体：**

```json
{
  "msg": {
    "to_user_id": "<目标用户 ID>",
    "context_token": "<会话上下文令牌>",
    "item_list": [
      {
        "type": 1,
        "text_item": { "text": "你好" }
      }
    ]
  }
}
```

### getUploadUrl

获取 CDN 上传预签名参数。上传文件前需先调用此接口获取 `upload_param` 和 `thumb_upload_param`。

**请求体：**

```json
{
  "filekey": "<文件标识>",
  "media_type": 1,
  "to_user_id": "<目标用户 ID>",
  "rawsize": 12345,
  "rawfilemd5": "<明文 MD5>",
  "filesize": 12352,
  "thumb_rawsize": 1024,
  "thumb_rawfilemd5": "<缩略图明文 MD5>",
  "thumb_filesize": 1040
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `media_type` | `number` | `1` = IMAGE, `2` = VIDEO, `3` = FILE |
| `rawsize` | `number` | 原文件明文大小 |
| `rawfilemd5` | `string` | 原文件明文 MD5 |
| `filesize` | `number` | AES-128-ECB 加密后的密文大小 |
| `thumb_rawsize` | `number?` | 缩略图明文大小（IMAGE/VIDEO 时必填） |
| `thumb_rawfilemd5` | `string?` | 缩略图明文 MD5（IMAGE/VIDEO 时必填） |
| `thumb_filesize` | `number?` | 缩略图密文大小（IMAGE/VIDEO 时必填） |

**响应体：**

```json
{
  "upload_param": "<原图上传加密参数>",
  "thumb_upload_param": "<缩略图上传加密参数>"
}
```

### getConfig

获取账号配置，包括 typing ticket。

**请求体：**

```json
{
  "ilink_user_id": "<用户 ID>",
  "context_token": "<可选，会话上下文令牌>"
}
```

**响应体：**

```json
{
  "ret": 0,
  "typing_ticket": "<base64 编码的 typing ticket>"
}
```

### sendTyping

发送或取消输入状态指示。

**请求体：**

```json
{
  "ilink_user_id": "<用户 ID>",
  "typing_ticket": "<从 getConfig 获取>",
  "status": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `number` | `1` = 正在输入，`2` = 取消输入 |

### 消息结构

#### WeixinMessage

| 字段 | 类型 | 说明 |
|------|------|------|
| `seq` | `number?` | 消息序列号 |
| `message_id` | `number?` | 消息唯一 ID |
| `from_user_id` | `string?` | 发送者 ID |
| `to_user_id` | `string?` | 接收者 ID |
| `create_time_ms` | `number?` | 创建时间戳（ms） |
| `session_id` | `string?` | 会话 ID |
| `message_type` | `number?` | `1` = USER, `2` = BOT |
| `message_state` | `number?` | `0` = NEW, `1` = GENERATING, `2` = FINISH |
| `item_list` | `MessageItem[]?` | 消息内容列表 |
| `context_token` | `string?` | 会话上下文令牌，回复时需回传 |

#### MessageItem

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `number` | `1` TEXT, `2` IMAGE, `3` VOICE, `4` FILE, `5` VIDEO |
| `text_item` | `{ text: string }?` | 文本内容 |
| `image_item` | `ImageItem?` | 图片（含 CDN 引用和 AES 密钥） |
| `voice_item` | `VoiceItem?` | 语音（SILK 编码） |
| `file_item` | `FileItem?` | 文件附件 |
| `video_item` | `VideoItem?` | 视频 |
| `ref_msg` | `RefMessage?` | 引用消息 |

#### CDN 媒体引用 (CDNMedia)

所有媒体类型（图片/语音/文件/视频）通过 CDN 传输，使用 AES-128-ECB 加密：

| 字段 | 类型 | 说明 |
|------|------|------|
| `encrypt_query_param` | `string?` | CDN 下载/上传的加密参数 |
| `aes_key` | `string?` | base64 编码的 AES-128 密钥 |

### CDN 上传流程

1. 计算文件明文大小、MD5，以及 AES-128-ECB 加密后的密文大小
2. 如需缩略图（图片/视频），同样计算缩略图的明文和密文参数
3. 调用 `getUploadUrl` 获取 `upload_param`（和 `thumb_upload_param`）
4. 使用 AES-128-ECB 加密文件内容，PUT 上传到 CDN URL
5. 缩略图同理加密并上传
6. 使用返回的 `encrypt_query_param` 构造 `CDNMedia` 引用，放入 `MessageItem` 发送

> 完整的类型定义见 [`src/api/types.ts`](src/api/types.ts)，API 调用实现见 [`src/api/api.ts`](src/api/api.ts)。
