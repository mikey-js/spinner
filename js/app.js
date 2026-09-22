import { Wheel } from "./wheel.js";
import {
  loadLibrary,
  saveLibrary,
  saveActiveSnapshot,
  setActiveWheel,
  deleteWheel,
  upsertWheel,
  listWheels,
  newWheelId,
  downloadJson,
  DEFAULT_WHEEL_ID,
} from "./storage.js";
import { playTick, playWin } from "./audio.js";
import { initConfetti, burstConfetti, stopConfetti } from "./confetti.js";
import {
  encodeShareUrl,
  decodeShareFromLocation,
  clearShareFromLocation,
  getShareBaseUrl,
  SHARE_URL_SOFT_LIMIT,
} from "./share.js";
import { qrDataUrl } from "./qr.js";
import { builtinShareHash } from "./default-share-token.js";

const PALETTE = ["#063893", "#d2ecf2", "#fefefe"];
const TEXT_FOR = {
  "#063893": "#ffffff",
  "#d2ecf2": "#111827",
  "#fefefe": "#111827",
};

const ICONS = {
  trash: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
  share: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.5 10.5 15.5 6.5M8.5 13.5l7 4"/></svg>`,
  grip: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17" r="1.4"/><circle cx="15" cy="17" r="1.4"/></svg>`,
};

const els = {
  title: document.getElementById("wheel-title"),
  titleEdit: document.getElementById("wheel-title-edit"),
  canvas: document.getElementById("wheel"),
  pointer: document.getElementById("pointer"),
  spin: document.getElementById("btn-spin"),
  mute: document.getElementById("btn-mute"),
  fullscreen: document.getElementById("btn-fullscreen"),
  panelToggle: document.getElementById("btn-panel"),
  panel: document.getElementById("side-panel"),
  activeList: document.getElementById("active-list"),
  inactiveList: document.getElementById("inactive-list"),
  activeCount: document.getElementById("active-count"),
  inactiveCount: document.getElementById("inactive-count"),
  lockNote: document.getElementById("entries-lock-note"),
  addForm: document.getElementById("add-entry-form"),
  addInput: document.getElementById("add-entry-input"),
  addBtn: document.getElementById("btn-add-entry"),
  restoreRemoved: document.getElementById("btn-restore-removed"),
  shuffle: document.getElementById("btn-shuffle"),
  resultsList: document.getElementById("results-list"),
  resultsEmpty: document.getElementById("results-empty"),
  clearResults: document.getElementById("btn-clear-results"),
  autoRemove: document.getElementById("opt-auto-remove"),
  confetti: document.getElementById("opt-confetti"),
  sounds: document.getElementById("opt-sounds"),
  spinTime: document.getElementById("opt-spin-time"),
  spinTimeValue: document.getElementById("spin-time-value"),
  titleInput: document.getElementById("opt-title"),
  exportBtn: document.getElementById("btn-export"),
  importBtn: document.getElementById("btn-import"),
  importFile: document.getElementById("import-file"),
  saveAsNew: document.getElementById("btn-save-as-new"),
  newWheel: document.getElementById("btn-new-wheel"),
  wheelLibrary: document.getElementById("wheel-library"),
  winnerOverlay: document.getElementById("winner-on-wheel"),
  winnerText: document.getElementById("winner-text"),
  dismissWinner: document.getElementById("btn-dismiss-winner"),
  removeWinner: document.getElementById("btn-remove-winner"),
  confettiCanvas: document.getElementById("confetti"),
  shareModal: document.getElementById("share-modal"),
  shareUrl: document.getElementById("share-url"),
  shareQr: document.getElementById("share-qr"),
  shareStatus: document.getElementById("share-status"),
  copyShare: document.getElementById("btn-copy-share"),
  closeShare: document.getElementById("btn-close-share"),
};

const EPHEMERAL_ID = "__shared__";

const wheel = new Wheel(els.canvas);
/** Canonical catalog for heal while a shared/default link is open (not stored in the library). */
let defaultWheel = null;
/** Session-only wheel from `/default` or `#w=` - never written into the saved library. */
let ephemeral = null;
/** Ignore hashclears caused by clearShareFromLocation(). */
let ignoreHashClear = false;
let library = null;
let state = null;
let muted = false;
let lastWinner = null;
let dragEntryId = null;
let renamingTitle = false;

function isViewingEphemeral() {
  return !!ephemeral && !library?.activeId;
}

function catalogLocked() {
  // Shared /default is spin-only while that session wheel is selected.
  return isViewingEphemeral();
}

function textColorFor(bg) {
  const key = String(bg || "").toLowerCase();
  return TEXT_FOR[key] || pickTextColor(key);
}

function pickTextColor(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#111827" : "#ffffff";
}

function isRemoved(entry) {
  return !!entry?.removed;
}

function activeEntries(entries = state?.entries || []) {
  return entries.filter((e) => !isRemoved(e));
}

