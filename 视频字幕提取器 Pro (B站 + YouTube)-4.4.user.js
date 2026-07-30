// ==UserScript==
// @name         视频字幕提取器 Pro (B站 + YouTube)
// @namespace    http://tampermonkey.net/
// @version      4.4
// @description  自动提取B站/YouTube视频字幕，支持AI生成和CC字幕，可复制下载，AI总结，点击跳转。4.4 新增下载格式选择（TXT/MD/SRT）与格式记忆。
// @license      MIT
// @match        *://www.bilibili.com/video/*
// @match        *://www.youtube.com/watch*
// @match        *://m.youtube.com/watch*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      youtube.com
// @connect      www.youtube.com
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/563012/%E8%A7%86%E9%A2%91%E5%AD%97%E5%B9%95%E6%8F%90%E5%8F%96%E5%99%A8%20Pro%20%28B%E7%AB%99%20%2B%20YouTube%29.user.js
// @updateURL https://update.greasyfork.org/scripts/563012/%E8%A7%86%E9%A2%91%E5%AD%97%E5%B9%95%E6%8F%90%E5%8F%96%E5%99%A8%20Pro%20%28B%E7%AB%99%20%2B%20YouTube%29.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ===================== Trusted Types 策略（绕过 YouTube 安全限制）=====================
    let trustedPolicy = null;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
            trustedPolicy = window.trustedTypes.createPolicy('bsePolicy', {
                createHTML: (string) => string
            });
        } catch (e) {
            // 策略可能已存在
        }
    }

    // 安全设置 innerHTML
    function safeSetInnerHTML(element, html) {
        if (trustedPolicy) {
            element.innerHTML = trustedPolicy.createHTML(html);
        } else {
            element.innerHTML = html;
        }
    }

    // HTML 转义
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 转义正则元字符
    function escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 高亮匹配（输入要求是已经转义过的 HTML 文本）
    function highlightMatches(escapedText, query) {
        if (!query) return escapedText;
        const escapedQuery = escapeHtml(query);
        const re = new RegExp(escapeRegExp(escapedQuery), 'gi');
        return escapedText.replace(re, m => `<mark class="bse-search-highlight">${m}</mark>`);
    }

    // ===================== 平台检测 =====================
    const PLATFORM = {
        BILIBILI: 'bilibili',
        YOUTUBE: 'youtube'
    };

    function detectPlatform() {
        const host = window.location.hostname;
        if (host.includes('bilibili.com')) return PLATFORM.BILIBILI;
        if (host.includes('youtube.com')) return PLATFORM.YOUTUBE;
        return null;
    }

    const currentPlatform = detectPlatform();
    console.log('[字幕提取器] 脚本启动, 平台:', currentPlatform, '域名:', window.location.hostname);
    if (!currentPlatform) {
        console.log('[字幕提取器] 未识别的平台，退出');
        return;
    }

    // ===================== 主题配置 =====================
    const THEMES = {
        [PLATFORM.BILIBILI]: {
            name: 'B站',
            primary: '#00AEEC',
            primaryDark: '#0095D0',
            accent: '#FB7299',
            shadow: 'rgba(0, 174, 236, 0.4)'
        },
        [PLATFORM.YOUTUBE]: {
            name: 'YouTube',
            primary: '#FF0000',
            primaryDark: '#CC0000',
            accent: '#FF4444',
            shadow: 'rgba(255, 0, 0, 0.3)'
        }
    };

    const theme = THEMES[currentPlatform];

    // ===================== 样式注入 =====================
    GM_addStyle(`
        /* ========== CSS 变量 - 动态主题 ========== */
        :root {
            --bse-primary: ${theme.primary};
            --bse-primary-dark: ${theme.primaryDark};
            --bse-accent: ${theme.accent};
            --bse-shadow-color: ${theme.shadow};
            --bse-green: #18C86A;
            --bse-yellow: #FFB027;
            --bse-bg-glass: rgba(24, 28, 36, 0.92);
            --bse-bg-card: rgba(255, 255, 255, 0.03);
            --bse-border: rgba(255, 255, 255, 0.08);
            --bse-text: rgba(255, 255, 255, 0.95);
            --bse-text-dim: rgba(255, 255, 255, 0.55);
            --bse-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .bse-container {
            position: fixed;
            z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Roboto', sans-serif;
            right: 20px;
            top: 80px;
        }

        .bse-trigger-btn {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            background: linear-gradient(145deg, var(--bse-primary) 0%, var(--bse-primary-dark) 100%);
            border: 1px solid rgba(255,255,255,0.25);
            cursor: pointer;
            box-shadow: 0 8px 32px var(--bse-shadow-color);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
            position: relative;
        }
        .bse-trigger-btn:hover { transform: scale(1.08); }
        .bse-trigger-btn svg { width: 24px; height: 24px; fill: white; }

        .bse-status-dot {
            position: absolute;
            top: -4px;
            right: -4px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: var(--bse-accent);
            border: 3px solid #1a1e26;
        }
        .bse-status-dot.ready { background: var(--bse-green); }
        .bse-status-dot.loading { background: var(--bse-yellow); animation: bse-pulse 1s infinite; }

        @keyframes bse-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bse-spin { to { transform: rotate(360deg); } }

        .bse-badge {
            position: absolute;
            bottom: -6px;
            right: -6px;
            min-width: 20px;
            height: 20px;
            background: var(--bse-accent);
            color: white;
            font-size: 11px;
            font-weight: 700;
            border-radius: 10px;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 0 5px;
            border: 3px solid #1a1e26;
        }

        .bse-panel {
            position: absolute;
            top: 68px;
            right: 0;
            width: 480px;
            max-height: 78vh;
            background: var(--bse-bg-glass);
            backdrop-filter: blur(24px);
            border-radius: 20px;
            box-shadow: var(--bse-shadow);
            border: 1px solid var(--bse-border);
            display: none;
            flex-direction: column;
            overflow: hidden;
        }
        .bse-panel.show { display: flex; }

        .bse-header {
            padding: 18px 22px;
            background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
            border-bottom: 1px solid var(--bse-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .bse-title { font-size: 17px; font-weight: 600; color: var(--bse-text); margin: 0; }
        .bse-platform-tag {
            display: inline-block;
            padding: 2px 8px;
            background: var(--bse-primary);
            color: white;
            font-size: 10px;
            border-radius: 4px;
            margin-left: 8px;
            vertical-align: middle;
        }
        .bse-subtitle-info { font-size: 12px; color: var(--bse-text-dim); margin-top: 4px; }

        .bse-refresh-btn {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: rgba(255,255,255,0.08);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .bse-refresh-btn:hover { background: rgba(255,255,255,0.15); }
        .bse-refresh-btn svg { width: 18px; height: 18px; fill: var(--bse-text-dim); }
        .bse-refresh-btn.spinning svg { animation: bse-spin 0.8s linear infinite; }

        .bse-subtitle-selector {
            padding: 14px 22px;
            background: rgba(0,0,0,0.15);
            border-bottom: 1px solid var(--bse-border);
        }
        .bse-selector-label { font-size: 11px; color: var(--bse-text-dim); margin-bottom: 10px; }
        .bse-subtitle-list { display: flex; flex-wrap: wrap; gap: 8px; max-height: 120px; overflow-y: auto; }
        .bse-subtitle-option {
            padding: 8px 14px;
            background: rgba(255,255,255,0.06);
            border: 1px solid transparent;
            border-radius: 10px;
            color: var(--bse-text);
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .bse-subtitle-option:hover { background: rgba(255,255,255,0.1); }
        .bse-subtitle-option.active { background: rgba(255,255,255,0.12); border-color: var(--bse-primary); color: var(--bse-primary); }
        .bse-subtitle-option .tag { font-size: 9px; padding: 3px 6px; border-radius: 5px; margin-left: 6px; }
        .bse-subtitle-option .tag.ai { background: rgba(0,174,236,0.25); color: #00AEEC; }
        .bse-subtitle-option .tag.cc { background: rgba(24,200,106,0.25); color: var(--bse-green); }
        .bse-subtitle-option .tag.auto { background: rgba(255,176,39,0.25); color: var(--bse-yellow); }

        .bse-tabs { display: flex; padding: 0 22px; border-bottom: 1px solid var(--bse-border); }
        .bse-tab {
            padding: 14px 18px;
            border: none;
            background: transparent;
            color: var(--bse-text-dim);
            font-size: 13px;
            cursor: pointer;
            position: relative;
        }
        .bse-tab:hover { color: var(--bse-text); }
        .bse-tab.active { color: var(--bse-primary); }
        .bse-tab.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 24px;
            height: 3px;
            background: var(--bse-primary);
            border-radius: 2px;
        }

        .bse-content { flex: 1; overflow-y: auto; padding: 18px 22px; min-height: 0; }
        .bse-content::-webkit-scrollbar { width: 6px; }
        .bse-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }

        .bse-search-box {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
            padding: 10px 12px;
            background: rgba(0,0,0,0.25);
            border: 1px solid var(--bse-border);
            border-radius: 10px;
            transition: border-color 0.2s;
        }
        .bse-search-box:focus-within { border-color: var(--bse-primary); }
        .bse-search-box svg { width: 16px; height: 16px; fill: var(--bse-text-dim); flex-shrink: 0; }
        .bse-search-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: var(--bse-text);
            font-size: 13px;
            min-width: 0;
        }
        .bse-search-input::placeholder { color: var(--bse-text-dim); }
        .bse-search-count { font-size: 11px; color: var(--bse-text-dim); white-space: nowrap; }
        .bse-search-clear {
            background: transparent;
            border: none;
            color: var(--bse-text-dim);
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            padding: 0 4px;
            display: none;
        }
        .bse-search-clear:hover { color: var(--bse-text); }
        .bse-search-box.has-query .bse-search-clear { display: inline-block; }
        .bse-search-highlight {
            background: rgba(255,176,39,0.45);
            color: inherit;
            border-radius: 2px;
            padding: 0 1px;
        }

        .bse-text-area {
            width: 100%;
            min-height: 220px;
            background: rgba(0,0,0,0.25);
            border: 1px solid var(--bse-border);
            border-radius: 12px;
            padding: 14px 16px;
            color: var(--bse-text);
            font-size: 13px;
            line-height: 1.75;
            resize: vertical;
            font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        }
        .bse-text-area:focus { outline: none; border-color: var(--bse-primary); }

        .bse-loading, .bse-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 50px 20px;
            color: var(--bse-text-dim);
        }
        .bse-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: var(--bse-primary);
            border-radius: 50%;
            animation: bse-spin 0.8s linear infinite;
            margin-bottom: 14px;
        }

        .bse-subtitle-item {
            padding: 12px 14px;
            margin-bottom: 10px;
            background: var(--bse-bg-card);
            border-radius: 10px;
            border-left: 3px solid var(--bse-primary);
            cursor: pointer;
            transition: all 0.2s;
        }
        .bse-subtitle-item:hover { background: rgba(255,255,255,0.05); transform: translateX(4px); }
        .bse-timestamp { font-size: 11px; color: var(--bse-primary); font-family: monospace; margin-bottom: 6px; }
        .bse-subtitle-text { font-size: 14px; color: var(--bse-text); line-height: 1.6; }

        .bse-ai-section { margin-top: 16px; }
        .bse-ai-header { font-size: 12px; color: var(--bse-text-dim); margin-bottom: 12px; }
        .bse-prompt-list { display: flex; flex-direction: column; gap: 8px; }
        .bse-prompt-btn {
            width: 100%;
            text-align: left;
            padding: 12px 16px;
            font-size: 13px;
            background: var(--bse-bg-card);
            border: 1px solid var(--bse-border);
            border-radius: 10px;
            color: var(--bse-text);
            cursor: pointer;
            transition: all 0.2s;
        }
        .bse-prompt-btn:hover { background: rgba(255,255,255,0.05); border-color: var(--bse-primary); }

        .bse-footer {
            padding: 16px 22px;
            background: rgba(0,0,0,0.2);
            border-top: 1px solid var(--bse-border);
            display: flex;
            gap: 12px;
        }
        .bse-btn {
            flex: 1;
            padding: 12px 18px;
            border: none;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .bse-btn svg { width: 18px; height: 18px; }
        .bse-btn-primary { background: linear-gradient(135deg, var(--bse-primary) 0%, var(--bse-primary-dark) 100%); color: white; }
        .bse-btn-primary:hover { filter: brightness(1.1); }
        .bse-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .bse-btn-secondary { background: rgba(255,255,255,0.08); color: var(--bse-text); }
        .bse-btn-secondary:hover { background: rgba(255,255,255,0.12); }

        /* ========== 下载分裂按钮组 ========== */
        .bse-download-group {
            flex: 1;
            position: relative;
            display: flex;
            gap: 2px;
        }
        .bse-download-group #bse-download-btn {
            flex: 1;
            border-top-right-radius: 0;
            border-bottom-right-radius: 0;
        }
        .bse-format-caret {
            flex: 0 0 auto;
            width: 40px;
            padding: 12px 8px;
            border-top-left-radius: 0;
            border-bottom-left-radius: 0;
        }
        .bse-format-caret svg { width: 16px; height: 16px; transition: transform 0.2s; }
        .bse-download-group.open .bse-format-caret svg { transform: rotate(180deg); }
        .bse-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .bse-format-menu {
            position: absolute;
            bottom: calc(100% + 8px);
            left: 0;
            right: 0;
            background: var(--bse-bg-glass);
            border: 1px solid var(--bse-border);
            border-radius: 10px;
            box-shadow: var(--bse-shadow);
            padding: 6px;
            display: none;
            flex-direction: column;
            gap: 2px;
            z-index: 10;
            backdrop-filter: blur(12px);
        }
        .bse-download-group.open .bse-format-menu { display: flex; }
        .bse-format-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 9px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            color: var(--bse-text);
            transition: background 0.15s;
        }
        .bse-format-item:hover { background: rgba(255,255,255,0.08); }
        .bse-format-item.active { background: var(--bse-primary); color: #fff; }
        .bse-format-item .bse-format-name { font-weight: 600; }
        .bse-format-item .bse-format-desc { font-size: 11px; color: var(--bse-text-dim); }
        .bse-format-item.active .bse-format-desc { color: rgba(255,255,255,0.8); }

        .bse-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
        .bse-stat-item { background: var(--bse-bg-card); border-radius: 10px; padding: 14px; text-align: center; }
        .bse-stat-label { font-size: 11px; color: var(--bse-text-dim); margin-bottom: 4px; }
        .bse-stat-value { font-size: 18px; font-weight: 700; color: var(--bse-primary); }

        .bse-toast {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: rgba(24,200,106,0.95);
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            font-size: 14px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.35);
            opacity: 0;
            transition: all 0.35s;
            z-index: 100001;
        }
        .bse-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        .bse-toast.error { background: rgba(244,67,54,0.95); }
    `);

    // ===================== 全局状态 =====================
    let allSubtitles = [];
    let currentSubtitleData = null;
    let selectedSubtitleId = null;
    let panelVisible = false;
    let currentTab = 'timestamp';
    let isLoading = false;
    let currentVideoKey = null;
    let previewSearchQuery = '';

    const AI_PROMPTS = [
        { icon: '📝', text: '总结视频核心内容', prompt: '请根据以下字幕内容，用简洁的语言总结视频的核心内容和主要观点：' },
        { icon: '📋', text: '提取关键要点', prompt: '请从以下字幕中提取5-10个关键要点，用列表形式呈现：' },
        { icon: '🎯', text: '生成学习笔记', prompt: '请根据以下字幕内容，生成结构化的学习笔记：' },
        { icon: '❓', text: '生成思考问题', prompt: '请根据以下字幕内容，生成5个有深度的思考问题：' },
    ];

    // ===================== 工具函数 =====================
    function log(...args) { console.log('[字幕提取器]', ...args); }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    // SRT 标准时间戳：HH:MM:SS,mmm
    function formatSrtTime(seconds) {
        const total = Math.max(0, seconds);
        const hrs = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        const secs = Math.floor(total % 60);
        const ms = Math.round((total % 1) * 1000);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }

    // 获取当前视频标题（B站 / YouTube 各自 DOM，兜底 document.title）
    function getVideoTitle() {
        try {
            if (currentPlatform === PLATFORM.BILIBILI) {
                const el = document.querySelector('h1.video-title, h1[title], .video-title');
                const t = (el && (el.getAttribute('title') || el.textContent)) || '';
                if (t.trim()) return t.trim();
            } else if (currentPlatform === PLATFORM.YOUTUBE) {
                const player = getMoviePlayer();
                if (player && typeof player.getVideoData === 'function') {
                    const vd = player.getVideoData();
                    if (vd && vd.title) return vd.title.trim();
                }
                const el = document.querySelector('h1.ytd-watch-metadata, h1.title yt-formatted-string, #title h1');
                const t = (el && el.textContent) || '';
                if (t.trim()) return t.trim();
            }
        } catch (e) {
            log('获取标题失败:', e);
        }
        // 兜底：document.title 去掉站点后缀
        return (document.title || 'subtitle')
            .replace(/\s*[-_|]\s*(bilibili|哔哩哔哩|YouTube).*$/i, '')
            .trim() || 'subtitle';
    }

    // 过滤文件名非法字符
    function sanitizeFilename(name) {
        return String(name || 'subtitle')
            .replace(/[\\/:*?"<>|\n\r\t]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || 'subtitle';
    }

    function showToast(message, isError = false) {
        let toast = document.querySelector('.bse-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'bse-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.toggle('error', isError);
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function seekToTime(seconds) {
        const video = document.querySelector('video');
        if (video) {
            video.currentTime = seconds;
            showToast(`跳转到 ${formatTime(seconds)}`);
        }
    }

    function setLoadingState(loading) {
        isLoading = loading;
        const dot = document.querySelector('.bse-status-dot');
        const btn = document.querySelector('.bse-refresh-btn');
        if (dot) dot.classList.toggle('loading', loading);
        if (btn) btn.classList.toggle('spinning', loading);
    }

    // ===================== B站 API =====================
    async function fetchBilibiliSubtitles() {
        const url = window.location.href;
        const bvidMatch = url.match(/\/video\/(BV[\w]+)/);
        const pageMatch = url.match(/[?&]p=(\d+)/);
        const bvid = bvidMatch ? bvidMatch[1] : null;
        const page = pageMatch ? parseInt(pageMatch[1]) : 1;

        if (!bvid) {
            log('无法获取 bvid');
            return [];
        }

        try {
            // 获取 aid 和 cid
            const viewResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { credentials: 'include' });
            const viewData = await viewResp.json();

            if (viewData.code !== 0 || !viewData.data) {
                log('获取视频信息失败:', viewData.message);
                return [];
            }

            const aid = viewData.data.aid;
            const pages = viewData.data.pages || [];
            let cid = viewData.data.cid;
            if (pages.length >= page) {
                cid = pages[page - 1].cid;
            }
            log('B站视频: aid=' + aid + ', cid=' + cid);

            // 获取字幕列表
            const playerResp = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, { credentials: 'include' });
            const playerData = await playerResp.json();

            if (playerData.code !== 0 || !playerData.data?.subtitle?.subtitles) {
                log('获取字幕列表失败');
                return [];
            }

            return playerData.data.subtitle.subtitles.map((sub, index) => ({
                id: sub.id || index,
                lan: sub.lan,
                lan_doc: sub.lan_doc,
                subtitle_url: sub.subtitle_url,
                isAI: sub.lan.startsWith('ai-'),
                isCC: !sub.lan.startsWith('ai-'),
                isAuto: false,
                body: null
            }));
        } catch (e) {
            log('B站字幕获取出错:', e);
            return [];
        }
    }

    async function fetchBilibiliSubtitleContent(url) {
        try {
            if (url.startsWith('//')) url = 'https:' + url;
            const resp = await fetch(url);
            const data = await resp.json();
            return data.body || [];
        } catch (e) {
            log('B站字幕内容获取失败:', e);
            return [];
        }
    }

    // ===================== YouTube API（重构版 v4.3）=====================
    // 关键背景：
    //   - YouTube 自 2024-2025 起在大多数视频的 captionTrack.baseUrl 中加入
    //     exp=xpe / potc=1 / pot=... 参数，直接 fetch 返回 HTTP 200 但 body 为空
    //     （PoToken / Proof of Origin Token 拦截）。
    //   - 浏览器扩展 / 用户脚本 *本地* 唯一可靠的解决方案：
    //       1. 从 movie_player 实例 (getAudioTrack / getPlayerResponse) 取已签名 URL
    //       2. 调用 /youtubei/v1/player 用 ANDROID 客户端伪装，多数视频不带 PoToken
    //       3. 去掉 exp=xpe 参数后重试
    //   - 优先 fmt=json3（YouTube 当前最稳定的字幕格式）

    function getYouTubeVideoId() {
        const url = new URL(window.location.href);
        return url.searchParams.get('v')
            || (location.pathname.startsWith('/shorts/') ? location.pathname.split('/')[2] : null);
    }

    // 拿到带方法的 movie_player（必须经 unsafeWindow 才能调用脚本世界的方法）
    function getMoviePlayer() {
        try {
            const doc = (typeof unsafeWindow !== 'undefined' && unsafeWindow.document) || document;
            const el = doc.getElementById('movie_player');
            if (el && typeof el.getPlayerResponse === 'function') return el;
            return null;
        } catch (e) {
            return null;
        }
    }

    // 等待 movie_player 初始化完成（拿到带 videoDetails 的 playerResponse）
    async function waitMoviePlayer(timeout = 6000) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
            const p = getMoviePlayer();
            if (p) {
                try {
                    const r = p.getPlayerResponse();
                    if (r && r.videoDetails) return p;
                } catch (e) { /* 还没就绪 */ }
            }
            await new Promise(r => setTimeout(r, 250));
        }
        return getMoviePlayer();
    }

    // 清理需要 PoToken 的参数（exp=xpe 是 PoToken 触发标记）
    function sanitizeCaptionUrl(url) {
        if (!url) return url;
        return url
            .replace(/([?&])exp=xpe(&|$)/g, (_, p1, p2) => p2 ? p1 : '')
            .replace(/([?&])potc=\d+(&|$)/g, (_, p1, p2) => p2 ? p1 : '')
            .replace(/([?&])pot=[^&]*(&|$)/g, (_, p1, p2) => p2 ? p1 : '')
            .replace(/[?&]$/, '');
    }

    function mapTrack(t, i) {
        return {
            id: i,
            lan: t.languageCode || t.lang_code || 'unknown',
            lan_doc: (t.name && t.name.simpleText) || t.displayName || t.languageName || t.languageCode || 'Unknown',
            subtitle_url: t.url || t.baseUrl,
            isAI: false,
            isCC: t.kind !== 'asr',
            isAuto: t.kind === 'asr',
            body: null
        };
    }

    // ---------- 通道 0：直接从 movie_player 实例取（最可靠，URL 已签名）----------
    function getCaptionsFromMoviePlayer(player) {
        if (!player) return [];
        try {
            // 0a: getAudioTrack().captionTracks —— 这里 .url 经过当前播放会话签名
            if (typeof player.getAudioTrack === 'function') {
                const at = player.getAudioTrack();
                const tracks = at && at.captionTracks;
                if (tracks && tracks.length) {
                    log('通道 0a(movie_player.getAudioTrack):', tracks.length, '轨道');
                    return tracks.map(mapTrack);
                }
            }
        } catch (e) {
            log('通道 0a 错误:', e);
        }
        try {
            // 0b: getPlayerResponse() —— 实时 playerResponse，token 比页面初始的更新
            if (typeof player.getPlayerResponse === 'function') {
                const pr = player.getPlayerResponse();
                const ct = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer
                    && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
                if (ct && ct.length) {
                    log('通道 0b(movie_player.getPlayerResponse):', ct.length, '轨道');
                    return ct.map(mapTrack);
                }
            }
        } catch (e) {
            log('通道 0b 错误:', e);
        }
        return [];
    }

    // ---------- 通道 A：window.ytInitialPlayerResponse / script 标签 ----------
    function getPlayerResponseFromWindow() {
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow.ytInitialPlayerResponse) {
            return unsafeWindow.ytInitialPlayerResponse;
        }
        if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
        for (const s of document.querySelectorAll('script')) {
            const text = s.textContent || '';
            if (text.includes('ytInitialPlayerResponse')) {
                const m = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
                if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
            }
        }
        return null;
    }

    function extractTracksFromResponse(pr) {
        const tracks = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer
            && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
        return (tracks || []).map(mapTrack);
    }

    // ---------- 通道 C：InnerTube /youtubei/v1/player（伪装 ANDROID 客户端绕 PoToken）----------
    function getInnertubeApiKey() {
        try {
            if (typeof unsafeWindow !== 'undefined') {
                const cfg = unsafeWindow.ytcfg;
                if (cfg) {
                    if (typeof cfg.get === 'function') {
                        const k = cfg.get('INNERTUBE_API_KEY');
                        if (k) return k;
                    }
                    if (cfg.data_ && cfg.data_.INNERTUBE_API_KEY) return cfg.data_.INNERTUBE_API_KEY;
                }
            }
        } catch (e) {}
        for (const s of document.querySelectorAll('script')) {
            const m = (s.textContent || '').match(/"INNERTUBE_API_KEY":"([^"]+)"/);
            if (m) return m[1];
        }
        // 已知的公开 web key，作为最后兜底
        // 找不到 key 时返回 null（fetchTracksFromInnertube 会处理）
        return null;
    }

    async function fetchTracksFromInnertube(videoId, clientType = 'ANDROID') {
        try {
            const apiKey = getInnertubeApiKey();
            const keyParam = apiKey ? `key=${encodeURIComponent(apiKey)}&` : '';
            const clients = {
                ANDROID: {
                    clientName: 'ANDROID',
                    clientVersion: '20.10.38',
                    androidSdkVersion: 30,
                    hl: 'en', gl: 'US',
                    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
                    headerName: '3'
                },
                WEB: {
                    clientName: 'WEB',
                    clientVersion: '2.20240101.00.00',
                    hl: 'en', gl: 'US',
                    headerName: '1'
                }
            };
            const cli = clients[clientType] || clients.ANDROID;
            const body = {
                context: { client: { ...cli } },
                videoId
            };
            delete body.context.client.headerName;

            const resp = await fetch(`https://www.youtube.com/youtubei/v1/player?${keyParam}prettyPrint=false`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-YouTube-Client-Name': cli.headerName,
                    'X-YouTube-Client-Version': cli.clientVersion
                },
                body: JSON.stringify(body),
                credentials: clientType === 'ANDROID' ? 'omit' : 'include'
            });
            if (!resp.ok) {
                log('通道 C InnerTube HTTP', resp.status);
                return [];
            }
            const data = await resp.json();
            const tracks = extractTracksFromResponse(data);
            log(`通道 C(InnerTube ${clientType}):`, tracks.length, '轨道');
            return tracks;
        } catch (e) {
            log('通道 C 错误:', e);
            return [];
        }
    }

    async function fetchYouTubeSubtitles() {
        const videoId = getYouTubeVideoId();
        if (!videoId) {
            log('无法获取 YouTube 视频 ID');
            return [];
        }

        // 通道 0：等 movie_player 就绪后从实例取（URL 已签名，最稳）
        const player = await waitMoviePlayer(6000);
        let tracks = getCaptionsFromMoviePlayer(player);
        if (tracks.length) return tracks;

        // 通道 A：window 全局对象
        const pr = getPlayerResponseFromWindow();
        tracks = extractTracksFromResponse(pr);
        if (tracks.length) {
            log('通道 A(window):', tracks.length, '轨道');
            return tracks;
        }

        // 通道 C：InnerTube ANDROID 客户端
        tracks = await fetchTracksFromInnertube(videoId, 'ANDROID');
        if (tracks.length) return tracks;

        // 通道 C': InnerTube WEB 客户端兜底
        tracks = await fetchTracksFromInnertube(videoId, 'WEB');
        if (tracks.length) return tracks;

        log('YouTube 所有通道均无字幕');
        return [];
    }

    // 格式 fallback 顺序：json3 在 2024+ 的 YouTube 上最稳定，所以放第一
    const SUBTITLE_FORMATS = ['json3', 'srv3', 'vtt', 'ttml'];

    async function fetchYouTubeSubtitleContent(baseUrl) {
        if (!baseUrl || baseUrl.length < 20) {
            log('无效的 baseUrl:', baseUrl);
            return [];
        }

        log('原始 baseUrl:', baseUrl.substring(0, 160) + (baseUrl.length > 160 ? '...' : ''));
        const hasPoTokenMarker = /[?&](exp=xpe|potc=|pot=)/.test(baseUrl);
        log('长度:', baseUrl.length, ' signature:', baseUrl.includes('signature'), ' PoToken标记:', hasPoTokenMarker);

        // 候选 URL 列表：原始 → 去 PoToken 参数（部分视频去掉后仍可用）
        const sanitized = sanitizeCaptionUrl(baseUrl);
        const variants = sanitized && sanitized !== baseUrl ? [baseUrl, sanitized] : [baseUrl];

        // 1) 普通 fetch 多 URL × 多格式
        for (const variant of variants) {
            for (const fmt of SUBTITLE_FORMATS) {
                try {
                    const result = await tryFetchSubtitle(variant, fmt);
                    if (result && result.length > 0) return result;
                } catch (e) {
                    log(`格式 ${fmt} 失败:`, e.message);
                }
            }
        }

        // 2) GM_xmlhttpRequest 兜底（绕过 CORS / 某些 Trusted Types 限制）
        log('所有 fetch 失败，尝试 GM_xmlhttpRequest');
        for (const variant of variants) {
            const r = await fetchYouTubeSubtitleWithGM(variant);
            if (r && r.length) return r;
        }

        // 3) 终极兜底：通过 InnerTube ANDROID 重新拉一份"无 PoToken 标记"的 baseUrl 再试
        const videoId = getYouTubeVideoId();
        if (videoId) {
            log('尝试通过 InnerTube ANDROID 重新拉取签名 URL');
            const fresh = await fetchTracksFromInnertube(videoId, 'ANDROID');
            if (fresh.length) {
                // 优先匹配相同语言（从原 baseUrl 中提取 lang）
                const langMatch = baseUrl.match(/[?&]lang=([^&]+)/);
                const wanted = langMatch ? decodeURIComponent(langMatch[1]) : null;
                const pick = (wanted && fresh.find(t => t.lan === wanted || t.lan.startsWith(wanted.split('-')[0]))) || fresh[0];
                if (pick && pick.subtitle_url && pick.subtitle_url !== baseUrl) {
                    log('使用 InnerTube 重取的 URL 重试 (lang=' + pick.lan + ')');
                    for (const fmt of SUBTITLE_FORMATS) {
                        try {
                            const r = await tryFetchSubtitle(pick.subtitle_url, fmt);
                            if (r && r.length) return r;
                        } catch (e) {}
                    }
                }
            }
        }

        return [];
    }

    // 尝试指定格式获取字幕
    async function tryFetchSubtitle(baseUrl, fmt) {
        // 在 baseUrl 后追加 fmt 参数
        let url;
        if (baseUrl.includes('fmt=')) {
            url = baseUrl.replace(/fmt=[^&]+/, `fmt=${fmt}`);
        } else {
            // baseUrl 已经有 ? 所以用 &
            url = baseUrl + `&fmt=${fmt}`;
        }

        log(`[${fmt}] 请求:`, url.substring(0, 120) + '...');

        const resp = await fetch(url, { credentials: 'include' });

        if (!resp.ok) {
            log(`[${fmt}] HTTP 错误: ${resp.status}`);
            return null;
        }

        const text = await resp.text();
        log(`[${fmt}] 响应长度:`, text.length);

        if (!text || text.length === 0) {
            log(`[${fmt}] 响应为空`);
            return null;
        }

        // 根据格式解析
        return parseSubtitleByFormat(text, fmt);
    }

    // 根据格式解析字幕
    function parseSubtitleByFormat(text, fmt) {
        switch (fmt) {
            case 'vtt':
                return parseVtt(text);
            case 'ttml':
                return parseTtml(text);
            case 'srv3':
            case 'json3':
                return parseJson3(text);
            default:
                return [];
        }
    }

    // VTT 解析器
    function parseVtt(vttText) {
        const subtitles = [];
        const lines = vttText.split('\n');
        let currentSub = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 跳过 WEBVTT 头部和空行
            if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('Kind:') || line.startsWith('Language:')) {
                continue;
            }

            // 时间行格式：00:00:01.000 --> 00:00:04.000
            const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3})/);
            if (timeMatch) {
                if (currentSub && currentSub.content) {
                    subtitles.push(currentSub);
                }
                currentSub = {
                    from: parseVttTime(timeMatch[1]),
                    to: parseVttTime(timeMatch[2]),
                    content: ''
                };
                continue;
            }

            // 纯数字行（序号），跳过
            if (/^\d+$/.test(line)) {
                continue;
            }

            // 字幕内容行
            if (currentSub) {
                if (currentSub.content) {
                    currentSub.content += ' ' + line;
                } else {
                    currentSub.content = line;
                }
            }
        }

        // 添加最后一条
        if (currentSub && currentSub.content) {
            subtitles.push(currentSub);
        }

        // 清理 HTML 标签
        return subtitles.map(sub => ({
            ...sub,
            content: sub.content.replace(/<[^>]+>/g, '').trim()
        })).filter(sub => sub.content.length > 0);
    }

    // 解析 VTT 时间格式 (00:00:01.000 或 00:00:01,000)
    function parseVttTime(timeStr) {
        const parts = timeStr.replace(',', '.').split(':');
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseFloat(parts[2]);
        return hours * 3600 + minutes * 60 + seconds;
    }

    // TTML 解析器
    function parseTtml(ttmlText) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(ttmlText, 'text/xml');
            const paragraphs = doc.querySelectorAll('p[begin][end]');

            const subtitles = [];
            paragraphs.forEach(p => {
                const begin = parseTtmlTime(p.getAttribute('begin'));
                const end = parseTtmlTime(p.getAttribute('end'));
                const content = p.textContent.trim();

                if (content) {
                    subtitles.push({ from: begin, to: end, content });
                }
            });

            log('TTML 解析到', subtitles.length, '条字幕');
            return subtitles;
        } catch (e) {
            log('TTML 解析失败:', e);
            return [];
        }
    }

    // 解析 TTML 时间格式
    function parseTtmlTime(timeStr) {
        if (!timeStr) return 0;
        // 格式可能是 "00:00:01.000" 或 "1.5s" 或 "1500ms"
        if (timeStr.endsWith('ms')) {
            return parseFloat(timeStr) / 1000;
        }
        if (timeStr.endsWith('s')) {
            return parseFloat(timeStr);
        }
        // 标准时间格式
        const parts = timeStr.split(':');
        if (parts.length === 3) {
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
        }
        return parseFloat(timeStr) || 0;
    }

    // JSON3/SRV3 解析器
    function parseJson3(jsonText) {
        try {
            const data = JSON.parse(jsonText);
            if (!data.events) return [];

            const subtitles = data.events
                .filter(e => e.segs)
                .map(e => ({
                    from: e.tStartMs / 1000,
                    to: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
                    content: e.segs.map(s => s.utf8 || '').join('')
                }))
                .filter(s => s.content.trim().length > 0);

            log('JSON3 解析到', subtitles.length, '条字幕');
            return subtitles;
        } catch (e) {
            log('JSON3 解析失败:', e);
            return [];
        }
    }

    // 使用 GM_xmlhttpRequest 获取字幕（多格式 fallback）
    async function fetchYouTubeSubtitleWithGM(baseUrl) {
        for (const fmt of SUBTITLE_FORMATS) {
            try {
                let url = baseUrl;
                if (baseUrl.includes('fmt=')) {
                    url = baseUrl.replace(/fmt=[^&]+/, `fmt=${fmt}`);
                } else {
                    url = baseUrl + `&fmt=${fmt}`;
                }

                log(`GM 尝试格式 ${fmt}`);
                const result = await gmFetch(url);

                if (result) {
                    const subtitles = parseSubtitleByFormat(result, fmt);
                    if (subtitles.length > 0) {
                        log(`GM ${fmt} 解析到`, subtitles.length, '条字幕');
                        return subtitles;
                    }
                }
            } catch (e) {
                log(`GM ${fmt} 失败:`, e.message);
            }
        }

        log('GM_xmlhttpRequest 所有格式都失败');
        return [];
    }

    // GM_xmlhttpRequest 封装（Promise 版本）
    function gmFetch(url) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'undefined') {
                log('GM_xmlhttpRequest 不可用');
                resolve(null);
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (response) {
                    log('GM 状态:', response.status, '长度:', response.responseText?.length);
                    if (response.status === 200 && response.responseText && response.responseText.length > 0) {
                        resolve(response.responseText);
                    } else {
                        resolve(null);
                    }
                },
                onerror: function (error) {
                    log('GM 错误:', error);
                    resolve(null);
                }
            });
        });
    }

    // ===================== 统一接口 =====================
    async function fetchAllSubtitles(force = false) {
        const videoKey = currentPlatform === PLATFORM.BILIBILI
            ? window.location.href
            : getYouTubeVideoId();

        if (!force && videoKey === currentVideoKey && allSubtitles.length > 0) {
            log('已有字幕数据');
            return;
        }

        currentVideoKey = videoKey;
        allSubtitles = [];
        currentSubtitleData = null;
        selectedSubtitleId = null;

        setLoadingState(true);
        log('开始获取字幕...');

        try {
            if (currentPlatform === PLATFORM.BILIBILI) {
                allSubtitles = await fetchBilibiliSubtitles();
            } else if (currentPlatform === PLATFORM.YOUTUBE) {
                allSubtitles = await fetchYouTubeSubtitles();
            }

            log('获取到', allSubtitles.length, '个字幕');

            if (allSubtitles.length > 0) {
                await loadSubtitle(allSubtitles[0]);
            }
        } catch (e) {
            log('获取字幕出错:', e);
        }

        setLoadingState(false);
        updateUI();
    }

    async function loadSubtitle(subtitle) {
        if (!subtitle) return;

        // 切换字幕源时清空预览搜索
        if (selectedSubtitleId !== subtitle.id) {
            previewSearchQuery = '';
        }
        selectedSubtitleId = subtitle.id;

        if (subtitle.body && subtitle.body.length > 0) {
            currentSubtitleData = subtitle;
            updateUI();
            updateContent();
            return;
        }

        setLoadingState(true);

        let body = [];
        if (currentPlatform === PLATFORM.BILIBILI) {
            body = await fetchBilibiliSubtitleContent(subtitle.subtitle_url);
        } else if (currentPlatform === PLATFORM.YOUTUBE) {
            // 直接使用 baseUrl（已包含签名参数）
            body = await fetchYouTubeSubtitleContent(subtitle.subtitle_url);
        }

        subtitle.body = body;
        currentSubtitleData = subtitle;
        log('加载字幕:', subtitle.lan_doc, body.length, '条');

        setLoadingState(false);
        updateUI();
        updateContent();
    }

    // ===================== UI =====================
    function createUI() {
        if (document.querySelector('.bse-container')) return;

        const container = document.createElement('div');
        container.className = 'bse-container';
        safeSetInnerHTML(container, `
            <button class="bse-trigger-btn" title="字幕提取器 Pro">
                <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/></svg>
                <span class="bse-status-dot"></span>
                <span class="bse-badge">0</span>
            </button>
            <div class="bse-panel">
                <div class="bse-header">
                    <div>
                        <h3 class="bse-title">字幕提取器<span class="bse-platform-tag">${theme.name}</span></h3>
                        <div class="bse-subtitle-info">点击刷新获取字幕</div>
                    </div>
                    <button class="bse-refresh-btn" title="刷新">
                        <svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                    </button>
                </div>
                <div class="bse-subtitle-selector">
                    <div class="bse-selector-label">选择字幕源</div>
                    <div class="bse-subtitle-list"></div>
                </div>
                <div class="bse-tabs">
                    <button class="bse-tab active" data-tab="timestamp">带时间戳</button>
                    <button class="bse-tab" data-tab="plain">纯文本</button>
                    <button class="bse-tab" data-tab="preview">预览</button>
                    <button class="bse-tab" data-tab="ai">AI 总结</button>
                </div>
                <div class="bse-content">
                    <div class="bse-empty">点击刷新按钮获取字幕</div>
                </div>
                <div class="bse-footer">
                    <div class="bse-download-group">
                        <button class="bse-btn bse-btn-secondary" id="bse-download-btn" disabled>
                            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                            <span class="bse-download-label">下载</span>
                        </button>
                        <button class="bse-btn bse-btn-secondary bse-format-caret" id="bse-format-caret" title="选择下载格式" disabled>
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                        </button>
                        <div class="bse-format-menu" id="bse-format-menu"></div>
                    </div>
                    <button class="bse-btn bse-btn-primary" id="bse-copy-btn" disabled>
                        <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        复制
                    </button>
                </div>
            </div>
        `);
        document.body.appendChild(container);
        renderFormatMenu();
        bindEvents(container);
    }

    // 渲染下载格式菜单项（含当前选中高亮）
    function renderFormatMenu() {
        const menu = document.querySelector('#bse-format-menu');
        if (!menu) return;
        const current = getDownloadFormat();
        safeSetInnerHTML(menu, DOWNLOAD_FORMATS.map(f => `
            <div class="bse-format-item ${f.id === current ? 'active' : ''}" data-format="${f.id}">
                <span class="bse-format-name">${f.label}</span>
                <span class="bse-format-desc">${f.desc}</span>
            </div>
        `).join(''));
        // 主下载键标签同步当前格式
        const label = document.querySelector('.bse-download-label');
        if (label) {
            const cur = DOWNLOAD_FORMATS.find(f => f.id === current);
            label.textContent = cur ? `下载 ${cur.label}` : '下载';
        }
    }

    function bindEvents(container) {
        const triggerBtn = container.querySelector('.bse-trigger-btn');
        const panel = container.querySelector('.bse-panel');
        const refreshBtn = container.querySelector('.bse-refresh-btn');
        const tabs = container.querySelectorAll('.bse-tab');
        const copyBtn = container.querySelector('#bse-copy-btn');
        const downloadBtn = container.querySelector('#bse-download-btn');
        const formatCaret = container.querySelector('#bse-format-caret');
        const formatMenu = container.querySelector('#bse-format-menu');
        const downloadGroup = container.querySelector('.bse-download-group');

        triggerBtn.addEventListener('click', () => {
            panelVisible = !panelVisible;
            panel.classList.toggle('show', panelVisible);
            if (panelVisible && allSubtitles.length === 0) {
                fetchAllSubtitles();
            }
        });

        document.addEventListener('click', (e) => {
            if (panelVisible && !container.contains(e.target)) {
                panelVisible = false;
                panel.classList.remove('show');
            }
            // 点击分裂按钮组外部时关闭格式菜单
            if (downloadGroup && !downloadGroup.contains(e.target)) {
                downloadGroup.classList.remove('open');
            }
        });

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentTab = tab.dataset.tab;
                updateContent();
            });
        });

        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fetchAllSubtitles(true);
        });

        copyBtn.addEventListener('click', () => {
            const text = getFormattedText();
            if (text) {
                GM_setClipboard(text);
                showToast('✓ 已复制到剪贴板');
            }
        });

        // 主下载键：按当前记忆的格式下载
        downloadBtn.addEventListener('click', () => {
            downloadSubtitle(getDownloadFormat());
        });

        // ‹caret›：开合格式菜单
        if (formatCaret && downloadGroup) {
            formatCaret.addEventListener('click', (e) => {
                e.stopPropagation();
                if (formatCaret.disabled) return;
                downloadGroup.classList.toggle('open');
            });
        }

        // 菜单项：记住选择并立即以该格式下载
        if (formatMenu) {
            formatMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.bse-format-item');
                if (!item) return;
                e.stopPropagation();
                const id = item.dataset.format;
                setDownloadFormat(id);
                renderFormatMenu();
                if (downloadGroup) downloadGroup.classList.remove('open');
                downloadSubtitle(id);
            });
        }
    }

    function getFormattedText() {
        if (!currentSubtitleData?.body) return '';
        if (currentTab === 'plain') {
            return currentSubtitleData.body.map(item => item.content).join('\n');
        }
        return currentSubtitleData.body.map(item =>
            `[${formatTime(item.from)} - ${formatTime(item.to)}] ${item.content}`
        ).join('\n');
    }

    // ===================== 下载格式 =====================
    const DOWNLOAD_FORMATS = [
        { id: 'txt', label: 'TXT', ext: 'txt', mime: 'text/plain;charset=utf-8', desc: '纯文本' },
        { id: 'md',  label: 'MD',  ext: 'md',  mime: 'text/markdown;charset=utf-8', desc: 'Markdown 笔记' },
        { id: 'srt', label: 'SRT', ext: 'srt', mime: 'application/x-subrip;charset=utf-8', desc: '带时间轴字幕' }
    ];
    const DEFAULT_DOWNLOAD_FORMAT = 'txt';

    function getDownloadFormat() {
        try {
            const saved = GM_getValue('bse_download_format', DEFAULT_DOWNLOAD_FORMAT);
            return DOWNLOAD_FORMATS.some(f => f.id === saved) ? saved : DEFAULT_DOWNLOAD_FORMAT;
        } catch (e) {
            return DEFAULT_DOWNLOAD_FORMAT;
        }
    }

    function setDownloadFormat(id) {
        try { GM_setValue('bse_download_format', id); } catch (e) {}
    }

    // 根据格式生成字幕文本
    function buildSubtitleContent(formatId) {
        const body = currentSubtitleData?.body;
        if (!body || !body.length) return '';

        if (formatId === 'srt') {
            return body.map((item, i) =>
                `${i + 1}\n${formatSrtTime(item.from)} --> ${formatSrtTime(item.to)}\n${item.content}`
            ).join('\n\n') + '\n';
        }

        if (formatId === 'md') {
            const title = getVideoTitle();
            const lang = currentSubtitleData.lan_doc || currentSubtitleData.lan || '';
            const header = [
                `# ${title}`,
                '',
                `> 来源：${window.location.href}`,
                `> 平台：${theme.name}${lang ? ' ・ 语言：' + lang : ''}`,
                '',
                '---',
                ''
            ].join('\n');
            const lines = body.map(item =>
                `- \`[${formatTime(item.from)}]\` ${item.content}`
            ).join('\n');
            return header + lines + '\n';
        }

        // txt：纯文本
        return body.map(item => item.content).join('\n') + '\n';
    }

    // 按指定格式下载字幕文件
    function downloadSubtitle(formatId) {
        const fmt = DOWNLOAD_FORMATS.find(f => f.id === formatId) || DOWNLOAD_FORMATS[0];
        const text = buildSubtitleContent(fmt.id);
        if (!text) {
            showToast('暂无字幕可下载', true);
            return;
        }
        const blob = new Blob([text], { type: fmt.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(getVideoTitle())}.${fmt.ext}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`✓ 已下载 ${fmt.label}`);
    }

    function updateUI() {
        const statusDot = document.querySelector('.bse-status-dot');
        const subtitleInfo = document.querySelector('.bse-subtitle-info');
        const copyBtn = document.querySelector('#bse-copy-btn');
        const downloadBtn = document.querySelector('#bse-download-btn');
        const formatCaret = document.querySelector('#bse-format-caret');
        const badge = document.querySelector('.bse-badge');
        const subtitleList = document.querySelector('.bse-subtitle-list');

        if (badge && allSubtitles.length > 0) {
            badge.textContent = allSubtitles.length;
            badge.style.display = 'flex';
        }

        if (subtitleList) {
            if (allSubtitles.length > 0) {
                safeSetInnerHTML(subtitleList, allSubtitles.map(sub => {
                    let tagClass = sub.isAI ? 'ai' : (sub.isAuto ? 'auto' : 'cc');
                    let tagText = sub.isAI ? 'AI' : (sub.isAuto ? '自动' : 'CC');
                    return `
                        <div class="bse-subtitle-option ${sub.id === selectedSubtitleId ? 'active' : ''}" data-id="${sub.id}">
                            ${sub.lan_doc}
                            <span class="tag ${tagClass}">${tagText}</span>
                        </div>
                    `;
                }).join(''));

                subtitleList.querySelectorAll('.bse-subtitle-option').forEach(opt => {
                    opt.addEventListener('click', () => {
                        const sub = allSubtitles.find(s => s.id == opt.dataset.id);
                        if (sub) loadSubtitle(sub);
                    });
                });
            } else {
                safeSetInnerHTML(subtitleList, '<div style="color:var(--bse-text-dim);font-size:12px;">暂无字幕</div>');
            }
        }

        if (currentSubtitleData?.body) {
            if (statusDot) { statusDot.classList.remove('loading'); statusDot.classList.add('ready'); }
            if (subtitleInfo) subtitleInfo.textContent = `${currentSubtitleData.body.length} 条字幕`;
            if (copyBtn) copyBtn.disabled = false;
            if (downloadBtn) downloadBtn.disabled = false;
            if (formatCaret) formatCaret.disabled = false;
        } else if (allSubtitles.length === 0 && !isLoading) {
            if (subtitleInfo) subtitleInfo.textContent = '此视频暂无字幕';
        }
    }

    function updateContent() {
        const content = document.querySelector('.bse-content');
        if (!content) return;

        if (isLoading) {
            safeSetInnerHTML(content, '<div class="bse-loading"><div class="bse-spinner"></div><div>正在获取字幕...</div></div>');
            return;
        }

        if (currentTab === 'ai') {
            renderAITab(content);
            return;
        }

        if (!currentSubtitleData?.body) {
            safeSetInnerHTML(content, '<div class="bse-empty">点击刷新按钮获取字幕</div>');
            return;
        }

        if (currentTab === 'preview') {
            renderPreviewTab(content);
        } else {
            safeSetInnerHTML(content, `<textarea class="bse-text-area" readonly>${escapeHtml(getFormattedText())}</textarea>`);
        }
    }

    function renderPreviewTab(content) {
        const body = currentSubtitleData.body;
        const count = body.length;
        const duration = count > 0 ? formatTime(body[count - 1].to) : '00:00.00';
        const chars = body.reduce((sum, item) => sum + item.content.length, 0);
        const query = previewSearchQuery;

        safeSetInnerHTML(content, `
            <div class="bse-search-box${query ? ' has-query' : ''}">
                <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                <input class="bse-search-input" type="text" placeholder="搜索字幕内容..." value="${escapeHtml(query)}">
                <span class="bse-search-count"></span>
                <button class="bse-search-clear" title="清除">×</button>
            </div>
            <div class="bse-stats">
                <div class="bse-stat-item"><div class="bse-stat-label">字幕条数</div><div class="bse-stat-value">${count}</div></div>
                <div class="bse-stat-item"><div class="bse-stat-label">总时长</div><div class="bse-stat-value">${duration.split('.')[0]}</div></div>
                <div class="bse-stat-item"><div class="bse-stat-label">总字数</div><div class="bse-stat-value">${chars}</div></div>
            </div>
            <div class="bse-preview-list"></div>
        `);

        const listEl = content.querySelector('.bse-preview-list');
        const countEl = content.querySelector('.bse-search-count');
        const input = content.querySelector('.bse-search-input');
        const clearBtn = content.querySelector('.bse-search-clear');
        const searchBox = content.querySelector('.bse-search-box');

        const renderList = () => {
            const q = previewSearchQuery.trim();
            const lowerQ = q.toLowerCase();
            const filtered = q ? body.filter(item => item.content.toLowerCase().includes(lowerQ)) : body;

            if (countEl) countEl.textContent = q ? `${filtered.length}/${count}` : '';
            if (searchBox) searchBox.classList.toggle('has-query', !!q);

            if (filtered.length === 0) {
                safeSetInnerHTML(listEl, `<div class="bse-empty" style="padding:30px;">未找到匹配 "${escapeHtml(q)}" 的字幕</div>`);
                return;
            }

            const html = filtered.map(item => {
                const text = highlightMatches(escapeHtml(item.content), q);
                return `
                    <div class="bse-subtitle-item" data-time="${item.from}">
                        <div class="bse-timestamp">${formatTime(item.from)} → ${formatTime(item.to)}</div>
                        <div class="bse-subtitle-text">${text}</div>
                    </div>
                `;
            }).join('');
            safeSetInnerHTML(listEl, html);

            listEl.querySelectorAll('.bse-subtitle-item').forEach(item => {
                item.addEventListener('click', () => seekToTime(parseFloat(item.dataset.time)));
            });
        };

        if (input) {
            input.addEventListener('input', (e) => {
                previewSearchQuery = e.target.value;
                renderList();
            });
            // 阻止字幕选择面板的点击关闭
            input.addEventListener('click', (e) => e.stopPropagation());
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                previewSearchQuery = '';
                if (input) {
                    input.value = '';
                    input.focus();
                }
                renderList();
            });
        }

        renderList();
    }

    function renderAITab(content) {
        const hasSubtitle = currentSubtitleData?.body?.length > 0;
        safeSetInnerHTML(content, `
            <div class="bse-ai-section">
                <div class="bse-ai-header">🤖 AI 智能总结</div>
                ${hasSubtitle ? `
                    <div class="bse-prompt-list">
                        ${AI_PROMPTS.map((p, i) => `
                            <button class="bse-prompt-btn" data-index="${i}">
                                <span style="font-size:18px;">${p.icon}</span>
                                <span>${p.text}</span>
                            </button>
                        `).join('')}
                    </div>
                ` : '<div class="bse-empty" style="padding:30px;">请先获取字幕</div>'}
            </div>
        `);

        if (hasSubtitle) {
            content.querySelectorAll('.bse-prompt-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const prompt = AI_PROMPTS[parseInt(btn.dataset.index)];
                    const text = currentSubtitleData.body.map(item => item.content).join('\n');
                    GM_setClipboard(`${prompt.prompt}\n\n${text}`);
                    showToast('✓ 已复制 AI 提示词');
                });
            });
        }
    }

    // ===================== 初始化 =====================
    function init() {
        log('初始化 -', theme.name, '模式');
        createUI();

        setTimeout(() => {
            log('当前URL:', window.location.href);
            fetchAllSubtitles();
        }, 1500);
    }

    // 重置状态（视频切换时调用）
    function resetState() {
        log('页面切换，重置状态');
        currentVideoKey = null;
        allSubtitles = [];
        currentSubtitleData = null;
        selectedSubtitleId = null;
        previewSearchQuery = '';
        updateUI();
        setTimeout(() => fetchAllSubtitles(), 1500);
    }

    // 监听 URL 变化（通用方案）
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            resetState();
        }
    }).observe(document, { subtree: true, childList: true });

    // YouTube SPA 导航专用监听
    if (currentPlatform === PLATFORM.YOUTUBE) {
        window.addEventListener('yt-navigate-finish', () => {
            log('yt-navigate-finish 事件触发');
            resetState();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
