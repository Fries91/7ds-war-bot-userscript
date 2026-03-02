// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️ (Wrath Theme + Collapsible + Draggable)
// @namespace    7ds-wrath-warbot
// @version      7.0.1
// @description  Wrath-themed shield overlay matching app.py. Uses /state (CSP-proof). OPT (token 666). OFFLINE sections collapsible. Shield is DRAGGABLE. Click shield toggles open/close. YOUR faction has 🎯 Bounty buttons. ENEMY has ⚔️ Attack buttons. No close button.
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

  // default position (used if no saved position)
  const SHIELD_TOP_DEFAULT = 110;
  const SHIELD_RIGHT_DEFAULT = 12;

  const REFRESH_MS = 8000;

  // ========== helpers ==========
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

  function detectPlayerName() {
    const t = (document.title || "").trim();
    if (t && t.length <= 60) return t.replace(/\s+\-\s+Torn.*$/i, "").trim();
    return "";
  }

  // local opt state
  function availKey(tornId) { return `wrath_avail_${tornId || "unknown"}`; }
  function setLocalAvail(tornId, val) { GM_setValue(availKey(tornId), !!val); }
  function getLocalAvail(tornId) { return !!GM_getValue(availKey(tornId), false); }

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

  // ========== hospital countdown ==========
  function parseUntilToMs(until) {
    if (!until) return null;
    if (typeof until === "number") return until * 1000;
    const s = String(until).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
    const ms = Date.parse(s);
    return isNaN(ms) ? null : ms;
  }

  function fmtLeft(msLeft) {
    if (msLeft <= 0) return "OUT";
    const totalSec = Math.floor(msLeft / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  function tickHospitalTimers() {
    if (!document.getElementById("wrath-overlay")) return;
    const now = Date.now();
    const list = document.querySelectorAll("#wrath-overlay .hospTimer");
    for (const el of list) {
      const raw = el.getAttribute("data-until") || "";
      const untilMs = parseUntilToMs(raw);
      if (!untilMs) { el.textContent = "—"; continue; }
      const left = untilMs - now;
      el.textContent = fmtLeft(left);
      if (left <= 0) el.style.opacity = "0.85";
      else el.style.opacity = "1";
    }
  }

  // ========== split + render ==========
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

  function fmtMins(n) {
    if (typeof n !== "number") return "—";
    if (n < 60) return `${n}m`;
    const h = Math.floor(n / 60), m = n % 60;
    return `${h}h ${m}m`;
  }

  function attackUrlFor(id) {
    return `https://www.torn.com/loader.php?sid=attack&user2ID=${encodeURIComponent(String(id || ""))}`;
  }

  function bountyUrlFor(id) {
    return `https://www.torn.com/bounties.php?step=add&userID=${encodeURIComponent(String(id || ""))}`;
  }

  // mode: "you" => Bounty | "enemy" => Attack
  function memberHTML(r, st, mode) {
    const name = esc(r.name || r.id || "Unknown");
    const id = esc(r.id || "");
    const opted = r.available ? " ✅ OPTED" : "";

    const right = st === "hospital"
      ? `<span class="hospTimer" data-until="${esc(r.hospital_until ?? "")}">—</span>`
      : esc(fmtMins(r.minutes));

    if (mode === "you") {
      return `
        <div class="member ${st}">
          <div class="left">
            <div class="name">${name}${opted}</div>
            <div class="sub">ID: ${id}</div>
          </div>
          <div class="actions">
            <div class="right">${right}</div>
            <a class="abtn bounty" href="${bountyUrlFor(r.id)}" target="_blank" rel="noopener noreferrer">🎯 Bounty</a>
          </div>
        </div>
      `;
    }

    return `
      <div class="member ${st}">
        <div class="left">
          <div class="name">${name}${opted}</div>
          <div class="sub">ID: ${id}</div>
        </div>
        <div class="actions">
          <div class="right">${right}</div>
          <a class="abtn attack" href="${attackUrlFor(r.id)}" target="_blank" rel="noopener noreferrer">⚔️ Attack</a>
        </div>
      </div>
    `;
  }

  function setList(el, arr, st, emptyText, mode) {
    el.innerHTML = "";
    if (!arr.length) {
      el.innerHTML = `<div class="section-empty">${esc(emptyText)}</div>`;
      return;
    }
    for (const r of arr) el.insertAdjacentHTML("beforeend", memberHTML(r, st, mode));
  }

  function syncOptUI(tornId) {
    const btn = document.getElementById("rt-opt");
    const txt = document.getElementById("rt-opt-text");
    if (!btn || !txt) return;
    const on = getLocalAvail(tornId);
    btn.classList.toggle("on", on);
    txt.textContent = on ? "OPTED IN" : "OPT IN";
  }

  async function ensureIdOrWarn() {
    const tid = detectTornId();
    if (!tid) {
      const err = document.getElementById("rt-error");
      if (err) {
        err.style.display = "block";
        err.textContent = "Couldn't detect your Torn ID yet.\nOpen your profile/sidebar then try again.";
      }
      return null;
    }
    return tid;
  }

  function render(state) {
    const $ = (id) => document.getElementById(id);

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

    setList($("rt-you-online"), you.online, "online", "No one online right now.", "you");
    setList($("rt-you-idle"), you.idle, "idle", "No one idle right now.", "you");
    setList($("rt-you-hosp"), you.hosp, "hospital", "No one in hospital right now.", "you");
    setList($("rt-you-offline-list"), you.offline, "offline", "No one offline right now.", "you");

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

      setList($("rt-them-online"), them.online, "online", "No enemy online right now.", "enemy");
      setList($("rt-them-idle"), them.idle, "idle", "No enemy idle right now.", "enemy");
      setList($("rt-them-hosp"), them.hosp, "hospital", "No enemy in hospital right now.", "enemy");
      setList($("rt-them-offline-list"), them.offline, "offline", "No enemy offline right now.", "enemy");
    }

    const tid = detectTornId();
    if (tid) syncOptUI(tid);

    tickHospitalTimers();
  }

  async function refreshState() {
    const err = document.getElementById("rt-error");
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

  // ========== draggable shield ==========
  const POS_KEY = "wrath_shield_pos_v1"; // {top,left} stored
  function loadPos() {
    const p = GM_getValue(POS_KEY, null);
    if (p && typeof p === "object" && p.top != null && p.left != null) return p;
    // default: convert right->left
    const left = Math.max(0, window.innerWidth - 48 - SHIELD_RIGHT_DEFAULT);
    return { top: SHIELD_TOP_DEFAULT, left };
  }
  function savePos(top, left) {
    GM_setValue(POS_KEY, { top, left });
  }
  function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

  // ========== UI ==========
  GM_addStyle(`
    #wrath-overlay, #wrath-overlay * { pointer-events: auto !important; }

    :root{
      --bg0:#070607;
      --bg1:#0d0a0c;
      --text:#f4f2f3;
      --muted:rgba(244,242,243,.74);

      --ember:#ff7a18;
      --blood:#ff2a2a;
      --gold:#ffd24a;
      --violet:#b06cff;

      --line:rgba(255,255,255,.10);
      --cardBorder:rgba(255,255,255,.07);

      --green:#00ff66;
      --yellow:#ffd000;
      --red:#ff3333;

      --dangerBg:rgba(255,80,80,.12);
      --dangerBorder:rgba(255,80,80,.25);

      --glowRed: 0 0 14px rgba(255,42,42,.25), 0 0 26px rgba(255,42,42,.14);
      --glowEmber: 0 0 14px rgba(255,122,24,.22), 0 0 28px rgba(255,122,24,.12);
    }

    #wrath-shield{
      position:fixed;
      z-index:2147483647;
      width:48px; height:48px; border-radius:14px;
      display:grid; place-items:center;
      cursor:pointer; user-select:none; -webkit-tap-highlight-color:transparent;

      background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
      border:1px solid rgba(255,255,255,.12);
      box-shadow: 0 14px 34px rgba(0,0,0,.60), var(--glowRed);
      color: var(--gold);
      text-shadow: var(--glowEmber);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      font-size:22px;
      touch-action: none;
    }

    #wrath-overlay{
      position:fixed; inset:0; z-index:2147483646; display:none;
      background:
        radial-gradient(1200px 700px at 18% 10%, rgba(255,42,42,.10), transparent 55%),
        radial-gradient(900px 600px at 82% 0%, rgba(255,122,24,.08), transparent 60%),
        linear-gradient(180deg, var(--bg0), var(--bg1)) !important;
      color: var(--text);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      overflow-y:auto;
      padding:10px;
      -webkit-text-size-adjust: 100%;
    }
    #wrath-overlay * { color: inherit !important; }

    .sigil{
      height:10px;
      border-radius:999px;
      background: linear-gradient(90deg, transparent, rgba(255,42,42,.55), rgba(255,122,24,.45), transparent) !important;
      opacity:.9;
      margin-bottom:10px;
      position:relative;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.06) !important;
      box-shadow: var(--glowRed);
    }
    .sigil:after{
      content:"";
      position:absolute;
      top:-40px; left:-60%;
      width:40%;
      height:120px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent);
      transform: rotate(18deg);
      animation: sweep 5.8s linear infinite;
      opacity:.5;
    }
    @keyframes sweep{
      0%{ left:-60%; }
      100%{ left:140%; }
    }

    .topbar { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
    .title {
      font-weight: 950;
      letter-spacing: 1.1px;
      font-size: 16px;
      color: var(--gold) !important;
      text-transform: uppercase;
      text-shadow: var(--glowEmber);
    }
    .meta { font-size:12px; opacity:.96; display:flex; align-items:center; gap:8px; flex-wrap:wrap; color: var(--text) !important; }

    .pill {
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:6px 10px;
      border-radius:999px;
      background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.04)) !important;
      border:1px solid rgba(255,255,255,.10) !important;
      font-size:12px;
      white-space:nowrap;
      color: var(--text) !important;
    }

    .btn {
      cursor:pointer; user-select:none;
      padding:6px 10px; border-radius:999px;
      background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.04)) !important;
      border:1px solid rgba(255,255,255,.12) !important;
      font-size:12px; white-space:nowrap;
      color: var(--text) !important;
      box-shadow: 0 8px 18px rgba(0,0,0,.30);
    }
    .btn:active { transform: translateY(1px); }
    .btn.on { border-color: rgba(0,255,102,.35) !important; box-shadow: 0 0 18px rgba(0,255,102,.10); }

    .divider { margin:14px 0; height:1px; background:var(--line) !important; }

    .section-title {
      font-weight: 950;
      letter-spacing: 1.0px;
      margin-top: 10px;
      margin-bottom: 6px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      flex-wrap:wrap;
      color: var(--gold) !important;
      text-shadow: var(--glowEmber);
    }
    .section-title .small { font-size:12px; opacity:.9; font-weight:700; color: var(--text) !important; text-shadow:none; }

    h2 {
      margin:12px 0 6px;
      padding-bottom:6px;
      border-bottom:1px solid rgba(255,255,255,.10) !important;
      font-size:13px;
      letter-spacing:.7px;
      color: var(--text) !important;
      text-transform: uppercase;
      opacity: .95;
      display:flex; justify-content:space-between; align-items:center; gap:10px;
    }

    .member {
      padding:9px 10px;
      margin:6px 0;
      border-radius:12px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      font-size:13px;
      background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.02)) !important;
      border:1px solid var(--cardBorder) !important;
      color: var(--text) !important;
      box-shadow: 0 10px 20px rgba(0,0,0,.22);
      position: relative;
      overflow: hidden;
    }
    .member:after{
      content:"";
      position:absolute;
      inset:-1px;
      background:
        radial-gradient(260px 60px at 10% 0%, rgba(255,122,24,.10), transparent 65%),
        radial-gradient(220px 55px at 90% 0%, rgba(255,42,42,.10), transparent 70%);
      pointer-events:none;
      opacity:.8;
    }

    .left { display:flex; flex-direction:column; gap:2px; min-width:0; position:relative; z-index:1; }
    .name { font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:58vw; color: var(--text) !important; }
    .sub { opacity:.82; font-size:11px; color: var(--text) !important; }
    .right { opacity:.96; font-size:12px; white-space:nowrap; color: var(--text) !important; position:relative; z-index:1; }

    .online{ border-left:4px solid var(--green) !important; }
    .idle{ border-left:4px solid var(--yellow) !important; }
    .offline{ border-left:4px solid var(--red) !important; box-shadow: var(--glowRed); }
    .hospital{ border-left:4px solid var(--violet) !important; }

    .hospTimer{
      font-weight: 900;
      letter-spacing: .4px;
      text-shadow: var(--glowEmber);
    }

    .section-empty { opacity:.85; font-size:12px; padding:8px 2px; color: var(--text) !important; }

    .err {
      margin-top:10px; padding:10px; border-radius:12px;
      background: var(--dangerBg) !important;
      border:1px solid var(--dangerBorder) !important;
      font-size:12px; white-space:pre-wrap;
      color: var(--text) !important;
      box-shadow: var(--glowRed);
    }

    .warbox {
      margin-top:10px; padding:10px; border-radius:14px;
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03)) !important;
      border:1px solid rgba(255,255,255,.10) !important;
      font-size:12px; line-height:1.35;
      color: var(--text) !important;
      box-shadow: var(--glowEmber);
    }
    .warrow { display:flex; justify-content:space-between; gap:10px; margin:3px 0; }
    .label { opacity:.8; color: var(--muted) !important; }

    /* ✅ Collapsible OFFLINE (details/summary) */
    .collapsible{
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.10) !important;
      background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02)) !important;
      box-shadow: 0 10px 20px rgba(0,0,0,.22);
      overflow:hidden;
      margin: 10px 0;
    }
    .collapsible summary{
      list-style:none;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      cursor:pointer;
      padding:10px 12px;
      font-weight: 950;
      letter-spacing: .7px;
      text-transform: uppercase;
      user-select:none;
    }
    .collapsible summary::-webkit-details-marker{ display:none; }
    .collapsible summary:after{
      content:"▾";
      opacity:.9;
      margin-left:8px;
    }
    .collapsible[open] summary:after{ content:"▴"; }
    .collapsible .body{ padding: 0 10px 10px; }

    /* ✅ actions + buttons */
    .actions{
      display:flex;
      align-items:center;
      gap:8px;
      justify-content:flex-end;
      position:relative;
      z-index:2;
      white-space:nowrap;
    }
    .abtn{
      cursor:pointer; user-select:none;
      padding:6px 10px; border-radius:12px;
      border:1px solid rgba(255,255,255,.14) !important;
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)) !important;
      font-size:12px; font-weight:950;
      color: var(--text) !important;
      text-decoration:none !important;
      box-shadow: 0 10px 18px rgba(0,0,0,.24);
      display:inline-flex;
      align-items:center;
      gap:6px;
    }
    .abtn:active{ transform: translateY(1px); }

    .abtn.attack{
      border-color: rgba(255,122,24,.45) !important;
      background: linear-gradient(180deg, rgba(255,122,24,.22), rgba(255,42,42,.10)) !important;
      box-shadow: var(--glowEmber);
    }

    .abtn.bounty{
      border-color: rgba(255,42,42,.40) !important;
      background: linear-gradient(180deg, rgba(255,42,42,.20), rgba(255,122,24,.10)) !important;
      box-shadow: var(--glowRed);
    }

    @media (max-width: 520px){
      .name{ max-width: 52vw; }
      .abtn{ padding:6px 9px; }
    }
  `);

  function ensureUI() {
    if (document.getElementById("wrath-shield")) return;

    const pos = loadPos();

    const shield = document.createElement("div");
    shield.id = "wrath-shield";
    shield.textContent = "🛡️";
    shield.title = "Drag or tap to open/close 7DS*: Wrath War Panel";
    shield.style.top = `${pos.top}px`;
    shield.style.left = `${pos.left}px`;

    const overlay = document.createElement("div");
    overlay.id = "wrath-overlay";
    overlay.innerHTML = `
      <div class="sigil"></div>

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
          <span class="btn" id="rt-open-app">Open App</span>
          <span class="btn" id="rt-refresh">Refresh</span>
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

      <!-- ✅ OFFLINE COLLAPSIBLE -->
      <details class="collapsible" id="rt-you-offline">
        <summary>
          <span>🔴 OFFLINE (30+ mins)</span>
          <span class="pill" id="rt-you-offline-count">0</span>
        </summary>
        <div class="body" id="rt-you-offline-list"></div>
      </details>

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

        <!-- ✅ ENEMY OFFLINE COLLAPSIBLE -->
        <details class="collapsible" id="rt-them-offline">
          <summary>
            <span>🔴 ENEMY OFFLINE (30+ mins)</span>
            <span class="pill" id="rt-them-offline-count">0</span>
          </summary>
          <div class="body" id="rt-them-offline-list"></div>
        </details>
      </div>
    `;

    document.body.appendChild(shield);
    document.body.appendChild(overlay);

    // ===== draggable logic (tap vs drag safe) =====
    let cachedId = null;
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0;
    let startTop = 0, startLeft = 0;

    function isOpen() { return overlay.style.display === "block"; }
    function openOverlay() {
      overlay.style.display = "block";
      cachedId = cachedId || detectTornId();
      syncOptUI(cachedId || "unknown");
      refreshState();
    }
    function closeOverlay() { overlay.style.display = "none"; }
    function toggleOverlay() { isOpen() ? closeOverlay() : openOverlay(); }

    function getPoint(ev) {
      const t = ev.touches && ev.touches[0];
      return t ? { x: t.clientX, y: t.clientY } : { x: ev.clientX, y: ev.clientY };
    }

    function onDown(ev) {
      dragging = true;
      moved = false;

      const p = getPoint(ev);
      startX = p.x; startY = p.y;

      startTop = parseFloat(shield.style.top || "0");
      startLeft = parseFloat(shield.style.left || "0");

      shield.style.transition = "none";
      ev.preventDefault();
      ev.stopPropagation();
    }

    function onMove(ev) {
      if (!dragging) return;
      const p = getPoint(ev);
      const dx = p.x - startX;
      const dy = p.y - startY;

      // only treat as drag after a small threshold (so taps still click)
      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;

      if (moved) {
        const w = 48, h = 48;
        const maxLeft = window.innerWidth - w - 2;
        const maxTop = window.innerHeight - h - 2;

        const nextLeft = clamp(startLeft + dx, 2, maxLeft);
        const nextTop = clamp(startTop + dy, 2, maxTop);

        shield.style.left = `${nextLeft}px`;
        shield.style.top = `${nextTop}px`;
      }

      ev.preventDefault();
      ev.stopPropagation();
    }

    function onUp(ev) {
      if (!dragging) return;
      dragging = false;

      shield.style.transition = "";
      const top = parseFloat(shield.style.top || "0");
      const left = parseFloat(shield.style.left || "0");
      savePos(top, left);

      // if it wasn't dragged, treat as click -> toggle overlay
      if (!moved) toggleOverlay();

      ev.preventDefault();
      ev.stopPropagation();
    }

    // pointer events (best) + touch fallback
    shield.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);

    shield.addEventListener("touchstart", onDown, { passive: false, capture: true });
    window.addEventListener("touchmove", onMove, { passive: false, capture: true });
    window.addEventListener("touchend", onUp, { passive: false, capture: true });

    // ===== buttons =====
    document.getElementById("rt-refresh").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      cachedId = cachedId || detectTornId();
      syncOptUI(cachedId || "unknown");
      await refreshState();
    }, true);

    document.getElementById("rt-open-app").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      cachedId = cachedId || (await ensureIdOrWarn());
      openAppPanelWithId(cachedId);
    }, true);

    document.getElementById("rt-opt").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      cachedId = cachedId || (await ensureIdOrWarn());
      if (!cachedId) return;

      const next = !getLocalAvail(cachedId);
      setLocalAvail(cachedId, next);
      syncOptUI(cachedId);

      const nm = detectPlayerName();
      const res = await postAvailability(cachedId, next, nm);

      if (!res.ok) {
        setLocalAvail(cachedId, !next);
        syncOptUI(cachedId);
        const err = document.getElementById("rt-error");
        if (err) {
          err.style.display = "block";
          err.textContent =
            "Failed to update OPT\n" +
            (typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2));
        }
      } else {
        await refreshState();
      }
    }, true);

    // auto refresh while open
    setInterval(() => {
      if (overlay.style.display === "block") {
        refreshState();
        tickHospitalTimers();
      }
    }, REFRESH_MS);

    // 1s hospital countdown tick while open
    setInterval(() => {
      if (overlay.style.display === "block") tickHospitalTimers();
    }, 1000);
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
