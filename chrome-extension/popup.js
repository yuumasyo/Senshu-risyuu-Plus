const DEFAULTS = {
  enabled: true,
  idleSeconds: 120,
  debugMode: false,
  modernUiMode: true,
  syllabusIncludeYobiJigen: true,
  syllabusPreviewFirstResult: true,
  matchMode: "zenki_doyou_7",
  customOnclickIncludes: "\\t1\\tF7\\t",
};

const STORAGE_KEYS = [
  "enabled",
  "idleSeconds",
  "idleMinutes",
  "debugMode",
  "modernUiMode",
  "syllabusIncludeYobiJigen",
  "syllabusPreviewFirstResult",
  "matchMode",
  "customOnclickIncludes",
];

const PANEL_TITLE_IDS = [
  "panelLookTitle",
  "panelKeepTitle",
  "panelSyllabusTitle",
  "panelTargetTitle",
];

function applyUiTheme(modern) {
  document.documentElement.classList.toggle("ui-modern", modern);
  document.documentElement.classList.toggle("ui-classic", !modern);
  const badge = $("brandBadge");
  if (badge) badge.hidden = !modern;
  for (const id of PANEL_TITLE_IDS) {
    const el = $(id);
    if (el) el.hidden = !modern;
  }
}

function $(id) {
  return document.getElementById(id);
}

function secondsToUi(idleSeconds) {
  const sec = Number(idleSeconds);
  if (!Number.isFinite(sec)) return { value: 2, unit: "min" };
  if (sec % 60 === 0 && sec >= 60) {
    return { value: sec / 60, unit: "min" };
  }
  return { value: sec, unit: "sec" };
}

function toggleCustom() {
  const custom = $("matchMode").value === "custom";
  $("customWrap").style.display = custom ? "flex" : "none";
}

function load() {
  chrome.storage.sync.get(STORAGE_KEYS, (items) => {
    let idleSeconds = items.idleSeconds;
    if (idleSeconds == null || !Number.isFinite(Number(idleSeconds))) {
      const m = items.idleMinutes;
      if (m != null && Number.isFinite(Number(m))) {
        idleSeconds = Math.round(Number(m) * 60);
      } else {
        idleSeconds = DEFAULTS.idleSeconds;
      }
    }
    idleSeconds = Math.max(1, Math.min(86400, Math.round(Number(idleSeconds))));

    const modern =
      items.modernUiMode === undefined ? DEFAULTS.modernUiMode : !!items.modernUiMode;
    applyUiTheme(modern);
    $("modernUiMode").checked = modern;

    $("enabled").checked =
      items.enabled === undefined ? DEFAULTS.enabled : !!items.enabled;
    const ui = secondsToUi(idleSeconds);
    $("idleValue").value = ui.value;
    $("idleUnit").value = ui.unit;
    $("debugMode").checked = !!items.debugMode;
    $("syllabusIncludeYobiJigen").checked =
      items.syllabusIncludeYobiJigen === undefined
        ? DEFAULTS.syllabusIncludeYobiJigen
        : !!items.syllabusIncludeYobiJigen;
    $("syllabusPreviewFirstResult").checked =
      items.syllabusPreviewFirstResult === undefined
        ? DEFAULTS.syllabusPreviewFirstResult
        : !!items.syllabusPreviewFirstResult;
    $("matchMode").value = items.matchMode || DEFAULTS.matchMode;
    $("customOnclickIncludes").value =
      items.customOnclickIncludes || DEFAULTS.customOnclickIncludes;
    toggleCustom();
  });
}

function save() {
  const raw = parseFloat(String($("idleValue").value).replace(",", "."));
  const unit = $("idleUnit").value;
  let idleSeconds =
    unit === "min" ? Math.round(raw * 60) : Math.round(raw);
  if (!Number.isFinite(idleSeconds) || idleSeconds < 1) idleSeconds = 1;
  idleSeconds = Math.min(86400, idleSeconds);

  const payload = {
    enabled: $("enabled").checked,
    idleSeconds,
    debugMode: $("debugMode").checked,
    modernUiMode: $("modernUiMode").checked,
    syllabusIncludeYobiJigen: $("syllabusIncludeYobiJigen").checked,
    syllabusPreviewFirstResult: $("syllabusPreviewFirstResult").checked,
    matchMode: $("matchMode").value,
    customOnclickIncludes:
      $("customOnclickIncludes").value.trim() || DEFAULTS.customOnclickIncludes,
  };
  chrome.storage.sync.set(payload, () => window.close());
}

document.addEventListener("DOMContentLoaded", load);
$("save").addEventListener("click", save);
$("matchMode").addEventListener("change", toggleCustom);
$("modernUiMode").addEventListener("change", () => applyUiTheme($("modernUiMode").checked));
