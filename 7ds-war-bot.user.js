// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️
// @namespace    https://github.com/Fries91/7ds-war-bot-userscript
// @version      2.3.6
// @description  Shield overlay + BIG toggle Opt button (CHAIN SITTER ONLY) + iframe fallback + draggable shield
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @downloadURL  https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
// @updateURL    https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_URL = 'https://torn-war-bot.onrender.com/?embed=1';
  const API_URL   = 'https://torn-war-bot.onrender.com/api/availability';

  // Chain sitter Torn IDs
  const CHAIN_SITTER_IDS = ['1234'];

  // Optional: must match Render AVAIL_TOKEN if you use one
  const AVAIL_TOKEN = '';

  // Default position (used only if user never dragged)
  const DEFAULT_TOP = 110;
  const DEFAULT_RIGHT = 12;

  // Storage keys
  const POS_KEY = 'warbot_shield_pos_v1';

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
  // We only need an ID to enforce "chain sitter only".
  // Tries common Torn globals/DOM. If it can't find it, Opt button just won't show.
  function getMyIdentity() {
    let tornId = '';
    let name = '';

    // cached
    tornId = (getStored('warbot_torn_id', '') || '').trim();
    name   = (getStored('warbot_name', '') || '').trim();

    // try Torn globals
    try {
      if (!tornId && window.user && (window.user.player_id || window.user.ID)) {
        tornId = String(window.user.player_id || window.user.ID);
      }
    } catch (e) {}

    // try any XID reference in page source (best-effort)
    if (!tornId) {
      try {
        const m = document.body && document.body.innerHTML && document.body.innerHTML.match(/XID=(\d{3,})/);
        if (m && m[1]) tornId = m[1];
      } catch (e) {}
    }

    // name (best-effort)
    if (!name) {
      try {
        const el = document.querySelector('.user-name') ||
                   document.querySelector('[class*="userName"]') ||
                   document.querySelector('[class*="username"]');
        if (el) name = (el.textContent || '').trim();
      } catch (e) {}
    }

    if (tornId) setStored('warbot_torn_id', tornId);
    if (name) setStored('warbot_name', name);

    return { tornId: tornId || '', name: name || '' };
  }

  async function postAvailability(state, toggleBtn) {
    const { tornId, name } = getMyIdentity();

    if (!tornId) {
      alert('Could not detect your Torn ID on this page.\nOpen Torn in a normal tab and refresh, then try again.');
      return;
    }

    if (!isChainSitter(tornId)) {
      alert('Opt In/Out is for CHAIN SITTERS only.');
      return;
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

  function bootWhenReady() {
    if (!document.body) return setTimeout(bootWhenReady, 250);
    inject();
  }

  // ===== draggable helper (mouse + touch) =====
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function loadPos() {
    try {
      const raw = getStored(POS_KEY, '');
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  function savePos(x, y) {
    setStored(POS_KEY, JSON.stringify({ x, y }));
  }

  function applyPos(shield, x, y) {
    // x,y are "left/top" in px
    shield.style.left = `${x}px`;
    shield.style.top  = `${y}px`;
    shield.style.right = 'auto';
    shield.style.bottom = 'auto';
  }

  function makeDraggable(shield) {
    const start = { x: 0, y: 0, sx: 0, sy: 0, dragging: false, moved: false };

    function onDown(clientX, clientY) {
      const rect = shield.getBoundingClientRect();
      start.sx = rect.left;
      start.sy = rect.top;
      start.x = clientX;
      start.y = clientY;
      start.dragging = true;
      start.moved = false;
      shield.style.transition = 'none';
    }

    function onMove(clientX, clientY) {
      if (!start.dragging) return;
      const dx = clientX - start.x;
      const dy = clientY - start.y;

      if (Math.abs(dx) + Math.abs(dy) > 6) start.moved = true;

      const rect = shield.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const maxX = window.innerWidth  - w - 2;
      const maxY = window.innerHeight - h - 2;

      const nx = clamp(start.sx + dx, 2, maxX);
      const ny = clamp(start.sy + dy, 2, maxY);

      applyPos(shield, nx, ny);
    }

    function onUp() {
      if (!start.dragging) return;
      start.dragging = false;

      // snap save
      const rect = shield.getBoundingClientRect();
      savePos(rect.left, rect.top);

      // restore transition (optional)
      shield.style.transition = '';
    }

    // Mouse
    shield.addEventListener('mousedown', (e) => {
      // left click only
      if (e.button !== 0) return;
      e.preventDefault();
      onDown(e.clientX, e.clientY);

      const mm = (ev) => { ev.preventDefault(); onMove(ev.clientX, ev.clientY); };
      const mu = (ev) => {
        ev.preventDefault();
        document.removeEventListener('mousemove', mm, true);
        document.removeEventListener('mouseup', mu, true);
        onUp();
      };

      document.addEventListener('mousemove', mm, true);
      document.addEventListener('mouseup', mu, true);
    }, true);

    // Touch
    shield.addEventListener('touchstart', (e) => {
      if (!e.touches || !e.touches[0]) return;
      const t = e.touches[0];
      onDown(t.clientX, t.clientY);
      // prevent scroll while dragging
      e.preventDefault();
    }, { passive: false });

    shield.addEventListener('touchmove', (e) => {
      if (!start.dragging || !e.touches || !e.touches[0]) return;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });

    shield.addEventListener('touchend', (e) => {
      onUp();
      e.preventDefault();
    }, { passive: false });

    // So click-to-open doesn't fire after a drag
    shield._warbotWasDragged = () => start.moved;
    shield._warbotResetDragged = () => { start.moved = false; };
  }

  function inject() {
    // Shield button
    const shield = document.createElement('div');
    shield.textContent = '🛡️';
    shield.id = 'warbot_shield';

    css(shield, `
      position: fixed;
      z-index: 2147483647;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: pointer;
      background: rgba(21,21,33,0.95);
      border: 1px solid rgba(42,42,58,0.95);
      border-radius: 12px;
      color: #ffd86a;
      box-shadow: 0 10px 30px rgba(0,0,0,0.45);
      user-select: none;
      -webkit-user-select: none;
      touch-action: none; /* important for iOS drag */
    `);

    // Default position (right/top) unless saved
    // We convert "right/top" default to "left/top" for drag system
    const saved = loadPos();
    if (saved) {
      applyPos(shield, saved.x, saved.y);
    } else {
      // compute default left from right
      const approxWidth = 44;
      const left = Math.max(2, window.innerWidth - approxWidth - DEFAULT_RIGHT);
      applyPos(shield, left, DEFAULT_TOP);
      savePos(left, DEFAULT_TOP);
    }

    document.body.appendChild(shield);

    makeDraggable(shield);

    let overlay = null;

    function openNewTab() {
      window.open(PANEL_URL.replace('?embed=1',''), '_blank', 'noopener,noreferrer');
    }

    function closeOverlay() {
      if (!overlay) return;
      overlay.remove();
      overlay = null;
    }

    function openOverlay() {
      // If last interaction was a drag, do not open
      if (shield._warbotWasDragged && shield._warbotWasDragged()) {
        if (shield._warbotResetDragged) shield._warbotResetDragged();
        return;
      }

      // Toggle behavior: click shield again closes
      if (overlay) { closeOverlay(); return; }

      const { tornId } = getMyIdentity();
      const chainSitter = tornId ? isChainSitter(tornId) : false;

      // Backdrop
      overlay = document.createElement('div');
      css(overlay, `
        position: fixed;
        top:0;left:0;right:0;bottom:0;
        width:100vw;height:100vh;
        background: rgba(0,0,0,0.60);
        z-index: 2147483646;
      `);

      // Panel container
      const box = document.createElement('div');
      css(box, `
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        width: min(980px, 95vw);
        height: min(82vh, 900px);
        background: #0b0b0f;
        border: 1px solid #2a2a3a;
        border-radius: 14px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 70px rgba(0,0,0,0.75);
      `);

      // Top bar
      const bar = document.createElement('div');
      css(bar, `
        padding: 12px;
        display: flex;
        gap: 10px;
        align-items: center;
        background: #151521;
        border-bottom: 1px solid #2a2a3a;
        color: #fff;
        font-weight: 800;
      `);

      const title = document.createElement('div');
      title.textContent = chainSitter ? '7DS War-Bot (Chain Sitter)' : '7DS War-Bot';
      title.style.flex = '1';
      bar.appendChild(title);

      // Chain sitter toggle
      if (chainSitter) {
        const toggleBtn = document.createElement('button');
        css(toggleBtn, `
          padding: 14px 16px;
          font-size: 14px;
          font-weight: 900;
          border-radius: 10px;
          border: 2px solid;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #111;
        `);

        const currentState = getStored('warbot_opt_state', '0') === '1';
        updateToggleButton(toggleBtn, currentState);

        toggleBtn.onclick = () => {
          const newState = !(getStored('warbot_opt_state', '0') === '1');
          postAvailability(newState, toggleBtn);
        };

        bar.appendChild(toggleBtn);
      }

      // Open panel in new tab
      const openBtn = document.createElement('button');
      openBtn.textContent = '↗ Open Panel';
      css(openBtn, `
        padding: 10px 12px;
        background: #111;
        border: 1px solid #333;
        border-radius: 8px;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      `);
      openBtn.onclick = openNewTab;
      bar.appendChild(openBtn);

      // Close button
      const close = document.createElement('button');
      close.textContent = '✖';
      css(close, `
        padding: 10px;
        background: #111;
        border: 1px solid #333;
        border-radius: 8px;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      `);
      close.onclick = closeOverlay;
      bar.appendChild(close);

      // Iframe wrapper
      const iframeWrap = document.createElement('div');
      css(iframeWrap, `
        flex: 1;
        position: relative;
        background: #0b0b0f;
      `);

      // Loading hint
      const msg = document.createElement('div');
      msg.textContent = 'Loading… If it ever shows “Ask the owner”, press “Open Panel”.';
      css(msg, `
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        z-index: 2;
        padding: 10px 12px;
        border: 1px solid #2a2a3a;
        border-radius: 10px;
        background: rgba(21,21,33,0.92);
        color: #fff;
        font-size: 12px;
        opacity: 0.9;
      `);

      // Iframe (cache-busted)
      const iframe = document.createElement('iframe');
      iframe.src = PANEL_URL + (PANEL_URL.includes('?') ? '&' : '?') + 'cb=' + Date.now();
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.setAttribute('loading', 'eager');
      css(iframe, `
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #0b0b0f;
      `);

      setTimeout(() => { if (msg) msg.style.display = 'none'; }, 6000);

      // Click outside closes
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeOverlay();
      });

      iframeWrap.appendChild(iframe);
      iframeWrap.appendChild(msg);

      box.appendChild(bar);
      box.appendChild(iframeWrap);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    // IMPORTANT: click handler should not interfere with dragging
    shield.addEventListener('click', (e) => {
      e.preventDefault();
      openOverlay();
    }, true);
  }

  bootWhenReady();
})();
