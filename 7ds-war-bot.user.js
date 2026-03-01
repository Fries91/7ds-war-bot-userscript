// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️
// @namespace    https://github.com/Fries91/7ds-war-bot-userscript
// @version      2.3.1
// @description  Shield overlay + BIG toggle Opt button (CHAIN SITTER ONLY) + iframe fallback
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @downloadURL  https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
// @updateURL    https://raw.githubusercontent.com/Fries91/7ds-war-bot-userscript/main/7ds-war-bot.user.js
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

  const SHIELD_TOP = 110;
  const SHIELD_RIGHT = 12;

  function getStored(key, fallback = '') {
    try { return GM_getValue(key, fallback); }
    catch (e) { return localStorage.getItem(key) || fallback; }
  }

  function setStored(key, val) {
    try { GM_setValue(key, val); }
    catch (e) { localStorage.setItem(key, val); }
  }

  function ensureIdentity() {
    let tornId = getStored('warbot_torn_id', '');
    let name   = getStored('warbot_name', '');

    if (!tornId) {
      tornId = prompt('Enter your Torn ID:', '') || '';
      tornId = tornId.trim();
      if (tornId) setStored('warbot_torn_id', tornId);
    }
    if (!name) {
      name = prompt('Enter your Torn name:', '') || '';
      name = name.trim();
      if (name) setStored('warbot_name', name);
    }

    return { tornId: tornId.trim(), name: name.trim() };
  }

  function isChainSitter(id) {
    return CHAIN_SITTER_IDS.includes(String(id || '').trim());
  }

  async function postAvailability(state, toggleBtn) {
    const { tornId, name } = ensureIdentity();
    if (!tornId) return alert('Missing Torn ID.');

    if (!isChainSitter(tornId)) {
      return alert('Opt In/Out is for CHAIN SITTERS only.');
    }

    toggleBtn.textContent = '⏳ Updating...';

    const payload = {
      torn_id: tornId,
      name: name,
      available: state
    };

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

  const shield = document.createElement('div');
  shield.textContent = '🛡️';
  shield.id = 'warbot_shield';
  css(shield, `
    position: fixed;
    top: ${SHIELD_TOP}px;
    right: ${SHIELD_RIGHT}px;
    z-index: 999999;
    font-size: 26px;
    cursor: pointer;
    background: rgba(21,21,33,0.95);
    border: 1px solid rgba(42,42,58,0.95);
    border-radius: 12px;
    padding: 8px 10px;
  `);

  document.body.appendChild(shield);

  let overlay = null;

  function openNewTab() {
    window.open(PANEL_URL.replace('?embed=1',''), '_blank', 'noopener,noreferrer');
  }

  function openOverlay() {
    if (overlay) return;

    const { tornId } = ensureIdentity();
    const chainSitter = isChainSitter(tornId);

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
    msg.textContent = 'Loading… If you see “Ask the owner”, press “Open Panel”.';
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

    // ✅ cache-buster so Torn/mobile doesn't keep a blocked cached iframe
    iframe.src = PANEL_URL + (PANEL_URL.includes('?') ? '&' : '?') + 'cb=' + Date.now();

    iframe.setAttribute('referrerpolicy', 'no-referrer');
    css(iframe, `
      position:absolute;
      top:0;left:0;
      width:100%;
      height:100%;
      border:0;
      background:transparent;
    `);

    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 6000);

    iframeWrap.appendChild(iframe);
    iframeWrap.appendChild(msg);

    box.appendChild(bar);
    box.appendChild(iframeWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  shield.onclick = openOverlay;

})();
