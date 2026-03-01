// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️ (Overlay + Opt In) — NO CSP / NO IFRAME
// @namespace    7ds-wrath-warbot
// @version      5.0.0
// @description  Shield opens an in-page overlay that renders LIVE data from /state (no iframe, no CSP errors). Chain sitter OPT IN button (token 666).
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

  // =========================
  // ✅ CONFIG
  // =========================
  const BASE_URL = "https://torn-war-bot.onrender.com";
  const API_STATE = `${BASE_URL}/state`;
  const API_AVAIL = `${BASE_URL}/api/availability`;
  const BG_URL = `${BASE_URL}/static/wrath-bg.jpg`; // make sure this exists!

  // 🔥 Put YOUR Torn ID here
  const MY_TORN_ID = "1234";

  // Chain sitter IDs (only these see OPT button)
  const CHAIN_SITTER_IDS = ["1234"];

  // ✅ Token must match Render env AVAIL_TOKEN
  const AVAIL_TOKEN = "666";

  // UI placement
  const SHIELD_TOP = 110;
  const SHIELD_RIGHT = 12;

  // Refresh
  const REFRESH_MS = 15000;

  // =========================
  // Helpers
  // =========================
  const isChainSitter = CHAIN_SITTER_IDS.includes(String(MY_TORN_ID));

  function esc(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function setLocalAvail(val) {
    GM_setValue("wrath_avail", !!val);
  }

  function getLocalAvail() {
    return !!GM_getValue("wrath_avail", false);
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
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function httpGetJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: { "Cache-Control": "no-cache" },
        onload: (r) => {
          try {
            const j = JSON.parse(r.responseText || "{}");
            resolve(j);
          } catch (e) {
            reject(new Error("Bad JSON from server"));
          }
        },
        onerror: () => reject(new Error("Network error")),
      });
    });
  }

  function postAvailability(available) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API_AVAIL + `?token=${encodeURIComponent(AVAIL_TOKEN)}`,
        headers: {
          "Content-Type": "application/json",
          "X-Token": AVAIL_TOKEN
        },
        data: JSON.stringify({
          torn_id: String(MY_TORN_ID),
          available: !!available,
          name: "" // optional; server fills if blank
        }),
        onload: (r) => {
          let body = r.responseText;
          try { body = JSON.parse(body || "{}"); } catch {}
          resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, body });
        },
        onerror: () => resolve({ ok: false, status: 0, body: "network error" })
      });
    });
  }

  // =========================
  // Styles (Wrath theme)
  // =========================
  GM_addStyle(`
    #wrath-shield {
      position: fixed;
      top: ${SHIELD_TOP}px;
      right: ${SHIELD_RIGHT}px;
      z-index: 2147483647;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;

      background: radial-gradient(circle at 30% 30%, rgba(255,80,70,.30), rgba(0,0,0,.85));
      border: 1px solid rgba(255,60,50,.55);
      box-shadow: 0 10px 28px rgba(0,0,0,.55), 0 0 18px rgba(255,60,50,.35);
      backdrop-filter: blur(6px);
    }
    #wrath-shield:active { transform: scale(.98); }
    #wrath-shield .icon {
      font-size: 22px;
      filter: drop-shadow(0 0 10px rgba(255,60,50,.55));
    }

    #wrath-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: none;

      background:
        linear-gradient(rgba(0,0,0,.82), rgba(0,0,0,.90)),
        url("${BG_URL}") center/cover no-repeat fixed;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      overflow-y: auto;
      padding: 20px 14px 40px 14px;
    }

    #wrath-topbar {
      position: sticky;
      top: 0;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;

      padding: 10px 10px;
      margin: -20px -14px 12px -14px;
      background: rgba(0,0,0,.75);
      border-bottom: 1px solid rgba(255,60,50,.25);
      backdrop-filter: blur(8px);
    }

    #wrath-title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    #wrath-crest {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-weight: 900;
      color: #ffcc66;
      border: 1px solid rgba(215,179,90,.25);
      background: radial-gradient(circle at 30% 30%, rgba(215,179,90,.18), rgba(255,59,48,.12), rgba(0,0,0,.7));
    }

    #wrath-title-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    #wrath-title-text .h {
      font-size: 14px;
      font-weight: 900;
      color: #ffcc66;
      letter-spacing: .5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 62vw;
    }

    #wrath-title-text .s {
      font-size: 11px;
      opacity: .9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 62vw;
    }

    #wrath-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 0 0 auto;
    }

    .wrath-btn {
      border: 1px solid rgba(255,60,50,.25);
      background: rgba(0,0,0,.55);
      color: #fff;
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .wrath-btn:active { transform: scale(.99); }

    #wrath-opt {
      border-color: rgba(215,179,90,.25);
      color: #ffcc66;
    }
    #wrath-opt.on {
      border-color: rgba(44,255,111,.35);
      color: #2cff6f;
      box-shadow: 0 0 18px rgba(44,255,111,.18);
    }

    #wrath-wrap {
      max-width: 980px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    @media (min-width: 820px) {
      #wrath-wrap { grid-template-columns: 1fr 1fr; }
    }

    .card {
      background: rgba(0,0,0,.62);
      border: 1px solid rgba(255,60,50,.25);
      border-radius: 16px;
      padding: 12px;
      backdrop-filter: blur(8px);
      box-shadow: 0 12px 35px rgba(0,0,0,.55);
    }
    .card h2 {
      margin: 0 0 8px 0;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .pill {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(215,179,90,.22);
      background: rgba(215,179,90,.08);
      color: #ffcc66;
      white-space: nowrap;
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 7px 0;
      border-top: 1px solid rgba(255,255,255,.08);
      font-size: 12px;
    }
    .row:first-of-type { border-top: none; }
    .k { opacity: .85; }
    .v { text-align: right; }

    .members {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .m {
      background: rgba(0,0,0,.45);
      border: 1px solid rgba(255,60,50,.18);
      border-radius: 14px;
      padding: 9px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      box-shadow: 0 0 0 3px rgba(255,255,255,.05);
      flex: 0 0 auto;
    }
    .dot.online { background: #2cff6f; }
    .dot.idle { background: #ffcc00; }
    .dot.offline { background: #ff4444; }

    .name {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 56vw;
    }
    .meta {
      font-size: 11px;
      opacity: .85;
      text-align: right;
      white-space: nowrap;
    }

    #wrath-err {
      display: none;
      margin-top: 12px;
      padding: 10px;
      border-radius: 14px;
      border: 1px solid rgba(255,59,48,.35);
      background: rgba(255,59,48,.08);
      color: #ffd6d3;
      font-size: 12px;
      white-space: pre-wrap;
      max-width: 980px;
      margin-left: auto;
      margin-right: auto;
    }

    #wrath-toast {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(0,0,0,.78);
      border: 1px solid rgba(255,60,50,.22);
      color: #fff;
      font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      box-shadow: 0 10px 26px rgba(0,0,0,.55);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
      white-space: pre-wrap;
      max-width: 90vw;
    }
    #wrath-toast.show { opacity: 1; }
  `);

  // =========================
  // Build UI
  // =========================
  function ensureUI() {
    if (document.getElementById("wrath-shield")) return;

    const shield = document.createElement("div");
    shield.id = "wrath-shield";
    shield.innerHTML = `<div class="icon">🛡️</div>`;
    shield.title = "Open 7DS*: Wrath War-Bot (Overlay)";

    const overlay = document.createElement("div");
    overlay.id = "wrath-overlay";
    overlay.innerHTML = `
      <div id="wrath-topbar">
        <div id="wrath-title">
          <div id="wrath-crest">7</div>
          <div id="wrath-title-text">
            <div class="h">7DS*: Wrath — War-Bot</div>
            <div class="s" id="wrath-sub">Loading…</div>
          </div>
        </div>

        <div id="wrath-actions">
          ${isChainSitter ? `<div class="wrath-btn" id="wrath-opt"><span id="wrath-opt-text">OPT IN</span></div>` : ``}
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
          <h2>🟢 Online / 🟡 Idle / 🔴 Offline <span class="pill" id="wrath-counts">—</span></h2>
          <div class="members" id="wrath-members"></div>
        </div>
      </div>

      <div id="wrath-err"></div>
    `;

    document.body.appendChild(shield);
    document.body.appendChild(overlay);

    // open
    shield.addEventListener("click", (e) => {
      e.preventDefault();
      overlay.style.display = "block";
      loadAndRender();
    });

    // close
    overlay.querySelector("#wrath-close").addEventListener("click", () => {
      overlay.style.display = "none";
    });

    // refresh
    overlay.querySelector("#wrath-refresh").addEventListener("click", () => {
      loadAndRender(true);
    });

    // opt
    if (isChainSitter) {
      const optBtn = overlay.querySelector("#wrath-opt");
      const optText = overlay.querySelector("#wrath-opt-text");

      function syncOptUI() {
        const on = getLocalAvail();
        optBtn.classList.toggle("on", on);
        optText.textContent = on ? "OPTED IN" : "OPT IN";
      }

      syncOptUI();

      optBtn.addEventListener("click", async () => {
        const next = !getLocalAvail();
        setLocalAvail(next);
        syncOptUI();

        const res = await postAvailability(next);
        if (res.ok) {
          toast(next ? "✅ Opted IN (server updated)" : "✅ Opted OUT (server updated)");
        } else {
          setLocalAvail(!next);
          syncOptUI();
          toast("❌ Failed to update server\n" + (typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)));
        }
      });
    }
  }

  // =========================
  // Render
  // =========================
  function render(data) {
    const overlay = document.getElementById("wrath-overlay");
    if (!overlay) return;

    const errBox = document.getElementById("wrath-err");
    errBox.style.display = "none";
    errBox.textContent = "";

    const f = data.faction || {};
    const tag = f.tag ? `[${f.tag}] ` : "";
    const fname = f.name || "Faction";
    const updated = data.updated_at ? "Updated" : "Waiting";
    document.getElementById("wrath-updated").textContent = updated;
    document.getElementById("wrath-sub").textContent = `${tag}${fname}`;

    const w = data.war || {};
    document.getElementById("wrath-war").innerHTML = `
      <div class="row"><div class="k">Opponent</div><div class="v">${esc(w.opponent || "No active war")}</div></div>
      <div class="row"><div class="k">Target</div><div class="v">${esc(w.target ?? "—")}</div></div>
      <div class="row"><div class="k">Your Score</div><div class="v">${esc(w.score ?? "—")}</div></div>
      <div class="row"><div class="k">Enemy Score</div><div class="v">${esc(w.enemy_score ?? "—")}</div></div>
    `;

    const rows = data.rows || [];
    let online = 0, idle = 0, offline = 0;

    const membersWrap = document.getElementById("wrath-members");
    membersWrap.innerHTML = "";

    for (const r of rows) {
      const st = r.status || "offline";
      if (st === "online") online++;
      else if (st === "idle") idle++;
      else offline++;

      const mins = (typeof r.minutes === "number") ? `${r.minutes}m` : "—";
      const el = document.createElement("div");
      el.className = "m";
      el.innerHTML = `
        <div class="left">
          <div class="dot ${esc(st)}"></div>
          <div style="min-width:0;">
            <div class="name">${esc(r.name || r.id || "Unknown")}</div>
            <div class="meta" style="text-align:left;">Last action: ${esc(mins)}</div>
          </div>
        </div>
        <div class="meta">${esc(st.toUpperCase())}</div>
      `;
      membersWrap.appendChild(el);
    }

    document.getElementById("wrath-counts").textContent = `🟢 ${online}  🟡 ${idle}  🔴 ${offline}`;

    if (data.last_error) {
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
      errBox.style.display = "block";
      errBox.textContent = "Failed to load /state\n" + (e?.message || e);
      if (showToast) toast("❌ Refresh failed");
    }
  }

  // Auto refresh while open
  setInterval(() => {
    const overlay = document.getElementById("wrath-overlay");
    if (overlay && overlay.style.display === "block") loadAndRender(false);
  }, REFRESH_MS);

  // Boot
  ensureUI();

  // Torn pages can re-render; retry a few times
  let tries = 0;
  const t = setInterval(() => {
    ensureUI();
    tries++;
    if (tries >= 10) clearInterval(t);
  }, 800);
})();
