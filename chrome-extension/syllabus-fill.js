(function () {
  const KEY = "risyuPendingSyllabusSearch";
  const LOG = "[RisyuKeeper:シラバス埋め込み]";

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

  function tryStorageLocalSet(items, callback) {
    try {
      chrome.storage.local.set(items, callback);
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

  function fillAndSubmit(p) {
    const sel = (name) => document.querySelector(`select[name="${name}"]`);
    const setSel = (name, val) => {
      const el = sel(name);
      if (!el || val === undefined || val === null || val === "") return;
      el.value = String(val);
    };

    setSel("value(nendo)", p.nendo);
    setSel("value(crclm)", p.crclm);
    setSel("value(campuscd)", p.campuscd);
    setSel("value(kaikoCd)", p.kaikoCd);
    setSel("value(yobi)", p.yobi);
    setSel("value(jigen)", p.jigen);
    setSel("value(searchKeywordFlg)", p.searchKeywordFlg || "1");

    const kgi = document.querySelector("#kouginmField") || document.querySelector('input[name="value(kouginm)"]');
    const syo = document.querySelector("#syokunmField") || document.querySelector('input[name="value(syokunm)"]');
    const kwf = document.querySelector("#keywordField");
    if (kgi) kgi.value = p.kouginm || "";
    if (syo) syo.value = p.syokunm || "";
    if (kwf) kwf.value = p.keywords || "";

    const hk = document.querySelector("#hiddenSearchKouginm");
    const hs = document.querySelector("#hiddenSearchSyokunm");
    const hkw = document.querySelector("#hiddenSearchKeyword");
    if (hk) hk.value = p.kouginm || "";
    if (hs) hs.value = p.syokunm || "";
    if (hkw) hkw.value = p.keywords || "";

    const btn = Array.from(document.querySelectorAll('input[type="button"],input[type="submit"],button')).find(
      (b) => String(b.value || b.textContent || "").includes("検索する")
    );
    if (btn) {
      setTimeout(() => {
        if (p.previewFirst) {
          tryStorageLocalSet({ risyuSyllabusWantFirstPreview: Date.now() });
        }
        btn.click();
      }, 450);
    } else {
      console.warn(LOG, "検索するボタンが見つかりません");
    }
  }

  function run() {
    if (!/slspskgr\.do/i.test(location.href)) return;

    tryStorageLocalGet([KEY], (got) => {
      const p = got[KEY];
      if (!p || typeof p.ts !== "number") return;
      if (Date.now() - p.ts > 120000) {
        tryStorageLocalRemove(KEY);
        return;
      }

      tryStorageLocalRemove(KEY);

      let tries = 0;
      const tick = () => {
        if (!document.querySelector('form[name="sylbsActionForm"]')) {
          if (++tries < 50) {
            setTimeout(tick, 200);
            return;
          }
          console.warn(LOG, "検索フォームが現れませんでした");
          return;
        }
        try {
          fillAndSubmit(p);
        } catch (e) {
          console.warn(LOG, e);
        }
      };
      tick();
    });
  }

  run();
})();