function inactiveEntries(entries = state?.entries || []) {
  return entries.filter((e) => isRemoved(e));
}

function entryCounts(entries = state?.entries || []) {
  const total = entries.length;
  const active = entries.filter((e) => !isRemoved(e)).length;
  return { active, total, inactive: total - active };
}

function syncWheelCanvas() {
  wheel.setEntries(activeEntries());
}

function snapshotFromState() {
  return {
    title: state.title,
    entries: state.entries,
    results: state.results,
    settings: state.settings,
  };
}

function persist() {
  if (isViewingEphemeral()) {
    ephemeral = {
      title: state.title,
      entries: state.entries,
      results: state.results,
      settings: state.settings,
    };
    renderLibrary();
    syncCatalogLockUi();
    return;
  }
  if (!library.activeId || !library.wheels[library.activeId]) {
    renderLibrary();
    return;
  }
  library = saveActiveSnapshot(library, snapshotFromState());
  renderLibrary();
}

function normalizeTitle(value) {
  return String(value || "").trim() || "Untitled";
}

function titleEditable() {
  return !catalogLocked();
}

function applyTitle() {
  const name = normalizeTitle(state.title);
  state.title = name;
  els.title.textContent = name;
  document.title = name;
  els.titleInput.value = name;
  if (!renamingTitle) els.titleEdit.value = name;
  syncTitleEditUi();
}

function syncTitleEditUi() {
  const canEdit = titleEditable();
  els.title.classList.toggle("is-editable", canEdit);
  els.title.tabIndex = canEdit ? 0 : -1;
  els.title.title = canEdit ? "Click to rename" : "";
  els.title.setAttribute("aria-label", canEdit ? `${els.title.textContent} (click to rename)` : els.title.textContent);
  els.titleInput.disabled = !canEdit;
  if (!canEdit && renamingTitle) cancelTitleEdit();
}

function startTitleEdit() {
  if (!titleEditable() || renamingTitle) return;
  renamingTitle = true;
  els.title.hidden = true;
  els.titleEdit.hidden = false;
  els.titleEdit.value = state.title || "";
  requestAnimationFrame(() => {
    els.titleEdit.focus();
    els.titleEdit.select();
  });
}

function commitTitleEdit() {
  if (!renamingTitle) return;
  renamingTitle = false;
  const next = normalizeTitle(els.titleEdit.value);
  els.title.hidden = false;
  els.titleEdit.hidden = true;
  if (next !== state.title) {
    state.title = next;
    applyTitle();
    persist();
  } else {
    applyTitle();
  }
}

function cancelTitleEdit() {
  if (!renamingTitle) return;
  renamingTitle = false;
  els.title.hidden = false;
  els.titleEdit.hidden = true;
  els.titleEdit.value = state.title || "";
}

function syncCatalogLockUi() {
  const locked = catalogLocked();
  els.lockNote.hidden = !locked;
  els.addForm.classList.toggle("is-disabled", locked);
  els.addInput.disabled = locked;
  els.addBtn.disabled = locked;
  document.getElementById("tab-entries")?.classList.toggle("catalog-locked", locked);
  syncTitleEditUi();

  const { active, total } = entryCounts();
  const hasRemoved = active < total;
  const needsHeal = isViewingEphemeral() && defaultCatalogIncomplete();
  els.restoreRemoved.disabled = !hasRemoved && !needsHeal;
  els.restoreRemoved.title = hasRemoved
    ? `Move ${total - active} removed item${total - active === 1 ? "" : "s"} back on the wheel`
    : needsHeal
      ? "Restore missing prompts from the original shared wheel"
      : "No removed items to restore";
}

function syncSettingsUi() {
  const s = state.settings;
  els.autoRemove.checked = !!s.autoRemoveWinner;
  els.confetti.checked = s.showConfetti !== false;
  els.sounds.checked = !muted && s.sounds !== false;
  els.spinTime.value = String(s.spinTime || 7);
  els.spinTimeValue.textContent = String(s.spinTime || 7);
  document.body.classList.toggle("is-muted", muted || s.sounds === false);
  syncCatalogLockUi();
}

function syncPointerColor() {
  if (!state.settings.pointerMatchSegmentColor) {
    els.pointer.style.borderTopColor = "var(--accent)";
    return;
  }
  els.pointer.style.borderTopColor = wheel.colorAtPointer();
}

function refreshEntriesUi() {
  renderEntryLists();
  syncWheelCanvas();
  syncSettingsUi();
  syncPointerColor();
}

function renderResults() {
  const results = state.results || [];
  els.resultsList.innerHTML = "";
  els.resultsEmpty.hidden = results.length > 0;
  results.forEach((r) => {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "result-swatch";
    swatch.style.background = r.backgroundColor || "#888";
    const body = document.createElement("div");
    const text = document.createElement("p");
    text.className = "result-text";
    text.textContent = r.value;
    const meta = document.createElement("p");
    meta.className = "result-meta";
    meta.textContent = new Date(r.at).toLocaleString();
    body.append(text, meta);
    li.append(swatch, body);
    els.resultsList.append(li);
  });
}

