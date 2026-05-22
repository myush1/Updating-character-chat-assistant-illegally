// ==UserScript==
// @name         크랙 캐릭터챗 어시스턴트
// @namespace    https://crack.wrtn.ai/
// @version      3.40.0
// @description  crack.wrtn.ai 캐릭터챗의 채팅 로그·유저노트·요약메모리·대화프로필을 읽어 Gemini API / Firebase AI Logic 에게 질문하는 도우미
// @author       extensionCode & Assistant
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      googleapis.com
// @connect      open.er-api.com
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  const CWA_VERSION = '2.40.3';
  let usdKrw = 1400;

  /* =========================================================================
   * 0. 다크/라이트 모드 지원을 위한 전역 스타일 주입 (메모장 테마 완벽 동기화)
   * ========================================================================= */
  if (!document.getElementById('cwa-theme-styles')) {
    const style = document.createElement('style');
    style.id = 'cwa-theme-styles';
    style.innerHTML = `
      :root {
        --cwa-primary: #FF4432;
        --cwa-primaryHover: #E63D2D;
        --cwa-success: #34C759;
        --cwa-danger: #FF3B30;
        --cwa-dangerBg: rgba(255, 59, 48, 0.08);
        --cwa-bg: #FFFFFF;
        --cwa-panelBg: #FFFFFF;
        --cwa-text: #1C1C1E;
        --cwa-textSub: #3A3A3C;
        --cwa-textMuted: #8E8E93;
        --cwa-textFaint: #AEAEB2;
        --cwa-border: #E5E5EA;
        --cwa-threadBg: #F9F9F9;
        --cwa-abubBg: #FFFFFF;
        --cwa-btnSecBg: #EAEAEA;
        --cwa-btnSecHover: #D1D1D6;
        --cwa-shadow: 0 10px 40px -10px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --cwa-primary: #FF4432;
          --cwa-primaryHover: rgba(255, 68, 50, 0.8);
          --cwa-success: #32D74B;
          --cwa-danger: #FF453A;
          --cwa-dangerBg: rgba(255, 69, 58, 0.15);
          --cwa-bg: #1C1C1E;
          --cwa-panelBg: #1C1C1E;
          --cwa-text: #F2F2F7;
          --cwa-textSub: #EBEBF5;
          --cwa-textMuted: #8E8E93;
          --cwa-textFaint: #636366;
          --cwa-border: #38383A;
          --cwa-threadBg: #2C2C2E;
          --cwa-abubBg: #3A3A3C;
          --cwa-btnSecBg: #3A3A3C;
          --cwa-btnSecHover: #48484A;
          --cwa-shadow: 0 16px 48px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1);
        }
      }
      body[data-theme="dark"] {
        --cwa-primary: #FF4432 !important;
        --cwa-primaryHover: rgba(255, 68, 50, 0.8) !important;
        --cwa-success: #32D74B !important;
        --cwa-danger: #FF453A !important;
        --cwa-dangerBg: rgba(255, 69, 58, 0.15) !important;
        --cwa-bg: #1C1C1E !important;
        --cwa-panelBg: #1C1C1E !important;
        --cwa-text: #F2F2F7 !important;
        --cwa-textSub: #EBEBF5 !important;
        --cwa-textMuted: #8E8E93 !important;
        --cwa-textFaint: #636366 !important;
        --cwa-border: #38383A !important;
        --cwa-threadBg: #2C2C2E !important;
        --cwa-abubBg: #3A3A3C !important;
        --cwa-btnSecBg: #3A3A3C !important;
        --cwa-btnSecHover: #48484A !important;
        --cwa-shadow: 0 16px 48px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1) !important;
      }
      body[data-theme="light"] {
        --cwa-primary: #FF4432 !important;
        --cwa-primaryHover: #E63D2D !important;
        --cwa-success: #34C759 !important;
        --cwa-danger: #FF3B30 !important;
        --cwa-dangerBg: rgba(255, 59, 48, 0.08) !important;
        --cwa-bg: #FFFFFF !important;
        --cwa-panelBg: #FFFFFF !important;
        --cwa-text: #1C1C1E !important;
        --cwa-textSub: #3A3A3C !important;
        --cwa-textMuted: #8E8E93 !important;
        --cwa-textFaint: #AEAEB2 !important;
        --cwa-border: #E5E5EA !important;
        --cwa-threadBg: #F9F9F9 !important;
        --cwa-abubBg: #FFFFFF !important;
        --cwa-btnSecBg: #EAEAEA !important;
        --cwa-btnSecHover: #D1D1D6 !important;
        --cwa-shadow: 0 10px 40px -10px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /* =========================================================================
   * 0-1. crack-api 네트워크 캡처
   * ========================================================================= */
  const apiCaptures = [];
  const API_HOST_RE = /crack-api\.wrtn\.ai/;
  let uiRefreshHook = null;

  let summaryAccum = [];
  let summarySeen = {};
  let summaryChatId = null;

  function mergeSummaries(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    list.forEach(function (s) {
      const k = (s && s._id) || JSON.stringify(s);
      if (!summarySeen[k]) {
        summarySeen[k] = 1;
        summaryAccum.push(s);
        added++;
      }
    });
    return added;
  }

  let messagesAccum = [];
  let messagesSeen = {};
  let messagesChatId = null;
  let messagesHasNext = false;
  let messagesNextCursor = null;

  function mergeMessages(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    list.forEach(function (m) {
      const k = (m && m._id) || JSON.stringify(m);
      if (!messagesSeen[k]) {
        messagesSeen[k] = 1;
        messagesAccum.push(m);
        added++;
      }
    });
    return added;
  }

  function syncMessagesChat() {
    const cid = getChatId();
    if (!cid || cid === messagesChatId) return;
    messagesChatId = cid;
    messagesAccum = [];
    messagesSeen = {};
    messagesHasNext = false;
    messagesNextCursor = null;
  }

  function recordCapture(url, status, body) {
    if (!url || !API_HOST_RE.test(url)) return;
    if (!body || body.length > 600000) return;
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      return;
    }
    const key = String(url).split('?')[0];
    const rec = { key: key, url: String(url), status: status, json: json, time: Date.now() };

    const idx = apiCaptures.findIndex(function (c) { return c.key === key; });
    if (idx >= 0) apiCaptures[idx] = rec;
    else apiCaptures.push(rec);
    if (apiCaptures.length > 80) apiCaptures.shift();

    if (/\/summaries(\?|$)/.test(rec.url) && json && json.data && Array.isArray(json.data.summaries)) {
      const mc = rec.url.match(/\/chats\/([a-zA-Z0-9]+)\/summaries/);
      const capCid = mc ? mc[1] : null;
      syncSummaryChat();
      if (capCid && capCid === summaryChatId) {
        const added = mergeSummaries(json.data.summaries);
        persistSummaries();
        const cursor = json.data.nextCursor;
        if (cursor && added > 0 && summaryAccum.length < 800) {
          const baseUrl = rec.url.split(/[?&]cursor=/)[0];
          proactiveFetch(baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'cursor=' + encodeURIComponent(cursor));
        }
      }
    }

    if (/\/messages(\?|$)/.test(rec.url) && json && json.data && Array.isArray(json.data.messages)) {
      const mc = rec.url.match(/\/chats\/([a-zA-Z0-9]+)\/messages/);
      const capCid = mc ? mc[1] : null;
      syncMessagesChat();
      if (capCid && capCid === messagesChatId) {
        const added = mergeMessages(json.data.messages);
        messagesHasNext = !!json.data.hasNext;
        messagesNextCursor = json.data.nextCursor || null;
        const target = Math.min(2000, (Number(settings.msgCount) || 20) + 20);
        if (json.data.hasNext && json.data.nextCursor && added > 0 && messagesAccum.length < target) {
          const baseUrl = rec.url.split(/[?&]cursor=/)[0];
          proactiveFetch(baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'cursor=' + encodeURIComponent(json.data.nextCursor));
        }
      }
    }
    if (typeof uiRefreshHook === 'function') uiRefreshHook();
  }

  (function installInterceptor() {
    function pageHook() {
      var post = function (d) {
        try { window.dispatchEvent(new CustomEvent('cwa-capture', { detail: d })); } catch (e) {}
      };
      var H = 'crack-api.wrtn.ai';
      var savedHeaders = {};
      var rememberHeader = function (name, value) {
        if (!name || value == null) return;
        var n = String(name).toLowerCase();
        if (n === 'authorization' || n.indexOf('x-') === 0) savedHeaders[n] = String(value);
      };
      var collectFromHeaders = function (h) {
        try {
          if (!h) return;
          if (typeof h.forEach === 'function') {
            h.forEach(function (v, k) { rememberHeader(k, v); });
          } else if (Array.isArray(h)) {
            h.forEach(function (p) { rememberHeader(p[0], p[1]); });
          } else {
            for (var k in h) {
              if (Object.prototype.hasOwnProperty.call(h, k)) rememberHeader(k, h[k]);
            }
          }
        } catch (e) {}
      };

      var _fetch = window.fetch;
      if (_fetch) {
        window.fetch = function () {
          var args = arguments;
          try {
            var u0 = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
            if (u0.indexOf(H) >= 0) {
              if (args[1] && args[1].headers) collectFromHeaders(args[1].headers);
              if (args[0] && args[0].headers && typeof args[0] === 'object') collectFromHeaders(args[0].headers);
            }
          } catch (e) {}
          return _fetch.apply(this, args).then(function (res) {
            try {
              var u = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
              if (u.indexOf(H) >= 0) {
                res.clone().text().then(function (t) {
                  post({ url: u, status: res.status, body: t });
                }).catch(function () {});
              }
            } catch (e) {}
            return res;
          });
        };
      }

      var O = XMLHttpRequest.prototype.open, S = XMLHttpRequest.prototype.send;
      var SRH = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.open = function (m, u) {
        this.__cwaU = u;
        return O.apply(this, arguments);
      };
      XMLHttpRequest.prototype.setRequestHeader = function (n, v) {
        try {
          if (this.__cwaU && String(this.__cwaU).indexOf(H) >= 0) rememberHeader(n, v);
        } catch (e) {}
        return SRH.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        xhr.addEventListener('load', function () {
          try {
            if (xhr.__cwaU && String(xhr.__cwaU).indexOf(H) >= 0) {
              post({ url: String(xhr.__cwaU), status: xhr.status, body: xhr.responseText });
            }
          } catch (e) {}
        });
        return S.apply(this, arguments);
      };

      window.addEventListener('cwa-fetch', function (e) {
        var u = (typeof e.detail === 'string') ? e.detail : (e.detail && e.detail.url);
        if (!u) return;
        try {
          var hdrs = {};
          for (var k in savedHeaders) {
            if (Object.prototype.hasOwnProperty.call(savedHeaders, k)) hdrs[k] = savedHeaders[k];
          }
          fetch(u, { credentials: 'include', headers: hdrs }).then(function (r) {
            return r.text().then(function (t) {
              post({ url: u, status: r.status, body: t });
            });
          }).catch(function () {});
        } catch (err) {}
      });
    }

    try {
      const s = document.createElement('script');
      s.textContent = '(' + pageHook.toString() + ')();';
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      window.addEventListener('cwa-capture', function (e) {
        const d = e.detail || {};
        recordCapture(d.url, d.status, d.body);
      });
    } catch (e) { /* 무시 */ }
  })();

  // 비동기 초기화를 위한 메인 래퍼 시작
  (async function mainApp() {
    /* =========================================================================
     * 1. IndexedDB 설정 및 데이터베이스 로드
     * ========================================================================= */
    const db = new Dexie("CWADB");
    db.version(1).stores({ cwaData: 'id' });

    async function fetchKey(id, def) {
      try {
        let record = await db.cwaData.get(id);
        if (record) return record.data;
        let val = GM_getValue(id);
        if (val !== undefined && val !== null) {
          try { val = typeof val === 'string' ? JSON.parse(val) : val; } catch(e){}
          await db.cwaData.put({ id: id, data: val });
          return val;
        }
        return def;
      } catch(e) { return def; }
    }
    function saveToDB(id, data) {
      db.cwaData.put({ id: id, data: data }).catch(e => {});
    }

    const DEFAULT_SYSTEM_PROMPT = '당신은 캐릭터 채팅(롤플레이) 플레이어를 돕는 보조 AI입니다.\n' +
      "아래에 페르소나·유저노트·요약메모리·채팅 로그가 주어질 수 있습니다. '캐릭터:'는 상대 캐릭터(AI)의 대사·지문, '나:'는 사용자(플레이어)의 대사·지문입니다.\n" +
      '사용자의 질문에 한국어로, 간결하고 실용적으로 답하세요.';

    const DEFAULTS = {
      provider: 'gemini', geminiKey: '',
      fbRaw: '', fbApiKey: '', fbProject: '', fbAppId: '', fbBackend: 'vertex', fbAppCheck: '',
      model: 'gemini-3.5-flash', thinking: '0',
      prompts: [{ id: 'default', name: '기본 프롬프트', text: DEFAULT_SYSTEM_PROMPT }],
      activePromptId: 'default',
      msgCount: 20, memoryCount: 40, temperature: 0.9,
      sendPersona: true, sendUserNote: true, sendMemory: true
    };

    const MODELS = [
      ['gemini-3.5-flash', 'Gemini 3.5 Flash (최신·권장)'],
      ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite (최저가)'],
      ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro (최고 품질)'],
      ['gemini-2.5-flash', 'Gemini 2.5 Flash (구버전·저렴)'],
      ['gemini-2.5-pro', 'Gemini 2.5 Pro (구버전)'],
    ];

    let settings = await fetchKey('settings', DEFAULTS);
    settings = Object.assign({}, DEFAULTS, settings || {});
    if (!settings.prompts || settings.prompts.length === 0) {
      settings.prompts = [{ id: 'default', name: '기본 프롬프트', text: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT }];
      settings.activePromptId = 'default';
    }
    let popupPos = await fetchKey('cwa_pos', { left: '50px', top: '100px', width: '400px', height: '620px' });

    function saveSettings(s) { saveToDB('settings', s); }

    async function syncSummaryChat() {
      const cid = getChatId();
      if (!cid || cid === summaryChatId) return;
      summaryChatId = cid;
      summaryAccum = [];
      summarySeen = {};
      const cached = await fetchKey('cwa_sum_' + cid, null);
      if (Array.isArray(cached) && cached.length) {
        summaryAccum = cached;
        for (let i = 0; i < cached.length; i++) {
          const s = cached[i];
          summarySeen[(s && s._id) || JSON.stringify(s)] = 1;
        }
      }
    }
    function persistSummaries() {
      if (summaryChatId) saveToDB('cwa_sum_' + summaryChatId, summaryAccum);
    }

    function fetchRate() {
      try {
        GM_xmlhttpRequest({
          method: 'GET', url: 'https://open.er-api.com/v6/latest/USD', timeout: 15000,
          onload: function (r) {
            try {
              const j = JSON.parse(r.responseText);
              const krw = j && j.rates && j.rates.KRW;
              if (krw && krw > 0) {
                usdKrw = krw;
                saveToDB('cwa_rate', { rate: krw, time: Date.now() });
                if (typeof uiRefreshHook === 'function') uiRefreshHook();
              }
            } catch (e) {}
          }
        });
      } catch (e) {}
    }
    async function initRate() {
      let c = await fetchKey('cwa_rate', null);
      if (c && c.rate > 0) usdKrw = c.rate;
      if (!c || !c.time || Date.now() - c.time > 3600000) fetchRate();
    }

    async function loadQA(chatId) { return await fetchKey('cwa_qa_' + chatId, null); }
    function saveQA(chatId, obj) { saveToDB('cwa_qa_' + chatId, obj); }

    /* =========================================================================
     * 2. 채팅 로그 추출
     * ========================================================================= */
    function cleanContent(t) {
      return String(t || '').replace(/^\[\/\/\]:\s*#.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }
    function scrapeChatFromDom() {
      const groups = document.querySelectorAll('[data-message-group-id]');
      const out = [];
      groups.forEach(function (g) {
        const wrap = g.querySelector(':scope > div');
        if (!wrap) return;
        const role = wrap.classList.contains('items-end') ? 'user' : 'assistant';
        let nodes = g.querySelectorAll('.wrtn-markdown');
        if (!nodes.length) nodes = g.querySelectorAll('[class*="break-all"]');
        let text = '';
        nodes.forEach(function (n) {
          const t = (n.innerText || '').trim();
          if (t) text += (text ? '\n' : '') + t;
        });
        text = text.trim();
        if (text) out.push({ role: role, text: text });
      });
      return out.reverse();
    }
    function scrapeChat() {
      if (messagesAccum.length && messagesChatId === getChatId()) {
        return messagesAccum.slice()
          .sort(function (a, b) {
            const x = a._id || '', y = b._id || '';
            return x < y ? -1 : (x > y ? 1 : 0);
          })
          .map(function (m) {
            return { role: m.role === 'user' ? 'user' : 'assistant', text: cleanContent(m.content) };
          })
          .filter(function (m) { return m.text; });
      }
      return scrapeChatFromDom();
    }

    /* =========================================================================
     * 3. 대화프로필 / 유저노트 / 요약메모리 추출
     * ========================================================================= */
    function getChatId() {
      const m = location.pathname.match(/(?:episodes|chats?)\/([a-zA-Z0-9]{8,})/);
      return m ? m[1] : null;
    }
    function getNextFallback() {
      try {
        const el = document.getElementById('__NEXT_DATA__');
        if (!el) return null;
        const j = JSON.parse(el.textContent);
        return (j.props && j.props.pageProps && j.props.pageProps.fallback) || null;
      } catch (e) { return null; }
    }
    function latestCapture(reKey) {
      for (let i = apiCaptures.length - 1; i >= 0; i--) {
        if (reKey.test(apiCaptures[i].key)) return apiCaptures[i].json;
      }
      return null;
    }
    function getRoomData() {
      const chatId = getChatId();
      if (!chatId) return null;
      const j = latestCapture(new RegExp('/v3/chats/' + chatId + '$'));
      if (j && j.data) return j.data;
      const fb = getNextFallback();
      if (fb && fb['/v3/chats/' + chatId] && fb['/v3/chats/' + chatId].data) return fb['/v3/chats/' + chatId].data;
      return null;
    }
    function getProfileId() {
      const j = latestCapture(/\/crack-api\/profiles$/);
      return (j && j.data && j.data._id) || null;
    }
    function findUserNote() {
      const room = getRoomData();
      const un = room && room.story && room.story.userNote;
      if (un && typeof un.content === 'string' && un.content.trim()) return un.content.trim();
      return null;
    }
    function findProfile() {
      const room = getRoomData();
      const wantId = room && room.chatProfile && room.chatProfile._id;
      const j = latestCapture(/\/chat-profiles$/);
      const list = j && j.data && j.data.chatProfiles;
      if (!Array.isArray(list) || !list.length) return null;
      let p = null;
      if (wantId) {
        for (let i = 0; i < list.length; i++) {
          if (list[i] && list[i]._id === wantId) { p = list[i]; break; }
        }
      }
      if (!p) {
        for (let i = 0; i < list.length; i++) {
          if (list[i] && list[i].isRepresentative) { p = list[i]; break; }
        }
      }
      if (!p) p = list[0];
      const parts = [];
      if (p.name) parts.push('이름: ' + p.name);
      if (p.information) parts.push(p.information);
      return parts.join('\n').trim() || null;
    }
    function summaryTotal() {
      if (summaryAccum.length) return summaryAccum.length;
      const j = latestCapture(/\/summaries$/);
      const list = j && j.data && j.data.summaries;
      return Array.isArray(list) ? list.length : 0;
    }
    function findSummary() {
      let list = summaryAccum;
      if (!list.length) {
        const j = latestCapture(/\/summaries$/);
        list = (j && j.data && Array.isArray(j.data.summaries)) ? j.data.summaries : [];
      }
      if (!list.length) return null;
      const n = Math.max(1, Math.min(999, Number(settings.memoryCount) || 40));
      const txt = list.slice(0, n).reverse().map(function (s) {
        return (s.title ? '■ ' + s.title + '\n' : '') + (s.summary || '');
      }).join('\n\n').trim();
      return txt ? txt.slice(0, 80000) : null;
    }
    function getFeatures() {
      return { profile: findProfile(), userNote: findUserNote(), memory: findSummary() };
    }
    function proactiveFetch(url) {
      try { window.dispatchEvent(new CustomEvent('cwa-fetch', { detail: String(url) })); } catch (e) {}
    }
    function ensureMoreMessages() {
      const want = Math.min(2000, (Number(settings.msgCount) || 20) + 20);
      if (messagesAccum.length >= want || !messagesHasNext || !messagesNextCursor) return;
      const cid = getChatId();
      if (!cid) return;
      proactiveFetch('https://crack-api.wrtn.ai/crack-gen/v3/chats/' + cid + '/messages?limit=20&cursor=' + encodeURIComponent(messagesNextCursor));
    }
    async function refreshFeatureData() {
      await syncSummaryChat();
      syncMessagesChat();
      const base = 'https://crack-api.wrtn.ai';
      const chatId = getChatId();
      function pull() {
        proactiveFetch(base + '/crack-api/profiles');
        if (chatId) {
          proactiveFetch(base + '/crack-gen/v3/chats/' + chatId);
          proactiveFetch(base + '/crack-gen/v3/chats/' + chatId + '/summaries?limit=20&type=longTerm&orderBy=newest&filter=all');
          proactiveFetch(base + '/crack-gen/v3/chats/' + chatId + '/messages?limit=20');
        }
        const pid = getProfileId();
        if (pid) proactiveFetch(base + '/crack-api/profiles/' + pid + '/chat-profiles');
      }
      pull();
      setTimeout(pull, 1700);
    }

    /* =========================================================================
     * 4. 프롬프트 구성 및 API 호출
     * ========================================================================= */
    function buildUserText(chat, question, count) {
      const f = getFeatures();
      let parts = [];
      if (settings.sendPersona && f.profile) parts.push('[대화 프로필 / 페르소나]\n' + f.profile);
      if (settings.sendUserNote && f.userNote) parts.push('[유저노트]\n' + f.userNote);
      if (settings.sendMemory && f.memory) parts.push('[장기기억 / 요약메모리 — 오래된 순, 맨 아래가 최근]\n' + f.memory);

      const slice = count > 0 ? chat.slice(-count) : chat;
      if (!slice.length) parts.push('[채팅 로그]\n(채팅 로그를 찾지 못했습니다. 채팅방 화면에서 사용해 주세요.)');
      else {
        const log = slice.map(function (m) { return (m.role === 'user' ? '나: ' : '캐릭터: ') + m.text; }).join('\n\n');
        parts.push('[지금까지의 채팅 로그 — 위가 과거, 맨 아래가 가장 최근(현재 장면)]\n' + log);
        parts.push('[현재 장면] 바로 위 채팅 로그의 맨 마지막 메시지가 지금 시점입니다. 답변은 반드시 이 최신 장면을 기준으로 하세요. 오래된 장면이 아닙니다.');
      }
      parts.push('[질문]\n' + question);
      return parts.join('\n\n');
    }

    const SAFETY_SETTINGS = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(function (c) {
      return { category: c, threshold: 'BLOCK_NONE' };
    });

    function enc(s) { return encodeURIComponent(String(s).trim()); }
    function gmRequest(opts) {
      return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
          method: opts.method, url: opts.url, headers: opts.headers, data: opts.data, timeout: 90000,
          onload: function (r) { resolve(r); },
          onerror: function () { reject(new Error('네트워크 오류 (연결 실패)')); },
          ontimeout: function () { reject(new Error('요청 시간 초과')); }
        });
      });
    }

    function thinkingBudget() {
      const t = settings.thinking;
      if (t === 'high') return 8192;
      if (t === '-1') return -1;
      return /pro/i.test(settings.model || '') ? -1 : 0;
    }
    function buildBody(systemText, contents) {
      return {
        systemInstruction: { parts: [{ text: systemText }] },
        contents: contents,
        generationConfig: {
          temperature: Number(settings.temperature) || 0.9,
          thinkingConfig: { thinkingBudget: thinkingBudget() }
        },
        safetySettings: SAFETY_SETTINGS
      };
    }

    function parseGenResponse(r) {
      let j;
      try { j = JSON.parse(r.responseText); }
      catch (e) { throw new Error('응답 파싱 실패 (HTTP ' + r.status + ')'); }
      if (r.status < 200 || r.status >= 300) throw new Error((j && j.error && j.error.message) ? j.error.message : ('HTTP ' + r.status));
      const cand = j.candidates && j.candidates[0];
      if (!cand) {
        const bp = j.promptFeedback && j.promptFeedback.blockReason;
        throw new Error(bp ? ('요청이 차단되었습니다: ' + bp) : '응답에 결과가 없습니다.');
      }
      const parts = (cand.content && cand.content.parts) || [];
      const txt = parts.map(function (p) { return p.text || ''; }).join('').trim();
      if (!txt) throw new Error('빈 응답 (finishReason: ' + (cand.finishReason || '?') + ')');
      const um = j.usageMetadata || {};
      return { text: txt, promptTokens: um.promptTokenCount || 0, outputTokens: um.candidatesTokenCount || 0, thoughtTokens: um.thoughtsTokenCount || 0 };
    }

    const MODEL_PRICES = {
      'gemini-3.5-flash': { in: 1.50, out: 9.00 },
      'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 },
      'gemini-3.1-pro-preview': { in: 2.00, out: 12.0 },
      'gemini-2.5-flash': { in: 0.30, out: 2.50 },
      'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
      'gemini-2.5-pro': { in: 1.25, out: 10.0 }
    };
    function modelPricing(model) {
      const m = (model || '').toLowerCase().trim();
      if (MODEL_PRICES[m]) return MODEL_PRICES[m];
      for (const k in MODEL_PRICES) {
        if (m.indexOf(k) === 0) return MODEL_PRICES[k];
      }
      const g3 = m.indexOf('gemini-3') >= 0;
      if (/flash-?lite/.test(m)) return g3 ? { in: 0.25, out: 1.50 } : { in: 0.10, out: 0.40 };
      if (/pro/.test(m)) return g3 ? { in: 2.00, out: 12.0 } : { in: 1.25, out: 10.0 };
      return g3 ? { in: 1.50, out: 9.00 } : { in: 0.30, out: 2.50 };
    }
    function estimateCost(promptTokens, outputTokens) {
      const p = modelPricing(settings.model);
      return promptTokens / 1e6 * p.in + outputTokens / 1e6 * p.out;
    }

    async function callGemini(sys, contents) {
      const key = settings.geminiKey.trim();
      if (!key) throw new Error('Gemini API 키가 비어 있습니다. 설정에서 입력하세요.');
      const model = (settings.model || '').trim() || 'gemini-3.5-flash';
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + enc(model) + ':generateContent?key=' + enc(key);
      const r = await gmRequest({
        method: 'POST', url: url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(buildBody(sys, contents))
      });
      return parseGenResponse(r);
    }
    async function callFirebase(sys, contents) {
      const s = settings;
      if (!s.fbApiKey.trim()) throw new Error('Firebase API 키가 비어 있습니다.');
      if (!s.fbProject.trim()) throw new Error('Firebase 프로젝트 ID가 비어 있습니다.');
      const model = (settings.model || '').trim() || 'gemini-3.5-flash';
      let path = s.fbBackend === 'google'
        ? '/v1beta/projects/' + enc(s.fbProject) + '/models/' + enc(model)
        : '/v1beta/projects/' + enc(s.fbProject) + '/locations/global/publishers/google/models/' + enc(model);
      const url = 'https://firebasevertexai.googleapis.com' + path + ':generateContent';

      const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': s.fbApiKey.trim(),
        'x-goog-api-client': 'gl-js/ fire/12.0.0'
      };
      if (s.fbAppId.trim()) headers['X-Firebase-Appid'] = s.fbAppId.trim();
      if (s.fbAppCheck.trim()) headers['X-Firebase-AppCheck'] = s.fbAppCheck.trim();

      const r = await gmRequest({
        method: 'POST', url: url, headers: headers,
        data: JSON.stringify(buildBody(sys, contents))
      });
      return parseGenResponse(r);
    }

    function ask(sys, contents) {
      return settings.provider === 'firebase' ? callFirebase(sys, contents) : callGemini(sys, contents);
    }

    /* =========================================================================
     * 6. UI 생성 및 이벤트
     * ========================================================================= */
    const Icons = {
      settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
      close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
      refresh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
      rebuild: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px; vertical-align:middle;"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
      check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px; vertical-align:middle;"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
      trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
      edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>'
    };

    function whenBody(cb) {
      if (document.body) { cb(); return; }
      const mo = new MutationObserver(function () {
        if (document.body) { mo.disconnect(); cb(); }
      });
      mo.observe(document.documentElement, { childList: true });
    }

    await syncSummaryChat();
    await initRate();
    whenBody(buildUI);

    function buildUI() {
      const host = document.createElement('div');
      host.id = 'cwa-host';
      host.style.cssText = 'all:initial;';
      document.body.appendChild(host);
      const root = host.attachShadow({ mode: 'open' });

      root.innerHTML = [
        '<style>',
        ':host,*{box-sizing:border-box;}',
        '.cwa{font-family:"Pretendard Variable", Pretendard, -apple-system, sans-serif;}',
        '.cwa-panel{position:fixed;background:var(--cwa-panelBg);',
        ' border-radius:16px;box-shadow:var(--cwa-shadow);z-index:2147483645;display:none;',
        ' flex-direction:column;overflow:hidden;color:var(--cwa-text); border:1px solid rgba(128,128,128,0.1);}',
        '.cwa-panel.open{display:flex;}',
        '.cwa-head{display:flex;align-items:center;gap:8px;padding:12px 14px;background:var(--cwa-panelBg);color:var(--cwa-text);border-bottom:1px solid var(--cwa-border);cursor:grab;user-select:none;touch-action:none;}',
        '.cwa-head b{flex:1;font-size:14px;pointer-events:none;}',
        '.cwa-hbtn{cursor:pointer;border:0;background:transparent;color:var(--cwa-text);width:28px;height:28px;',
        ' border-radius:8px;display:flex;justify-content:center;align-items:center;transition:all 0.2s ease;}',
        '.cwa-hbtn:hover{background:var(--cwa-btnSecBg);}',
        '.cwa-hbtn:active{background:var(--cwa-btnSecHover);transform:scale(0.95);}',
        '.cwa-body{padding:12px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px; flex:1; -webkit-overflow-scrolling:touch;}',
        '.cwa-body::-webkit-scrollbar, .cwa-thread::-webkit-scrollbar, .cwa-q::-webkit-scrollbar { width: 4px; height: 4px; }',
        '.cwa-body::-webkit-scrollbar-track, .cwa-thread::-webkit-scrollbar-track, .cwa-q::-webkit-scrollbar-track { background: transparent; }',
        '.cwa-body::-webkit-scrollbar-thumb, .cwa-thread::-webkit-scrollbar-thumb, .cwa-q::-webkit-scrollbar-thumb { background: var(--cwa-border); border-radius: 4px; transition: background 0.2s; }',
        '.cwa-body::-webkit-scrollbar-thumb:hover, .cwa-thread::-webkit-scrollbar-thumb:hover, .cwa-q::-webkit-scrollbar-thumb:hover { background: var(--cwa-textFaint); }',
        '.cwa-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--cwa-textMuted);flex-wrap:wrap;}',
        '.cwa-row input[type=number]{width:58px;}',
        'label.cwa-lbl{font-size:12px;font-weight:600;color:var(--cwa-textSub);display:block;margin-bottom:4px;}',
        'input,select,textarea{font-family:inherit;font-size:13px;border:1px solid var(--cwa-border);border-radius:8px;',
        ' padding:7px 9px;width:100%;outline:none;background:transparent;color:var(--cwa-text);}',
        'input:focus,select:focus,textarea:focus{border-color:var(--cwa-primary);}',
        'textarea{resize:vertical;}',
        '.cwa-compact-sel { appearance:none; -webkit-appearance:none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'gray\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 6px center; }',
        '.cwa-q{min-height:64px;}',
        '.cwa-btn{cursor:pointer;border:0;border-radius:8px;padding:9px 12px;font-size:13px;font-weight:600;',
        ' background:var(--cwa-primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;transition:background 0.2s;}',
        '.cwa-btn:hover{background:var(--cwa-primaryHover);}',
        '.cwa-btn:disabled{opacity:.55;cursor:default;}',
        '.cwa-btn.sec{background:var(--cwa-btnSecBg);color:var(--cwa-textSub);font-weight:600;}',
        '.cwa-btn.sec:hover{background:var(--cwa-btnSecHover);}',
        '.cwa-chk{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--cwa-textSub);cursor:pointer;}',
        '.cwa-chk input{width:auto;}',
        '.cwa-chk .dot{font-size:10px;}',
        '.dot-ok{color:var(--cwa-success);}.dot-no{color:var(--cwa-textFaint);}',
        '.cwa-thread{border:1px solid var(--cwa-border);border-radius:8px;padding:8px;background:var(--cwa-threadBg);',
        ' display:flex;flex-direction:column;gap:10px; flex:1; max-height:none; min-height:100px; overflow-y:auto; -webkit-overflow-scrolling:touch;}',
        '.cwa-thread .empty{font-size:12px;color:var(--cwa-textFaint);text-align:center;padding:16px 4px;}',
        '.cwa-qa{display:flex;flex-direction:column;gap:3px;}',
        '.cwa-qbub{align-self:flex-end;max-width:88%;background:var(--cwa-primary);color:#fff;font-size:14px;',
        ' padding:8px 12px;border-radius:12px 12px 4px 12px;white-space:pre-wrap;word-break:break-word;line-height:1.5;letter-spacing:-0.2px;}',
        '.cwa-abub{align-self:flex-start;max-width:96%;background:var(--cwa-abubBg);border:1px solid var(--cwa-border);color:var(--cwa-text);',
        ' font-size:15px;line-height:1.7;letter-spacing:-0.2px;padding:10px 14px;border-radius:12px 12px 12px 4px;',
        ' white-space:pre-wrap;word-break:break-word;}',
        '.cwa-abub.err{background:var(--cwa-dangerBg);border-color:var(--cwa-danger);color:var(--cwa-danger);}',
        '.cwa-atools{display:flex;gap:11px;align-self:flex-start;flex-wrap:wrap;}',
        '.cwa-acopy{font-size:10px;color:var(--cwa-textFaint);cursor:pointer;background:none;border:0;padding:0; display:flex; align-items:center;}',
        '.cwa-acopy:hover{color:var(--cwa-primary);}',
        '.cwa-meta{font-size:10px;color:var(--cwa-textFaint);align-self:flex-start;}',
        '.cwa-muted{font-size:11px;color:var(--cwa-textFaint);}',
        '.cwa-fieldset{display:flex;flex-direction:column;gap:8px;border:1px solid var(--cwa-border);border-radius:10px;padding:12px 10px;}',
        '.cwa-hide{display:none!important;}',
        '.cwa-foot{font-size:11px;color:var(--cwa-textFaint);text-align:center;padding:2px 0 4px;}',
        '.cwa-resizer{position:absolute; right:0; bottom:0; width:20px; height:20px; cursor:nwse-resize; color:var(--cwa-textFaint); display:flex; justify-content:center; align-items:center; z-index:10; user-select:none; padding-right:4px; padding-bottom:4px; touch-action:none;}',
        '</style>',

        '<div class="cwa">',
        '  <div class="cwa-panel" id="cwa-panel">',
        '    <div class="cwa-head" id="cwa-head">',
        `      <b id="cwa-title" style="letter-spacing:-0.3px; font-weight:600;">캐릭터챗 어시스턴트</b>`,
        `      <button class="cwa-hbtn" id="cwa-gear" title="설정">${Icons.settings}</button>`,
        `      <button class="cwa-hbtn" id="cwa-close" title="닫기">${Icons.close}</button>`,
        '    </div>',

        /* ---- 메인 (확장된 채팅 스레드) ---- */
        '    <div class="cwa-body" id="cwa-main">',
        '      <div class="cwa-row" style="margin-bottom:4px; flex-wrap:nowrap; gap:6px;">',
        '        <select id="cwa-session-select" style="flex:1; font-weight:600; font-size:13px;"></select>',
        `        <button class="cwa-hbtn" id="cwa-session-add" title="새 대화방" style="border:1px solid var(--cwa-border);">${Icons.plus}</button>`,
        `        <button class="cwa-hbtn" id="cwa-session-edit" title="이름 수정" style="border:1px solid var(--cwa-border);">${Icons.edit}</button>`,
        `        <button class="cwa-hbtn" id="cwa-session-del" title="대화방 삭제" style="border:1px solid var(--cwa-border); color:var(--cwa-danger);">${Icons.trash}</button>`,
        '      </div>',
        '      <div class="cwa-row" style="flex-wrap:nowrap; justify-content:space-between; margin-bottom:6px; gap:6px;">',
        '        <span class="cwa-muted" id="cwa-attach-info" style="flex:1; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; cursor:default;"></span>',
        '        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">',
        '          <select id="cwa-main-prompt-select" class="cwa-compact-sel" title="프롬프트 프리셋 선택" style="font-size:12px; padding:0 20px 0 8px; height:28px; border-radius:8px; border:1px solid var(--cwa-border); background-color:transparent; color:var(--cwa-textSub); font-weight:600; cursor:pointer; max-width:120px;"></select>',
        // [수정된 부분] 세로 높이(height:28px) 기준으로 자동으로 가로를 1:1로 맞추기 위해 aspect-ratio: 1 / 1; 을 적용했습니다.
        `          <button class="cwa-btn sec" id="cwa-preview" title="전송 내용 미리보기" style="aspect-ratio:1/1; height:28px; padding:0; display:flex; justify-content:center; align-items:center; border-radius:8px;">${Icons.eye}</button>`,
        `          <button class="cwa-btn sec" id="cwa-refresh" title="데이터 다시 불러오기" style="aspect-ratio:1/1; height:28px; padding:0; display:flex; justify-content:center; align-items:center; border-radius:8px; transition:opacity 0.2s;">${Icons.refresh}</button>`,
        '        </div>',
        '      </div>',
        '      <div class="cwa-thread" id="cwa-thread"></div>',
        '      <textarea class="cwa-q" id="cwa-q" placeholder="질문 입력 (Enter로 전송, Shift+Enter로 줄바꿈)"></textarea>',
        '      <button class="cwa-btn" id="cwa-send">물어보기 (Enter)</button>',
        '      <div class="cwa-foot">v<span id="cwa-ver">?</span> · <span id="cwa-prov">gemini</span> · $1≈₩<span id="cwa-rate">?</span></div>',
        '    </div>',

        /* ---- 설정 (탭 분리) ---- */
        '    <div class="cwa-body cwa-hide" id="cwa-settings">',
        '      <!-- 1. 어시스턴트 설정 -->',
        '      <div class="cwa-fieldset">',
        '        <label class="cwa-lbl" style="font-size:13px; margin-bottom:8px;">1. 어시스턴트 설정</label>',
        '        <div class="cwa-row"><span class="cwa-muted">채팅 로그 (최근)</span><input type="number" id="cwa-send-n" min="1" step="1"></div>',
        '        <div class="cwa-row"><span class="cwa-muted">요약메모리 (최근)</span><input type="number" id="cwa-memcount" min="1" max="999" step="1"></div>',
        '        <div class="cwa-row" style="gap:12px;">',
        '          <label class="cwa-chk"><input type="checkbox" id="cwa-c-persona">대화프로필</label>',
        '          <label class="cwa-chk"><input type="checkbox" id="cwa-c-note">유저노트</label>',
        '          <label class="cwa-chk"><input type="checkbox" id="cwa-c-memory">요약메모리</label>',
        '        </div>',
        '        <div class="cwa-row"><span class="cwa-muted">모델</span><select id="cwa-model" style="flex:1;"></select></div>',
        '        <div class="cwa-row"><span class="cwa-muted">생각</span>',
        '          <select id="cwa-think" style="flex:1;"><option value="0">끔 (빠름)</option><option value="-1">자동</option><option value="high">깊게</option></select>',
        '        </div>',
        '        <input type="text" id="cwa-model-custom" placeholder="모델명 직접 입력 (예: gemini-2.5-pro)" style="display:none;">',
        '      </div>',

        '      <!-- 2. 시스템 프롬프트 프리셋 -->',
        '      <div class="cwa-fieldset">',
        '        <label class="cwa-lbl" style="font-size:13px; margin-bottom:8px;">2. 시스템 프롬프트</label>',
        '        <div style="display:flex; gap:6px; margin-bottom:4px;">',
        '          <select id="cwa-prompt-select" style="flex:1;"></select>',
        `          <button class="cwa-btn sec" id="cwa-prompt-add" title="새 프리셋" style="padding:0; width:28px; height:28px; display:flex; justify-content:center; align-items:center;">${Icons.plus}</button>`,
        `          <button class="cwa-btn sec" id="cwa-prompt-edit" title="이름 수정" style="padding:0; width:28px; height:28px; display:flex; justify-content:center; align-items:center;">${Icons.edit}</button>`,
        `          <button class="cwa-btn sec" id="cwa-prompt-del" title="프리셋 삭제" style="padding:0; width:28px; height:28px; color:var(--cwa-danger); display:flex; justify-content:center; align-items:center;">${Icons.trash}</button>`,
        '        </div>',
        '        <textarea id="cwa-sysprompt" style="min-height:110px;"></textarea>',
        '        <button class="cwa-btn sec" id="cwa-prompt-save" style="margin-top:4px;">현재 프롬프트 덮어쓰기</button>',
        '      </div>',

        '      <!-- 3. API 설정 -->',
        '      <div class="cwa-fieldset">',
        '        <label class="cwa-lbl" style="font-size:13px; margin-bottom:8px;">3. API 설정</label>',
        '        <div><label class="cwa-lbl">제공자</label>',
        '          <select id="cwa-provider"><option value="gemini">Gemini API (AI Studio · API 키)</option><option value="firebase">Firebase AI Logic (firebaseConfig)</option></select>',
        '        </div>',
        '        <div id="cwa-fs-gemini" style="margin-top:8px;">',
        '          <label class="cwa-lbl">Gemini API 키</label>',
        '          <input type="password" id="cwa-gemini-key" placeholder="AIza...">',
        '          <div class="cwa-muted" style="margin-top:4px;">aistudio.google.com/apikey 에서 키 발급.</div>',
        '        </div>',
        '        <div id="cwa-fs-firebase" class="cwa-hide" style="margin-top:8px;">',
        '          <label class="cwa-lbl">Firebase 콘솔 코드 붙여넣기</label>',
        '          <textarea id="cwa-fb-paste" style="min-height:90px;" placeholder="Firebase 콘솔이 주는 코드를 통째로 붙여넣으세요"></textarea>',
        '          <div class="cwa-muted" id="cwa-fb-parsed" style="margin-top:4px;"></div>',
        '        </div>',
        '      </div>',
        '      <div style="display:flex;gap:8px; margin-top:4px;">',
        '        <button class="cwa-btn" id="cwa-save" style="flex:1;">전체 저장</button>',
        '      </div>',
        '      <div class="cwa-muted" id="cwa-save-msg" style="color:var(--cwa-success); text-align:center;"></div>',
        '    </div>',

        /* ---- 전송 내용 미리보기 ---- */
        '    <div class="cwa-body cwa-hide" id="cwa-preview-view">',
        '      <div class="cwa-row" style="justify-content:space-between;">',
        '        <span class="cwa-muted">AI 에게 실제로 보내지는 내용입니다.</span>',
        '        <span style="display:flex;gap:6px;">',
        '          <button class="cwa-btn sec" id="cwa-prev-copy" style="padding:4px 10px;font-size:12px;">복사</button>',
        '          <button class="cwa-btn sec" id="cwa-prev-back" style="padding:4px 10px;font-size:12px;">← 닫기</button>',
        '        </span>',
        '      </div>',
        '      <pre id="cwa-preview-text" style="white-space:pre-wrap;word-break:break-word;font-size:11px;',
        '       line-height:1.5;background:var(--cwa-threadBg);border:1px solid var(--cwa-border);border-radius:8px;',
        '       padding:8px;margin:0;color:var(--cwa-text);"></pre>',
        '    </div>',
        '    <div class="cwa-resizer" id="cwa-resizer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15l-6 6 M21 8l-13 13"></path></svg></div>',
        '  </div>',
        '</div>',
      ].join('');

      const $ = function (id) { return root.getElementById(id); };
      const panelEl = $('cwa-panel');
      const headerEl = $('cwa-head');
      const resizerEl = $('cwa-resizer');
      const views = { main: $('cwa-main'), settings: $('cwa-settings'), preview: $('cwa-preview-view') };

      Object.assign(panelEl.style, {
        left: popupPos.left, top: popupPos.top,
        width: popupPos.width, height: popupPos.height,
        minWidth: '350px', minHeight: '400px'
      });

      function showView(name) {
        Object.keys(views).forEach(function (k) { views[k].classList.toggle('cwa-hide', k !== name); });
        $('cwa-title').textContent = name === 'settings' ? '설정' : name === 'preview' ? '전송 내용 미리보기' : '캐릭터챗 어시스턴트';
        if (name === 'main') refreshMain();
        if (name === 'settings') fillSettingsForm();
        if (name === 'preview') renderPreview();
      }

      function openPanel() {
        panelEl.classList.add('open');
        showView('main');
        refreshFeatureData();
        softRefresh();
      }
      function softRefresh() {
        setTimeout(function () {
          if (panelEl.classList.contains('open') && !views.main.classList.contains('cwa-hide')) refreshMain();
        }, 1800);
        setTimeout(function () {
          if (panelEl.classList.contains('open') && !views.main.classList.contains('cwa-hide')) refreshMain();
        }, 4200);
      }
      function closePanel() { panelEl.classList.remove('open'); }
      function togglePanel() { if (panelEl.classList.contains('open')) closePanel(); else openPanel(); }

      /* ---- 드래그 및 리사이징 최적화 ---- */
      let isDragging = false, dragStartX, dragStartY, initialLeft, initialTop;
      const startDrag = (x, y, cursorElement) => {
        isDragging = true;
        if (cursorElement) cursorElement.style.cursor = 'grabbing';
        dragStartX = x; dragStartY = y;
        const rect = panelEl.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
      };
      const moveDrag = (x, y) => {
        if (!isDragging) return;
        panelEl.style.left = `${Math.max(0, Math.min(initialLeft + (x - dragStartX), window.innerWidth - panelEl.offsetWidth))}px`;
        panelEl.style.top = `${Math.max(0, Math.min(initialTop + (y - dragStartY), window.innerHeight - panelEl.offsetHeight))}px`;
      };
      const stopDrag = (cursorElement) => {
        if (isDragging) {
          isDragging = false;
          if (cursorElement) cursorElement.style.cursor = 'grab';
          popupPos.left = panelEl.style.left; popupPos.top = panelEl.style.top;
          saveToDB('cwa_pos', popupPos);
        }
      };

      headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('select')) return;
        startDrag(e.clientX, e.clientY, headerEl);
      });
      document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
      document.addEventListener('mouseup', () => stopDrag(headerEl));

      headerEl.addEventListener('touchstart', (e) => {
        if (e.target.closest('button') || e.target.closest('select')) return;
        startDrag(e.touches[0].clientX, e.touches[0].clientY, headerEl);
      }, {passive: false});
      document.addEventListener('touchmove', (e) => {
        if(isDragging) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }
      }, {passive: false});
      document.addEventListener('touchend', () => stopDrag(headerEl));

      let isResizing = false, resizeStartX, resizeStartY, initialWidth, initialHeight;
      const startResize = (x, y) => {
        isResizing = true;
        resizeStartX = x; resizeStartY = y;
        initialWidth = panelEl.offsetWidth; initialHeight = panelEl.offsetHeight;
      };
      const moveResize = (x, y) => {
        if (!isResizing) return;
        panelEl.style.width = `${Math.max(350, initialWidth + (x - resizeStartX))}px`;
        panelEl.style.height = `${Math.max(400, initialHeight + (y - resizeStartY))}px`;
      };
      const stopResize = () => {
        if (isResizing) {
          isResizing = false;
          popupPos.width = panelEl.style.width; popupPos.height = panelEl.style.height;
          saveToDB('cwa_pos', popupPos);
        }
      };
      resizerEl.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        startResize(e.clientX, e.clientY);
      });
      document.addEventListener('mousemove', (e) => moveResize(e.clientX, e.clientY));
      document.addEventListener('mouseup', stopResize);

      resizerEl.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        startResize(e.touches[0].clientX, e.touches[0].clientY);
      }, {passive: false});
      document.addEventListener('touchmove', (e) => {
        if(isResizing) { e.preventDefault(); moveResize(e.touches[0].clientX, e.touches[0].clientY); }
      }, {passive: false});
      document.addEventListener('touchend', stopResize);

      function populateModelSelect() {
        if (/-latest$/.test(settings.model || '')) {
          settings.model = /pro/.test(settings.model) ? 'gemini-3.1-pro-preview' : 'gemini-3.5-flash';
          saveSettings(settings);
        }
        const sel = $('cwa-model');
        sel.innerHTML = '';
        MODELS.forEach(function (m) {
          const o = document.createElement('option');
          o.value = m[0]; o.textContent = m[1];
          sel.appendChild(o);
        });
        const oc = document.createElement('option');
        oc.value = '__custom__'; oc.textContent = '직접 입력…';
        sel.appendChild(oc);
        syncModelSelect();
      }
      function syncModelSelect() {
        const known = MODELS.some(function (m) { return m[0] === settings.model; });
        if (known) {
          $('cwa-model').value = settings.model;
          $('cwa-model-custom').style.display = 'none';
        } else {
          $('cwa-model').value = '__custom__';
          $('cwa-model-custom').style.display = '';
          if (root.activeElement !== $('cwa-model-custom')) {
            $('cwa-model-custom').value = settings.model || '';
          }
        }
      }

      /* ---- 메인 화면 갱신 ---- */
      function refreshMain() {
        $('cwa-ver').textContent = CWA_VERSION;
        const chat = scrapeChat();
        $('cwa-prov').textContent = settings.provider === 'firebase' ? 'Firebase AI Logic' : 'Gemini API';
        $('cwa-rate').textContent = Math.round(usdKrw).toLocaleString();
        const f = getFeatures();
        const got = [];
        if (settings.sendPersona && f.profile) got.push('대화프로필');
        if (settings.sendUserNote && f.userNote) got.push('유저노트');
        if (settings.sendMemory && f.memory) {
          const tot = summaryTotal();
          const n = Math.max(1, Math.min(999, Number(settings.memoryCount) || 40));
          got.push('요약메모리(' + Math.min(tot, n) + '/' + tot + ')');
        }
        const cnt = Math.max(1, parseInt(settings.msgCount, 10));
        const estK = Math.round(buildUserText(chat, '', cnt).length / 1000);
        let attachText = got.length ? ('첨부: ' + got.join(', ')) : '첨부 안함';
        if (!f.profile && !f.userNote && !f.memory) attachText = '※ 데이터 로딩 중…';
        const fullText = attachText + ' · 입력 ≈' + estK + 'k자';
        $('cwa-attach-info').textContent = fullText;
        $('cwa-attach-info').title = fullText;

        updatePromptSelect();
        syncThread();
      }

      let _refreshTimer = null;
      uiRefreshHook = function () {
        clearTimeout(_refreshTimer);
        _refreshTimer = setTimeout(function () {
          if (panelEl.classList.contains('open') && !views.main.classList.contains('cwa-hide')) {
            refreshMain();
          }
        }, 250);
      };

      /* ---- 세션(대화방) 로직 ---- */
      let thread = [];
      let threadChatId = null;
      let currentRoomData = null;
      const HISTORY_TURNS = 6;

      async function syncThread() {
        const cid = getChatId();
        if (cid === threadChatId && currentRoomData) return;
        threadChatId = cid;

        let data = await loadQA(cid);
        if (Array.isArray(data)) {
          data = { activeSession: 'default', sessions: { 'default': { name: '기본 대화', thread: data } } };
          saveQA(cid, data);
        } else if (!data || !data.sessions) {
          data = { activeSession: 'default', sessions: { 'default': { name: '새 대화방', thread: [] } } };
        }
        currentRoomData = data;
        if (!currentRoomData.sessions[currentRoomData.activeSession]) {
          currentRoomData.activeSession = Object.keys(currentRoomData.sessions)[0];
        }
        thread = currentRoomData.sessions[currentRoomData.activeSession].thread;

        updateSessionSelect();
        renderThread();
      }

      function persistThread() {
        if (threadChatId && currentRoomData) {
          currentRoomData.sessions[currentRoomData.activeSession].thread = thread.filter(t => !t.error && !t.pending);
          saveQA(threadChatId, currentRoomData);
        }
      }

      function updateSessionSelect() {
        const sel = $('cwa-session-select');
        sel.innerHTML = '';
        for (const [id, session] of Object.entries(currentRoomData.sessions)) {
          const opt = document.createElement('option');
          opt.value = id; opt.textContent = session.name;
          sel.appendChild(opt);
        }
        sel.value = currentRoomData.activeSession;
      }

      $('cwa-session-select').addEventListener('change', (e) => {
        currentRoomData.activeSession = e.target.value;
        thread = currentRoomData.sessions[currentRoomData.activeSession].thread;
        persistThread();
        renderThread();
      });

      $('cwa-session-add').addEventListener('click', () => {
        const name = prompt("새 대화방 이름을 입력하세요", "새 대화방");
        if (!name) return;
        const id = 'session_' + Date.now();
        currentRoomData.sessions[id] = { name, thread: [] };
        currentRoomData.activeSession = id;
        thread = currentRoomData.sessions[id].thread;
        persistThread();
        updateSessionSelect();
        renderThread();
      });

      $('cwa-session-edit').addEventListener('click', () => {
        const currName = currentRoomData.sessions[currentRoomData.activeSession].name;
        const newName = prompt("대화방 이름을 수정하세요", currName);
        if (newName && newName.trim() !== '') {
          currentRoomData.sessions[currentRoomData.activeSession].name = newName.trim();
          persistThread();
          updateSessionSelect();
        }
      });

      $('cwa-session-del').addEventListener('click', () => {
        const keys = Object.keys(currentRoomData.sessions);
        if (keys.length <= 1) {
          if (confirm("대화 기록을 모두 비우시겠습니까?")) {
            currentRoomData.sessions[currentRoomData.activeSession].thread = [];
            thread = currentRoomData.sessions[currentRoomData.activeSession].thread;
            persistThread();
            renderThread();
          }
          return;
        }
        if (confirm(`'${currentRoomData.sessions[currentRoomData.activeSession].name}' 대화방을 완전히 삭제할까요?`)) {
          delete currentRoomData.sessions[currentRoomData.activeSession];
          currentRoomData.activeSession = Object.keys(currentRoomData.sessions)[0];
          thread = currentRoomData.sessions[currentRoomData.activeSession].thread;
          persistThread();
          updateSessionSelect();
          renderThread();
        }
      });

      function renderThread() {
        const box = $('cwa-thread');
        box.innerHTML = '';
        if (!thread.length) {
          const d = document.createElement('div');
          d.className = 'empty';
          d.textContent = '아직 대화가 없습니다. 아래에 질문을 입력해보세요.';
          box.appendChild(d);
          return;
        }
        thread.forEach(function (turn, idx) {
          const isLast = idx === thread.length - 1;
          const wrap = document.createElement('div');
          wrap.className = 'cwa-qa';

          const q = document.createElement('div');
          q.className = 'cwa-qbub';
          q.textContent = turn.q;

          const a = document.createElement('div');
          a.className = 'cwa-abub' + (turn.error ? ' err' : '');
          a.textContent = turn.pending ? '생각 중…' : turn.a;

          wrap.appendChild(q);
          wrap.appendChild(a);

          if (!turn.pending) {
            const tools = document.createElement('div');
            tools.className = 'cwa-atools';
            const toolBtn = function (labelHtml, fn) {
              const b = document.createElement('button');
              b.className = 'cwa-acopy'; b.innerHTML = labelHtml;
              b.addEventListener('click', fn);
              tools.appendChild(b);
              return b;
            };

            if (!turn.error) {
              const cp = toolBtn('복사', function () {
                if (!navigator.clipboard) return;
                navigator.clipboard.writeText(turn.a || '').then(function () {
                  cp.innerHTML = Icons.check + '복사됨';
                  setTimeout(function () { cp.innerHTML = '복사'; }, 1200);
                });
              });
            }
            toolBtn('수정', function () { editTurn(turn); });
            toolBtn('삭제', function () { deleteTurn(turn); });
            if (isLast) toolBtn(Icons.rebuild + '재생성', function () { regenerate(turn); });
            wrap.appendChild(tools);

            if (turn.tokens) {
              const meta = document.createElement('div');
              meta.className = 'cwa-meta';
              let s = '입력 ' + turn.tokens.p.toLocaleString() + ' · 출력 ' + turn.tokens.o.toLocaleString();
              if (turn.tokens.t) s += ' · 추론 ' + turn.tokens.t.toLocaleString();
              meta.textContent = s + ' 토큰 · 추정 ' + fmtCost(turn.cost);
              wrap.appendChild(meta);
            }
          }
          box.appendChild(wrap);
        });
        box.scrollTop = box.scrollHeight;
      }

      function fmtCost(usd) {
        if (!usd) return '$0';
        const d = usd >= 0.01 ? usd.toFixed(3) : usd.toFixed(5);
        return '$' + d + ' · ≈' + Math.round(usd * usdKrw).toLocaleString() + '원';
      }

      function clearThread() {
        thread = [];
        persistThread();
        renderThread();
      }
      function deleteTurn(turn) {
        if (busy) return;
        const idx = thread.indexOf(turn);
        if (idx < 0) return;
        thread.splice(idx, 1);
        persistThread();
        renderThread();
      }
      function editTurn(turn) {
        if (busy) return;
        const idx = thread.indexOf(turn);
        if (idx < 0) return;
        $('cwa-q').value = turn.q;
        thread.splice(idx, 1);
        persistThread();
        renderThread();
        $('cwa-q').focus();
      }

      let busy = false;
      async function runTurn(turn, priorTurns) {
        const count = Math.max(1, parseInt(settings.msgCount, 10));
        const activeP = settings.prompts.find(p => p.id === settings.activePromptId);
        const sysText = activeP ? activeP.text.trim() : DEFAULT_SYSTEM_PROMPT;
        const ctxText = buildUserText(scrapeChat(), turn.q, count);

        const contents = [];
        priorTurns.forEach(function (t) {
          if (t.error || t.pending) return;
          contents.push({ role: 'user', parts: [{ text: t.q }] });
          contents.push({ role: 'model', parts: [{ text: t.a }] });
        });
        contents.push({ role: 'user', parts: [{ text: ctxText }] });

        turn.a = ''; turn.pending = true; turn.error = false; turn.tokens = null; turn.cost = 0; turn.model = settings.model;
        renderThread();
        busy = true;
        $('cwa-send').disabled = true;

        try {
          const res = await ask(sysText, contents);
          turn.a = res.text;
          turn.tokens = { p: res.promptTokens, o: res.outputTokens, t: res.thoughtTokens || 0 };
          turn.cost = estimateCost(res.promptTokens, res.outputTokens + (res.thoughtTokens || 0));
          turn.pending = false;
        } catch (e) {
          turn.a = '오류: ' + (e && e.message ? e.message : e);
          turn.pending = false;
          turn.error = true;
        } finally {
          busy = false;
          $('cwa-send').disabled = false;
          persistThread();
          renderThread();
        }
      }

      async function doAsk() {
        if (busy) return;
        const question = $('cwa-q').value.trim();
        if (!question) { $('cwa-q').focus(); return; }

        const askCount = Math.max(1, parseInt(settings.msgCount, 10));
        if (askCount > 200 && !window.confirm('채팅 로그 ' + askCount + '개를 전송합니다.\n\n메시지가 많을수록 토큰 비용과 응답 시간이 크게 늘어납니다.\n이대로 보낼까요?')) {
          $('cwa-q').focus();
          return;
        }
        await syncThread();
        const entry = { q: question, a: '', t: Date.now() };
        const prior = thread.slice(-HISTORY_TURNS);
        thread.push(entry);
        $('cwa-q').value = '';
        await runTurn(entry, prior);
      }

      async function regenerate(turn) {
        if (busy) return;
        const idx = thread.indexOf(turn);
        if (idx < 0) return;
        await runTurn(turn, thread.slice(Math.max(0, idx - HISTORY_TURNS), idx));
      }

      /* ---- 설정 탭 및 공통 로직 ---- */
      function fillSettingsForm() {
        $('cwa-send-n').value = settings.msgCount;
        $('cwa-memcount').value = settings.memoryCount;
        $('cwa-c-persona').checked = settings.sendPersona;
        $('cwa-c-note').checked = settings.sendUserNote;
        $('cwa-c-memory').checked = settings.sendMemory;
        $('cwa-think').value = settings.thinking || '0';
        syncModelSelect();
        updatePromptSelect();
        $('cwa-provider').value = settings.provider;
        $('cwa-gemini-key').value = settings.geminiKey;
        $('cwa-fb-paste').value = settings.fbRaw || fbConfigText();
        showFbStatus();
        updateProviderFields();
      }

      function updatePromptSelect() {
        const selSet = $('cwa-prompt-select');
        const selMain = $('cwa-main-prompt-select');
        selSet.innerHTML = ''; selMain.innerHTML = '';
        settings.prompts.forEach(p => {
          const opt1 = document.createElement('option'); opt1.value = p.id; opt1.textContent = p.name;
          selSet.appendChild(opt1);
          const opt2 = document.createElement('option'); opt2.value = p.id; opt2.textContent = p.name;
          selMain.appendChild(opt2);
        });
        selSet.value = settings.activePromptId;
        selMain.value = settings.activePromptId;
        const activeP = settings.prompts.find(p => p.id === settings.activePromptId);
        $('cwa-sysprompt').value = activeP ? activeP.text : '';
      }

      $('cwa-prompt-select').addEventListener('change', (e) => {
        settings.activePromptId = e.target.value; saveSettings(settings); updatePromptSelect();
      });
      $('cwa-main-prompt-select').addEventListener('change', (e) => {
        settings.activePromptId = e.target.value; saveSettings(settings); updatePromptSelect();
      });

      $('cwa-prompt-add').addEventListener('click', () => {
        const name = prompt("새 프롬프트 프리셋 이름을 입력하세요", "새 프롬프트");
        if (!name) return;
        const id = 'prompt_' + Date.now();
        settings.prompts.push({ id, name, text: '' });
        settings.activePromptId = id;
        saveSettings(settings); updatePromptSelect(); $('cwa-sysprompt').focus();
      });
      $('cwa-prompt-edit').addEventListener('click', () => {
        const activeP = settings.prompts.find(p => p.id === settings.activePromptId);
        if (activeP) {
          const newName = prompt("프롬프트 프리셋 이름을 수정하세요", activeP.name);
          if (newName && newName.trim() !== '') {
            activeP.name = newName.trim();
            saveSettings(settings); updatePromptSelect();
          }
        }
      });
      $('cwa-prompt-del').addEventListener('click', () => {
        if (settings.prompts.length <= 1) { alert("최소 1개의 프리셋은 유지해야 합니다."); return; }
        if (confirm("현재 프롬프트 프리셋을 삭제할까요?")) {
          settings.prompts = settings.prompts.filter(p => p.id !== settings.activePromptId);
          settings.activePromptId = settings.prompts[0].id;
          saveSettings(settings); updatePromptSelect();
        }
      });
      $('cwa-prompt-save').addEventListener('click', () => {
        const activeP = settings.prompts.find(p => p.id === settings.activePromptId);
        if (activeP) {
          activeP.text = $('cwa-sysprompt').value;
          saveSettings(settings);
          const msg = $('cwa-save-msg'); msg.textContent = '프롬프트가 덮어씌워졌습니다 ✓';
          setTimeout(() => msg.textContent = '', 1500);
        }
      });

      function updateProviderFields() {
        const p = $('cwa-provider').value;
        $('cwa-fs-gemini').classList.toggle('cwa-hide', p !== 'gemini');
        $('cwa-fs-firebase').classList.toggle('cwa-hide', p !== 'firebase');
      }
      function fbConfigText() {
        if (!settings.fbApiKey && !settings.fbProject) return '';
        return 'const firebaseConfig = {\n apiKey: "' + (settings.fbApiKey || '') + '",\n projectId: "' + (settings.fbProject || '') + '",\n' + (settings.fbAppId ? ' appId: "' + settings.fbAppId + '"\n' : '') + '};';
      }
      function showFbStatus() {
        if (settings.fbApiKey && settings.fbProject) {
          $('cwa-fb-parsed').textContent = '✓ 설정됨 (projectId: ' + settings.fbProject + '). 바꾸려면 새 firebaseConfig 로 덮어쓰세요.';
        } else {
          $('cwa-fb-parsed').textContent = '아직 설정 안 됨 — firebaseConfig 를 붙여넣으세요.';
        }
      }
      function fbGrab(t, name) {
        const m = t.match(new RegExp(name + '\\s*:\\s*["\']([^"\']+)["\']'));
        return m ? m[1] : '';
      }
      function previewFbStatus() {
        const t = $('cwa-fb-paste').value;
        if (!t.trim()) { $('cwa-fb-parsed').textContent = '비어 있음 — 이대로 [저장]하면 Firebase 설정이 해제됩니다.'; return; }
        const k = fbGrab(t, 'apiKey'), p = fbGrab(t, 'projectId');
        $('cwa-fb-parsed').textContent = (k && p) ? ('✓ 인식됨 (projectId: ' + p + ') — [저장]을 눌러주세요') : '⚠ apiKey / projectId 를 찾지 못했어요. firebaseConfig 전체를 붙여넣어 주세요.';
      }
      function applyFbConfig() {
        const t = $('cwa-fb-paste').value;
        if (!t.trim()) { settings.fbRaw = ''; settings.fbApiKey = ''; settings.fbProject = ''; settings.fbAppId = ''; return; }
        settings.fbRaw = t; settings.fbApiKey = fbGrab(t, 'apiKey'); settings.fbProject = fbGrab(t, 'projectId'); settings.fbAppId = fbGrab(t, 'appId');
      }

      function applySettingsForm() {
        applyFbConfig();
        settings.provider = $('cwa-provider').value;
        settings.geminiKey = $('cwa-gemini-key').value.trim();
        const activeP = settings.prompts.find(p => p.id === settings.activePromptId);
        if (activeP) activeP.text = $('cwa-sysprompt').value;
        saveSettings(settings);
      }

      function renderPreview() {
        const cnt = Math.max(1, parseInt(settings.msgCount, 10));
        const f = getFeatures();
        const chat = scrapeChat();
        const L = [];
        const think = settings.thinking === '0' ? '끔' : (settings.thinking === 'high' ? '깊게' : '자동');
        L.push('● 모델 ' + (settings.model || '') + ' / 생각 ' + think);
        L.push('');
        L.push('[ 항목별 글자수 ]');
        const sec = function (label, on, content) {
          if (!on) L.push(' □ ' + label + ' : 꺼짐');
          else L.push(' ■ ' + label + ' : ' + (content ? content.length.toLocaleString() + '자' : '없음'));
        };
        sec('대화프로필', settings.sendPersona, f.profile);
        sec('유저노트', settings.sendUserNote, f.userNote);
        sec('요약메모리', settings.sendMemory, f.memory);
        const sliced = cnt > 0 ? chat.slice(-cnt) : chat;
        const logLen = sliced.reduce(function (s, m) { return s + (m.text ? m.text.length : 0); }, 0);
        L.push(' ■ 채팅 로그 : ' + logLen.toLocaleString() + '자 (' + sliced.length + '개 메시지)');
        const full = buildUserText(chat, '(여기에 질문이 들어갑니다)', cnt);
        L.push(' ─────────────');
        L.push(' 전체 전송 크기 : ' + full.length.toLocaleString() + '자');
        L.push('');
        L.push('════════ AI 에게 실제로 보내지는 내용 ════════');
        L.push('');
        L.push(full);
        $('cwa-preview-text').textContent = L.join('\n');
      }

      $('cwa-close').addEventListener('click', closePanel);
      $('cwa-gear').addEventListener('click', function () { showView(views.settings.classList.contains('cwa-hide') ? 'settings' : 'main'); });
      $('cwa-send').addEventListener('click', doAsk);
      $('cwa-q').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          if (e.isComposing) return;
          e.preventDefault();
          doAsk();
        }
      });
      $('cwa-preview').addEventListener('click', function () { showView('preview'); });
      $('cwa-prev-back').addEventListener('click', function () { showView('main'); });
      $('cwa-refresh').addEventListener('click', function () {
        const b = $('cwa-refresh');
        b.style.opacity = '0.5';
        refreshFeatureData();
        softRefresh();
        setTimeout(function () { b.style.opacity = '1'; refreshMain(); }, 2600);
      });
      $('cwa-model').addEventListener('change', function () {
        const v = $('cwa-model').value;
        if (v === '__custom__') {
          $('cwa-model-custom').style.display = '';
          $('cwa-model-custom').focus();
          return;
        }
        $('cwa-model-custom').style.display = 'none';
        settings.model = v;
        saveSettings(settings);
      });
      $('cwa-model-custom').addEventListener('change', function () {
        settings.model = $('cwa-model-custom').value.trim() || DEFAULTS.model;
        saveSettings(settings);
      });
      $('cwa-think').addEventListener('change', function () {
        settings.thinking = $('cwa-think').value;
        saveSettings(settings);
      });

      function wireAttachChk(id, key) {
        $(id).addEventListener('change', function () { settings[key] = $(id).checked; saveSettings(settings); });
      }
      wireAttachChk('cwa-c-persona', 'sendPersona');
      wireAttachChk('cwa-c-note', 'sendUserNote');
      wireAttachChk('cwa-c-memory', 'sendMemory');

      function wireCountInput(id, key, lo, hi) {
        $(id).addEventListener('change', function () {
          let v = parseInt($(id).value, 10);
          if (isNaN(v)) v = settings[key];
          v = Math.max(lo, Math.min(hi, v));
          settings[key] = v;
          $(id).value = v;
          saveSettings(settings);
          if (key === 'msgCount') ensureMoreMessages();
        });
      }
      wireCountInput('cwa-send-n', 'msgCount', 1, 99999);
      wireCountInput('cwa-memcount', 'memoryCount', 1, 999);

      $('cwa-provider').addEventListener('change', updateProviderFields);
      $('cwa-fb-paste').addEventListener('input', previewFbStatus);
      $('cwa-save').addEventListener('click', function () {
        applySettingsForm();
        $('cwa-save-msg').textContent = '설정이 저장되었습니다 ✓';
        setTimeout(function () { $('cwa-save-msg').textContent = ''; }, 1800);
      });
      $('cwa-prev-copy').addEventListener('click', function () {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText($('cwa-preview-text').textContent || '').then(function () {
          const b = $('cwa-prev-copy');
          b.innerHTML = Icons.check + '복사됨';
          setTimeout(function () { b.innerHTML = '복사'; }, 1200);
        });
      });

      populateModelSelect();

      /* =========================================================================
       * 5. 툴바 버튼 교체 로직 삽입
       * ========================================================================= */
      function injectToolbarButton() {
        if (document.getElementById('cwa-toolbar-btn')) return;
        const btnContainer = document.querySelector('.flex.items-center.space-x-2');
        if (!btnContainer) return;
        const recommendBtn = Array.from(btnContainer.querySelectorAll('button')).find(b => b?.textContent?.includes('추천답변'));
        const baseBtn = btnContainer.querySelector('button');
        if (!baseBtn) return;
        const tbBtn = baseBtn.cloneNode(true);
        tbBtn.id = 'cwa-toolbar-btn';
        tbBtn.textContent = '';
        tbBtn.removeAttribute('title');
        tbBtn.removeAttribute('disabled');
        tbBtn.style.marginLeft = '0.5rem';
        tbBtn.style.display = 'flex';
        tbBtn.style.alignItems = 'center';
        tbBtn.style.justifyContent = 'center';
        tbBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
        tbBtn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          togglePanel();
        };
        if (recommendBtn && recommendBtn.nextSibling) btnContainer.insertBefore(tbBtn, recommendBtn.nextSibling);
        else btnContainer.appendChild(tbBtn);
      }
      setInterval(injectToolbarButton, 500);

      try {
        GM_registerMenuCommand('어시스턴트 열기/닫기', togglePanel);
        GM_registerMenuCommand('설정 열기', function () {
          if (!panelEl.classList.contains('open')) panelEl.classList.add('open');
          showView('settings');
        });
      } catch (e) {}

      setTimeout(refreshFeatureData, 3000);
      let _lastUrl = location.href;
      setInterval(function () {
        if (location.href === _lastUrl) return;
        _lastUrl = location.href;
        if (!panelEl.classList.contains('open')) return;
        refreshFeatureData();
        refreshMain();
        softRefresh();
      }, 800);

      console.log('[크랙 캐릭터챗 어시스턴트] v' + CWA_VERSION + ' 로드됨');
    }
  })();
})();
