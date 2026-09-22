const LIBRARY_KEY = "spinner.library.v2";
const LEGACY_KEY = "spinner.wheel.v1";
export const DEFAULT_WHEEL_ID = "default";

function emptyLibrary() {
  return {
    activeId: null,
    wheels: {},
  };
}

function firstWheelId(library) {
  const ids = Object.keys(library.wheels);
  const def = ids.find((id) => library.wheels[id]?.isDefault);
  return def || ids[0] || null;
}

function readLibraryRaw() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.wheels || typeof data.wheels !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function migrateLegacy(library) {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return library;
    const legacy = JSON.parse(raw);
    if (!legacy?.entries?.length) {
      localStorage.removeItem(LEGACY_KEY);
      return library;
    }
    const id = newWheelId();
    library.wheels[id] = {
      id,
      name: legacy.title || "Imported wheel",
      isDefault: false,
      snapshot: {
        title: legacy.title || "Imported wheel",
        entries: legacy.entries,
        results: legacy.results || [],
        settings: legacy.settings || {},
      },
    };
    library.activeId = id;
    localStorage.removeItem(LEGACY_KEY);
    return library;
  } catch {
    return library;
  }
}

export function loadLibrary() {
  let library = readLibraryRaw() || emptyLibrary();
  if (!library.wheels) library.wheels = {};

  // Preserve a default wheel if present; do not invent one.
  if (library.wheels[DEFAULT_WHEEL_ID]) {
    const def = library.wheels[DEFAULT_WHEEL_ID];
    // Drop placeholder defaults left over from older builds (no snapshot yet).
    if (!def.snapshot) {
      delete library.wheels[DEFAULT_WHEEL_ID];
    } else {
      def.isDefault = true;
      def.id = DEFAULT_WHEEL_ID;
    }
  }

  library = migrateLegacy(library);

  if (!library.activeId || !library.wheels[library.activeId]) {
    library.activeId = firstWheelId(library);
  }

  saveLibrary(library);
  return library;
}

export function saveLibrary(library) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
}

export function listWheels(library) {
  return Object.values(library.wheels).sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

export function upsertWheel(library, wheel) {
  library.wheels[wheel.id] = wheel;
  saveLibrary(library);
  return library;
}

export function deleteWheel(library, id) {
  const wheel = library.wheels[id];
  if (!wheel || wheel.isDefault) return library;
  delete library.wheels[id];
  if (library.activeId === id) library.activeId = firstWheelId(library);
  saveLibrary(library);
  return library;
}

export function setActiveWheel(library, id) {
  if (!library.wheels[id]) return library;
  library.activeId = id;
  saveLibrary(library);
  return library;
}

export function saveActiveSnapshot(library, snapshot) {
  const active = library.wheels[library.activeId];
  if (!active) return library;
  active.snapshot = snapshot;
  active.name = snapshot.title || active.name;
  saveLibrary(library);
  return library;
}

export function newWheelId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `wheel-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
