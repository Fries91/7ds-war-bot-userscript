// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️ (Lite Mode - NO iframe)
// @namespace    https://github.com/Fries91/7ds-war-bot-userscript
// @version      2.4.2
// @description  Draggable shield + Lite overlay renders /state (NO iframe) + Opt button in Opt column for YOUR row
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      torn-war-bot.onrender.com
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ORIGIN = 'https://torn-war-bot.onrender.com';
  const STATE_URL    = PANEL_ORIGIN + '/state';
  const API_URL      = PANEL_ORIGIN + '/api/availability';

  const CHAIN_SITTER_IDS = ['1234'];
  const AVAIL_TOKEN = '';

  const DEFAULT_TOP = 110;
  const DEFAULT_RIGHT = 12;
  const POS_KEY = 'warbot_shield_pos_lite_v1';

  // ===== storage =====
  function getStored(key, fallback = '') {
    try { return GM_getValue(key, fallback); }
    catch (e) { return localStorage.getItem(key) || fallback; }
  }
  function setStored(key, val) {
    try { GM_setValue(key, val); }
    catch (e) { localStorage.setItem(key, val); }
  }

  function isChainSitter(id) {
    return CHAIN_SITTER_IDS.includes(String(id || '').trim());
  }

  // ========= identity (no prompts) =========
  function getMyIdentity() {
    let tornId = (getStored('warbot_torn_id', '') || '').trim();
    let name   = (getStored('warbot_name', '') || '').trim();

    try {
      if (!tornId && window.user && (window.user.player_id || window.user.ID)) {
        tornId = String(window.user.player_id || window.user.ID);
      }
    } catch (e) {}

    if (tornId) setStored('warbot_torn_id', tornId);
    if (name) setStored('warbot_name', name);

    return { tornId: tornId || '', name: name || '' };
  }

  // ===== HTTP (CORS-safe) =====
  function httpJSON(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = opts.headers || {};
    const body = opts.body || null;

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: body,
        timeout: 15000,
        onload: (res) => {
          try {
            const txt = res.responseText || '';
            const json = JSON.parse(txt);
            resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, json });
          } catch (e) {
            reject(e);
          }
        },
        onerror: (e) => reject(e),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }

  // ===== Opt In/Out =====
  async function postAvailability(state) {
    const { tornId, name } = getMyIdentity();
    if (!tornId) { alert('Could not detect your Torn ID here.'); return false; }
    if (!isChainSitter(tornId)) { alert('Opt In/Out is for CHAIN SITTERS only.'); return false; }

    const payload = JSON.stringify({ torn_id: tornId, name: name, available: !!state });
    const headers = { 'Content-Type': 'application/json' };
    if (AVAIL_TOKEN) headers['X-Avail-Token'] = AVAIL_TOKEN;

    try {
      const res = await httpJSON(API_URL, { method: 'POST', headers, body: payload });
      if (!res.ok) {
        alert((res.json && res.json.error) || 'Server error');
        return false;
      }
      setStored('warbot_opt_state', state ? '1' : '0');
      return true;
    } catch (e) {
      alert('Request failed (network / blocked).');
      return false;
    }
  }

  // ===== UI helpers =====
  function css(el, style) { el.style.cssText = style; return el; }
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function fmtDur(sec){
    sec = Math.max(0, Math.floor(sec || 0));
    const d = Math.floor(sec / 86400); sec %= 86400;
    const h = Math.floor(sec / 3600);  sec %= 3600;
    const m = Math.floor(sec / 60);    sec %= 60;
    const parts = [];
    if (d) parts.push(d + "d");
    if (h) parts.push(h + "h");
    if (m) parts.push(m + "m");
    parts.push(sec + "s");
    return parts.join(" ");
  }
  function pct(n, d){
    n = Number(n); d = Number(d);
    if (!isFinite(n) || !isFinite(d) || d <= 0) return null;
    const p = Math.max(0, Math.min(100, (n / d) * 100));
    return Math.round(p);
  }

  function isHospital(r){
    return String(r?.status || '').toLowerCase().includes('hospital');
  }
  function parseDurationMinutes(txt){
    txt = String(txt || '').toLowerCase();
    let total = 0;
    const d = txt.match(/(\d+)\s*d/); if (d) total += parseInt(d[1],10) * 1440;
    const h = txt.match(/(\d+)\s*h/); if (h) total += parseInt(h[1],10) * 60;
    const m = txt.match(/(\d+)\s*m/); if (m) total += parseInt(m[1],10);
    const s = txt.match(/(\d+)\s*s/); if (s && total === 0) total += 1;
    return total > 0 ? total : null;
  }
  function hospitalMinutes(r){
    const st = String(r?.status || '').toLowerCase();
    if (!st.includes('hospital')) return null;
    const idx = st.indexOf('hospital');
    const tail = idx >= 0 ? st.slice(idx) : st;
    return parseDurationMinutes(tail) ?? parseDurationMinutes(st);
  }

  let latestState = null;
  let rowsFetchedAtMs = 0;

  function elapsedSeconds(){
    if (!rowsFetchedAtMs) return 0;
    return Math.max(0, (Date.now() - rowsFetchedAtMs) / 1000);
  }
  function liveMinutes(baseMinutes){
    const inc = elapsedSeconds() / 60.0;
    const v = (baseMinutes == null) ? 1000000000 : baseMinutes;
    if (v >= 1000000000) return v;
    return v + inc;
  }
  function bucketFromMinutes(mins){
    if (mins <= 20) return 'online';
    if (mins > 20 && mins <= 30) return 'idle';
    return 'offline';
  }
  function dotClass(kind){
    if (kind === 'online') return 'dot g';
    if (kind === 'idle') return 'dot y';
    return 'dot r';
  }

  // ===== draggable =====
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function loadPos() {
    try {
      const raw = getStored(POS_KEY, '');
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
      return p;
    } catch { return null; }
  }
  function savePos(x, y) { setStored(POS_KEY, JSON.stringify({ x, y })); }
  function applyPos(shield, x, y) {
    shield.style.left = `${x}px`;
    shield.style.top  = `${y}px`;
    shield.style.right = 'auto';
    shield.style.bottom = 'auto';
  }
  function makeDraggable(shield) {
    const st = { x: 0, y: 0, sx: 0, sy: 0, dragging: false, moved: false };

    function onDown(cx, cy){
      const r = shield.getBoundingClientRect();
      st.sx = r.left; st.sy = r.top;
      st.x = cx; st.y = cy;
      st.dragging = true; st.moved = false;
      shield.style.transition = 'none';
    }
    function onMove(cx, cy){
      if (!st.dragging) return;
      const dx = cx - st.x, dy = cy - st.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) st.moved = true;

      const r = shield.getBoundingClientRect();
      const maxX = window.innerWidth - r.width - 2;
      const maxY = window.innerHeight - r.height - 2;

      const nx = clamp(st.sx + dx, 2, maxX);
      const ny = clamp(st.sy + dy, 2, maxY);
      applyPos(shield, nx, ny);
    }
    function onUp(){
      if (!st.dragging) return;
      st.dragging = false;
      const r = shield.getBoundingClientRect();
      savePos(r.left, r.top);
      shield.style.transition = '';
    }

    shield.addEventListener('mousedown', (e)=>{
      if (e.button !== 0) return;
      e.preventDefault();
      onDown(e.clientX, e.clientY);
      const mm = (ev)=>{ ev.preventDefault(); onMove(ev.clientX, ev.clientY); };
      const mu = (ev)=>{
        ev.preventDefault();
        document.removeEventListener('mousemove', mm, true);
        document.removeEventListener('mouseup', mu, true);
        onUp();
      };
      document.addEventListener('mousemove', mm, true);
      document.addEventListener('mouseup', mu, true);
    }, true);

    shield.addEventListener('touchstart', (e)=>{
      if (!e.touches || !e.touches[0]) return;
      const t = e.touches[0];
      onDown(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive:false });

    shield.addEventListener('touchmove', (e)=>{
      if (!st.dragging || !e.touches || !e.touches[0]) return;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive:false });

    shield.addEventListener('touchend', (e)=>{ onUp(); e.preventDefault(); }, { passive:false });

    shield._warbotWasDragged = ()=>st.moved;
    shield._warbotResetDragged = ()=>{ st.moved = false; };
  }

  if (document.getElementById('warbot_shield')) return;

  function inject(){
    const shield = document.createElement('div');
    shield.id = 'warbot_shield';
    shield.textContent = '🛡️';
    css(shield, `
      position: fixed;
      z-index: 2147483647;
      width: 44px;
      height: 44px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:24px;
      cursor:pointer;
      background: rgba(21,21,33,0.95);
      border: 1px solid rgba(42,42,58,0.95);
      border-radius: 12px;
      color: #ffd86a;
      box-shadow: 0 10px 30px rgba(0,0,0,0.45);
      user-select:none;
      -webkit-user-select:none;
      touch-action:none;
    `);

    const saved = loadPos();
    if (saved) applyPos(shield, saved.x, saved.y);
    else {
      const approx = 44;
      const left = Math.max(2, window.innerWidth - approx - DEFAULT_RIGHT);
      applyPos(shield, left, DEFAULT_TOP);
      savePos(left, DEFAULT_TOP);
    }

    document.body.appendChild(shield);
    makeDraggable(shield);

    let overlay = null;
    let refreshTimer = null;
    let tickTimer = null;

    function openNewTab(){ window.open(PANEL_ORIGIN + '/', '_blank', 'noopener,noreferrer'); }

    function closeOverlay(){
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      if (overlay) { overlay.remove(); overlay = null; }
    }

    function bountyCell(x){
      const bid = x && x.torn_id != null ? String(x.torn_id) : '';
      if (!bid) return '—';
      const url = `https://www.torn.com/bounties.php?p=add&XID=${bid}`;
      return `<a class="bbtn" href="${url}" target="_blank" rel="noopener noreferrer">🎯 Bounty</a>`;
    }

    function openOverlay(){
      if (overlay) { closeOverlay(); return; }

      overlay = document.createElement('div');
      css(overlay, `
        position: fixed; inset:0;
        width:100vw; height:100vh;
        background: rgba(0,0,0,0.60);
        z-index:2147483646;
      `);

      const box = document.createElement('div');
      css(box, `
        position:absolute;
        top:60px;
        left:50%;
        transform: translateX(-50%);
        width: min(980px, 95vw);
        height: min(82vh, 900px);
        background:#0b0b0f;
        border:1px solid #2a2a3a;
        border-radius:14px;
        overflow:hidden;
        display:flex;
        flex-direction:column;
        box-shadow:0 20px 70px rgba(0,0,0,0.75);
        color:#fff;
        font-family: Arial, sans-serif;
      `);

      const bar = document.createElement('div');
      css(bar, `
        padding:12px;
        display:flex;
        gap:10px;
        align-items:center;
        background:#151521;
        border-bottom:1px solid #2a2a3a;
        font-weight:900;
      `);

      const { tornId } = getMyIdentity();
      const myId = tornId ? String(tornId) : '';
      const chainSitter = myId ? isChainSitter(myId) : false;

      const title = document.createElement('div');
      title.textContent = chainSitter ? '7DS War-Bot (Chain Sitter) (Lite)' : '7DS War-Bot (Lite)';
      title.style.flex = '1';
      bar.appendChild(title);

      const openBtn = document.createElement('button');
      openBtn.textContent = '↗ Open Panel';
      css(openBtn, `
        padding:10px 12px;
        background:#111;
        border:1px solid #333;
        border-radius:8px;
        color:#fff;
        font-weight:900;
        cursor:pointer;
      `);
      openBtn.onclick = openNewTab;
      bar.appendChild(openBtn);

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✖';
      css(closeBtn, `
        padding:10px;
        background:#111;
        border:1px solid #333;
        border-radius:8px;
        color:#fff;
        font-weight:900;
        cursor:pointer;
      `);
      closeBtn.onclick = closeOverlay;
      bar.appendChild(closeBtn);

      const body = document.createElement('div');
      css(body, `flex:1; overflow:auto; padding:12px;`);

      body.innerHTML = `
        <style>
          .card{ background:#151521; border:1px solid #2a2a3a; border-radius:12px; padding:12px; margin-bottom:10px; }
          .muted{ opacity:0.75; font-size:12px; }
          .pill{ display:inline-block; padding:2px 10px; border:1px solid #2a2a3a; border-radius:999px; font-size:12px; margin:3px 6px 3px 0; }
          .gold{ color:#ffd86a; }
          .err{ color:#ffb4b4; white-space: pre-wrap; }
          .grid{ display:flex; flex-wrap:wrap; gap:6px; }
          table{ width:100%; border-collapse: collapse; }
          th,td{ text-align:left; padding:8px; border-bottom:1px solid #2a2a3a; font-size:13px; vertical-align:middle; }
          th{ opacity:0.85; }
          .twoCol{ display:flex; gap:10px; flex-wrap:wrap; }
          .col{ flex:1 1 360px; min-width:320px; }
          .colTitle{ font-weight:900; margin:6px 0 8px; }
          .hospTitle{ color:#ffb4b4; }
          .namecell{ display:flex; align-items:center; }
          .dot{ display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:8px; }
          .g{ background:#3dff86; box-shadow:0 0 10px rgba(61,255,134,0.35); }
          .y{ background:#ffd86a; box-shadow:0 0 10px rgba(255,216,106,0.28); }
          .r{ background:#ff4b4b; box-shadow:0 0 10px rgba(255,75,75,0.28); }
          .tag{ font-size:11px; opacity:0.75; margin-left:8px; }
          .bbtn{
            display:inline-block; padding:6px 10px; border:1px solid #2a2a3a; border-radius:10px;
            background:#111; color:#ffd86a; font-weight:900; text-decoration:none; white-space:nowrap;
          }
          .optbtn{
            display:inline-block;
            padding:6px 10px;
            border-radius:10px;
            border:1px solid #2a2a3a;
            background:#111;
            color:#fff;
            font-weight:900;
            cursor:pointer;
            white-space:nowrap;
          }
          .optbtn.on{ border-color:#2fff88; box-shadow:0 0 16px rgba(47,255,136,0.35); }
          .optbtn.off{ border-color:#ff4b4b; box-shadow:0 0 16px rgba(255,75,75,0.25); }
          .optbtn:active{ transform: scale(0.98); }
        </style>

        <div class="card">
          <div style="font-weight:900; font-size:16px;"><span class="gold" id="wb_fac">War-Bot</span></div>
          <div class="muted" id="wb_upd">Updated: —</div>
          <div class="muted err" id="wb_err"></div>
        </div>

        <div class="card">
          <div class="grid">
            <div class="pill" id="wb_chain">Chain: —</div>
            <div class="pill" id="wb_war">War: —</div>
            <div class="pill" id="wb_score">Score: —</div>
            <div class="pill" id="wb_target">Target: —</div>
            <div class="pill" id="wb_prog">Progress: —</div>
            <div class="pill" id="wb_on">🟢 Online: —</div>
            <div class="pill" id="wb_idle">🟡 Idle: —</div>
            <div class="pill" id="wb_off">🔴 Offline: —</div>
            <div class="pill" id="wb_opt">Chain sitter opted-in: —</div>
          </div>
        </div>

        <div class="card">
          <div class="colTitle gold">🟢 Online (0–20m)</div>
          <div class="twoCol">
            <div class="col"><div class="colTitle">✅ OK</div>
              <table><thead><tr><th>Member</th><th>Lvl</th><th>Status</th><th>Opt</th><th>Bounty</th></tr></thead><tbody id="wb_on_ok"></tbody></table>
            </div>
            <div class="col"><div class="colTitle hospTitle">🏥 Hospital</div>
              <table><thead><tr><th>Member</th><th>Lvl</th><th>Hosp time</th><th>Status</th><th>Opt</th><th>Bounty</th></tr></thead><tbody id="wb_on_h"></tbody></table>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="colTitle gold">🟡 Idle (21–30m)</div>
          <div class="twoCol">
            <div class="col"><div class="colTitle">✅ OK</div>
              <table><thead><tr><th>Member</th><th>Lvl</th><th>Status</th><th>Opt</th><th>Bounty</th></tr></thead><tbody id="wb_idle_ok"></tbody></table>
            </div>
            <div class="col"><div class="colTitle hospTitle">🏥 Hospital</div>
              <table><thead><tr><th>Member</th><th>Lvl</th><th>Hosp time</th><th>Status</th><th>Opt</th><th>Bounty</th></tr></thead><tbody id="wb_idle_h"></tbody></table>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="colTitle">🔴 Offline (31m+)</div>
          <div class="twoCol">
            <div class="col"><div class="colTitle">✅ OK</div>
              <table><thead><tr><th>Member</th><th>Lvl</th><th>Status</th><th>Opt</th><th>Bounty</th></tr></thead><tbody id="wb_off_ok"></tbody></table>
            </div>
            <div class="col"><div class="colTitle hospTitle">🏥 Hospital</div>
              <table><thead><tr><th>Member</th><th>Lvl</th><th>Hosp time</th><th>Status</th><th>Opt</th><th>Bounty</th></tr></thead><tbody id="wb_off_h"></tbody></table>
            </div>
          </div>
        </div>
      `;

      box.appendChild(bar);
      box.appendChild(body);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeOverlay(); });

      // --- OPT cell: button ONLY on YOUR row ---
      function optCellHTML(x){
        const tid = x && x.torn_id != null ? String(x.torn_id) : '';
        const opted = !!(x && x.is_chain_sitter && x.opted_in);

        // If this is YOUR row and you're chain sitter: show button
        if (chainSitter && myId && tid === myId) {
          const cls = opted ? 'optbtn on' : 'optbtn off';
          const txt = opted ? '🟢 Opted In' : '🔴 Opted Out';
          const next = opted ? '0' : '1';
          return `<button class="${cls}" data-opt-toggle="1" data-next="${next}">${txt}</button>`;
        }

        // Everyone else stays display-only
        return (x.is_chain_sitter && opted) ? '✅' : '—';
      }

      async function handleOptButtonClick(btn){
        if (!btn) return;
        btn.disabled = true;
        const next = btn.getAttribute('data-next') === '1';
        btn.textContent = '⏳ Updating...';

        const ok = await postAvailability(next);
        if (!ok) {
          // revert label best-effort
          btn.disabled = false;
          btn.textContent = next ? '🔴 Opted Out' : '🟢 Opted In';
          return;
        }

        // Force refresh quickly so your row updates from server
        await refresh();
        btn.disabled = false;
      }

      function fillOK(id, arr){
        const tb = body.querySelector('#'+id); if (!tb) return;
        tb.innerHTML = '';
        (arr||[]).slice(0,350).forEach(x=>{
          const tag = x.is_chain_sitter ? '<span class="tag">CS</span>' : '';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><div class="namecell"><span class="${dotClass(x._kind)}"></span><span>${esc(x.name||'')}</span>${tag}</div></td>
            <td>${esc(x.level ?? '')}</td>
            <td>${esc(x.status||'')}</td>
            <td>${optCellHTML(x)}</td>
            <td>${bountyCell(x)}</td>`;
          tb.appendChild(tr);
        });
      }
      function fillHosp(id, arr){
        const tb = body.querySelector('#'+id); if (!tb) return;
        tb.innerHTML = '';
        (arr||[]).slice(0,350).forEach(x=>{
          const tag = x.is_chain_sitter ? '<span class="tag">CS</span>' : '';
          const hm = hospitalMinutes(x);
          const ht = hm == null ? '—' : fmtDur(hm*60);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><div class="namecell"><span class="${dotClass(x._kind)}"></span><span>${esc(x.name||'')}</span>${tag}</div></td>
            <td>${esc(x.level ?? '')}</td>
            <td title="${esc(x.status||'')}">${esc(ht)}</td>
            <td>${esc(x.status||'')}</td>
            <td>${optCellHTML(x)}</td>
            <td>${bountyCell(x)}</td>`;
          tb.appendChild(tr);
        });
      }

      // Event delegation for opt button clicks
      body.addEventListener('click', (e)=>{
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-opt-toggle') === '1') {
          e.preventDefault();
          handleOptButtonClick(t);
        }
      });

      function renderRows(rows){
        const on_ok=[], on_h=[], idle_ok=[], idle_h=[], off_ok=[], off_h=[];
        for (const r of (rows||[])){
          const mins = liveMinutes(r.last_action_minutes);
          const kind = bucketFromMinutes(mins);
          const rr = Object.assign({}, r, { _kind: kind, _live_mins: mins });
          const hosp = isHospital(rr);
          if (kind==='online') (hosp?on_h:on_ok).push(rr);
          else if (kind==='idle') (hosp?idle_h:idle_ok).push(rr);
          else (hosp?off_h:off_ok).push(rr);
        }

        const sortByRecent=(a,b)=>(a._live_mins||1e9)-(b._live_mins||1e9);
        on_ok.sort(sortByRecent); idle_ok.sort(sortByRecent); off_ok.sort(sortByRecent);

        const sortHosp=(a,b)=>{
          const av = hospitalMinutes(a) ?? 1e9;
          const bv = hospitalMinutes(b) ?? 1e9;
          if (av!==bv) return av-bv;
          return sortByRecent(a,b);
        };
        on_h.sort(sortHosp); idle_h.sort(sortHosp); off_h.sort(sortHosp);

        body.querySelector('#wb_on').textContent   = `🟢 Online: ${on_ok.length+on_h.length} (OK ${on_ok.length} | 🏥 ${on_h.length})`;
        body.querySelector('#wb_idle').textContent = `🟡 Idle: ${idle_ok.length+idle_h.length} (OK ${idle_ok.length} | 🏥 ${idle_h.length})`;
        body.querySelector('#wb_off').textContent  = `🔴 Offline: ${off_ok.length+off_h.length} (OK ${off_ok.length} | 🏥 ${off_h.length})`;

        fillOK('wb_on_ok', on_ok);   fillHosp('wb_on_h', on_h);
        fillOK('wb_idle_ok', idle_ok); fillHosp('wb_idle_h', idle_h);
        fillOK('wb_off_ok', off_ok); fillHosp('wb_off_h', off_h);
      }

      async function refresh(){
        const err = body.querySelector('#wb_err');
        try{
          const res = await httpJSON(STATE_URL);
          if (!res.ok) { err.textContent = `Error: /state HTTP ${res.status}`; latestState=null; return; }

          latestState = res.json;
          rowsFetchedAtMs = Date.now();

          const s = latestState || {};
          const f = s.faction || {};
          body.querySelector('#wb_fac').textContent = (f.tag ? '['+f.tag+'] ' : '') + (f.name || '7DS*: Wrath');
          body.querySelector('#wb_upd').textContent = 'Updated: ' + (s.updated_at || '—');
          err.textContent = s.last_error ? ('Error: ' + JSON.stringify(s.last_error)) : '';

          const c = s.chain || {};
          body.querySelector('#wb_chain').textContent =
            `Chain: ${c.current ?? '—'}/${c.max ?? '—'} (timeout: ${c.timeout ?? '—'}s)`;

          const w = s.war || {};
          body.querySelector('#wb_war').textContent = `War: ${(w.opponent || '—')}`;

          const ourScore = (w.our_score ?? null);
          const oppScore = (w.opp_score ?? null);
          const ourChain = (w.our_chain ?? '—');
          const oppChain = (w.opp_chain ?? '—');
          body.querySelector('#wb_score').textContent =
            `Score: ${(ourScore ?? '—')}–${(oppScore ?? '—')} | Chains: ${ourChain}–${oppChain}`;

          const target = (w.target ?? null);
          body.querySelector('#wb_target').textContent = `Target: ${(target ?? '—')}`;

          const pOur = pct(ourScore, target);
          const pOpp = pct(oppScore, target);
          body.querySelector('#wb_prog').textContent =
            (pOur != null || pOpp != null)
              ? `Progress: ${(ourScore ?? '—')}/${(target ?? '—')} (${pOur ?? '—'}%) vs ${(oppScore ?? '—')}/${(target ?? '—')} (${pOpp ?? '—'}%)`
              : 'Progress: —';

          body.querySelector('#wb_opt').textContent = `Chain sitter opted-in: ${s.opted_in_count ?? 0}`;

          renderRows(s.rows || []);
        } catch(e){
          latestState=null;
          err.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
        }
      }

      function tick(){
        if (!latestState || !latestState.rows) return;
        renderRows(latestState.rows || []);
      }

      refresh();
      refreshTimer = setInterval(refresh, 10000);
      tickTimer = setInterval(tick, 1000);
    }

    shield.addEventListener('pointerup', (e)=>{
      e.preventDefault();
      if (shield._warbotWasDragged && shield._warbotWasDragged()) {
        shield._warbotResetDragged && shield._warbotResetDragged();
        return;
      }
      openOverlay();
    }, { capture:true });

    shield.addEventListener('click', (e)=>{
      e.preventDefault();
      if (shield._warbotWasDragged && shield._warbotWasDragged()) {
        shield._warbotResetDragged && shield._warbotResetDragged();
        return;
      }
      openOverlay();
    }, true);
  }

  if (!document.body) setTimeout(()=>inject(), 300);
  else inject();

})();