function createIconButton(className, title, svg, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = svg;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return btn;
}

function wheelNeedsRestore(item) {
  const entries =
    item.snapshot && Array.isArray(item.snapshot.entries) ? item.snapshot.entries : [];
  const { active, total } = entryCounts(entries);
  return active < total;
}

function renderLibrary() {
  const items = listWheels(library);
  els.wheelLibrary.innerHTML = "";

  if (ephemeral) {
    const row = document.createElement("label");
    row.className = "wheel-radio shared-session";
    if (isViewingEphemeral()) row.classList.add("is-active");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "wheel-select";
    radio.value = EPHEMERAL_ID;
    radio.checked = isViewingEphemeral();
    radio.addEventListener("change", () => {
      if (radio.checked) switchToEphemeral();
    });

    const mark = document.createElement("span");
    mark.className = "wheel-radio-mark";
    mark.setAttribute("aria-hidden", "true");

    const info = document.createElement("span");
    info.className = "wheel-lib-info";
    const name = document.createElement("span");
    name.className = "wheel-lib-name";
    name.textContent = ephemeral.title || "Shared wheel";
    const meta = document.createElement("span");
    meta.className = "wheel-lib-meta";
    const { active, total } = entryCounts(ephemeral.entries || []);
    meta.textContent = `Default · session${total ? ` · ${active}/${total}` : ""}`;
    info.append(name, meta);

    const actions = document.createElement("span");
    actions.className = "wheel-lib-actions";
    const shareBtn = createIconButton("icon-action ghost-icon", "Share wheel", ICONS.share, () => {
      if (isViewingEphemeral()) shareEphemeral();
      else {
        // Share the session default even if another wheel is selected
        shareWheelData({
          title: ephemeral.title,
          entries: ephemeral.entries,
          settings: ephemeral.settings,
        });
      }
    });
    const resetBtn = createIconButton(
      "icon-action ghost-icon",
      "Restore removed entries",
      ICONS.reset,
      () => {
        if (isViewingEphemeral()) restoreRemovedEntries();
        else {
          ephemeral.entries = restoreEntriesInPlace(ephemeral.entries || [], true);
          renderLibrary();
        }
      }
    );
    resetBtn.disabled = active >= total && !defaultCatalogIncomplete(ephemeral.entries || []);
    actions.append(resetBtn, shareBtn);
    row.append(radio, mark, info, actions);
    els.wheelLibrary.append(row);
  }

  items.forEach((item) => {
    const row = document.createElement("label");
    row.className = "wheel-radio";
    if (!isViewingEphemeral() && item.id === library.activeId) row.classList.add("is-active");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "wheel-select";
    radio.value = item.id;
    radio.checked = !isViewingEphemeral() && item.id === library.activeId;
    radio.addEventListener("change", () => {
      if (radio.checked) switchToWheel(item.id);
    });

    const mark = document.createElement("span");
    mark.className = "wheel-radio-mark";
    mark.setAttribute("aria-hidden", "true");

    const info = document.createElement("span");
    info.className = "wheel-lib-info";
    const name = document.createElement("span");
    name.className = "wheel-lib-name";
    name.textContent = item.name || "Untitled wheel";
    const meta = document.createElement("span");
    meta.className = "wheel-lib-meta";
    const entries =
      item.snapshot && Array.isArray(item.snapshot.entries) ? item.snapshot.entries : [];
    const { active, total } = entryCounts(entries);
    meta.textContent = total > 0 ? `${active}/${total}` : "Empty";
    info.append(name, meta);

    const actions = document.createElement("span");
    actions.className = "wheel-lib-actions";

    const resetBtn = createIconButton(
      "icon-action ghost-icon",
      "Restore removed entries",
      ICONS.reset,
      () => restoreWheelById(item.id)
    );
    resetBtn.disabled = !wheelNeedsRestore(item);
    actions.append(resetBtn);

    const shareBtn = createIconButton("icon-action ghost-icon", "Share wheel", ICONS.share, () => {
      shareWheelById(item.id);
    });
    actions.append(shareBtn);

    const delBtn = createIconButton("icon-action danger-icon", "Delete wheel", ICONS.trash, () => {
      if (!confirm(`Delete “${item.name}” from this browser?`)) return;
      const wasActive = !isViewingEphemeral() && library.activeId === item.id;
      library = deleteWheel(library, item.id);
      if (wasActive) {
        if (Object.keys(library.wheels).length) loadActiveWheel();
        else if (ephemeral) {
          library.activeId = null;
          saveLibrary(library);
          loadActiveWheel();
        } else {
          seedBlankUntitled();
          loadActiveWheel();
        }
      } else renderLibrary();
    });
    actions.append(delBtn);

    row.append(radio, mark, info, actions);
    els.wheelLibrary.append(row);
  });
}

