// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️
// @namespace    https://github.com/Fries91/7ds-war-bot-userscript
// @version      2.4.3
// @description  Draggable shield overlay + panel iframe + auto-pass me_id/me_name + chain-sitter opt toggle
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @downloadURL  https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
// @updateURL    https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_URL_BASE = 'https://torn-war-bot.onrender.com/?embed=1';
  const API_URL        = 'https://torn-war-bot.onrender.com/api/availability';

  // Chain sitter Torn IDs
  const CHAIN_SITTER_IDS = ['1234'];

  // Optional: must match Render AVAIL_TOKEN if you use one (leave blank if using panel buttons)
  const AVAIL_TOKEN = '';

  const DEFAULT_TOP = 110;
  const DEFAULT_RIGHT = 12;

  const DRAG_THRESHOLD_PX = 8; // move this much = drag (won't open)

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

  // Best-effort detection (may be empty depending on Torn context)
  function detectTornIdentityNoPrompt(){
    let tornId = '';
    let name = '';

    try {
      if (window.user) {
        tornId = String(window.user.player_id || window.user.ID || window.user.userid || '');
        name   = String(window.user.name || window.user.username || '');
      }
    } catch (e) {}

    // Fallback: sometimes Torn has a user ID in HTML/data attributes (best effort)
    try {
      if (!tornId) {
        const el = document.querySelector('[data-userid], [data-user-id], [data-playerid]');
        if (el) tornId = String(el.getAttribute('data-userid') || el.getAttribute('data-user-id') || el.getAttribute('data-playerid') || '');
      }
    } catch (e) {}

    tornId = (tornId || '').trim();
    name   = (name || '').trim();
    return { tornId, name };
  }

  function ensureIdentityForOpt() {
    // Only used if user hits the CHAIN SITTER opt toggle (not needed for opening panel)
    let tornId = getStored('warbot_torn_id', '');
    let name   = getStored('warbot_name', '');

    // If not stored, try auto-detect without prompt
    if (!tornId) {
      const auto = detectTornIdentityNoPrompt();
      if (auto.tornId) {
        tornId = auto.tornId;
        setStored('warbot_torn_id', tornId);
      }
      if (!name && auto.name) {
        name = auto.name;
        setStored('warbot_name', name);
      }
    }

    // Still missing? prompt (only for Opt)
    if (!tornId) {
      tornId = (prompt('Enter your Torn ID:', '') || '').trim();
      if (tornId) setStored('warbot_torn_id', tornId);
    }
    if (!name) {
      name = (prompt('Enter your Torn name (optional):', '') || '').trim();
      if (name) setStored('warbot_name', name);
    }

    return { tornId: (tornId || '').trim(), name: (name || '').trim() };
  }

  function buildPanelURL() {
    const auto = detectTornIdentityNoPrompt();
    const u = new URL(PANEL_URL_BASE);

    // Pass identity to panel so it can show Opt button on YOUR row
    if (auto.tornId) u.searchParams.set('me_id', auto.tornId);
    if (auto.name)   u.searchParams.set('me_name', auto.name);

    // Cache buster (prevents “blank cached iframe” problems)
    u.searchParams.set('cb', String(Date.now()));
    return u.toString();
  }

  async function postAvailability(state, toggleBtn) {
    const { tornId, name } = ensureIdentityForOpt();
    if (!tornId) return alert('Missing Torn ID.');

    if (!isChainSitter(tornId)) {
      return alert('Opt In/Out is for CHAIN SITTERS only.');
    }

    toggleBtn.textContent = '⏳ Updating...';

    const payload = { torn_id: tornId, name: name, available: state };
    const headers = { 'Content-Type': 'application/json' };
    if (AVAIL_TOKEN) headers['X-Avail-Token'] = AVAIL_TOKEN;

    try {
      const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        toggleBtn.textContent = '⚠ Error';
        alert(j.error || 'Server error');
        return;
      }

      setStored('warbot_opt_state', state ? '1' : '0');
      updateToggleButton(toggleBtn, state);

    } catch (e) {
      toggleBtn.textContent = '⚠ Failed';
      alert('Request failed (network / blocked).');
    }
  }

  function updateToggleButton(btn, active) {
    if (active) {
      btn.textContent = '🟢 ACTIVE (Tap to Opt Out)';
      btn.style.background = '#0d2f1f';
      btn.style.borderColor = '#2fff88';
      btn.style.boxShadow = '0 0 18px rgba(47,255,136,0.5)';
    } else {
      btn.textContent = '🔴 INACTIVE (Tap to Opt In)';
      btn.style.background = '#2a1010';
      btn.style.borderColor = '#ff4b4b';
      btn.style.boxShadow = '0 0 18px rgba(255,75,75,0.4)';
    }
  }

  function css(el, style) { el.style.cssText = style; return el; }

  // ✅ duplicate-inject guard
  if (document.getElementById('warbot_shield')) return;

  // Load saved shield position
  let savedTop = parseInt(getStored('warbot_shield_top', ''), 10);
  let savedRight = parseInt(getStored('warbot_shield_right', ''), 10);
  if (!isFinite(savedTop)) savedTop = DEFAULT_TOP;
  if (!isFinite(savedRight)) savedRight = DEFAULT_RIGHT;

  const shield = document.createElement('div');
  shield.textContent = '🛡️';
  shield.id = 'warbot_shield';
  css(shield, `
    position: fixed;
    top: ${savedTop}px;
    right: ${savedRight}px;
    z-index: 999999;
    font-size: 26px;
    cursor: pointer;
    background: rgba(21,21,33,0.95);
    border: 1px solid rgba(42,42,58,0.95);
    border-radius: 12px;
    padding: 8px 10px;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  `);

  document.body.appendChild(shield);

  let overlay = null;

  function openNewTab() {
    // open non-embed
    const full = buildPanelURL().replace('embed=1', 'embed=0');
    window.open(full, '_blank', 'noopener,noreferrer');
  }

  function closeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function openOverlay() {
    if (overlay) return;

    const auto = detectTornIdentityNoPrompt();
    const chainSitter = isChainSitter(auto.tornId || getStored('warbot_torn_id', ''));

    overlay = document.createElement('div');
    css(overlay, `
      position: fixed;
      top:0;left:0;
      width:100vw;height:100vh;
      background: rgba(0,0,0,0.6);
      z-index:999998;
    `);

    const box = document.createElement('div');
    css(box, `
      position:absolute;
      top:60px;left:10px;right:10px;bottom:20px;
      background:#0b0b0f;
      border:1px solid #2a2a3a;
      border-radius:12px;
      overflow:hidden;
      display:flex;
      flex-direction:column;
    `);

    const bar = document.createElement('div');
    css(bar, `
      padding:12px;
      display:flex;
      gap:10px;
      align-items:center;
      background:#151521;
      border-bottom:1px solid #2a2a3a;
      color:#fff;
      font-weight:800;
    `);

    const title = document.createElement('div');
    title.textContent = chainSitter ? '7DS War-Bot (Chain Sitter)' : '7DS War-Bot';
    title.style.flex = '1';
    bar.appendChild(title);

    if (chainSitter) {
      const toggleBtn = document.createElement('button');
      css(toggleBtn, `
        padding:14px 16px;
        font-size:14px;
        font-weight:900;
        border-radius:10px;
        border:2px solid;
        color:#fff;
        cursor:pointer;
        transition: all 0.2s ease;
      `);

      const currentState = getStored('warbot_opt_state', '0') === '1';
      updateToggleButton(toggleBtn, currentState);

      toggleBtn.onclick = () => {
        const newState = !(getStored('warbot_opt_state', '0') === '1');
        postAvailability(newState, toggleBtn);
      };

      bar.appendChild(toggleBtn);
    }

    const openBtn = document.createElement('button');
    openBtn.textContent = '↗ Open Panel';
    css(openBtn, `
      padding:10px 12px;
      background:#111;
      border:1px solid #333;
      border-radius:8px;
      color:#fff;
      font-weight:800;
      cursor:pointer;
    `);
    openBtn.onclick = openNewTab;
    bar.appendChild(openBtn);

    const close = document.createElement('button');
    close.textContent = '✖';
    css(close, `
      padding:10px;
      background:#111;
      border:1px solid #333;
      border-radius:8px;
      color:#fff;
      font-weight:800;
      cursor:pointer;
    `);
    close.onclick = closeOverlay;
    bar.appendChild(close);

    const iframeWrap = document.createElement('div');
    css(iframeWrap, `
      flex:1;
      position:relative;
      background:#0b0b0f;
    `);

    const msg = document.createElement('div');
    msg.textContent = 'Loading… If it stays blank or blocked, press “Open Panel”.';
    css(msg, `
      position:absolute;
      top:12px;left:12px;right:12px;
      z-index:2;
      padding:10px 12px;
      border:1px solid #2a2a3a;
      border-radius:10px;
      background: rgba(21,21,33,0.92);
      color:#fff;
      font-size:12px;
      opacity:0.9;
    `);

    const iframe = document.createElement('iframe');
    iframe.src = buildPanelURL();
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    css(iframe, `
      position:absolute;
      top:0;left:0;
      width:100%;
      height:100%;
      border:0;
      background:transparent;
    `);

    // Hide message after a bit (panel will be visible if allowed)
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 6500);

    iframeWrap.appendChild(iframe);
    iframeWrap.appendChild(msg);

    box.appendChild(bar);
    box.appendChild(iframeWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Tap outside closes
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });
  }

  // ===== Draggable shield (tap opens) =====
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0;
  let startTop = 0, startRight = 0;

  function getTopPx() {
    const t = parseFloat(shield.style.top || '0');
    return isFinite(t) ? t : DEFAULT_TOP;
  }
  function getRightPx() {
    const r = parseFloat(shield.style.right || '0');
    return isFinite(r) ? r : DEFAULT_RIGHT;
  }

  function onPointerDown(e){
    dragging = true;
    moved = false;

    const ptX = e.clientX;
    const ptY = e.clientY;
    startX = ptX;
    startY = ptY;

    startTop = getTopPx();
    startRight = getRightPx();

    shield.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e){
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!moved && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
      moved = true;
    }

    // Right decreases when moving right (because it's "right" offset)
    let newTop = startTop + dy;
    let newRight = startRight - dx;

    // clamp inside viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = shield.getBoundingClientRect();
    const w = rect.width || 44;
    const h = rect.height || 44;

    newTop = Math.max(6, Math.min(vh - h - 6, newTop));
    newRight = Math.max(6, Math.min(vw - w - 6, newRight));

    shield.style.top = `${Math.round(newTop)}px`;
    shield.style.right = `${Math.round(newRight)}px`;

    e.preventDefault();
  }

  function onPointerUp(e){
    if (!dragging) return;
    dragging = false;

    // save position
    const top = Math.round(getTopPx());
    const right = Math.round(getRightPx());
    setStored('warbot_shield_top', String(top));
    setStored('warbot_shield_right', String(right));

    // If it was a tap (not moved), open overlay
    if (!moved) openOverlay();

    e.preventDefault();
  }

  shield.addEventListener('pointerdown', onPointerDown, { passive:false });
  window.addEventListener('pointermove', onPointerMove, { passive:false });
  window.addEventListener('pointerup', onPointerUp, { passive:false });

})();
