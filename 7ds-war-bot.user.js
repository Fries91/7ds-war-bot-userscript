// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️
// @namespace    https://github.com/Fries91/7ds-war-bot-userscript
// @version      2.4.4
// @description  Draggable shield + tap-to-open overlay + CSP-safe panel fallback (srcdoc) + Chain sitter opt toggle
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @downloadURL  https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
// @updateURL    https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const ORIGIN    = 'https://torn-war-bot.onrender.com';
  const PANEL_URL = ORIGIN + '/?embed=1';
  const API_URL   = ORIGIN + '/api/availability';
  const STATE_URL = ORIGIN + '/state';

  // Chain sitter Torn IDs
  const CHAIN_SITTER_IDS = ['1234'];

  // Optional: must match Render AVAIL_TOKEN if you use one
  const AVAIL_TOKEN = '';

  // Default shield position if nothing stored
  const DEFAULT_TOP = 110;
  const DEFAULT_RIGHT = 12;

  // Drag threshold (px) to decide drag vs click
  const DRAG_THRESHOLD = 8;

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

  function ensureIdentity() {
    // Only needed for chain sitters to POST opt in/out.
    let tornId = getStored('warbot_torn_id', '');
    let name   = getStored('warbot_name', '');

    if (!tornId) {
      tornId = prompt('Enter your Torn ID (needed only for Opt In/Out):', '') || '';
      tornId = tornId.trim();
      if (tornId) setStored('warbot_torn_id', tornId);
    }
    if (!name) {
      name = prompt('Enter your Torn name (needed only for Opt In/Out):', '') || '';
      name = name.trim();
      if (name) setStored('warbot_name', name);
    }

    return { tornId: tornId.trim(), name: name.trim() };
  }

  async function postAvailability(state, toggleBtn) {
    const { tornId, name } = ensureIdentity();
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

  // ---------- Shield (draggable + clickable) ----------
  const shield = document.createElement('div');
  shield.textContent = '🛡️';
  shield.id = 'warbot_shield';

  // Load stored position
  // Stored as {top,left} in px. If not present, use top/right default.
  const storedPos = (function () {
    try { return JSON.parse(getStored('warbot_shield_pos', '')); }
    catch (e) { return null; }
  })();

  let topPx = DEFAULT_TOP;
  let leftPx = null;

  if (storedPos && typeof storedPos.top === 'number' && typeof storedPos.left === 'number') {
    topPx = storedPos.top;
    leftPx = storedPos.left;
  }

  css(shield, `
    position: fixed;
    top: ${topPx}px;
    ${leftPx == null ? `right:${DEFAULT_RIGHT}px;` : `left:${leftPx}px;`}
    z-index: 999999;
    font-size: 26px;
    cursor: pointer;
    background: rgba(21,21,33,0.95);
    border: 1px solid rgba(42,42,58,0.95);
    border-radius: 12px;
    padding: 8px 10px;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none; /* important for touch dragging */
  `);

  document.body.appendChild(shield);

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function saveShieldPos(top, left) {
    setStored('warbot_shield_pos', JSON.stringify({ top, left }));
  }

  function normalizeToLeftTop() {
    // Ensure shield uses left/top positioning so dragging is consistent
    const rect = shield.getBoundingClientRect();
    shield.style.left = rect.left + 'px';
    shield.style.top = rect.top + 'px';
    shield.style.right = 'auto';
  }

  let dragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;
  let moved = false;

  function pointerDown(e) {
    // Only left mouse button, but allow touch/pen
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    dragging = true;
    moved = false;

    normalizeToLeftTop();

    const rect = shield.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;

    shield.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function pointerMove(e) {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      moved = true;
    }

    const rect = shield.getBoundingClientRect();
    const w = rect.width || 44;
    const h = rect.height || 44;

    const maxLeft = window.innerWidth - w - 6;
    const maxTop = window.innerHeight - h - 6;

    const newLeft = clamp(startLeft + dx, 6, maxLeft);
    const newTop = clamp(startTop + dy, 6, maxTop);

    shield.style.left = newLeft + 'px';
    shield.style.top = newTop + 'px';

    e.preventDefault();
    e.stopPropagation();
  }

  function pointerUp(e) {
    if (!dragging) return;
    dragging = false;

    // Save position after drag
    const rect = shield.getBoundingClientRect();
    saveShieldPos(rect.top, rect.left);

    shield.releasePointerCapture?.(e.pointerId);

    e.preventDefault();
    e.stopPropagation();

    // If user did NOT move it, treat as a click/tap to open overlay
    if (!moved) openOverlay();
  }

  shield.addEventListener('pointerdown', pointerDown, { passive: false });
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', pointerUp, { passive: false });

  // ---------- Overlay + CSP-safe load ----------
  let overlay = null;

  function openNewTab() {
    window.open(ORIGIN + '/', '_blank', 'noopener,noreferrer');
  }

  async function buildSrcDocHTML() {
    const res = await fetch(PANEL_URL + (PANEL_URL.includes('?') ? '&' : '?') + 'cb=' + Date.now(), { cache: 'no-store' });
    const html = await res.text();

    // Patch relative fetches to absolute so srcdoc works
    let patched = html
      .replace(/fetch\(\s*['"]\/state['"]\s*\)/g, `fetch('${STATE_URL}')`)
      .replace(/fetch\(\s*["']\/state["']\s*,/g, `fetch('${STATE_URL}',`)
      .replace(/fetch\(\s*['"]\/health['"]\s*\)/g, `fetch('${ORIGIN}/health')`)
      .replace(/fetch\(\s*["']\/health["']\s*,/g, `fetch('${ORIGIN}/health',`);

    return patched;
  }

  async function loadPanelWithCSPFallback(iframe, msgEl) {
    const url = PANEL_URL + (PANEL_URL.includes('?') ? '&' : '?') + 'cb=' + Date.now();

    let fellBack = false;

    const fallback = async () => {
      if (fellBack) return;
      fellBack = true;

      if (msgEl) {
        msgEl.textContent = 'CSP blocked iframe — loading safe mode…';
        msgEl.style.display = 'block';
      }

      try {
        const patchedHTML = await buildSrcDocHTML();
        iframe.removeAttribute('src');
        iframe.srcdoc = patchedHTML;

        if (msgEl) {
          msgEl.textContent = 'Safe mode loaded ✅';
          setTimeout(() => { msgEl.style.display = 'none'; }, 1200);
        }
      } catch (e) {
        if (msgEl) {
          msgEl.textContent = 'Safe mode failed. Use “Open Panel”.';
          msgEl.style.display = 'block';
        }
      }
    };

    // Try normal iframe first
    iframe.src = url;

    // If browser fires error (often with CSP), fallback
    iframe.addEventListener('error', fallback);

    // Timed fallback (blank / blocked)
    setTimeout(() => fallback(), 1500);

    // If it loads normally, hide message
    iframe.addEventListener('load', () => {
      if (msgEl) setTimeout(() => { msgEl.style.display = 'none'; }, 600);
    }, { once: true });
  }

  function openOverlay() {
    if (overlay) return;

    // Only show chain sitter button if their stored ID is a chain sitter
    const storedId = getStored('warbot_torn_id', '');
    const chainSitter = isChainSitter(storedId);

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
    close.onclick = () => {
      overlay.remove();
      overlay = null;
    };
    bar.appendChild(close);

    const iframeWrap = document.createElement('div');
    css(iframeWrap, `
      flex:1;
      position:relative;
      background:#0b0b0f;
    `);

    const msg = document.createElement('div');
    msg.textContent = 'Loading… (If Torn blocks iframe, safe mode loads automatically)';
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
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    css(iframe, `
      position:absolute;
      top:0;left:0;
      width:100%;
      height:100%;
      border:0;
      background:transparent;
    `);

    iframeWrap.appendChild(iframe);
    iframeWrap.appendChild(msg);

    box.appendChild(bar);
    box.appendChild(iframeWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    loadPanelWithCSPFallback(iframe, msg);
  }

})();
