(function () {
  const STORAGE_KEY_DEPT = "risyuSavedDepartmentName";
  const STORAGE_KEY_PENDING = "risyuPendingSyllabusSearch";
  /** 別タブで開く公式検索画面（セッションはこの GET から開始する） */
  const SYLLABUS_ENTRY_URL =
    "https://syllabus.acc.senshu-u.ac.jp/syllsenshu/slspskgr.do?clearAccessData=true&contenam=slspskgr&kjnmnNo=8";
  const LOG = "[RisyuKeeper:シラバス]";

  /** 拡張の再読み込み後、タブを更新せずに古いコンテキストのスクリプトが動き続けると発生する */
  function isExtensionContextInvalidated(err) {
    const msg = err && (err.message || String(err));
    return typeof msg === "string" && msg.includes("Extension context invalidated");
  }

  function tryStorageLocalSet(items, callback) {
    try {
      chrome.storage.local.set(items, callback);
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) throw e;
    }
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

  /** シラバス「学部学科」value(crclm) options（現行 slspskgr 検索画面と一致。大学側更新時は要追随） */
  const SYLLABUS_CRCLM_OPTIONS = [
    { value: "100000", label: "【経済学部】" },
    { value: "101100", label: "経済学科" },
    { value: "101300", label: "現代経済学科" },
    { value: "101400", label: "生活環境経済学科" },
    { value: "101200", label: "国際経済学科" },
    { value: "716200", label: "二部経済学科" },
    { value: "200000", label: "【法学部】" },
    { value: "202100", label: "法律学科" },
    { value: "202200", label: "政治学科" },
    { value: "726300", label: "二部法律学科" },
    { value: "300000", label: "【経営学部】" },
    { value: "303100", label: "経営学科" },
    { value: "303300", label: "ビジネスデザイン学科" },
    { value: "400000", label: "【商学部】" },
    { value: "404100", label: "商業学科_2012年度以前" },
    { value: "404200", label: "会計学科" },
    { value: "404300", label: "マーケティング学科" },
    { value: "736400", label: "二部商業学科_2012年度以前" },
    { value: "736500", label: "二部マーケティング学科" },
    { value: "50000", label: "【文学部】" },
    { value: "505100", label: "国文学科_2007年度以前" },
    { value: "505200", label: "英米文学科" },
    { value: "505300", label: "人文学科_2017年度以前" },
    { value: "505400", label: "心理学科_2015年度以前" },
    { value: "505500", label: "日本語日本文学科_2016年度以前" },
    { value: "505600", label: "英語英米文学科" },
    { value: "505700", label: "日本語学科" },
    { value: "505800", label: "日本文学文化学科" },
    { value: "505900", label: "哲学科" },
    { value: "505A00", label: "歴史学科" },
    { value: "505B00", label: "環境地理学科" },
    { value: "505C00", label: "人文・ジャーナリズム学科" },
    { value: "505D00", label: "ジャーナリズム学科" },
    { value: "600000", label: "【ネットワーク情報学部】" },
    { value: "606100", label: "ネットワーク情報学科" },
    { value: "650000", label: "【人間科学部】" },
    { value: "659100", label: "心理学科" },
    { value: "659200", label: "社会学科" },
    { value: "670000", label: "【国際コミュニケーション学部】" },
    { value: "67A100", label: "日本語学科" },
    { value: "67A200", label: "異文化コミュニケーション学科" },
  ];

  let injectLoggedReason = false;
  let injectSuccessLogged = false;

  const ZEN_DIGIT = { "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7" };
  const YOBI_KANJI = { 月: "1", 火: "2", 水: "3", 木: "4", 金: "5", 土: "6" };

  function normalizeJa(s) {
    return String(s || "")
      .replace(/\u3000/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function saveDepartmentNameIfPresent() {
    const inp = document.querySelector('input[name="lblDprNm"]');
    if (!inp || !inp.value) return;
    const v = normalizeJa(inp.value);
    if (!v) return;
    tryStorageLocalSet({ [STORAGE_KEY_DEPT]: v });
  }

  function resolveCrclmValue(savedDept) {
    const name = normalizeJa(savedDept);
    if (!name) return "";
    const candidates = SYLLABUS_CRCLM_OPTIONS.filter((o) => !o.label.startsWith("【"));
    let hit = candidates.find((o) => o.label === name);
    if (hit) return hit.value;
    hit = candidates.find((o) => name.includes(o.label) || o.label.includes(name));
    return hit ? hit.value : "";
  }

  /** 見出しから年度・開講期 */
  function parseScheduleHeading(text) {
    const raw = String(text || "").replace(/\u3000/g, " ");
    const compact = raw.replace(/\s+/g, "");
    const yearM = compact.match(/(\d{4})年度/);
    const nendo = yearM ? yearM[1] : String(new Date().getFullYear());
    const kaikoM = compact.match(/(前期|後期|通年)/);
    const kaiko = kaikoM ? kaikoM[1] : "";
    return { nendo, kaiko, raw };
  }

  /** h3.outputset など「火曜１時限」「水曜2時限」形式からシラバス用 value(yobi)/value(jigen) */
  function parseYobiJigenFromHeading(text) {
    const compact = String(text || "").replace(/\u3000/g, " ").replace(/\s+/g, "");
    const yobiM = compact.match(/([月火水木金土])曜/);
    const yobi = yobiM ? YOBI_KANJI[yobiM[1]] || "" : "";
    const jm = compact.match(/([1-7]|[１-７])時限/);
    const jigen = jm ? ZEN_DIGIT[jm[1]] || jm[1] : "";
    return { yobi, jigen };
  }

  function risyuTermToKaikoCd(term) {
    const t = normalizeJa(term);
    if (t.includes("前期")) return "1";
    if (t.includes("後期")) return "2";
    if (t.includes("通年")) return "3";
    return "";
  }

  function campusToCampusCd(cmps) {
    const c = normalizeJa(cmps);
    if (!c) return "";
    if (c.includes("神田")) return "111";
    if (c.includes("生田")) return "112";
    if (c.includes("ニ部") || c.includes("二部")) return "121";
    return "";
  }

  function rowField(tr, suffix) {
    const el = tr.querySelector(`input[name*="${suffix}"]`);
    return el ? normalizeJa(el.value) : "";
  }

  /** ris から直接 POST せず、公式 GET で開いた同一セッション内で入力→検索（サーバの遷移チェック回避） */
  function queueSyllabusSearchAndOpenTab(fields) {
    const payload = {
      nendo: fields.nendo,
      kouginm: fields.kouginm,
      syokunm: fields.syokunm,
      keywords: fields.keywords || "",
      searchKeywordFlg: fields.searchKeywordFlg || "1",
      crclm: fields.crclm,
      campuscd: fields.campuscd,
      kaikoCd: fields.kaikoCd,
      yobi: fields.yobi || "",
      jigen: fields.jigen || "",
      previewFirst: !!fields.previewFirst,
      ts: Date.now(),
    };
    tryStorageLocalSet({ [STORAGE_KEY_PENDING]: payload }, () => {
      window.open(SYLLABUS_ENTRY_URL, "_blank", "noopener,noreferrer");
    });
  }

  function openSyllabusForRow(tr) {
    tryStorageLocalGet([STORAGE_KEY_DEPT], (gotLocal) => {
      tryStorageSyncGet(["syllabusIncludeYobiJigen", "syllabusPreviewFirstResult"], (gotSync) => {
        const savedDept = gotLocal[STORAGE_KEY_DEPT] || "";
        const h3 = document.querySelector("h3.outputset");
        const headingText = h3 ? h3.textContent : "";
        const head = parseScheduleHeading(headingText);

        const kouginm = rowField(tr, "lblSbjNm");
        const syokunm = rowField(tr, "lblTchFlnm");
        const rowTerm = rowField(tr, "lblOpcTrm");
        const campus = rowField(tr, "lblCmps");
        const nendoRow = tr.querySelector('input[name*="hdnLsnOpcFcy"]');
        const nendo = (nendoRow && nendoRow.value) || head.nendo;

        const kaikoCd = risyuTermToKaikoCd(rowTerm || head.kaiko);
        const crclm = resolveCrclmValue(savedDept);
        const campuscd = campusToCampusCd(campus);

        let yobi = "";
        let jigen = "";
        if (gotSync.syllabusIncludeYobiJigen) {
          const yj = parseYobiJigenFromHeading(headingText);
          yobi = yj.yobi;
          jigen = yj.jigen;
          if (yobi || jigen) {
            console.info(LOG, "曜日・時限を検索条件に含めます", yj, headingText.trim());
          }
        }

        if (!savedDept) {
          alert(
            "学科名が未保存です。先に申請状況画面（ARD010）など、冒頭に学科が表示されるページを一度開いてから、もう一度お試しください。"
          );
          return;
        }
        if (!crclm) {
          console.warn(
            LOG,
            "学部学科に一致なし:",
            savedDept,
            "→ syllabus-search.js 内 SYLLABUS_CRCLM_OPTIONS を更新してください。"
          );
        }

        queueSyllabusSearchAndOpenTab({
          nendo,
          kouginm,
          syokunm,
          keywords: "",
          searchKeywordFlg: "1",
          crclm,
          campuscd,
          kaikoCd,
          yobi,
          jigen,
          previewFirst: !!gotSync.syllabusPreviewFirstResult,
        });
      });
    });
  }

  function thTextNorm(el) {
    return (el.textContent || "").replace(/\s/g, "");
  }

  /** 本番で form 名・table class が微妙に違う場合や、table だけ先に出る場合に対応 */
  function findAllocationTable() {
    const q = (sel, root) => (root || document).querySelector(sel);
    let table = q('form[name="ARD010PCT02Form"] table.output');
    if (table) return table;
    table = q('form[action*="ARD010PCT02"] table.output');
    if (table) return table;
    table = q('form[action*="ARD010"] table.output');
    if (table) return table;
    table = q("table.output");
    if (table && q('input[name*="lblSbjNm"]', table)) return table;
    const probe = q('input[name*="lblSbjNm"]');
    return probe ? probe.closest("table") : null;
  }

  function logSkipOnce(reason, detail) {
    if (injectLoggedReason) return;
    injectLoggedReason = true;
    console.info(LOG, reason, detail || "");
  }

  function ensureRisyukeeperInjectStyles(modern) {
    let s = document.getElementById("risyukeeper-inject-ui");
    if (!s) {
      s = document.createElement("style");
      s.id = "risyukeeper-inject-ui";
      (document.head || document.documentElement).appendChild(s);
    }
    if (modern) {
      s.textContent = `
        button.risyukeeper-syllabus-open--modern {
          font-size:11px;
          font-weight:600;
          padding:4px 10px;
          margin:0;
          cursor:pointer;
          white-space:nowrap;
          border:1px solid #1a4a6e;
          border-radius:6px;
          background:linear-gradient(180deg,#f0f6fb,#dceaf5);
          color:#111827;
          box-shadow:
            0 1px 2px rgba(30,58,90,.12),
            inset 0 1px 0 rgba(255,255,255,.85);
        }
        button.risyukeeper-syllabus-open--modern:hover {
          border-color:#0f3550;
          background:linear-gradient(180deg,#e2eef8,#c9ddf0);
          color:#0f172a;
        }
        th.risyukeeper-syllabus-th--modern {
          background:#b0bfd4 !important;
          color:#111827 !important;
          font-weight:600 !important;
          border:1px solid #9aa6b5 !important;
          border-bottom:2px solid #2f6f9c !important;
        }
      `;
    } else {
      s.textContent = "";
    }
  }

  function styleSyllabusButton(btn, modern) {
    btn.classList.toggle("risyukeeper-syllabus-open--modern", modern);
    if (modern) {
      btn.style.cssText = "";
    } else {
      btn.style.cssText =
        "font-size:11px;padding:2px 6px;cursor:pointer;white-space:nowrap;margin:0;";
    }
  }

  function injectAllocationUiInner(modern) {
    try {
      ensureRisyukeeperInjectStyles(modern);

      const table = findAllocationTable();
      if (!table) {
        logSkipOnce(
          "配当テーブル未検出（このフレームに科目一覧なし、または別URLの可能性）",
          { href: location.href, frames: window !== window.top }
        );
        return;
      }

      const headerRow = table.rows[0];
      if (!headerRow) {
        logSkipOnce("table.rows[0] なし");
        return;
      }

      if (!headerRow.querySelector("th.risyukeeper-syllabus-th")) {
        const ths = headerRow.querySelectorAll("th");
        let insertAfter = null;
        for (const th of ths) {
          if (thTextNorm(th).includes("科目名称")) {
            insertAfter = th;
            break;
          }
        }
        if (!insertAfter) {
          logSkipOnce('見出し行に「科目名称」列がありません（動的生成・表記変更の可能性）', {
            headers: Array.from(ths).map((t) => thTextNorm(t)),
          });
          return;
        }
        const th = document.createElement("th");
        th.className = "risyukeeper-syllabus-th";
        if (modern) th.classList.add("risyukeeper-syllabus-th--modern");
        th.scope = "col";
        th.textContent = "シラバス";
        th.title = "履修申請の行からシラバス検索（別タブ）";
        insertAfter.insertAdjacentElement("afterend", th);
      } else {
        const syllabusTh = headerRow.querySelector("th.risyukeeper-syllabus-th");
        if (syllabusTh) syllabusTh.classList.toggle("risyukeeper-syllabus-th--modern", modern);
      }

      const rows = Array.from(table.rows).slice(1);
      let added = 0;
      for (const tr of rows) {
        if (!tr.querySelector('input[name*="lblSbjNm"]')) continue;

        const existingCell = tr.querySelector(".risyukeeper-syllabus-cell");
        if (existingCell) {
          const b = existingCell.querySelector(".risyukeeper-syllabus-open");
          if (b) styleSyllabusButton(b, modern);
          continue;
        }

        const nameInp = tr.querySelector('input[name*="lblSbjNm"]');
        const nameTd = nameInp ? nameInp.closest("td") : null;
        if (!nameTd) continue;

        const td = document.createElement("td");
        td.className = "risyukeeper-syllabus-cell";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "risyukeeper-syllabus-open";
        btn.textContent = "検索";
        btn.title = "シラバスを別タブで開く（入力は自動）";
        styleSyllabusButton(btn, modern);
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          openSyllabusForRow(tr);
        });

        td.appendChild(btn);
        nameTd.insertAdjacentElement("afterend", td);
        added += 1;
      }

      if (added > 0 && !injectSuccessLogged) {
        injectSuccessLogged = true;
        console.info(LOG, "シラバス検索ボタンを追加しました", added, "行（フレーム:", window === window.top ? "top" : "子iframe", "）");
      }
    } catch (e) {
      console.warn(LOG, "inject エラー", e);
    }
  }

  function injectAllocationUi() {
    tryStorageSyncGet(["modernUiMode"], (items) => {
      const modern = items.modernUiMode !== false;
      injectAllocationUiInner(modern);
    });
  }

  function scheduleInject() {
    saveDepartmentNameIfPresent();
    injectAllocationUi();
  }

  scheduleInject();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || changes.modernUiMode === undefined) return;
      scheduleInject();
    });
  } catch (e) {
    if (!isExtensionContextInvalidated(e)) throw e;
  }

  let debounceTimer = null;
  const obs = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      saveDepartmentNameIfPresent();
      injectAllocationUi();
    }, 120);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  let retries = 0;
  const retryIv = setInterval(() => {
    if (document.querySelector(".risyukeeper-syllabus-open")) {
      clearInterval(retryIv);
      return;
    }
    saveDepartmentNameIfPresent();
    injectAllocationUi();
    retries += 1;
    if (retries >= 80) clearInterval(retryIv);
  }, 400);
})();
