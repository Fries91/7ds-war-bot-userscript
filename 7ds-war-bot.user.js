// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️ (Overlay matches app.py realtime panel + Open App with ID)
// @namespace    7ds-wrath-warbot
// @version      6.6.0
// @description  Shield overlay styled to match your app.py realtime panel. Uses /state (CSP-proof). OPT (token 666). NEW: "Open App" opens your Render panel with ?xid=YOURID auto-filled.
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

  const REFRESH_MS = 8000;

  function esc(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
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

  // local opt state (fast UI), server is source of truth after refresh
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

  function openAppPanelWithId(tid) {
    const url = tid ? `${BASE_URL}/?xid=${encodeURIComponent(tid)}` : `${BASE_URL}/`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  GM_addStyle(`
    #wrath-overlay, #wrath-overlay * { pointer-events: auto !important; }

    #wrath-shield{
      position:fixed; top:${SHIELD_TOP}px; right:${SHIELD_RIGHT}px;
      z-index:2147483647;
      width:48px; height:48px; border-radius:14px;
      display:grid; place-items:center;
      cursor:pointer; user-select:none; -webkit-tap-highlight-color:transparent;
      background: rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);
      box-shadow:0 10px 26px rgba(0,0,0,.55);
      color:#f2f2f2;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      font-size:22px;
    }

    #wrath-overlay{
      position:fixed; inset:0; z-index:2147483646; display:none;
      background:#0b0b0b;
      color:#f2f2f2;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      overflow-y:auto;
      padding:10px;
    }

    .topbar { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
    .title { font-weight:900; letter-spacing:.6px; font-size:16px; }
    .meta { font-size:12px; opacity:.85; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .pill { display:inline-block; padding:6px 10px; border-radius:999px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); font-size:12px; white-space:nowrap; }

    .btn {
      cursor:pointer; user-select:none;
      padding:6px 10px; border-radius:999px;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);
      font-size:12px; white-space:nowrap;
    }
    .btn.on { border-color: rgba(0,255,102,.25); }

    .divider { margin:14px 0; height:1px; background:rgba(255,255,255,.10); }
    .section-title { font-weight:900; letter-spacing:.6px; margin-top:10px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .section-title .small { font-size:12px; opacity:.8; font-weight:600; }

    h2 { margin:12px 0 6px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,.08); font-size:14px; letter-spacing:.4px; display:flex; justify-content:space-between; align-items:center; gap:10px; }

    .member { padding:8px 10px; margin:6px 0; border-radius:10px; display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:13px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); }
    .left { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .name { font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:68vw; }
    .sub { opacity:.75; font-size:11px; }
    .right { opacity:.9; font-size:12px; white-space:nowrap; }

    .online{ border-left:4px solid #00ff66; }
    .idle{ border-left:4px solid #ffd000; }
    .offline{ border-left:4px solid #ff3333; }
    .hospital{ border-left:4px solid #b06cff; }

    .section-empty { opacity:.7; font-size:12px; padding:8px 2px; }
    .err { margin-top:10px; padding:10px; border-radius:12px; background:rgba(255,80,80,.12); border:1px solid rgba(255,80,80,.25); font-size:12px; white-space:pre-wrap; }

    .warbox { margin-top:10px; padding:10px; border-radius:12px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); font-size:12px; line-height:1.35; }
    .warrow { display:flex; justify-content:space-between; gap:10px; margin:3px 0; }
    .label { opacity:.75; }
  `);

  function $(id) { return document.getElementById(id); }

  function fmtMins(n) {
    if (typeof n !== "number") return "—";
    if (n < 60) return `${n}m`;
    const h = Math.floor(n / 60), m = n % 60;
    return `${h}h ${m}m`;
  }

  function hospLeft(until) {
    const t = Number(until);
    if (!t) return "in hospital";
    const now = Date.now() / 1000;
    const mins = Math.max(0, Math.round((t - now) / 60));
    if (mins <= 0) return "in hospital";
    if (mins < 60) return `${mins}m left`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h}h ${m}m left`;
  }

  function memberHTML(r, st) {
    const name = esc(r.name || r.id || "Unknown");
    const id = esc(r.id || "");
    const right = st === "hospital" ? hospLeft(r.hospital_until) : fmtMins(r.minutes);
    const opted = r.available ? " ✅ OPTED" : "";
    return `
      <div class="member ${st}">
        <div class="left">
          <div class="name">${name}${opted}</div>
          <div class="sub">ID: ${id}</div>
        </div>
        <div class="right">${esc(right)}</div>
      </div>
    `;
  }

  function split(rows) {
    const online = [], idle = [], offline = [], hosp = [];
    for (const r of (rows || [])) {
      const isHosp = !!r.hospital || r.status === "hospital";
      if (isHosp) { hosp.push(r); continue; }
      if (r.status === "online") online.push(r);
      else if (r.status === "idle") idle.push(r);
      else offline.push(r);
    }
    online.sort((a,b)=>(a.minutes ?? 999999) - (b.minutes ?? 999999));
    idle.sort((a,b)=>(a.minutes ?? 999999) - (b.minutes ?? 999999));
    offline.sort((a,b)=>(a.minutes ?? 999999) - (b.minutes ?? 999999));
    hosp.sort((a,b)=>(Number(a.hospital_until) || 9999999999) - (Number(b.hospital_until) || 9999999999));
    return { online, idle, offline, hosp };
  }

  function setList(el, arr, st, emptyText) {
    el.innerHTML = "";
    if (!arr.length) {
      el.innerHTML = `<div class="section-empty">${esc(emptyText)}</div>`;
      return;
    }
    for (const r of arr) el.insertAdjacentHTML("beforeend", memberHTML(r, st));
  }

  function syncOptUI(tornId) {
    const btn = $("rt-opt");
    const txt = $("rt-opt-text");
    if (!btn || !txt) return;
    const on = getLocalAvail(tornId);
    btn.classList.toggle("on", on);
    txt.textContent = on ? "OPTED IN" : "OPT IN";
  }

  async function ensureIdOrWarn() {
    const tid = detectTornId();
    if (!tid) {
      const err = $("rt-error");
      if (err) {
        err.style.display = "block";
        err.textContent = "Couldn't detect your Torn ID yet.\nOpen your profile/sidebar then try again.";
      }
      return null;
    }
    return tid;
  }

  function render(state) {
    const err = $("rt-error");
    if (state.last_error) {
      err.style.display = "block";
      err.textContent = "Last error:\n" + JSON.stringify(state.last_error, null, 2);
    } else {
      err.style.display = "none";
      err.textContent = "";
    }

    const c = state.counts || {};
    $("rt-updated").textContent = `Updated: ${state.updated_at || "—"}`;
    $("rt-online").textContent = `🟢 ${c.online ?? 0}`;
    $("rt-idle").textContent = `🟡 ${c.idle ?? 0}`;
    $("rt-offline").textContent = `🔴 ${c.offline ?? 0}`;
    $("rt-hospital").textContent = `🏥 ${c.hospital ?? 0}`;
    $("rt-avail").textContent = `✅ Avail: ${state.available_count ?? 0}`;

    const f = state.faction || {};
    $("rt-you-title").textContent = `${(f.tag ? `[${f.tag}] ` : "")}${f.name || ""}`.trim() || "—";

    const w = state.war || {};
    const warShow = (w.opponent || w.target || w.score !== null || w.enemy_score !== null);
    const warEl = $("rt-war");
    warEl.style.display = warShow ? "block" : "none";
    if (warShow) {
      warEl.innerHTML = `
        <div class="warrow"><div class="label">Opponent</div><div>${esc(w.opponent || "—")}</div></div>
        <div class="warrow"><div class="label">Opponent ID</div><div>${esc(w.opponent_id || "—")}</div></div>
        <div class="warrow"><div class="label">Our Score</div><div>${esc(w.score ?? "—")}</div></div>
        <div class="warrow"><div class="label">Enemy Score</div><div>${esc(w.enemy_score ?? "—")}</div></div>
        <div class="warrow"><div class="label">Target</div><div>${esc(w.target ?? "—")}</div></div>
        <div class="warrow"><div class="label">Start</div><div>${esc(w.start || "—")}</div></div>
        <div class="warrow"><div class="label">End</div><div>${esc(w.end || "—")}</div></div>
      `;
    }

    const you = split(state.rows || []);
    $("rt-you-online-count").textContent = String(you.online.length);
    $("rt-you-idle-count").textContent = String(you.idle.length);
    $("rt-you-hosp-count").textContent = String(you.hosp.length);
    $("rt-you-offline-count").textContent = String(you.offline.length);

    setList($("rt-you-online"), you.online, "online", "No one online right now.");
    setList($("rt-you-idle"), you.idle, "idle", "No one idle right now.");
    setList($("rt-you-hosp"), you.hosp, "hospital", "No one in hospital right now.");
    setList($("rt-you-offline"), you.offline, "offline", "No one offline right now.");

    const enemy = state.enemy || {};
    const ef = enemy.faction || {};
    const hasEnemy = !!ef.name;

    $("rt-enemy-wrap").style.display = hasEnemy ? "block" : "none";
    $("rt-them-title").textContent = hasEnemy
      ? `${(ef.tag ? `[${ef.tag}] ` : "")}${ef.name} (ID: ${ef.id || "—"})`
      : "Waiting for opponent id…";

    if (hasEnemy) {
      const them = split(enemy.rows || []);
      $("rt-them-online-count").textContent = String(them.online.length);
      $("rt-them-idle-count").textContent = String(them.idle.length);
      $("rt-them-hosp-count").textContent = String(them.hosp.length);
      $("rt-them-offline-count").textContent = String(them.offline.length);

      setList($("rt-them-online"), them.online, "online", "No enemy online right now.");
      setList($("rt-them-idle"), them.idle, "idle", "No enemy idle right now.");
      setList($("rt-them-hosp"), them.hosp, "hospital", "No enemy in hospital right now.");
      setList($("rt-them-offline"), them.offline, "offline", "No enemy offline right now.");
    }

    // ✅ Keep OPT button synced to local state (fast)
    // (Server truth shows as ✅ OPTED beside your name after refresh.)
    const tid = detectTornId();
    if (tid) syncOptUI(tid);
  }

  async function refreshState() {
    const err = $("rt-error");
    try {
      const data = await httpGetJson(API_STATE + `?cb=${Date.now()}`);
      render(data);
    } catch (e) {
      if (err) {
        err.style.display = "block";
        err.textContent = "Failed to load /state\n" + (e?.message || e);
      }
    }
  }

  function ensureUI() {
    if (document.getElementById("wrath-shield")) return;

    const shield = document.createElement("div");
    shield.id = "wrath-shield";
    shield.textContent = "🛡️";
    shield.title = "Open 7DS*: Wrath War Panel";

    const overlay = document.createElement("div");
    overlay.id = "wrath-overlay";
    overlay.innerHTML = `
      <div class="topbar">
        <div class="title">⚔ 7DS*: WRATH WAR PANEL</div>
        <div class="meta">
          <span id="rt-updated">Updated: —</span>
          <span class="pill" id="rt-online">🟢 0</span>
          <span class="pill" id="rt-idle">🟡 0</span>
          <span class="pill" id="rt-offline">🔴 0</span>
          <span class="pill" id="rt-hospital">🏥 0</span>
          <span class="pill" id="rt-avail">✅ Avail: 0</span>

          <span class="btn" id="rt-opt"><span id="rt-opt-text">OPT IN</span></span>

          <!-- ✅ NEW: Opens your Render app panel with ?xid=YOURID -->
          <span class="btn" id="rt-open-app">Open App</span>

          <span class="btn" id="rt-refresh">Refresh</span>
          <span class="btn" id="rt-close">Close</span>
        </div>
      </div>

      <div id="rt-error" class="err" style="display:none;"></div>
      <div id="rt-war" class="warbox" style="display:none;"></div>

      <div class="section-title">
        <div>🛡️ YOUR FACTION</div>
        <div class="small" id="rt-you-title">—</div>
      </div>

      <h2>🟢 ONLINE (0–20 mins) <span class="pill" id="rt-you-online-count">0</span></h2>
      <div id="rt-you-online"></div>

      <h2>🟡 IDLE (20–30 mins) <span class="pill" id="rt-you-idle-count">0</span></h2>
      <div id="rt-you-idle"></div>

      <h2>🏥 HOSPITAL <span class="pill" id="rt-you-hosp-count">0</span></h2>
      <div id="rt-you-hosp"></div>

      <h2>🔴 OFFLINE (30+ mins) <span class="pill" id="rt-you-offline-count">0</span></h2>
      <div id="rt-you-offline"></div>

      <div class="divider"></div>

      <div class="section-title">
        <div>🎯 ENEMY FACTION</div>
        <div class="small" id="rt-them-title">Waiting for opponent id…</div>
      </div>

      <div id="rt-enemy-wrap" style="display:none;">
        <h2>🟢 ENEMY ONLINE <span class="pill" id="rt-them-online-count">0</span></h2>
        <div id="rt-them-online"></div>

        <h2>🟡 ENEMY IDLE <span class="pill" id="rt-them-idle-count">0</span></h2>
        <div id="rt-them-idle"></div>

        <h2>🏥 ENEMY HOSPITAL <span class="pill" id="rt-them-hosp-count">0</span></h2>
        <div id="rt-them-hosp"></div>

        <h2>🔴 ENEMY OFFLINE <span class="pill" id="rt-them-offline-count">0</span></h2>
        <div id="rt-them-offline"></div>
      </div>
    `;

    document.body.appendChild(shield);
    document.body.appendChild(overlay);

    let cachedId = null;

    shield.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      overlay.style.display = "block";
      cachedId = cachedId || detectTornId();
      syncOptUI(cachedId || "unknown");
      await refreshState();
    }, true);

    $("rt-close").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      overlay.style.display = "none";
    }, true);

    $("rt-refresh").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      cachedId = cachedId || detectTornId();
      syncOptUI(cachedId || "unknown");
      await refreshState();
    }, true);

    // ✅ NEW: open your real Render panel with ?xid=####
    $("rt-open-app").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      cachedId = cachedId || (await ensureIdOrWarn());
      openAppPanelWithId(cachedId);
    }, true);

    $("rt-opt").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      cachedId = cachedId || (await ensureIdOrWarn());
      if (!cachedId) return;

      const next = !getLocalAvail(cachedId);
      setLocalAvail(cachedId, next);
      syncOptUI(cachedId);

      const nm = detectPlayerName();
      const res = await postAvailability(cachedId, next, nm);

      if (!res.ok) {
        // rollback
        setLocalAvail(cachedId, !next);
        syncOptUI(cachedId);
        const err = $("rt-error");
        if (err) {
          err.style.display = "block";
          err.textContent =
            "Failed to update OPT\n" +
            (typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2));
        }
      } else {
        await refreshState(); // refresh so ✅ OPTED label shows in list
      }
    }, true);

    // auto refresh while open
    setInterval(() => {
      if (overlay.style.display === "block") refreshState();
    }, REFRESH_MS);
  }

  ensureUI();

  // Torn can re-render; re-attach if needed
  let tries = 0;
  const t = setInterval(() => {
    ensureUI();
    tries++;
    if (tries >= 12) clearInterval(t);
  }, 800);
})();