function renderEntryLists() {
  const active = activeEntries();
  const inactive = inactiveEntries();
  els.activeCount.textContent = String(active.length);
  els.inactiveCount.textContent = String(inactive.length);
  fillEntryList(els.activeList, active, false);
  fillEntryList(els.inactiveList, inactive, true);
}

function fillEntryList(listEl, entries, removed) {
  listEl.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "entry-empty";
    empty.textContent = removed ? "No removed items" : "No active items";
    listEl.append(empty);
    return;
  }

  const locked = catalogLocked();
  // Phones: drag the whole row. Desktop: only the grip so text stays selectable.
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `entry-item${removed ? " is-removed" : ""}`;
    li.draggable = coarsePointer;
    li.dataset.id = entry.id;

    const armDrag = () => {
      li.draggable = true;
    };
    const disarmDrag = () => {
      li.draggable = coarsePointer;
    };

    const handle = document.createElement("span");
    handle.className = "entry-grip";
    handle.title = "Drag to move";
    handle.setAttribute("aria-label", "Drag to move");
    handle.innerHTML = ICONS.grip;
    handle.addEventListener("pointerdown", armDrag);

    const swatch = document.createElement("span");
    swatch.className = "entry-swatch";
    swatch.style.background = entry.backgroundColor || "#888";
    swatch.addEventListener("pointerdown", armDrag);

    const text = document.createElement(locked ? "span" : "input");
    if (locked) {
      text.className = "entry-text";
      text.textContent = entry.value;
      // Locked rows: drag from the label area too
      text.addEventListener("pointerdown", armDrag);
    } else {
      text.className = "entry-text-input";
      text.type = "text";
      text.value = entry.value;
      text.draggable = false;
      // Selecting / editing text must not arm a row drag
      text.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        disarmDrag();
      });
      text.addEventListener("change", () => {
        const next = text.value.trim();
        if (!next) {
          text.value = entry.value;
          return;
        }
        updateEntryValue(entry.id, next);
      });
      text.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          text.blur();
        }
      });
    }

    li.append(handle, swatch, text);

    if (!locked) {
      const trash = createIconButton("icon-action danger-icon", "Permanently delete", ICONS.trash, () => {
        if (!confirm("Permanently delete this entry from the wheel?")) return;
        permanentlyDeleteEntry(entry.id);
      });
      li.append(trash);
    }

    li.addEventListener("dragstart", (e) => {
      if (e.target.closest("input, textarea, button")) {
        e.preventDefault();
        disarmDrag();
        return;
      }
      dragEntryId = entry.id;
      li.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", entry.id);
    });
    li.addEventListener("dragend", () => {
      dragEntryId = null;
      li.classList.remove("is-dragging");
      disarmDrag();
      document.querySelectorAll(".entry-list.is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
    });

    listEl.append(li);
  });
}

function bindEntryDnD() {
  [els.activeList, els.inactiveList].forEach((list) => {
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      list.classList.add("is-drag-over");
      e.dataTransfer.dropEffect = "move";
    });
    list.addEventListener("dragleave", () => list.classList.remove("is-drag-over"));
    list.addEventListener("drop", (e) => {
      e.preventDefault();
      list.classList.remove("is-drag-over");
      const id = e.dataTransfer.getData("text/plain") || dragEntryId;
      if (!id) return;
      const toInactive = list.dataset.zone === "inactive";
      moveEntryToZone(id, toInactive, e.target.closest(".entry-item")?.dataset.id);
    });
  });
}

function moveEntryToZone(id, toInactive, beforeId) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;

  const others = state.entries.filter((e) => e.id !== id);
  const updated = { ...entry, removed: toInactive };

  const targetPool = others.filter((e) => !!e.removed === toInactive);
  const otherPool = others.filter((e) => !!e.removed !== toInactive);

  let inserted = false;
  const nextTarget = [];
  for (const e of targetPool) {
    if (beforeId && e.id === beforeId) {
      nextTarget.push(updated);
      inserted = true;
    }
    nextTarget.push(e);
  }
  if (!inserted) nextTarget.push(updated);

  // Keep active block first, then inactive - matches editor mental model
  state.entries = toInactive ? [...otherPool, ...nextTarget] : [...nextTarget, ...otherPool];
  hideWinner();
  refreshEntriesUi();
  persist();
}

function updateEntryValue(id, value) {
  if (catalogLocked()) return;
  state.entries = state.entries.map((e) => (e.id === id ? { ...e, value } : e));
  refreshEntriesUi();
  persist();
}

function permanentlyDeleteEntry(id) {
  if (catalogLocked()) return;
  state.entries = state.entries.filter((e) => e.id !== id);
  if (lastWinner?.id === id) hideWinner();
  refreshEntriesUi();
  persist();
}

