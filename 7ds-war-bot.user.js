// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️ (Overlay + Auto ID + OPT) — Status + Hospital
// @namespace    7ds-wrath-warbot
// @version      6.3.1
// @description  Overlay shows Online/Idle/Offline/Hospital from /state (no iframe = CSP-proof). OPT auto-detects your Torn ID. Token 666.
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      torn-war-bot.onrender.com
// ==/UserScript==

(function () {
  "use strict";

  const BASE_URL  = "https://torn-war-bot.onrender.com";
  const API_STATE = `${BASE_URL}/state`;
  const API_AVAIL = `${BASE_URL}/api/availability`;
  const AVAIL_TOKEN = "666";

  const SHIELD_TOP = 110;
  const SHIELD_RIGHT = 12;
  const REFRESH_MS = 15000;

  function esc(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function toast(msg) {
    let t = document.getElementById("wrath-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "wrath-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
  }

  function httpGetJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: { "Cache-Control": "no-cache" },
        onload: (r) => {
          try { resolve(JSON.parse(r.responseText || "{}")); }
          catch { reject(new Error("Bad JSON from server")); }
        },
        onerror: () => reject(new Error("Network error")),
      });
    });
  }

  function detectTornId() {
    try {
      const a = Array.from(document.querySelectorAll('a[href*="profiles.php?XID="]'));
      for (const el of a) {
        const href = el.getAttribute("href") || "";
        const m = href.match(/profiles\.php\?XID=(\d+)/i);
        if (m) return m[1];
      }
      const any = Array.from(document.querySelectorAll('a[href*="XID="]'));
      for (const el of any) {
        const href = el.getAttribute("href") || "";
        const m = href.match(/XID=(\d+)/i);
        if (m) return m[1];
      }
      const html = document.documentElement?.innerHTML || "";
      const mm = html.match(/profiles\.php\?XID=(\d+)/i) || html.match(/XID=(\d{3,10})/i);
      if (mm) return mm[1];
    } catch (_) {}
    return null;
  }

  function availKey(tornId) { return `wrath_avail_${tornId || "unknown"}`; }
  function setLocalAvail(tornId, val) { GM_setValue(availKey(tornId), !!val); }
  function getLocalAvail(tornId) { return !!GM_getValue(availKey(tornId), false); }

  function detectPlayerName() {
    const t = (document.title || "").trim();
    if (t && t.length <= 60) return t.replace(/\s+\-\s+Torn.*$/i, "").trim();
    return "";
  }

  function postAvailability(tornId, available, name) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API_AVAIL + `?token=${encodeURIComponent(AVAIL_TOKEN)}`,
        headers: { "Content-Type": "application/json", "X-Token": AVAIL_TOKEN },
        data: JSON.stringify({ torn_id: String(tornId || ""), available: !!available, name: name || "" }),
        onload: (r) => {
          let body = r.responseText;
          try { body = JSON.parse(body || "{}"); } catch {}
          resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, body });
        },
        onerror: () => resolve({ ok: false, status: 0, body: "network error" })
      });
    });
  }

  GM_addStyle(`
    #wrath-overlay, #wrath-overlay * { pointer-events: auto !important; }

    #wrath-shield{
      position:fixed; top:${SHIELD_TOP}px; right:${SHIELD_RIGHT}px;
      z-index:2147483647; width:48px; height:48px; border-radius:14px;
      display:grid; place-items:center; cursor:pointer; user-select:none;
      -webkit-tap-highlight-color:transparent;
      background: radial-gradient(circle at 30% 30%, rgba(255,80,70,.30), rgba(0,0,0,.90));
      border:1px solid rgba(255,60,50,.55);
      box-shadow:0 10px 28px rgba(0,0,0,.55), 0 0 18px rgba(255,60,50,.35);
      backdrop-filter: blur(6px);
    }
    #wrath-shield .icon{ font-size:22px; filter: drop-shadow(0 0 10px rgba(255,60,50,.55)); }

    #wrath-overlay{
      position:fixed; inset:0; z-index:2147483646; display:none;
      background: rgba(0,0,0,.92);
      color:#fff; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
      overflow-y:auto; padding: 18px 12px 28px 12px;
    }

    #wrath-topbar{
      position:sticky; top:0; z-index:2147483646;
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding:10px; margin:-18px -12px 12px -12px;
      background: rgba(0,0,0,.85);
      border-bottom:1px solid rgba(255,60,50,.25);
      backdrop-filter: blur(8px);
    }

    #wrath-title{ display:flex; align-items:center; gap:10px; min-width:0; }
    #wrath-crest{
      width:34px; height:34px; border-radius:12px; display:grid; place-items:center;
      font-weight:900; color:#ffcc66;
      border:1px solid rgba(215,179,90,.25);
      background: rgba(255,60,50,.08);
    }
    #wrath-title .h{ font-size:14px; font-weight:900; color:#ffcc66; letter-spacing:.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #wrath-title .s{ font-size:11px; opacity:.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    #wrath-actions{ display:flex; align-items:center; gap:10px; flex:0 0 auto; }
    .wrath-btn{
      border:1px solid rgba(255,60,50,.25); background: rgba(0,0,0,.55); color:#fff;
      border-radius:12px; padding:8px 10px; font-size:12px; cursor:pointer; user-select:none;
    }
    #wrath-opt{ border-color: rgba(215,179,90,.25); color:#ffcc66; }
    #wrath-opt.on{ border-color: rgba(44,255,111,.35); color:#2cff6f; }

    #wrath-wrap{ max-width:980px; margin:0 auto; display:grid; grid-template-columns:1fr; gap:12px; }
    @media (min-width:820px){ #wrath-wrap{ grid-template-columns:1fr 1fr; } }

    .card{
      background: rgba(0,0,0,.62);
      border:1px solid rgba(255,60,50,.25);
      border-radius:16px; padding:12px;
      box-shadow:0 12px 35px rgba(0,0,0,.55);
    }
    .card h2{ margin:0 0 8px 0; font-size:13px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .pill{ font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid rgba(215,179,90,.22); background: rgba(215,179,90,.08); color:#ffcc66; white-space:nowrap; }

    .row{ display:flex; justify-content:space-between; gap:12px; padding:7px 0; border-top:1px solid rgba(255,255,255,.08); font-size:12px; }
    .row:first-of-type{ border-top:none; }
    .k{ opacity:.85; }
    .v{ text-align:right; }

    .members{ display:flex; flex-direction:column; gap:8px; }
    .m{
      background: rgba(0,0,0,.45);
      border:1px solid rgba(255,60,50,.18);
      border-radius:14px; padding:9px 10px;
      display:flex; align-items:center; justify-content:space-between; gap:10px;
    }
    .left{ display:flex; align-items:center; gap:10px; min-width:0; }
    .dot{ width:10px; height:10px; border-radius:999px; box-shadow:0 0 0 3px rgba(255,255,255,.05); flex:0 0 auto; }
    .dot.online{ background:#2cff6f; }
    .dot.idle{ background:#ffcc00; }
    .dot.offline{ background:#ff4444; }
    .dot.hospital{ background:#b46bff; }
    .name{ font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:56vw; }
    .meta{ font-size:11px; opacity:.85; text-align:right; white-space:nowrap; }

    #wrath-err{
      display:none; margin-top:12px; padding:10px; border-radius:14px;
      border:1px solid rgba(255,59,48,.35); background: rgba(255,59,48,.08);
      color:#ffd6d3; font-size:12px; white-space:pre-wrap;
      max-width:980px; margin-left:auto; margin-right:auto;
    }

    #wrath-toast{
      position:fixed; left:50%; bottom:18px; transform:translateX(-50%);
      z-index:2147483647; padding:10px 12px; border-radius:14px;
      background: rgba(0,0,0,.78); border:1px solid rgba(255,60,50,.22);
      color:#fff; font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
      box-shadow:0 10px 26px rgba(0,0,0,.55);
      opacity:0; pointer-events:none; transition: opacity .18s ease;
      white-space:pre-wrap; max-width:90vw;
    }
    #wrath-toast.show{ opacity:1; }
  `);

  function render(data) {
    const errBox = document.getElementById("wrath-err");
    if (errBox) { errBox.style.display = "none"; errBox.textContent = ""; }

    const f = data.faction || {};
    const tag = f.tag ? `[${f.tag}] ` : "";
    const sub = document.getElementById("wrath-sub");
    if (sub) sub.textContent = `${tag}${f.name || "Faction"}`;

    const upd = document.getElementById("wrath-updated");
    if (upd) upd.textContent = data.updated_at ? "Updated" : "Waiting";

    const w = data.war || {};
    const warEl = document.getElementById("wrath-war");
    if (warEl) {
      warEl.innerHTML = `
        <div class="row"><div class="k">Opponent</div><div class="v">${esc(w.opponent || "No active war")}</div></div>
        <div class="row"><div class="k">Target</div><div class="v">${esc(w.target ?? "—")}</div></div>
        <div class="row"><div class="k">Your Score</div><div class="v">${esc(w.score ?? "—")}</div></div>
        <div class="row"><div class="k">Enemy Score</div><div class="v">${esc(w.enemy_score ?? "—")}</div></div>
      `;
    }

    const c = data.counts || {};
    const counts = document.getElementById("wrath-counts");
    if (counts) {
      counts.textContent = `🟢 ${c.online ?? 0}  🟡 ${c.idle ?? 0}  🔴 ${c.offline ?? 0}  🏥 ${c.hospital ?? 0}`;
    }

    const rows = data.rows || [];
    const membersWrap = document.getElementById("wrath-members");
    if (membersWrap) membersWrap.innerHTML = "";

    for (const r of rows) {
      const st = r.status || "offline";
      const mins = (typeof r.minutes === "number") ? `${r.minutes}m` : "—";
      const label =
        st === "hospital" ? "HOSPITAL" :
        st === "online" ? "ONLINE" :
        st === "idle" ? "IDLE" : "OFFLINE";

      const subline =
        st === "hospital" ? "In hospital" : `Last action: ${mins}`;

      if (membersWrap) {
        const el = document.createElement("div");
        el.className = "m";
        el.innerHTML = `
          <div class="left">
            <div class="dot ${esc(st)}"></div>
            <div style="min-width:0;">
              <div class="name">${esc(r.name || r.id || "Unknown")}</div>
              <div class="meta" style="text-align:left;">${esc(subline)}</div>
            </div>
          </div>
          <div class="meta">${label}</div>
        `;
        membersWrap.appendChild(el);
      }
    }

    if (data.last_error && errBox) {
      errBox.style.display = "block";
      errBox.textContent = "Last error:\n" + JSON.stringify(data.last_error, null, 2);
    }
  }

  async function loadAndRender(showToast) {
    try {
      const data = await httpGetJson(API_STATE);
      render(data);
      if (showToast) toast("✅ Refreshed");
    } catch (e) {
      const errBox = document.getElementById("wrath-err");
      if (errBox) {
        errBox.style.display = "block";
        errBox.textContent = "Failed to load /state\n" + (e?.message || e);
      }
      if (showToast) toast("❌ Refresh failed");
    }
  }

  function ensureUI() {
    if (document.getElementById("wrath-shield")) return;

    const shield = document.createElement("div");
    shield.id = "wrath-shield";
    shield.innerHTML = `<div class="icon">🛡️</div>`;
    shield.title = "Open 7DS*: Wrath War-Bot";

    const overlay = document.createElement("div");
    overlay.id = "wrath-overlay";
    overlay.innerHTML = `
      <div id="wrath-topbar">
        <div id="wrath-title">
          <div id="wrath-crest">7</div>
          <div style="min-width:0;display:flex;flex-direction:column;gap:2px;">
            <div class="h">7DS*: Wrath — War-Bot</div>
            <div class="s" id="wrath-sub">Loading…</div>
          </div>
        </div>
        <div id="wrath-actions">
          <div class="wrath-btn" id="wrath-opt"><span id="wrath-opt-text">OPT IN</span></div>
          <div class="wrath-btn" id="wrath-refresh">Refresh</div>
          <div class="wrath-btn" id="wrath-close">Close</div>
        </div>
      </div>

      <div id="wrath-wrap">
        <div class="card">
          <h2>⚔ War Status <span class="pill" id="wrath-updated">—</span></h2>
          <div id="wrath-war"></div>
        </div>

        <div class="card">
          <h2>Status <span class="pill" id="wrath-counts">—</span></h2>
          <div class="members" id="wrath-members"></div>
        </div>
      </div>

      <div id="wrath-err"></div>
    `;

    document.body.appendChild(shield);
    document.body.appendChild(overlay);

    let cachedId = null;

    function syncOptUI(tornId) {
      const optBtn = overlay.querySelector("#wrath-opt");
      const optText = overlay.querySelector("#wrath-opt-text");
      const on = getLocalAvail(tornId);
      optBtn.classList.toggle("on", on);
      optText.textContent = on ? "OPTED IN" : "OPT IN";
    }

    async function ensureIdOrWarn() {
      cachedId = cachedId || detectTornId();
      if (!cachedId) toast("⚠️ Couldn't detect your Torn ID yet. Open your profile/sidebar, then try OPT again.");
      return cachedId;
    }

    shield.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      overlay.style.display = "block";
      const tid = await ensureIdOrWarn();
      syncOptUI(tid || "unknown");
      await loadAndRender(false);
    }, true);

    overlay.querySelector("#wrath-close").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      overlay.style.display = "none";
    }, true);

    overlay.querySelector("#wrath-refresh").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      cachedId = cachedId || detectTornId();
      syncOptUI(cachedId || "unknown");
      await loadAndRender(true);
    }, true);

    overlay.querySelector("#wrath-opt").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const tid = await ensureIdOrWarn();
      if (!tid) return;

      const next = !getLocalAvail(tid);
      setLocalAvail(tid, next);
      syncOptUI(tid);

      const nm = detectPlayerName();
      const res = await postAvailability(tid, next, nm);

      if (res.ok) toast(next ? `✅ Opted IN (${tid})` : `✅ Opted OUT (${tid})`);
      else {
        setLocalAvail(tid, !next);
        syncOptUI(tid);
        toast("❌ Failed to update server\n" + (typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)));
      }
    }, true);
  }

  // auto refresh while open
  setInterval(() => {
    const overlay = document.getElementById("wrath-overlay");
    if (overlay && overlay.style.display === "block") loadAndRender(false);
  }, REFRESH_MS);

  ensureUI();

  // Torn can re-render; retry attach
  let tries = 0;
  const t = setInterval(() => {
    ensureUI();
    tries++;
    if (tries >= 12) clearInterval(t);
  }, 800);
})();
