// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️ (Wrath Theme + Collapsible + Draggable) [SCOPED FIX + MED DEALS + LOCAL YES/NO + CHAIN SITTERS]
// @namespace    7ds-wrath-warbot
// @version      7.7.3
// @description  Wrath-themed shield overlay matching app.py. Uses /state (CSP-proof). Shield draggable + tap to open/close. ✅ YES/NO is LOCAL only (stays checked, NOT tied to server). 🔗 Chain Sitters section shows REAL Opt In/Out (server, self-only). 💊 Med Deals delete removes instantly from screen + updates count, then deletes on server (DELETE BODY to avoid 405).
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
  const API_DEALS = `${BASE_URL}/api/med_deals`;

  const AVAIL_TOKEN = "666";

  const SHIELD_TOP_DEFAULT = 110;
  const SHIELD_RIGHT_DEFAULT = 12;
  const REFRESH_MS = 8000;

  // blocks refresh while posting/deleting so UI doesn’t “pop back”
  let WRATH_BUSY = false;

  // ===== local YES/NO storage =====
  const LOCAL_PREFIX = "wrath_local_yesno_v1_"; // + memberId -> "yes"|"no"|""
  function getLocalChoice(memberId) {
    return (GM_getValue(LOCAL_PREFIX + String(memberId || ""), "") || "").toString();
  }
  function setLocalChoice(memberId, choice) {
    GM_setValue(LOCAL_PREFIX + String(memberId || ""), choice || "");
  }

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

  function httpJson(method, url, bodyObj, extraHeaders = {}) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders),
        data: bodyObj ? JSON.stringify(bodyObj) : null,
        onload: (r) => {
          let body = r.responseText;
          try { body = JSON.parse(body || "{}"); } catch {}
          resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, body });
        },
        onerror: () => resolve({ ok: false, status: 0, body: "network error" })
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

  // 🔗 CHAIN SITTER Opt In/Out (server)
  function postAvailability(tornId, available, requesterId) {
    return httpJson(
      "POST",
      API_AVAIL + `?token=${encodeURIComponent(AVAIL_TOKEN)}`,
      { torn_id: String(tornId || ""), available: !!available, requester_id: String(requesterId || "") },
      { "X-Token": AVAIL_TOKEN, "X-Requester-Id": String(requesterId || "") }
    );
  }

  // 💊 Med Deals API
  function postMedDeal(payload) {
    return httpJson(
      "POST",
      API_DEALS + `?token=${encodeURIComponent(AVAIL_TOKEN)}`,
      payload,
      { "X-Token": AVAIL_TOKEN }
    );
  }

  // ✅ DELETE BODY (avoids 405 on /api/med_deals/<id>)
  function deleteMedDeal(dealId, requesterId) {
    return httpJson(
      "DELETE",
      `${API_DEALS}?token=${encodeURIComponent(AVAIL_TOKEN)}`,
      { id: String(dealId), requester_id: String(requesterId || "") },
      { "X-Token": AVAIL_TOKEN, "X-Requester-Id": String(requesterId || "") }
    );
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
      el.style.opacity = (left <= 0) ? "0.85" : "1";
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
    return `https://www.torn.com/bounties.php?p=add&XID=${encodeURIComponent(String(id || ""))}`;
  }

  function memberHTML(r, st, mode) {
    const name = esc(r.name || r.id || "Unknown");
    const id = esc(r.id || "");

    const right = st === "hospital"
      ? `<span class="hospTimer" data-until="${esc(r.hospital_until ?? "")}">—</span>`
      : esc(fmtMins(r.minutes));

    if (mode === "you") {
      const choice = getLocalChoice(r.id);
      const yesOn = choice === "yes" ? " on" : "";
      const noOn  = choice === "no"  ? " on" : "";

      return `
        <div class="member ${st}">
          <div class="left">
            <div class="name">${name}</div>
            <div class="sub">ID: ${id}</div>
          </div>
          <div class="actions">
            <div class="right">${right}</div>

            <span class="abtn yes${yesOn}" data-local="yes" data-local-id="${esc(r.id)}">
              <span class="ck" aria-hidden="true"></span>
              <span class="lbl">YES</span>
            </span>

            <span class="abtn no${noOn}" data-local="no" data-local-id="${esc(r.id)}">
              <span class="ck" aria-hidden="true"></span>
              <span class="lbl">NO</span>
            </span>

            <a class="abtn bounty" href="${bountyUrlFor(r.id)}" target="_blank" rel="noopener noreferrer">🎯</a>
          </div>
        </div>
      `;
    }

    return `
      <div class="member ${st}">
        <div class="left">
          <div class="name">${name}</div>
          <div class="sub">ID: ${id}</div>
        </div>
        <div class="actions">
          <div class="right">${right}</div>
          <a class="abtn attack" href="${attackUrlFor(r.id)}" target="_blank" rel="noopener noreferrer">⚔️</a>
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

  function buildEnemyMemberOptions(state) {
    return ((state.enemy || {}).rows || [])
      .filter(r => r && r.id && r.name)
      .map(r => ({ id: String(r.id), name: String(r.name) }))
      .sort((a,b) => a.name.localeCompare(b.name));
  }

  function buildMemberOptions(state) {
    return (state.rows || [])
      .filter(r => r && r.id && r.name)
      .map(r => ({ id: String(r.id), name: String(r.name) }))
      .sort((a,b) => a.name.localeCompare(b.name));
  }

  function setSelectOptions(selectEl, items, placeholderText) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholderText || "Select…";
    selectEl.appendChild(ph);

    for (const it of items) {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = `${it.name} (${it.id})`;
      selectEl.appendChild(opt);
    }
  }

  function renderDeals(state) {
    const list = document.getElementById("rt-deals-list");
    const count = document.getElementById("rt-deals-count");
    if (!list || !count) return;

    window.__wrath_last_state = state;

    const enemySel = document.getElementById("deal-enemy-member");
    const memberSel = document.getElementById("deal-member");

    const enemyOptions = buildEnemyMemberOptions(state);
    const memberOptions = buildMemberOptions(state);

    const prevEnemy = enemySel ? enemySel.value : "";
    const prevMember = memberSel ? memberSel.value : "";

    setSelectOptions(enemySel, enemyOptions, "Enemy member…");
    setSelectOptions(memberSel, memberOptions, "Our member…");

    if (enemySel && prevEnemy && enemyOptions.some(m => m.id === prevEnemy)) enemySel.value = prevEnemy;
    if (memberSel && prevMember && memberOptions.some(m => m.id === prevMember)) memberSel.value = prevMember;

    const deals = (state.med_deals || []);
    count.textContent = String(deals.length);

    if (!deals.length) {
      list.innerHTML = `<div class="section-empty">No deals logged yet.</div>`;
      return;
    }

    const myId = detectTornId() || "";
    list.innerHTML = "";

    for (const d of deals) {
      const canDel = myId && String(d.reporter_id || "") === String(myId);

      const enemyFaction = esc(d.enemy_faction || (state.war && state.war.opponent) || "—");
      const enemyMember = (d.enemy_player_name || d.enemy_player_id)
        ? `${esc(d.enemy_player_name || "—")}${d.enemy_player_id ? ` (${esc(d.enemy_player_id)})` : ""}`
        : "—";
      const ourMember = (d.member_name || d.member_id)
        ? `${esc(d.member_name || "—")}${d.member_id ? ` (${esc(d.member_id)})` : ""}`
        : "—";
      const notes = d.notes ? esc(d.notes) : "";

      list.insertAdjacentHTML("beforeend", `
        <div class="dealCard" data-deal-id="${esc(d.id)}">
          <div class="dealRow"><div class="dealLabel">Enemy Faction</div><div class="dealStrong">${enemyFaction}</div></div>
          <div class="dealRow"><div class="dealLabel">Enemy Member</div><div class="dealStrong">${enemyMember}</div></div>
          <div class="dealRow"><div class="dealLabel">Our Member</div><div class="dealStrong">${ourMember}</div></div>
          ${notes ? `<div class="dealRow"><div class="dealLabel">Notes</div><div class="dealStrong">${notes}</div></div>` : ""}
          <div class="dealRow"><div class="dealLabel">Posted</div><div class="dealStrong">${esc(d.created_at || "—")}</div></div>
          <div class="dealActions" style="margin-top:8px; display:flex; justify-content:flex-end;">
            ${canDel ? `<span class="abtn dealDel" data-deal-del="${esc(d.id)}">🗑</span>` : ``}
          </div>
        </div>
      `);
    }
  }

  // ✅ Chain sitters from /state.chain_sitters if present; fallback to opted-in rows.available
  function buildChainSittersFromState(state) {
    if (Array.isArray(state.chain_sitters) && state.chain_sitters.length) {
      return state.chain_sitters
        .map(m => ({
          id: String(m.id),
          name: String(m.name || m.id),
          status: String(m.status || "offline"),
          available: true
        }))
        .sort((a,b) => a.name.localeCompare(b.name));
    }

    return (state.rows || [])
      .filter(r => r && r.id && !!r.available)
      .map(r => ({
        id: String(r.id),
        name: String(r.name || r.id),
        status: String(r.status || "offline"),
        available: true,
      }))
      .sort((a,b) => a.name.localeCompare(b.name));
  }

  function renderChainSitters(state) {
    const list = document.getElementById("rt-chain-list");
    const count = document.getElementById("rt-chain-count");
    if (!list || !count) return;

    const cs = buildChainSittersFromState(state);
    count.textContent = String(cs.length);

    if (!cs.length) {
      list.innerHTML = `<div class="section-empty">No one opted in yet.</div>`;
      return;
    }

    list.innerHTML = "";
    for (const m of cs) {
      const mid = String(m.id || "");
      const nm = esc(m.name || mid || "—");
      list.insertAdjacentHTML("beforeend", `
        <div class="member ${m.status || "offline"}">
          <div class="left">
            <div class="name">${nm}</div>
            <div class="sub">ID: ${esc(mid)}</div>
          </div>
          <div class="actions">
            <span class="abtn chain on" title="Opted In">✅</span>
          </div>
        </div>
      `);
    }
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

    renderChainSitters(state);
    renderDeals(state);

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

    tickHospitalTimers();
  }

  // ✅ SCOPED CSS ONLY
  GM_addStyle(`
    #wrath-overlay, #wrath-overlay * { pointer-events: auto !important; }

    #wrath-overlay, #wrath-shield{
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
      position:fixed; z-index:2147483647;
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
      touch-action:none;
    }

    #wrath-overlay{
      position:fixed; inset:0; z-index:2147483646; display:none;
      background:
        radial-gradient(1200px 700px at 18% 10%, rgba(255,42,42,.10), transparent 55%),
        radial-gradient(900px 600px at 82% 0%, rgba(255,122,24,.08), transparent 60%),
        linear-gradient(180deg, var(--bg0), var(--bg1)) !important;
      color: var(--text) !important;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      overflow-y:auto;
      padding:10px;
      -webkit-text-size-adjust:100%;
    }
    #wrath-overlay * { color: inherit !important; }

    #wrath-overlay .sigil{ height:10px; border-radius:999px;
      background: linear-gradient(90deg, transparent, rgba(255,42,42,.55), rgba(255,122,24,.45), transparent) !important;
      opacity:.9; margin-bottom:10px; position:relative; overflow:hidden;
      border:1px solid rgba(255,255,255,.06) !important; box-shadow: var(--glowRed); }

    #wrath-overlay .topbar { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
    #wrath-overlay .title { font-weight:950; letter-spacing:1.1px; font-size:16px; color:var(--gold) !important; text-transform:uppercase; text-shadow:var(--glowEmber); }
    #wrath-overlay .meta { font-size:12px; opacity:.96; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

    #wrath-overlay .pill { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px;
      background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.04)) !important;
      border:1px solid rgba(255,255,255,.10) !important; font-size:12px; white-space:nowrap; }

    #wrath-overlay .btn { cursor:pointer; user-select:none; padding:6px 10px; border-radius:999px;
      background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.04)) !important;
      border:1px solid rgba(255,255,255,.12) !important; font-size:12px; white-space:nowrap; box-shadow:0 8px 18px rgba(0,0,0,.30); }
    #wrath-overlay .btn:active { transform: translateY(1px); }

    #wrath-overlay h2 { margin:12px 0 6px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,.10) !important;
      font-size:13px; letter-spacing:.7px; text-transform:uppercase; opacity:.95;
      display:flex; justify-content:space-between; align-items:center; gap:10px; }

    #wrath-overlay details.collapsible { border:1px solid rgba(255,255,255,.10) !important; border-radius:14px; overflow:hidden; margin:10px 0; }
    #wrath-overlay details.collapsible > summary { cursor:pointer; user-select:none; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px;
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)) !important; font-weight:950; letter-spacing:.7px; text-transform:uppercase; }
    #wrath-overlay details.collapsible > summary::-webkit-details-marker { display:none; }
    #wrath-overlay details.collapsible .body { padding:10px 10px 12px; }

    #wrath-overlay .member{ padding:9px 10px; margin:6px 0; border-radius:12px; display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:13px;
      background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.02)) !important;
      border:1px solid var(--cardBorder) !important; box-shadow: 0 10px 20px rgba(0,0,0,.22); position:relative; overflow:hidden; }

    #wrath-overlay .left{ display:flex; flex-direction:column; gap:2px; min-width:0; position:relative; z-index:1; }
    /* ✅ more room for names */
    #wrath-overlay .name{ font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:66vw; }
    #wrath-overlay .sub{ opacity:.82; font-size:11px; }

    /* ✅ tighter action spacing */
    #wrath-overlay .actions{ display:flex; align-items:center; gap:6px; justify-content:flex-end; position:relative; z-index:2; white-space:nowrap; }

    /* ✅ SMALLER MEMBER BUTTONS */
    #wrath-overlay .abtn{ cursor:pointer; user-select:none; padding:5px 8px; border-radius:10px;
      border:1px solid rgba(255,255,255,.14) !important;
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)) !important;
      font-size:11px; font-weight:950; text-decoration:none !important; box-shadow:0 10px 18px rgba(0,0,0,.24);
      display:inline-flex; align-items:center; gap:5px; line-height:1; }
    #wrath-overlay .abtn:active{ transform: translateY(1px); }

    #wrath-overlay .ck{
      width:12px; height:12px; border-radius:4px;
      border:1px solid rgba(255,255,255,.28) !important;
      background: rgba(0,0,0,.18) !important;
      display:inline-grid; place-items:center;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.25);
      flex: 0 0 auto;
    }
    #wrath-overlay .ck:after{
      content:"";
      width:7px; height:4px;
      border-left:2px solid transparent;
      border-bottom:2px solid transparent;
      transform: rotate(-45deg);
      opacity:0;
    }

    #wrath-overlay .abtn.yes{ border-color: rgba(0,255,102,.22) !important; }
    #wrath-overlay .abtn.no{  border-color: rgba(255,51,51,.22) !important; }

    #wrath-overlay .abtn.yes.on{ border-color: rgba(0,255,102,.55) !important; box-shadow: 0 0 18px rgba(0,255,102,.14); filter:brightness(1.08); }
    #wrath-overlay .abtn.no.on{  border-color: rgba(255,51,51,.55) !important; box-shadow: 0 0 18px rgba(255,51,51,.14); filter:brightness(1.08); }

    #wrath-overlay .abtn.yes.on .ck{ border-color: rgba(0,255,102,.55) !important; box-shadow: 0 0 14px rgba(0,255,102,.12); }
    #wrath-overlay .abtn.yes.on .ck:after{ border-left-color: rgba(0,255,102,.95) !important; border-bottom-color: rgba(0,255,102,.95) !important; opacity:1; }

    #wrath-overlay .abtn.no.on .ck{ border-color: rgba(255,51,51,.55) !important; box-shadow: 0 0 14px rgba(255,51,51,.12); }
    #wrath-overlay .abtn.no.on .ck:after{ border-left-color: rgba(255,51,51,.95) !important; border-bottom-color: rgba(255,51,51,.95) !important; opacity:1; }

    #wrath-overlay .abtn.attack{ border-color: rgba(255,122,24,.45) !important; }
    #wrath-overlay .abtn.bounty{ border-color: rgba(255,42,42,.40) !important; }

    #wrath-overlay .abtn.chain{ border-color: rgba(255,210,74,.45) !important; }
    #wrath-overlay .abtn.chain.on{ border-color: rgba(0,255,102,.55) !important; box-shadow: 0 0 16px rgba(0,255,102,.12); }

    #wrath-overlay .dealCard{ padding:10px; margin:6px 0; border-radius:14px; border:1px solid rgba(255,255,255,.08) !important;
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)) !important;
      box-shadow:0 10px 20px rgba(0,0,0,.20); font-size:12px; }
    #wrath-overlay .dealRow{ display:flex; justify-content:space-between; gap:10px; margin:4px 0; }
    #wrath-overlay .dealLabel{ opacity:.75; }
    #wrath-overlay .dealStrong{ font-weight:950; text-align:right; }

    #wrath-overlay .dealForm{ margin-top:10px; padding:10px; border-radius:14px; border:1px solid rgba(255,255,255,.08) !important;
      background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02)) !important; }
    #wrath-overlay .dealGrid{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    #wrath-overlay .dealGrid textarea, #wrath-overlay .dealGrid select{
      width:100%; box-sizing:border-box; padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,.12) !important;
      background: rgba(0,0,0,.25) !important; outline:none; font-size:12px; }
    #wrath-overlay .dealGrid textarea{ grid-column:1 / -1; min-height:70px; resize:vertical; }

    #wrath-overlay .section-empty{ opacity:.85; font-size:12px; padding:8px 2px; }

    #wrath-overlay .divider{ margin:12px 0; height:1px; background: rgba(255,255,255,.10); opacity:.35; }

    #wrath-overlay .section-title{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin:10px 0 6px; font-weight:950; letter-spacing:.8px; text-transform:uppercase; color:var(--gold) !important; text-shadow:var(--glowEmber); }
    #wrath-overlay .section-title .small{ font-size:12px; font-weight:700; opacity:.9; color:var(--text) !important; text-shadow:none; }

    #wrath-overlay .err{ margin-top:10px; padding:10px; border-radius:12px; background: var(--dangerBg) !important;
      border:1px solid var(--dangerBorder) !important; font-size:12px; white-space:pre-wrap; }

    #wrath-overlay .warbox{ margin-top:10px; padding:10px; border-radius:14px; border:1px solid rgba(255,255,255,.10) !important;
      background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02)) !important; font-size:12px; }

    #wrath-overlay .warrow{ display:flex; justify-content:space-between; gap:10px; margin:3px 0; }
    #wrath-overlay .label{ opacity:.8; }

    @media (max-width:520px){
      #wrath-overlay .name{ max-width:64vw; }
      #wrath-overlay .abtn{ padding:5px 7px; font-size:10.5px; }
      #wrath-overlay .dealGrid{ grid-template-columns:1fr; }
      #wrath-overlay .actions{ gap:5px; }
    }
  `);

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

  function ensureUI() {
    if (!document.body) return;
    if (document.getElementById("wrath-shield")) return;

    const pos = (function loadPos() {
      const p = GM_getValue("wrath_shield_pos_v1", null);
      if (p && typeof p === "object" && p.top != null && p.left != null) return p;
      const left = Math.max(2, window.innerWidth - 48 - SHIELD_RIGHT_DEFAULT);
      return { top: SHIELD_TOP_DEFAULT, left };
    })();

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

          <span class="btn" id="rt-open-app">Open App</span>
          <span class="btn" id="rt-refresh">Refresh</span>
        </div>
      </div>

      <div id="rt-error" class="err" style="display:none;"></div>
      <div id="rt-war" class="warbox" style="display:none;"></div>

      <details class="collapsible" id="rt-chain" open>
        <summary><span>🔗 CHAIN SITTERS (OPTED IN)</span><span class="pill" id="rt-chain-count">0</span></summary>
        <div class="body">
          <div class="section-empty" style="margin-bottom:6px;">Shows opted-in members.</div>
          <div id="rt-chain-list"></div>
        </div>
      </details>

      <details class="collapsible" id="rt-deals" open>
        <summary><span>💊 MED DEALS</span><span class="pill" id="rt-deals-count">0</span></summary>
        <div class="body">
          <div id="rt-deals-list"></div>

          <div class="dealForm">
            <div class="dealGrid">
              <select id="deal-enemy-member"><option value="">Enemy member…</option></select>
              <select id="deal-member"><option value="">Our member…</option></select>
              <textarea id="deal-notes" placeholder="Notes (optional) — terms, delivery, etc."></textarea>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
              <span class="abtn" id="deal-submit">✅</span>
            </div>
          </div>
        </div>
      </details>

      <div class="section-title"><div>🛡️ YOUR FACTION</div><div class="small" id="rt-you-title">—</div></div>

      <h2>🟢 ONLINE (0–20 mins) <span class="pill" id="rt-you-online-count">0</span></h2>
      <div id="rt-you-online"></div>

      <h2>🟡 IDLE (20–30 mins) <span class="pill" id="rt-you-idle-count">0</span></h2>
      <div id="rt-you-idle"></div>

      <h2>🏥 HOSPITAL <span class="pill" id="rt-you-hosp-count">0</span></h2>
      <div id="rt-you-hosp"></div>

      <details class="collapsible" id="rt-you-offline">
        <summary><span>🔴 OFFLINE (30+ mins)</span><span class="pill" id="rt-you-offline-count">0</span></summary>
        <div class="body" id="rt-you-offline-list"></div>
      </details>

      <div class="divider"></div>

      <div class="section-title"><div>🎯 ENEMY FACTION</div><div class="small" id="rt-them-title">Waiting for opponent id…</div></div>
      <div id="rt-enemy-wrap" style="display:none;">
        <h2>🟢 ENEMY ONLINE <span class="pill" id="rt-them-online-count">0</span></h2>
        <div id="rt-them-online"></div>

        <h2>🟡 ENEMY IDLE <span class="pill" id="rt-them-idle-count">0</span></h2>
        <div id="rt-them-idle"></div>

        <h2>🏥 ENEMY HOSPITAL <span class="pill" id="rt-them-hosp-count">0</span></h2>
        <div id="rt-them-hosp"></div>

        <details class="collapsible" id="rt-them-offline">
          <summary><span>🔴 ENEMY OFFLINE (30+ mins)</span><span class="pill" id="rt-them-offline-count">0</span></summary>
          <div class="body" id="rt-them-offline-list"></div>
        </details>
      </div>
    `;

    document.body.appendChild(shield);
    document.body.appendChild(overlay);

    // ===== draggable logic =====
    let dragging = false, moved = false;
    let startX = 0, startY = 0, startTop = 0, startLeft = 0;

    function isOpen() { return overlay.style.display === "block"; }
    function openOverlay() { overlay.style.display = "block"; refreshState(); }
    function closeOverlay() { overlay.style.display = "none"; }
    function toggleOverlay() { isOpen() ? closeOverlay() : openOverlay(); }

    function getPoint(ev) {
      const t = ev.touches && ev.touches[0];
      return t ? { x: t.clientX, y: t.clientY } : { x: ev.clientX, y: ev.clientY };
    }

    function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }
    function savePos(top, left) { GM_setValue("wrath_shield_pos_v1", { top, left }); }

    function onDown(ev) {
      dragging = true; moved = false;
      const p = getPoint(ev);
      startX = p.x; startY = p.y;
      startTop = parseFloat(shield.style.top || "0");
      startLeft = parseFloat(shield.style.left || "0");
      shield.style.transition = "none";
      ev.preventDefault(); ev.stopPropagation();
    }

    function onMove(ev) {
      if (!dragging) return;
      const p = getPoint(ev);
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
      if (moved) {
        const w = 48, h = 48;
        const maxLeft = window.innerWidth - w - 2;
        const maxTop = window.innerHeight - h - 2;
        shield.style.left = `${clamp(startLeft + dx, 2, maxLeft)}px`;
        shield.style.top  = `${clamp(startTop + dy, 2, maxTop)}px`;
      }
      ev.preventDefault(); ev.stopPropagation();
    }

    function onUp(ev) {
      if (!dragging) return;
      dragging = false;
      shield.style.transition = "";
      savePos(parseFloat(shield.style.top || "0"), parseFloat(shield.style.left || "0"));
      if (!moved) toggleOverlay();
      ev.preventDefault(); ev.stopPropagation();
    }

    shield.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);

    // ===== buttons =====
    document.getElementById("rt-refresh").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      await refreshState();
    }, true);

    document.getElementById("rt-open-app").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const tid = detectTornId();
      openAppPanelWithId(tid);
    }, true);

    // ✅ LOCAL YES/NO (stays checked, NOT connected to server)
    overlay.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const btn = target.closest("[data-local][data-local-id]");
      if (!btn) return;

      e.preventDefault(); e.stopPropagation();

      const memberId = btn.getAttribute("data-local-id");
      const which = btn.getAttribute("data-local"); // "yes" or "no"

      const row = btn.closest(".member");
      if (!row) return;

      const yesBtn = row.querySelector('[data-local="yes"][data-local-id]');
      const noBtn  = row.querySelector('[data-local="no"][data-local-id]');

      if (which === "yes") {
        setLocalChoice(memberId, "yes");
        if (yesBtn) yesBtn.classList.add("on");
        if (noBtn)  noBtn.classList.remove("on");
      } else {
        setLocalChoice(memberId, "no");
        if (noBtn)  noBtn.classList.add("on");
        if (yesBtn) yesBtn.classList.remove("on");
      }
    }, true);

    // 💊 Post deal
    document.getElementById("deal-submit").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();

      const cachedId = detectTornId();
      if (!cachedId) return;

      const reporterName = detectPlayerName();
      const state = window.__wrath_last_state || null;

      const enemyId = (document.getElementById("deal-enemy-member").value || "").trim();
      const memberId = (document.getElementById("deal-member").value || "").trim();
      const notes = (document.getElementById("deal-notes").value || "").trim();

      const err = document.getElementById("rt-error");
      if (!enemyId) { err.style.display="block"; err.textContent="Med Deals: Select an enemy member."; return; }
      if (!memberId) { err.style.display="block"; err.textContent="Med Deals: Select our member."; return; }

      const enemyOpt = document.querySelector(`#deal-enemy-member option[value="${CSS.escape(enemyId)}"]`);
      const enemyName = enemyOpt ? enemyOpt.textContent.replace(/\s*\(\d+\)\s*$/, "").trim() : "";

      const memberOpt = document.querySelector(`#deal-member option[value="${CSS.escape(memberId)}"]`);
      const memberName = memberOpt ? memberOpt.textContent.replace(/\s*\(\d+\)\s*$/, "").trim() : "";

      let enemyFaction = null;
      try {
        const ef = ((state || {}).enemy || {}).faction || {};
        if (ef && ef.name) enemyFaction = ef.id ? `${ef.name} (${ef.id})` : `${ef.name}`;
      } catch (_) {}

      const payload = {
        reporter_id: String(cachedId),
        reporter_name: reporterName || "",
        enemy_player_id: String(enemyId),
        enemy_player_name: enemyName || "",
        member_id: String(memberId),
        member_name: memberName || "",
        enemy_faction: enemyFaction,
        notes: notes || null,
      };

      WRATH_BUSY = true;
      const res = await postMedDeal(payload);
      WRATH_BUSY = false;

      if (!res.ok) {
        err.style.display = "block";
        err.textContent =
          "Failed to post deal\n" +
          (typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2));
        return;
      }

      document.getElementById("deal-notes").value = "";
      await refreshState();
    }, true);

    // 💊 Deal Done delete (✅ instant UI remove + count update, then server delete)
    overlay.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const btn = target.closest("[data-deal-del]");
      if (!btn) return;

      const dealId = btn.getAttribute("data-deal-del");
      if (!dealId) return;

      e.preventDefault(); e.stopPropagation();

      const requesterId = detectTornId();
      if (!requesterId) return;

      const err = document.getElementById("rt-error");
      if (err) { err.style.display = "none"; err.textContent = ""; }

      WRATH_BUSY = true;

      // ✅ remove from cached state first so it can’t re-render
      try {
        const st = window.__wrath_last_state;
        if (st && Array.isArray(st.med_deals)) {
          st.med_deals = st.med_deals.filter(d => String(d.id) !== String(dealId));
        }
      } catch (_) {}

      // ✅ INSTANT UI REMOVE
      const card = btn.closest(".dealCard");
      if (card) card.remove();

      // ✅ update count + empty text immediately
      const list = document.getElementById("rt-deals-list");
      const countEl = document.getElementById("rt-deals-count");
      if (list && countEl) {
        const remaining = list.querySelectorAll(".dealCard").length;
        countEl.textContent = String(remaining);
        if (remaining === 0) {
          list.innerHTML = `<div class="section-empty">No deals logged yet.</div>`;
        }
      }

      // ✅ SERVER DELETE (DELETE BODY)
      const res = await deleteMedDeal(dealId, requesterId);
      WRATH_BUSY = false;

      if (!res.ok) {
        if (err) {
          err.style.display = "block";
          err.textContent =
            "Failed to delete deal (restoring list)\n" +
            (typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2));
        }
        await refreshState();
        return;
      }

      await refreshState();
    }, true);

    // auto refresh while open (skip while busy)
    setInterval(() => {
      if (WRATH_BUSY) return;
      if (overlay.style.display === "block") {
        refreshState();
        tickHospitalTimers();
      }
    }, REFRESH_MS);

    setInterval(() => {
      if (WRATH_BUSY) return;
      if (overlay.style.display === "block") tickHospitalTimers();
    }, 1000);
  }

  ensureUI();
  let tries = 0;
  const t = setInterval(() => {
    ensureUI();
    tries++;
    if (tries >= 20) clearInterval(t);
  }, 700);

})();