function addEntry(value) {
  if (catalogLocked()) return;
  const text = value.trim();
  if (!text) return;
  const i = activeEntries().length;
  const bg = PALETTE[i % PALETTE.length];
  state.entries = [
    ...activeEntries(),
    {
      id: `text-${Date.now()}`,
      type: "text",
      value: text,
      weight: 1,
      backgroundColor: bg,
      textColor: textColorFor(bg),
      removed: false,
    },
    ...inactiveEntries(),
  ];
  refreshEntriesUi();
  persist();
}

function softRemoveEntryById(id) {
  state.entries = state.entries.map((e) => (e.id === id ? { ...e, removed: true } : e));
  hideWinner();
  refreshEntriesUi();
  persist();
}

function mergeMissingFromDefault(entries) {
  if (!defaultWheel?.entries?.length) return entries;
  const ids = new Set(entries.map((e) => e.id));
  const values = new Set(entries.map((e) => e.value));
  const missing = defaultWheel.entries.filter((e) => !ids.has(e.id) && !values.has(e.value));
  if (!missing.length) return entries;
  return [...entries, ...missing.map((e) => ({ ...structuredClone(e), removed: false }))];
}

function defaultCatalogIncomplete(entries = state?.entries || []) {
  if (!defaultWheel?.entries?.length) return false;
  const ids = new Set(entries.map((e) => e.id));
  const values = new Set(entries.map((e) => e.value));
  return defaultWheel.entries.some((e) => !ids.has(e.id) && !values.has(e.value));
}

function healDefaultCatalogIfNeeded() {
  if (!isViewingEphemeral()) return false;
  const before = state.entries.length;
  state.entries = mergeMissingFromDefault(state.entries);
  return state.entries.length !== before;
}

function restoreEntriesInPlace(entries, mergeCatalog) {
  let next = entries.map((e) => ({ ...e, removed: false }));
  if (mergeCatalog) next = mergeMissingFromDefault(next);
  return next.map((e, i) => {
    const bg = e.backgroundColor || PALETTE[i % PALETTE.length];
    return { ...e, backgroundColor: bg, textColor: e.textColor || textColorFor(bg) };
  });
}

function restoreRemovedEntries() {
  const hadRemoved = state.entries.some(isRemoved);
  const needsHeal = isViewingEphemeral() && defaultCatalogIncomplete();
  if (!hadRemoved && !needsHeal) return;
  state.entries = restoreEntriesInPlace(state.entries, isViewingEphemeral());
  hideWinner();
  refreshEntriesUi();
  persist();
}

function restoreWheelById(id) {
  if (!isViewingEphemeral() && id === library.activeId) {
    restoreRemovedEntries();
    return;
  }
  const record = library.wheels[id];
  if (!record?.snapshot || !Array.isArray(record.snapshot.entries)) return;
  record.snapshot = {
    ...record.snapshot,
    entries: restoreEntriesInPlace(record.snapshot.entries, false),
  };
  record.name = record.snapshot.title || record.name;
  library = upsertWheel(library, record);
  renderLibrary();
}

function wheelDataForShare(id) {
  if (!isViewingEphemeral() && id === library.activeId && state) {
    return {
      title: state.title,
      entries: state.entries,
      settings: state.settings,
    };
  }
  const record = library.wheels[id];
  if (record?.snapshot && Array.isArray(record.snapshot.entries)) {
    return {
      title: record.snapshot.title || record.name,
      entries: record.snapshot.entries,
      settings: record.snapshot.settings || {},
    };
  }
  return null;
}

async function shareWheelData(data) {
  if (!data?.entries?.length) {
    alert("Add at least one entry before sharing.");
    return;
  }
  try {
    const url = await encodeShareUrl({
      title: data.title,
      entries: data.entries,
      settings: data.settings,
    });
    await openShareModal(url, data.title);
  } catch (err) {
    console.error(err);
    alert("Could not build a share link for this wheel.");
  }
}

async function shareEphemeral() {
  persist();
  await shareWheelData(ephemeral || snapshotFromState());
}

async function shareWheelById(id) {
  if (!isViewingEphemeral() && id === library.activeId) persist();
  const data = wheelDataForShare(id);
  await shareWheelData(data);
}

function closeShareModal() {
  els.shareModal.hidden = true;
  els.shareStatus.hidden = true;
  els.shareStatus.textContent = "";
  els.shareStatus.classList.remove("is-warn");
}

async function openShareModal(url, title) {
  els.shareModal.hidden = false;
  els.shareUrl.value = url;
  els.shareStatus.hidden = true;
  document.getElementById("share-modal-title").textContent = `Share “${title || "wheel"}”`;
  els.shareQr.removeAttribute("src");
  try {
    els.shareQr.src = await qrDataUrl(url, 4, 2);
  } catch (err) {
    console.error(err);
    els.shareStatus.hidden = false;
    els.shareStatus.classList.add("is-warn");
    els.shareStatus.textContent = "QR code could not be generated — you can still copy the link.";
  }
  if (url.length > SHARE_URL_SOFT_LIMIT) {
    els.shareStatus.hidden = false;
    els.shareStatus.classList.add("is-warn");
    els.shareStatus.textContent =
      "This link is very long. It should still work, but some apps truncate big QR codes / URLs.";
  }
}

