# 视频字幕提取器 Pro (B站 + YouTube)

[![GreasyFork](https://img.shields.io/badge/GreasyFork-Install-brightgreen)](https://greasyfork.org/scripts/563012)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://spdx.org/licenses/MIT.html)
![Version](https://img.shields.io/badge/version-4.4-orange)

一个 Tampermonkey / Violentmonkey / Greasemonkey 用户脚本，自动从 **B 站** 和 **YouTube** 视频页提取字幕（含 AI 生成 / CC 人工字幕 / 自动生成 ASR），支持：

- 🔘 一键复制 / 下载 `.txt`
- 📄 下载支持格式选择（TXT / MD / SRT），自动记住上次选择
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

---

## 支持的站点

| 站点 | URL 匹配 | 字幕来源 |
|---|---|---|
| Bilibili | `*://www.bilibili.com/video/*` | AI / CC 字幕 |
| YouTube  | `*://www.youtube.com/watch*` `*://m.youtube.com/watch*` | 多通道自动提取 |

---

## 本地开发

```bash
# 语法校验
node --check "视频字幕提取器 Pro (B站 + YouTube)-4.4.user.js"
```

---

## 版本历史

- **4.4**（当前）：下载支持格式选择（TXT / MD / SRT），下载按钮改为分裂式（主键 + 格式菜单），自动记住上次选择，文件名采用视频标题。
- 4.3：重构 YouTube 通道（movie_player 实例 + InnerTube ANDROID 绕过 PoToken）。
- 4.2：重构 YouTube 字幕提取，增强稳定性与兼容性。
- 4.1：基础版本，B 站与 YouTube 支持。

---

## License

MIT © ChenM0M

---

## 免责声明

本脚本仅供学习和个人使用。使用者应遵守相关网站的服务条款。作者不对因使用本脚本产生的任何问题负责。本脚本不隶属于 Bilibili 或 YouTube。
