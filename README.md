# 视频字幕提取器 Pro (B站 + YouTube)

[![GreasyFork](https://img.shields.io/badge/GreasyFork-Install-brightgreen)](https://greasyfork.org/scripts/563012)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://spdx.org/licenses/MIT.html)
![Version](https://img.shields.io/badge/version-4.2-orange)

一个 Tampermonkey / Violentmonkey / Greasemonkey 用户脚本，自动从 **B 站** 和 **YouTube** 视频页提取字幕（含 AI 生成 / CC 人工字幕 / 自动生成 ASR），支持：

- 🔘 一键复制 / 下载 `.txt`
- ⏱️ 带时间戳、纯文本、预览三种格式
- 🤖 内置 AI 总结提示词（一键复制 prompt + 字幕，粘到任意 LLM）
- 🎯 点击预览条目跳转到对应播放时间
- 🌗 自动适配 B 站蓝 / YouTube 红双主题
- 🔁 SPA 路由切换自动重新抓取

---

## 安装

1. 安装一个用户脚本管理器：
   - [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Safari / Firefox)
   - [Violentmonkey](https://violentmonkey.github.io/)
2. 一键安装：
   - **Greasy Fork**：<https://greasyfork.org/scripts/563012>
   - **GitHub Raw**：<https://raw.githubusercontent.com/ChenM0M/CCextractorPro/main/视频字幕提取器%20Pro%20(B站%20%2B%20YouTube)-4.1.user.js>

---

## 支持的站点

| 站点 | URL 匹配 | 字幕来源 |
|---|---|---|
| Bilibili | `*://www.bilibili.com/video/*` | `api.bilibili.com/x/player/wbi/v2` （AI / CC） |
| YouTube  | `*://www.youtube.com/watch*` `*://m.youtube.com/watch*` | `movie_player` 实例 / `ytInitialPlayerResponse` / InnerTube `/youtubei/v1/player` |

---

## 4.2 版的 YouTube 重构（关键说明）

YouTube 自 2024-2025 起在大部分 `captionTrack.baseUrl` 中加入 `exp=xpe` / `potc=1` / `pot=...` 参数，**直接 fetch 会返回 HTTP 200 但 body 为空**（PoToken / Proof of Origin Token 拦截，参见 [yt-dlp/yt-dlp#13075](https://github.com/yt-dlp/yt-dlp/issues/13075) 和 [youtube-transcript-api#592](https://github.com/jdepoix/youtube-transcript-api/issues/592)）。

4.2 把 YouTube 提取改成四级 fallback：

```
通道 0  movie_player.getAudioTrack().captionTracks   ← 最稳，URL 已被当前播放会话签名
        / movie_player.getPlayerResponse()
   ↓
通道 A  window.ytInitialPlayerResponse / script 标签
   ↓
通道 C  POST /youtubei/v1/player  (clientName=ANDROID)  ← 绕 PoToken
   ↓
通道 C' POST /youtubei/v1/player  (clientName=WEB)
```

下载字幕内容时还会：
- 先尝试 `fmt=json3`（当前最稳定）→ `srv3` → `vtt` → `ttml`
- 同时尝试原 URL 与剥离 `exp=xpe / potc / pot` 后的清洁 URL
- 普通 `fetch` 失败后再用 `GM_xmlhttpRequest` 兜底
- 终极兜底：通过 InnerTube ANDROID **重新拉取一份带新签名的 URL** 重试

---

## 项目结构

```
.
├── 视频字幕提取器 Pro (B站 + YouTube)-4.1.user.js   # 主脚本（v4.2，含完整 UI + 解析逻辑）
├── .github/workflows/lint.yml                        # 推送时自动 node --check 语法校验
├── .gitignore
├── LICENSE
└── README.md
```

---

## 本地开发

```bash
# 语法校验
node --check "视频字幕提取器 Pro (B站 + YouTube)-4.1.user.js"

# 修改后在浏览器里：
# 1. 打开脚本管理器 → 新建脚本 → 粘贴；或
# 2. 在 Tampermonkey 设置里启用「文件 URL 访问」并 @require 本地文件
```

---

## CI/CD：自动同步到 Greasy Fork

> **结论：不需要自定义 GitHub Action 去主动推送，Greasy Fork 已经内置了「Sync from external URL + Webhook」机制。**

### 推荐配置（一次性）

1. **GitHub 一侧**：把脚本以稳定路径提交到仓库主分支（本仓库即根目录的 `.user.js` 文件）。
   - 拿到 raw URL：`https://raw.githubusercontent.com/ChenM0M/CCextractorPro/main/<filename>.user.js`

2. **Greasy Fork 一侧**（脚本管理员）：
   - 打开 <https://greasyfork.org/scripts/563012/sync>
   - **Sync source**：填上面的 raw URL
   - 勾选 **Update automatically** → 选择 **GitHub webhook**
   - Greasy Fork 会给出一个 webhook URL，形如 `https://greasyfork.org/scripts/563012/sync_update?secret=XXXX`

3. **GitHub 一侧**：
   - 进入仓库 → Settings → Webhooks → Add webhook
   - Payload URL = 上一步 Greasy Fork 给的 URL
   - Content type = `application/json`
   - 触发事件：`Just the push event`

4. **每次只要 push 修改了那个 `.user.js` 文件**，Greasy Fork 就会自动重新同步发布。

### 关键 pitfall（来自社区讨论）

- Greasy Fork 只在文件被 **modified** 时触发同步，不是 **added**。所以：
  - 不要在 CI 里强制重写到一个空分支（会变成 added）
  - 保持脚本的路径和文件名稳定
  - 直接在主分支上修改，最简单
- 文件名含中文/空格也可用（raw URL 会被自动 URL-encode），但用 ASCII 文件名可以省去转义麻烦。

### 本仓库的 CI 工作流

仓库根目录的 [`.github/workflows/lint.yml`](.github/workflows/lint.yml) 会在每次 push / PR 时跑：
- `node --check` 语法校验脚本
- 检查 `@version` 是否相比上一个版本有递增（避免忘记升版本号）

> Greasy Fork 在比对版本时**只看 `@version`**，所以即使你 push 了改动，没改版本号也不会触发用户的客户端更新（webhook 同步会成功，但用户端的 `update.greasyfork.org/.../...meta.js` 比对版本仍是旧的）。

---

## 版本历史

- **4.2**（当前）：重构 YouTube 字幕提取通道，绕过 PoToken；引入 `movie_player` 实例 + InnerTube ANDROID 双兜底。
- 4.1：通用框架，B 站可用，YouTube 仅 `ytInitialPlayerResponse` 单通道（受 PoToken 影响大）。

---

## 致谢与参考

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — InnerTube 客户端伪装方案
- [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) — PoToken 问题文档
- StackOverflow [#73863672](https://stackoverflow.com/questions/73863672/) — `movie_player.getAudioTrack()` 思路
- Medium "Extract YouTube Transcripts Using Innertube API (2025)" — Android 客户端示例

---

## License

MIT © ChenM0M