function safeClearShareFromLocation() {
  ignoreHashClear = true;
  clearShareFromLocation();
  // Defer so any hashchange from clearing the share token is ignored.
  setTimeout(() => {
    ignoreHashClear = false;
  }, 0);
}

function applySharedAsDefault(shared) {
  const entries = structuredClone(shared.entries || []);
  const title = shared.title || "Shared wheel";
  const settings = { ...blankWheelSettings(), ...(shared.settings || {}) };

  // Session-only - never written into the saved wheel library.
  ephemeral = {
    title,
    entries,
    results: [],
    settings,
  };
  defaultWheel = {
    id: "shared-catalog",
    title,
    entries: entries.map((e) => ({ ...structuredClone(e), removed: false })),
    customSettings: settings,
  };
  library.activeId = null;
  saveLibrary(library);
}

/** Drop the session default - only for bare root boot or a replacement share URL. */
function clearEphemeral() {
  ephemeral = null;
  defaultWheel = null;
}

async function applyShareFromUrl() {
  let shared = null;
  try {
    shared = await decodeShareFromLocation();
  } catch (err) {
    console.error("Share link decode failed:", err);
    alert("This share link could not be read.");
    safeClearShareFromLocation();
    return false;
  }
  if (!shared?.entries?.length) return false;
  // Only persist in-memory edits when a wheel is already open (hashchange), not during boot.
  if (state && !isViewingEphemeral() && library?.activeId) persist();
  applySharedAsDefault(shared);
  safeClearShareFromLocation();
  loadActiveWheel();
  return true;
}

function hideWinner() {
  els.winnerOverlay.hidden = true;
  lastWinner = null;
}

function showWinner(entry) {
  lastWinner = entry;
  els.winnerText.textContent = entry.value;
  els.winnerOverlay.hidden = false;
  els.removeWinner.hidden = !state.settings.showRemoveButton;
}

function setSpinning(isSpinning) {
  document.body.classList.toggle("is-spinning", isSpinning);
  els.spin.disabled = isSpinning;
  els.canvas.style.pointerEvents = isSpinning ? "none" : "auto";
}

async function doSpin() {
  if (wheel.spinning || wheel.count < 2) return;
  hideWinner();
  stopConfetti();
  setSpinning(true);

  wheel.onTick = () => {
    syncPointerColor();
    if (!muted && state.settings.sounds !== false) {
      playTick((state.settings.volume || 37) / 100);
    }
  };

  const duration = Number(state.settings.spinTime) || 7;
  const winner = await wheel.spin(duration);
  setSpinning(false);
  syncPointerColor();

  if (!winner) return;

  state.results = [
    {
      id: winner.id,
      value: winner.value,
      backgroundColor: winner.backgroundColor,
      at: Date.now(),
    },
    ...(state.results || []),
  ].slice(0, 100);
  renderResults();

  if (!muted && state.settings.sounds !== false) {
    playWin((state.settings.winnerVolume || 80) / 100);
  }
  if (state.settings.showConfetti !== false) {
    burstConfetti([...(state.settings.themeColors || PALETTE), "#fbbf24", "#8b7cf6"]);
  }

  if (state.settings.winnerDisplayMode === "on-wheel" || state.settings.showWinnerResult !== false) {
    showWinner(winner);
  }

  if (state.settings.autoRemoveWinner) {
    softRemoveEntryById(winner.id);
  } else {
    persist();
  }
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      document.querySelectorAll(".tab-pane").forEach((pane) => {
        const match = pane.id === `tab-${name}`;
        pane.hidden = !match;
        pane.classList.toggle("active", match);
      });
    });
  });
}

function hydrateFromPayload(data, results = []) {
  const settings = {
    showConfetti: true,
    sounds: true,
    spinTime: 7,
    autoRemoveWinner: false,
    showRemoveButton: true,
    pointerMatchSegmentColor: true,
    winnerDisplayMode: "on-wheel",
    showWinnerResult: true,
    volume: 37,
    winnerVolume: 80,
    themeColors: PALETTE,
    ...(data.customSettings || data.settings || {}),
  };
  if (settings.volume === 0) settings.sounds = false;

  state = {
    title: data.title || "Spin Wheel",
    entries: structuredClone(data.entries || []).map((e) => ({ ...e, removed: !!e.removed })),
    results: structuredClone(results),
    settings,
  };

  wheel.textureOpacity = settings.wheelTextureOpacity ?? 0.6;
  wheel.rotation = 0;
  applyTitle();
  renderResults();
  hideWinner();
  refreshEntriesUi();
}

