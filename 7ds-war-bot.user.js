// ==UserScript==
// @name         7DS*: Wrath War-Bot Overlay (No CSP)
// @namespace    7ds-wrath-overlay
// @version      4.0.0
// @description  Live War Overlay inside Torn (no iframe, no CSP errors)
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_addStyle
// @connect      torn-war-bot.onrender.com
// ==/UserScript==

(function () {
  "use strict";

  const API_STATE = "https://torn-war-bot.onrender.com/state";

  const BTN_TOP = 110;
  const BTN_RIGHT = 12;

  // =====================
  // Styles
  // =====================
  GM_addStyle(`
    #wrath-shield {
      position: fixed;
      top: ${BTN_TOP}px;
      right: ${BTN_RIGHT}px;
      z-index: 2147483647;
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      cursor: pointer;
      background: radial-gradient(circle at 30% 30%, rgba(255,60,50,.35), rgba(0,0,0,.9));
      border: 1px solid rgba(255,60,50,.6);
      box-shadow: 0 0 20px rgba(255,60,50,.4);
      font-size: 20px;
    }

    #wrath-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: none;
      background:
        linear-gradient(rgba(0,0,0,.85), rgba(0,0,0,.9)),
        url("https://torn-war-bot.onrender.com/static/wrath-bg.jpg") center/cover no-repeat;
      backdrop-filter: blur(6px);
      color: white;
      font-family: Arial, sans-serif;
      overflow-y: auto;
      padding: 40px 20px;
    }

    #wrath-overlay .panel {
      max-width: 900px;
      margin: auto;
      background: rgba(0,0,0,.7);
      border: 1px solid rgba(255,60,50,.4);
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 0 30px rgba(255,60,50,.4);
    }

    #wrath-overlay h2 {
      color: #ff3b30;
      margin-top: 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,.1);
    }

    .member {
      display: flex;
      justify-content: space-between;
      padding: 8px 10px;
      margin-bottom: 8px;
      border-radius: 8px;
      background: rgba(0,0,0,.6);
    }

    .online { color: #2cff6f; }
    .idle { color: #ffcc00; }
    .offline { color: #ff4444; }

    #wrath-close {
      position: absolute;
      top: 20px;
      right: 25px;
      cursor: pointer;
      font-size: 22px;
      color: white;
    }
  `);

  // =====================
  // Build UI
  // =====================
  const shield = document.createElement("div");
  shield.id = "wrath-shield";
  shield.textContent = "🛡️";

  const overlay = document.createElement("div");
  overlay.id = "wrath-overlay";

  overlay.innerHTML = `
    <div id="wrath-close">✖</div>
    <div class="panel">
      <h2>⚔ 7DS*: WRATH WAR PANEL</h2>
      <div id="war"></div>
      <h2>🟢 ONLINE / 🟡 IDLE / 🔴 OFFLINE</h2>
      <div id="members"></div>
    </div>
  `;

  document.body.appendChild(shield);
  document.body.appendChild(overlay);

  shield.onclick = () => {
    overlay.style.display = "block";
    loadState();
  };

  document.getElementById("wrath-close").onclick = () => {
    overlay.style.display = "none";
  };

  // =====================
  // Data Loader
  // =====================
  async function loadState() {
    try {
      const res = await fetch(API_STATE);
      const data = await res.json();

      const war = data.war || {};
      document.getElementById("war").innerHTML = `
        <div class="row"><span>Opponent</span><span>${war.opponent || "None"}</span></div>
        <div class="row"><span>Target</span><span>${war.target ?? "-"}</span></div>
        <div class="row"><span>Your Score</span><span>${war.score ?? "-"}</span></div>
        <div class="row"><span>Enemy Score</span><span>${war.enemy_score ?? "-"}</span></div>
      `;

      let membersHTML = "";
      (data.rows || []).forEach(r => {
        membersHTML += `
          <div class="member ${r.status}">
            <div>${r.name}</div>
            <div>${r.status.toUpperCase()} (${r.minutes ?? "-"}m)</div>
          </div>
        `;
      });

      document.getElementById("members").innerHTML = membersHTML;

    } catch (e) {
      document.getElementById("war").innerHTML = "Error loading data.";
    }
  }

  setInterval(() => {
    if (overlay.style.display === "block") loadState();
  }, 15000);

})();
