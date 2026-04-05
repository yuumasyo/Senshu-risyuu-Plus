(function () {
  const STORAGE_KEYS = [
    "enabled",
    "idleSeconds",
    "idleMinutes",
    "debugMode",
    "modernUiMode",
    "matchMode",
    "customOnclickIncludes",
  ];

  const DEFAULTS = {
    enabled: false,
    idleSeconds: 120,
    debugMode: false,
    modernUiMode: true,
    matchMode: "zenki_doyou_7",
    customOnclickIncludes: "\t1\tF7\t",
  };

  let settings = { ...DEFAULTS };
  let timerId = null;
  let overlayTimerId = null;
  let nextFireAt = 0;

  function isExtensionContextInvalidated(err) {
    const msg = err && (err.message || String(err));
    return typeof msg === "string" && msg.includes("Extension context invalidated");
  }

  function normalize(raw) {
    const merged = { ...DEFAULTS, ...raw };
    let sec = merged.idleSeconds;
    if (sec == null || !Number.isFinite(Number(sec))) {
      const m = merged.idleMinutes;
      if (m != null && Number.isFinite(Number(m))) {
        sec = Math.round(Number(m) * 60);
      } else {
        sec = DEFAULTS.idleSeconds;
      }
    }
    sec = Math.round(Number(sec));
    sec = Math.max(1, Math.min(86400, sec));
    merged.idleSeconds = sec;
    return merged;
  }

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(STORAGE_KEYS, (items) => {
          settings = normalize(items);
          resolve(settings);
        });
      } catch (e) {
        if (isExtensionContextInvalidated(e)) {
          resolve(settings);
          return;
        }
        throw e;
      }
    });
  }

  function dbg(...args) {
    if (settings.debugMode) console.log("[Senshu-risyuu-Plus]", ...args);
  }

  /** 申請状況（ARD010）など: 科目の追加 */
  function findPrimaryKeepaliveButton() {
    const inputs = document.querySelectorAll(
      'input[type="image"][name="ERefer_ARD010PCT02"], input[type="image"][title="科目の追加"]'
    );
    const list = Array.from(inputs).filter((el) => !el.disabled);

    if (settings.matchMode === "custom" && settings.customOnclickIncludes) {
      const needle = settings.customOnclickIncludes.replace(/\\t/g, "\t");
      for (const el of list) {
        const oc = el.getAttribute("onclick") || "";
        if (oc.includes(needle)) return el;
      }
      return null;
    }

    const re = /'[\d]+\t1\tF7\t/;
    for (const el of list) {
      const oc = el.getAttribute("onclick") || "";
      if (re.test(oc)) return el;
    }
    return null;
  }

  /** 配当科目選択: 表示件数 select + その右の Go（EDispNumberSet） */
  function findFallbackDisplayCountControls() {
    const select = document.querySelector('select[name="selCasePerPage"]');
    const goBtn = document.querySelector('input[type="image"][name="EDispNumberSet"]');
    if (!select || select.disabled || !goBtn || goBtn.disabled) return null;
    return { select, goBtn };
  }

  function performFallbackDisplayCountKeepalive() {
    const ctrl = findFallbackDisplayCountControls();
    if (!ctrl) return false;
    ctrl.goBtn.click();
    return true;
  }

  function resolveKeepaliveTarget() {
    const primary = findPrimaryKeepaliveButton();
    if (primary) return { source: "primary", el: primary };
    if (findFallbackDisplayCountControls()) return { source: "fallback-display" };
    return null;
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function isModernUi() {
    return settings.modernUiMode !== false;
  }

  const PAGE_MODERN_STYLE_ID = "risyukeeper-page-modern-style";
  let pageModernStylePromise = null;

  function applyPageModernTheme() {
    const on = isModernUi();
    document.documentElement.classList.toggle("risyukeeper-page-modern", on);
    if (on) {
      let el = document.getElementById(PAGE_MODERN_STYLE_ID);
      if (!el) {
        el = document.createElement("style");
        el.id = PAGE_MODERN_STYLE_ID;
        document.documentElement.appendChild(el);
      }
      if (!el.textContent && !pageModernStylePromise) {
        let cssUrl;
        try {
          cssUrl = chrome.runtime.getURL("ris-page-modern.css");
        } catch (e) {
          if (isExtensionContextInvalidated(e)) return;
          throw e;
        }
        pageModernStylePromise = fetch(cssUrl, {
          cache: "no-store",
        })
          .then((r) => r.text())
          .then((text) => {
            const node = document.getElementById(PAGE_MODERN_STYLE_ID);
            if (node) node.textContent = text;
            pageModernStylePromise = null;
          })
          .catch(() => {
            pageModernStylePromise = null;
          });
      }
    } else {
      const el = document.getElementById(PAGE_MODERN_STYLE_ID);
      if (el) el.remove();
    }
  }

  function debugOverlayStyleString() {
    if (isModernUi()) {
      return [
        "position:fixed",
        "right:12px",
        "bottom:12px",
        "z-index:2147483646",
        'font:12px/1.45 "Noto Sans JP",system-ui,-apple-system,sans-serif',
        "padding:10px 12px",
        "background:#ffffff",
        "color:#1f2937",
        "border:1px solid #d1d6de",
        "border-left:3px solid #2f6f9c",
        "border-radius:8px",
        "max-width:min(320px,90vw)",
        "pointer-events:none",
        "white-space:pre-wrap",
        "box-shadow:0 2px 10px rgba(30,41,59,.1)",
      ].join(";");
    }
    return [
      "position:fixed",
      "right:8px",
      "bottom:8px",
      "z-index:2147483646",
      "font:12px/1.4 system-ui,sans-serif",
      "padding:8px 10px",
      "background:rgba(0,0,0,.78)",
      "color:#e8e8e8",
      "border-radius:6px",
      "max-width:min(320px,90vw)",
      "pointer-events:none",
      "white-space:pre-wrap",
      "box-shadow:0 2px 8px rgba(0,0,0,.35)",
    ].join(";");
  }

  function ensureOverlay() {
    let el = document.getElementById("risyukeeper-debug");
    if (!el) {
      el = document.createElement("div");
      el.id = "risyukeeper-debug";
      el.setAttribute("style", debugOverlayStyleString());
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function removeOverlay() {
    const el = document.getElementById("risyukeeper-debug");
    if (el) el.remove();
    if (overlayTimerId !== null) {
      clearInterval(overlayTimerId);
      overlayTimerId = null;
    }
  }

  function updateDebugOverlay() {
    if (!settings.debugMode) {
      removeOverlay();
      return;
    }
    const el = ensureOverlay();
    el.setAttribute("style", debugOverlayStyleString());
    if (overlayTimerId === null) {
      overlayTimerId = window.setInterval(updateDebugOverlay, 500);
    }
    const lines = [
      "Senshu-risyuu-Plus デバッグ",
      settings.enabled ? "状態: 有効" : "状態: 無効（キープオフ）",
      `無操作まで: ${settings.idleSeconds} 秒`,
    ];
    if (settings.enabled && nextFireAt > 0) {
      const remain = Math.max(0, Math.ceil((nextFireAt - Date.now()) / 1000));
      lines.push(`次のクリックまで: 約 ${remain} 秒`);
    } else if (settings.enabled) {
      lines.push("次のクリックまで: —");
    }
    const resolved = resolveKeepaliveTarget();
    if (resolved) {
      lines.push(
        resolved.source === "primary"
          ? "対象: 第1（科目の追加など）"
          : "対象: フォールバック（表示件数+Go）"
      );
    } else {
      lines.push("対象: 未検出");
    }
    el.textContent = lines.join("\n");
  }

  function scheduleKeepalive() {
    clearTimer();
    if (!settings.enabled) {
      nextFireAt = 0;
      dbg("無効のためタイマーなし");
      updateDebugOverlay();
      return;
    }
    const ms = Math.max(1000, settings.idleSeconds * 1000);
    nextFireAt = Date.now() + ms;
    dbg("タイマー設定", { idleSeconds: settings.idleSeconds, fireAt: new Date(nextFireAt).toISOString() });
    timerId = window.setTimeout(runKeepalive, ms);
    updateDebugOverlay();
  }

  function runKeepalive() {
    timerId = null;
    if (!settings.enabled) return;
    const resolved = resolveKeepaliveTarget();
    if (resolved && resolved.source === "primary") {
      dbg("キープクリック実行（第1選択）");
      resolved.el.click();
    } else if (resolved && resolved.source === "fallback-display") {
      dbg("キープ実行（表示件数変更 + EDispNumberSet）");
      performFallbackDisplayCountKeepalive();
    } else {
      dbg("キープクリック中止（第1も表示件数Goもなし）");
    }
    scheduleKeepalive();
  }

  let lastThrottle = 0;
  const THROTTLE_MS = 800;
  const THROTTLE_TYPES = new Set(["mousemove", "wheel", "scroll"]);

  function onActivity(ev) {
    if (!settings.enabled) return;
    if (THROTTLE_TYPES.has(ev.type)) {
      const now = Date.now();
      if (now - lastThrottle < THROTTLE_MS) return;
      lastThrottle = now;
    }
    dbg("操作検知 → タイマーリセット", ev.type);
    scheduleKeepalive();
  }

  const opts = { capture: true, passive: true };
  ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"].forEach((type) =>
    document.addEventListener(type, onActivity, opts)
  );

  const DISCLAIMER_SESSION_KEY = "senshu-risyuu-plus-enrollment-warn-dismissed";
  const DISCLAIMER_MODAL_ID = "senshu-risyuu-plus-disclaimer-modal";

  /**
   * 履修サイト（トップフレーム）初回表示時: 最終申請前の無効化確認と免責のモーダル。
   * 同一タブ内では sessionStorage で再表示を抑止。
   */
  function showEnrollmentDisclaimerIfNeeded() {
    if (window !== window.top) return;
    if (!/^https:\/\/ris\.acc\.senshu-u\.ac\.jp\//.test(location.href)) return;
    try {
      if (sessionStorage.getItem(DISCLAIMER_SESSION_KEY) === "1") return;
    } catch {
      /* ストレージ不可環境では毎回表示 */
    }
    if (document.getElementById(DISCLAIMER_MODAL_ID)) return;

    const backdrop = document.createElement("div");
    backdrop.id = DISCLAIMER_MODAL_ID;
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "srp-disclaimer-title");
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483645",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:16px",
      "box-sizing:border-box",
      "background:rgba(15,23,42,.55)",
      "font:15px/1.6 system-ui,-apple-system,\"Noto Sans JP\",sans-serif",
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "max-width:28rem",
      "width:100%",
      "max-height:min(90vh,520px)",
      "overflow:auto",
      "background:#fff",
      "color:#1f2937",
      "border-radius:12px",
      "padding:20px 22px",
      "box-shadow:0 20px 50px rgba(0,0,0,.25)",
      "border:1px solid #cbd5e1",
      "box-sizing:border-box",
    ].join(";");

    const title = document.createElement("h2");
    title.id = "srp-disclaimer-title";
    title.textContent = "ご利用前の確認（重要）";
    title.style.cssText = "margin:0 0 12px;font-size:1.05rem;font-weight:700;line-height:1.35;";
    panel.appendChild(title);

    const p1 = document.createElement("p");
    p1.style.margin = "0 0 12px";
    p1.innerHTML =
      "この拡張機能（<strong>Senshu-risyuu-Plus</strong>）を<strong>有効にした状態</strong>で履修登録画面を表示しています。";
    panel.appendChild(p1);

    const ul = document.createElement("ul");
    ul.style.cssText = "margin:0 0 14px;padding-left:1.25em;";
    const items = [
      "最終的な<strong>申請・保存</strong>を行う前に、Chrome のメニュー「設定」→「拡張機能」（アドレスバーに <code style=\"font-size:.9em\">chrome://extensions</code> と入力して開くこともできます）から<strong>本拡張をオフ（無効）</strong>にしてください。",
      "無効化したうえで、<strong>拡張なしの通常の画面</strong>のまま、申請・保存が問題なく行えることを<strong>必ずご確認ください</strong>。",
      "本拡張の利用に起因する不具合・データの不整合・損害等について、<strong>開発者は一切の責任を負いません</strong>。すべて<strong>自己責任</strong>でのご利用となります。",
    ];
    items.forEach((html) => {
      const li = document.createElement("li");
      li.style.marginBottom = "8px";
      li.innerHTML = html;
      ul.appendChild(li);
    });
    panel.appendChild(ul);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "上記を理解して閉じる";
    btn.style.cssText = [
      "display:block",
      "width:100%",
      "margin-top:4px",
      "padding:12px 16px",
      "font-size:15px",
      "font-weight:600",
      "cursor:pointer",
      "border:1px solid #1a4a6e",
      "border-radius:10px",
      "background:linear-gradient(180deg,#3a7eb0,#2f6f9c)",
      "color:#fff",
      "box-sizing:border-box",
    ].join(";");
    btn.addEventListener("click", () => {
      try {
        sessionStorage.setItem(DISCLAIMER_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      backdrop.remove();
    });
    panel.appendChild(btn);

    backdrop.appendChild(panel);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) e.stopPropagation();
    });
    (document.body || document.documentElement).appendChild(backdrop);
    try {
      btn.focus();
    } catch {
      /* ignore */
    }
  }

  function applySettings() {
    applyPageModernTheme();
    clearTimer();
    if (!settings.debugMode) {
      removeOverlay();
    } else {
      updateDebugOverlay();
    }
    dbg("設定適用", {
      enabled: settings.enabled,
      idleSeconds: settings.idleSeconds,
      matchMode: settings.matchMode,
    });
    if (settings.enabled) scheduleKeepalive();
    else {
      nextFireAt = 0;
      updateDebugOverlay();
    }
  }

  loadSettings()
    .then(applySettings)
    .then(() => {
      showEnrollmentDisclaimerIfNeeded();
    });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      const hit = STORAGE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(changes, k));
      if (!hit) return;
      loadSettings().then(applySettings);
    });
  } catch (e) {
    if (!isExtensionContextInvalidated(e)) throw e;
  }
})();