function payloadForActive() {
  const record = library.wheels[library.activeId];
  // Use snapshot whenever it exists - including blank wheels with entries: []
  if (record?.snapshot && Array.isArray(record.snapshot.entries)) {
    return {
      data: {
        title: record.snapshot.title,
        entries: record.snapshot.entries,
        settings: record.snapshot.settings,
      },
      results: record.snapshot.results || [],
    };
  }
  return {
    data: {
      title: "Untitled",
      entries: [],
      settings: blankWheelSettings(),
    },
    results: [],
  };
}

function loadActiveWheel() {
  if (isViewingEphemeral()) {
    hydrateFromPayload(
      {
        title: ephemeral.title,
        entries: ephemeral.entries,
        settings: ephemeral.settings,
      },
      ephemeral.results || []
    );
    if (healDefaultCatalogIfNeeded()) refreshEntriesUi();
    persist(); // keeps ephemeral in sync only
    return;
  }
  const { data, results } = payloadForActive();
  hydrateFromPayload(data, results);
  persist();
}

function switchToEphemeral() {
  if (!ephemeral) return;
  if (isViewingEphemeral()) {
    renderLibrary();
    syncCatalogLockUi();
    return;
  }
  persist();
  library.activeId = null;
  saveLibrary(library);
  loadActiveWheel();
}

function switchToWheel(id) {
  if (!isViewingEphemeral() && id === library.activeId) {
    renderLibrary();
    return;
  }
  persist();
  library = setActiveWheel(library, id);
  loadActiveWheel();
}

function saveCurrentAsNew() {
  persist();
  const snap = snapshotFromState();
  const id = newWheelId();
  const title = `${snap.title || "Wheel"} (copy)`;
  library = upsertWheel(library, {
    id,
    name: title,
    isDefault: false,
    snapshot: {
      ...snap,
      title,
      entries: (snap.entries || []).map((e) => ({ ...e, removed: false })),
    },
  });
  library = setActiveWheel(library, id);
  loadActiveWheel();
}

function blankWheelSettings() {
  return {
    showConfetti: true,
    sounds: true,
    spinTime: 7,
    autoRemoveWinner: false,
    showRemoveButton: true,
    pointerMatchSegmentColor: true,
    winnerDisplayMode: "on-wheel",
    showWinnerResult: true,
    volume: 37,
    winnerVolume: 80,
    themeColors: PALETTE,
  };
}

function seedBlankUntitled() {
  const id = newWheelId();
  const title = "Untitled";
  library.wheels[id] = {
    id,
    name: title,
    isDefault: false,
    snapshot: {
      title,
      entries: [],
      results: [],
      settings: blankWheelSettings(),
    },
  };
  library.activeId = id;
  saveLibrary(library);
}

function createBlankWheel() {
  persist();
  const id = newWheelId();
  const title = "Untitled";
  library = upsertWheel(library, {
    id,
    name: title,
    isDefault: false,
    snapshot: {
      title,
      entries: [],
      results: [],
      settings: blankWheelSettings(),
    },
  });
  library = setActiveWheel(library, id);
  loadActiveWheel();
}

function importAsNewWheel(data) {
  const id = newWheelId();
  const title = data.title || "Imported wheel";
  const settings = data.customSettings || data.settings || {};
  library = upsertWheel(library, {
    id,
    name: title,
    isDefault: false,
    snapshot: {
      title,
      entries: data.entries,
      results: data.results || [],
      settings,
    },
  });
  library = setActiveWheel(library, id);
  loadActiveWheel();
}

function cryptoRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

function stripLegacyCachedDefault(lib) {
  if (!lib.wheels[DEFAULT_WHEEL_ID]) return lib;
  delete lib.wheels[DEFAULT_WHEEL_ID];
  if (lib.activeId === DEFAULT_WHEEL_ID) {
    const ids = Object.keys(lib.wheels);
    lib.activeId = ids[0] || null;
  }
  saveLibrary(lib);
  return lib;
}

/** If the app is somehow served on /default, bounce to root + builtin share hash. */
function redirectDefaultPathIfNeeded() {
  if (!/\/default\/?$/i.test(location.pathname)) return false;
  location.replace(`${getShareBaseUrl()}${builtinShareHash()}`);
  return true;
}

