// ==UserScript==
// @name         7DS*: Wrath War-Bot 🛡️ (CSP-Proof Lite + Chain Sitter Opt)
// @namespace    7ds-wrath-warbot
// @version      3.2.0
// @description  Shield opens /lite in a NEW TAB (no iframe = no CSP errors). Optional Chain Sitter opt-in toggle.
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
  const LITE_URL = `${BASE_URL}/lite`;
  const API_AVAIL = `${BASE_URL}/api/availability`;

  // Put YOUR Torn ID here (required for opt-in button + to identify you)
  const MY_TORN_ID = "1234";

  // Chain sitter Torn IDs (only these see the OPT button)
  const CHAIN_SITTER_IDS = ["1234"];

  // Optional: must match Render env AVAIL_TOKEN (leave "" if not using)
  const AVAIL_TOKEN = "";

  // Shield position
  const BTN_TOP = 110;
  const BTN_RIGHT = 12;

  // =========================
  // Helpers
  // =========================
  const isChainSitter = CHAIN_SITTER_IDS.includes(String(MY_TORN_ID));

  function openLite() {
    // ✅ No iframe. Opens in new tab. CSP-proof.
    window.open(LITE_URL, "_blank", "noopener,noreferrer");
  }

  function setLocalAvail(val) {
    GM_setValue("wrath_avail", !!val);
  }

  function getLocalAvail() {
    return !!GM_getValue("wrath_avail", false);
  }

  function updateOptUI(btn) {
    const on = getLocalAvail();
    btn.classList.toggle("on", on);
    btn.querySelector(".label").textContent = on ? "OPTED IN" : "OPT IN";
    btn.querySelector(".sub").textContent = on ? "Available for chaining" : "Tap to become available";
  }

  function postAvailability(available) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API_AVAIL + (AVAIL_TOKEN ? `?token=${encodeURIComponent(AVAIL_TOKEN)}` : ""),
        headers: {
          "Content-Type": "application/json",
          ...(AVAIL_TOKEN ? { "X-Token": AVAIL_TOKEN } : {})
        },
        data: JSON.stringify({
          torn_id: String(MY_TORN_ID),
          available: !!available
        }),
        onload: (r) => {
          try {
            const j = JSON.parse(r.responseText || "{}");
            resolve({ ok: r.status >= 200 && r.status < 300 && j.ok !== false, status: r.status, body: j });
          } catch {
            resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, body: r.responseText });
          }
        },
        onerror: () => resolve({ ok: false, status: 0, body: "network error" })
      });
    });
  }

  // =========================
  // Styles (Wrath theme)
  // =========================
  GM_addStyle(`
    #wrath-warbot-wrap {
      position: fixed;
      top: ${BTN_TOP}px;
      right: ${BTN_RIGHT}px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 10px;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    /* Shield */
    #wrath-warbot-shield {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      cursor: pointer;

      display: grid;
      place-items: center;

      background: radial-gradient(circle at 30% 30%, rgba(255,80,70,.30), rgba(0,0,0,.85));
      border: 1px solid rgba(255,60,50,.55);
      box-shadow: 0 10px 28px rgba(0,0,0,.55), 0 0 18px rgba(255,60,50,.35);
      backdrop-filter: blur(6px);
    }
    #wrath-warbot-shield:hover {
      box-shadow: 0 10px 30px rgba(0,0,0,.65), 0 0 28px rgba(255,60,50,.55);
      transform: translateY(-1px);
    }
    #wrath-warbot-shield:active { transform: translateY(0px) scale(.98); }

    #wrath-warbot-shield .icon {
      font-size: 22px;
      line-height: 1;
      filter: drop-shadow(0 0 10px rgba(255,60,50,.55));
    }

    /* Optional chain sitter opt button */
    #wrath-opt {
      width: 190px;
      border-radius: 16px;
      padding: 10px 12px;
      cursor: pointer;

      background: rgba(0,0,0,.72);
      border: 1px solid rgba(255,60,50,.28);
      box-shadow: 0 10px 26px rgba(0,0,0,.55);
      backdrop-filter: blur(8px);

      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }

    #wrath-opt .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 4px;
    }
    #wrath-opt .label {
      font-weight: 900;
      letter-spacing: .6px;
      font-size: 13px;
      color: #ffcc66;
    }
    #wrath-opt .tag {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(215,179,90,.22);
      background: rgba(215,179,90,.08);
      color: #ffcc66;
      white-space: nowrap;
    }
    #wrath-opt .sub {
      font-size: 11px;
      opacity: .9;
    }

    #wrath-opt.on {
      border-color: rgba(44,255,111,.45);
      box-shadow: 0 10px 26px rgba(0,0,0,.55), 0 0 22px rgba(44,255,111,.25);
    }
    #wrath-opt.on .label { color: #2cff6f; }
    #wrath-opt.on .tag {
      border-color: rgba(44,255,111,.35);
      background: rgba(44,255,111,.10);
      color: #2cff6f;
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

  // =========================
  // Build UI (NO iframe)
  // =========================
  function buildUI() {
    if (document.getElementById("wrath-warbot-wrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "wrath-warbot-wrap";

    const shield = document.createElement("div");
    shield.id = "wrath-warbot-shield";
    shield.innerHTML = `<div class="icon">🛡️</div>`;
    shield.title = "Open 7DS*: Wrath War-Bot (Lite)";
    shield.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLite();
    });

    wrap.appendChild(shield);

    // Chain sitter opt-in button
    if (isChainSitter) {
      const opt = document.createElement("div");
      opt.id = "wrath-opt";
      opt.innerHTML = `
        <div class="top">
          <div class="label">OPT IN</div>
          <div class="tag">CHAIN SITTER</div>
        </div>
        <div class="sub">Tap to become available</div>
      `;

      updateOptUI(opt);

      opt.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const next = !getLocalAvail();
        // update local immediately for snappy feel
        setLocalAvail(next);
        updateOptUI(opt);

        const res = await postAvailability(next);
        if (res.ok) {
          toast(next ? "✅ Opted IN (server updated)" : "✅ Opted OUT (server updated)");
        } else {
          // revert if server failed
          setLocalAvail(!next);
          updateOptUI(opt);
          toast(
            "❌ Failed to update server\n" +
            (typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2))
          );
        }
      });

      wrap.appendChild(opt);
    }

    document.body.appendChild(wrap);
  }

  // =========================
  // HARD CLEANUP: remove any old war-bot iframes from older scripts
  // =========================
  function nukeOldIframes() {
    const iframes = Array.from(document.querySelectorAll("iframe"));
    for (const f of iframes) {
      const src = (f.getAttribute("src") || "").toLowerCase();
      if (src.includes("torn-war-bot") || src.includes("onrender.com")) {
        f.remove();
      }
    }
  }

  // Run now + retry while Torn UI loads
  nukeOldIframes();
  buildUI();

  let tries = 0;
  const timer = setInterval(() => {
    nukeOldIframes();
    buildUI();
    tries++;
    if (tries >= 12) clearInterval(timer);
  }, 800);
})();
