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

  const DISCLAIMER_MODAL_ID = "senshu-risu-disclaimer-modal";
  const DISCLAIMER_HIDE_KEY = "risCourseDisclaimerHide";

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

  function tryStorageLocalGetDisclaimer(keys, callback) {
    try {
      chrome.storage.local.get(keys, callback);
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) throw e;
    }
  }

  function tryStorageLocalSetDisclaimer(items, callback) {
    try {
      chrome.storage.local.set(items, callback);
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) throw e;
    }
  }

  /**
   * 履修サイト（拡張有効時）で初回表示する免責・確認モーダル。
   * 子 iframe では出さない（重複防止）。
   */
  function mountDisclaimerModal() {
    if (document.getElementById(DISCLAIMER_MODAL_ID)) return;

    const backdrop = document.createElement("div");
    backdrop.id = DISCLAIMER_MODAL_ID;
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "senshu-risu-disclaimer-title");
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "background:rgba(15,23,42,.55)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:16px",
      "box-sizing:border-box",
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "max-width:32rem",
      "width:100%",
      "max-height:min(90vh,640px)",
      "overflow:auto",
      "background:#fff",
      "color:#1f2937",
      "border-radius:12px",
      "box-shadow:0 25px 50px -12px rgba(0,0,0,.25)",
      "border:1px solid #cbd5e1",
      "font:14px/1.6 system-ui,-apple-system,\"Noto Sans JP\",sans-serif",
      "padding:20px 22px",
      "box-sizing:border-box",
    ].join(";");

    const title = document.createElement("h2");
    title.id = "senshu-risu-disclaimer-title";
    title.textContent = "Senshu-risyuu-Plus：重要なご確認";
    title.style.cssText = "margin:0 0 12px;font-size:1.05rem;font-weight:700;color:#0f172a;";

    const p1 = document.createElement("p");
    p1.style.margin = "0 0 12px";
    p1.textContent =
      "この拡張機能は大学・システム運営者による公式のものではありません。履修の申請・単位認定の保存など、重要な操作を行う前に、必ず次を実施してください。";

    const ol = document.createElement("ol");
    ol.style.cssText = "margin:0 0 14px;padding-left:1.35em;";
    const li1 = document.createElement("li");
    li1.style.marginBottom = "8px";
    li1.innerHTML =
      "ブラウザの <strong>拡張機能を管理</strong>を開き（Chrome: <code>chrome://extensions</code>、Edge: <code>edge://extensions</code>）、<strong>本拡張（Senshu-risyuu-Plus）をオフ</strong>にします。";
    const li2 = document.createElement("li");
    li2.style.marginBottom = "8px";
    li2.innerHTML =
      "<strong>拡張なしの公式の履修画面だけ</strong>の状態で、申請や保存が問題なく行えることを確認します。";
    const li3 = document.createElement("li");
    li3.textContent = "問題ないことを確認したうえで、必要に応じて本拡張を再度オンにしてください。";
    ol.appendChild(li1);
    ol.appendChild(li2);
    ol.appendChild(li3);

    const p2 = document.createElement("p");
    p2.style.cssText = "margin:0 0 16px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;";
    p2.innerHTML =
      "<strong>免責：</strong>本拡張の利用により生じた不利益・データの不整合・履修上のトラブル等について、<strong>開発者は一切の責任を負いません。</strong>利用はすべて自己責任です。";

    const rowUnderstand = document.createElement("label");
    rowUnderstand.style.cssText =
      "display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;cursor:pointer;";
    const cbUnderstand = document.createElement("input");
    cbUnderstand.type = "checkbox";
    cbUnderstand.style.cssText = "margin-top:4px;width:16px;height:16px;flex-shrink:0;accent-color:#2f6f9c;";
    const spanUnderstand = document.createElement("span");
    spanUnderstand.textContent =
      "上記（拡張をオフにして公式画面のみで確認すること、および免責）を読み、内容を理解しました。";
    rowUnderstand.appendChild(cbUnderstand);
    rowUnderstand.appendChild(spanUnderstand);

    const rowHide = document.createElement("label");
    rowHide.style.cssText =
      "display:flex;align-items:flex-start;gap:10px;margin-bottom:18px;cursor:pointer;";
    const cbHide = document.createElement("input");
    cbHide.type = "checkbox";
    cbHide.style.cssText = "margin-top:4px;width:16px;height:16px;flex-shrink:0;accent-color:#2f6f9c;";
    const spanHide = document.createElement("span");
    spanHide.textContent = "次回からこの警告を表示しない（ローカルに保存）";
    rowHide.appendChild(cbHide);
    rowHide.appendChild(spanHide);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "画面を続行する";
    btn.disabled = true;
    btn.style.cssText = [
      "padding:10px 18px",
      "border-radius:8px",
      "border:1px solid #cbd5e1",
      "background:#e5e7eb",
      "color:#9ca3af",
      "font-weight:600",
      "cursor:not-allowed",
    ].join(";");

    function updateBtn() {
      const ok = cbUnderstand.checked;
      btn.disabled = !ok;
      btn.style.background = ok ? "#2f6f9c" : "#e5e7eb";
      btn.style.color = ok ? "#fff" : "#9ca3af";
      btn.style.borderColor = ok ? "#255a82" : "#cbd5e1";
      btn.style.cursor = ok ? "pointer" : "not-allowed";
    }
    cbUnderstand.addEventListener("change", updateBtn);

    btn.addEventListener("click", () => {
      if (!cbUnderstand.checked) return;
      if (cbHide.checked) {
        tryStorageLocalSetDisclaimer({ [DISCLAIMER_HIDE_KEY]: true });
      }
      backdrop.remove();
    });

    btnRow.appendChild(btn);
    panel.appendChild(title);
    panel.appendChild(p1);
    panel.appendChild(ol);
    panel.appendChild(p2);
    panel.appendChild(rowUnderstand);
    panel.appendChild(rowHide);
    panel.appendChild(btnRow);
    backdrop.appendChild(panel);
    document.documentElement.appendChild(backdrop);
  }

  function showDisclaimerIfNeeded() {
    if (window !== window.top) return;
    tryStorageLocalGetDisclaimer([DISCLAIMER_HIDE_KEY], (got) => {
      if (got[DISCLAIMER_HIDE_KEY]) return;
      mountDisclaimerModal();
    });
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

  loadSettings().then(applySettings);

  showDisclaimerIfNeeded();

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
