(function () {
  const PREVIEW_TS_KEY = "risyuSyllabusWantFirstPreview";
  const NAV_GUARD_KEY = "risyuFirstDetailNavFrom";
  const LOG = "[Senshu-risyuu-Plus:シラバス結果]";

  function isExtensionContextInvalidated(err) {
    const msg = err && (err.message || String(err));
    return typeof msg === "string" && msg.includes("Extension context invalidated");
  }

  function tryStorageLocalGet(keys, callback) {
    try {
      chrome.storage.local.get(keys, callback);
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) throw e;
    }
  }

  function tryStorageSyncGet(keys, callback) {
    try {
      chrome.storage.sync.get(keys, callback);
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) throw e;
    }
  }

  function tryStorageLocalRemove(keys, callback) {
    try {
      chrome.storage.local.remove(keys, callback);
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) throw e;
    }
  }

  function absUrl(href) {
    try {
      return new URL(href, location.href).href;
    } catch {
      return href;
    }
  }

  function looksLikeDetailHref(href) {
    if (!href || href.startsWith("javascript:") || href === "#") return false;
    const h = href.toLowerCase();
    if (h.includes("logout")) return false;
    if (h.includes("syllabusinfo")) return true;
    if (h.includes("/syllabus/") && h.includes(".do")) return true;
    if (h.includes("slsps") && h.includes(".do") && !h.includes("slspskgr")) return true;
    return false;
  }

  function findFirstResultAnchor() {
    const rows = document.querySelectorAll("table tr");
    for (const tr of rows) {
      if (tr.querySelector("th")) continue;
      const a = tr.querySelector("a[href]");
      if (!a) continue;
      const raw = a.getAttribute("href") || "";
      if (raw.startsWith("javascript:")) continue;
      const full = absUrl(raw);
      if (looksLikeDetailHref(full)) return { href: full };
    }
    const anchors = document.querySelectorAll('a[href]');
    for (const a of anchors) {
      const raw = a.getAttribute("href") || "";
      if (raw.startsWith("javascript:")) continue;
      const full = absUrl(raw);
      if (looksLikeDetailHref(full)) return { href: full };
    }
    return null;
  }

  function clearPreviewRequest() {
    tryStorageLocalRemove(PREVIEW_TS_KEY);
  }

  function navigateToFirstDetail(href) {
    try {
      if (sessionStorage.getItem(NAV_GUARD_KEY) === location.href) return;
      sessionStorage.setItem(NAV_GUARD_KEY, location.href);
    } catch {
      /* ignore */
    }
    clearPreviewRequest();
    console.info(LOG, "検索1件目の詳細へ遷移します", href);
    window.location.assign(href);
  }

  function tryRun() {
    tryStorageLocalGet([PREVIEW_TS_KEY], (g) => {
      const ts = g[PREVIEW_TS_KEY];
      if (ts == null || typeof ts !== "number") return;
      if (Date.now() - ts > 120000) {
        clearPreviewRequest();
        return;
      }

      tryStorageSyncGet(["syllabusPreviewFirstResult"], (s) => {
        if (s.syllabusPreviewFirstResult === false) {
          clearPreviewRequest();
          return;
        }

        const hit = findFirstResultAnchor();
        if (hit) {
          navigateToFirstDetail(hit.href);
          return;
        }

        console.info(LOG, "一覧行がまだ無いか、該当リンクを検出できませんでした");
      });
    });
  }

  let attempts = 0;
  const maxAttempts = 70;

  function poll() {
    tryRun();
    attempts += 1;
    if (attempts >= maxAttempts) {
      tryStorageLocalGet([PREVIEW_TS_KEY], (g) => {
        if (g[PREVIEW_TS_KEY] != null) clearPreviewRequest();
      });
      return;
    }
    setTimeout(poll, 180);
  }

  tryStorageLocalGet([PREVIEW_TS_KEY], (g) => {
    if (g[PREVIEW_TS_KEY] == null) return;
    poll();

    const obs = new MutationObserver(() => {
      tryRun();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 15000);
  });
})();