async function boot() {
  if (redirectDefaultPathIfNeeded()) return;

  initConfetti(els.confettiCanvas);
  library = loadLibrary();
  // Old builds cached /default into localStorage as an undeletable default - drop it.
  library = stripLegacyCachedDefault(library);

  const appliedShare = await applyShareFromUrl();
  if (!appliedShare) {
    // Bare root / no share token - session default must not survive a fresh load.
    clearEphemeral();
    if (!Object.keys(library.wheels).length) {
      seedBlankUntitled();
    } else if (!library.activeId || !library.wheels[library.activeId]) {
      // activeId is null after a prior shared session - reopen a saved wheel, don't spawn Untitled.
      library.activeId = Object.keys(library.wheels)[0];
      saveLibrary(library);
    }
  }

  loadActiveWheel();
  bindTabs();
  bindEntryDnD();

  window.addEventListener("hashchange", () => {
    if (ignoreHashClear) return;
    const hash = location.hash || "";
    if (!hash.startsWith("#w=") && !hash.startsWith("#w/")) return;
    applyShareFromUrl().catch((err) => {
      console.error(err);
    });
  });

  els.shareModal.querySelectorAll("[data-close-share]").forEach((el) => {
    el.addEventListener("click", closeShareModal);
  });
  els.closeShare.addEventListener("click", closeShareModal);
  els.copyShare.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.shareUrl.value);
      els.shareStatus.hidden = false;
      els.shareStatus.classList.remove("is-warn");
      els.shareStatus.textContent = "Link copied.";
    } catch {
      els.shareUrl.select();
      els.shareStatus.hidden = false;
      els.shareStatus.classList.add("is-warn");
      els.shareStatus.textContent = "Select the link and copy it manually.";
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.shareModal.hidden) closeShareModal();
  });

  els.spin.addEventListener("click", (e) => {
    e.stopPropagation();
    doSpin();
  });
  els.canvas.addEventListener("click", () => doSpin());

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) {
      if (renamingTitle) return;
      const tag = document.activeElement?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (document.activeElement === els.title) return;
      e.preventDefault();
      doSpin();
    }
  });

  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (catalogLocked()) return;
    addEntry(els.addInput.value);
    els.addInput.value = "";
    els.addInput.focus();
  });

  els.restoreRemoved.addEventListener("click", () => restoreRemovedEntries());

  els.shuffle.addEventListener("click", () => {
    const active = activeEntries();
    const removed = inactiveEntries();
    for (let i = active.length - 1; i > 0; i--) {
      const j = Math.floor(cryptoRandom() * (i + 1));
      [active[i], active[j]] = [active[j], active[i]];
    }
    const shuffledActive = active.map((e, i) => {
      const bg = PALETTE[i % PALETTE.length];
      return { ...e, removed: false, backgroundColor: bg, textColor: textColorFor(bg) };
    });
    state.entries = [...shuffledActive, ...removed];
    refreshEntriesUi();
    persist();
  });

  els.clearResults.addEventListener("click", () => {
    state.results = [];
    renderResults();
    persist();
  });

  els.autoRemove.addEventListener("change", () => {
    state.settings.autoRemoveWinner = els.autoRemove.checked;
    persist();
  });
  els.confetti.addEventListener("change", () => {
    state.settings.showConfetti = els.confetti.checked;
    persist();
  });
  els.sounds.addEventListener("change", () => {
    muted = !els.sounds.checked;
    state.settings.sounds = els.sounds.checked;
    document.body.classList.toggle("is-muted", muted);
    persist();
  });
  els.spinTime.addEventListener("input", () => {
    state.settings.spinTime = Number(els.spinTime.value);
    els.spinTimeValue.textContent = els.spinTime.value;
    persist();
  });
  els.titleInput.addEventListener("change", () => {
    if (!titleEditable()) return;
    state.title = normalizeTitle(els.titleInput.value);
    applyTitle();
    persist();
  });

  els.title.addEventListener("click", () => startTitleEdit());
  els.title.addEventListener("keydown", (e) => {
    if (!titleEditable()) return;
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startTitleEdit();
    }
  });
  els.titleEdit.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitleEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTitleEdit();
    }
  });
  els.titleEdit.addEventListener("blur", () => commitTitleEdit());

  els.mute.addEventListener("click", () => {
    muted = !muted;
    els.sounds.checked = !muted;
    state.settings.sounds = !muted;
    document.body.classList.toggle("is-muted", muted);
    persist();
  });

  els.fullscreen.addEventListener("click", async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  });

  els.panelToggle.addEventListener("click", () => {
    els.panel.classList.toggle("is-collapsed");
    requestAnimationFrame(() => {
      wheel.draw();
      syncPointerColor();
    });
  });

  els.dismissWinner.addEventListener("click", hideWinner);
  els.removeWinner.addEventListener("click", () => {
    if (lastWinner) softRemoveEntryById(lastWinner.id);
  });

  els.exportBtn.addEventListener("click", () => {
    downloadJson(`${(state.title || "wheel").replace(/\s+/g, "-").toLowerCase()}.json`, {
      title: state.title,
      entries: state.entries,
      customSettings: state.settings,
      results: state.results,
      exportedAt: new Date().toISOString(),
    });
  });

  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.entries) || !data.entries.length) {
        alert("Invalid wheel JSON: missing entries.");
        return;
      }
      persist();
      importAsNewWheel(data);
    } catch {
      alert("Could not parse JSON file.");
    } finally {
      els.importFile.value = "";
    }
  });

  els.saveAsNew.addEventListener("click", () => saveCurrentAsNew());
  els.newWheel.addEventListener("click", () => createBlankWheel());

  window.addEventListener("resize", () => {
    wheel.draw();
    syncPointerColor();
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif">Failed to load wheel: ${err.message}</p>`;
});
