/**
 * Share wheels via URL hash - no server storage.
 *
 * Format: `#w=<base64url(payload)>`
 * Payload bytes: [flag][data...]
 *   flag 0x01 = deflate-raw compressed UTF-8 JSON
 *   flag 0x00 = raw UTF-8 JSON (fallback)
 *
 * JSON shape (v1):
 *   { v:1, t:title, e:[[value, bg, fg, removed], ...], s?: settings }
 */

function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8Encode(text) {
  return new TextEncoder().encode(text);
}

function utf8Decode(bytes) {
  return new TextDecoder().decode(bytes);
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("Decompression not supported");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Build a compact shareable object from a wheel snapshot-like shape. */
export function buildSharePayload(wheel) {
  const entries = (wheel.entries || []).map((e) => [
    e.value,
    e.backgroundColor || "#063893",
    e.textColor || "#ffffff",
    e.removed ? 1 : 0,
  ]);
  const payload = {
    v: 1,
    t: wheel.title || "Untitled",
    e: entries,
  };
  if (wheel.settings && typeof wheel.settings === "object") {
    const s = wheel.settings;
    payload.s = {
      st: s.spinTime,
      ar: s.autoRemoveWinner ? 1 : 0,
      cf: s.showConfetti === false ? 0 : 1,
      so: s.sounds === false ? 0 : 1,
      vol: s.volume,
      wv: s.winnerVolume,
    };
  }
  return payload;
}

/** Expand compact payload into app wheel data. */
export function expandSharePayload(payload) {
  if (!payload || payload.v !== 1 || !Array.isArray(payload.e)) {
    throw new Error("Unsupported share payload");
  }
  const entries = payload.e.map((row, i) => {
    const value = Array.isArray(row) ? row[0] : row?.v;
    const backgroundColor = Array.isArray(row) ? row[1] : row?.c;
    const textColor = Array.isArray(row) ? row[2] : row?.t;
    const removed = Array.isArray(row) ? !!row[3] : !!row?.r;
    return {
      id: `shared-${i}-${Date.now()}`,
      type: "text",
      value: String(value ?? ""),
      weight: 1,
      backgroundColor: backgroundColor || "#063893",
      textColor: textColor || "#ffffff",
      removed,
    };
  }).filter((e) => e.value.trim());

  const s = payload.s || {};
  const settings = {
    showConfetti: s.cf !== 0,
    sounds: s.so !== 0,
    spinTime: Number(s.st) || 7,
    autoRemoveWinner: !!s.ar,
    showRemoveButton: true,
    pointerMatchSegmentColor: true,
    winnerDisplayMode: "on-wheel",
    showWinnerResult: true,
    volume: s.vol ?? 37,
    winnerVolume: s.wv ?? 80,
    themeColors: ["#063893", "#d2ecf2", "#fefefe"],
  };

  return {
    title: payload.t || "Shared wheel",
    entries,
    settings,
  };
}

export async function encodeShareToken(payload) {
  const json = JSON.stringify(payload);
  const raw = utf8Encode(json);
  const compressed = await deflateRaw(raw);
  let packed;
  if (compressed && compressed.length < raw.length) {
    packed = new Uint8Array(1 + compressed.length);
    packed[0] = 0x01;
    packed.set(compressed, 1);
  } else {
    packed = new Uint8Array(1 + raw.length);
    packed[0] = 0x00;
    packed.set(raw, 1);
  }
  return toBase64Url(packed);
}

export async function decodeShareToken(token) {
  const packed = fromBase64Url(token);
  if (!packed.length) throw new Error("Empty share token");
  const flag = packed[0];
  const body = packed.subarray(1);
  let jsonBytes;
  if (flag === 0x01) jsonBytes = await inflateRaw(body);
  else if (flag === 0x00) jsonBytes = body;
  else throw new Error("Unknown share encoding");
  return JSON.parse(utf8Decode(jsonBytes));
}

export async function encodeShareUrl(wheelOrPayload, baseUrl = getShareBaseUrl()) {
  const payload =
    wheelOrPayload?.e && wheelOrPayload?.v === 1
      ? wheelOrPayload
      : buildSharePayload(wheelOrPayload);
  const token = await encodeShareToken(payload);
  return `${baseUrl}#w=${token}`;
}

export function getShareBaseUrl() {
  let path = location.pathname
    .replace(/\/default\/?$/i, "/")
    .replace(/\/index\.html?$/i, "/");
  if (!path.endsWith("/")) {
    const leaf = path.split("/").pop() || "";
    if (!leaf.includes(".")) path += "/";
  }
  return `${location.origin}${path}`;
}

export async function decodeShareFromLocation(search = location.search, hash = location.hash) {
  let token = null;
  if (hash.startsWith("#w=")) token = hash.slice(3);
  else if (hash.startsWith("#w/")) token = hash.slice(3);
  if (!token) {
    const params = new URLSearchParams(search);
    token = params.get("w");
  }
  if (!token) return null;
  // Strip accidental query/hash junk after token
  token = decodeURIComponent(token.split("&")[0].split("#")[0]);
  const compact = await decodeShareToken(token);
  return expandSharePayload(compact);
}

export function clearShareFromLocation() {
  const url = `${location.pathname}${location.search}`;
  history.replaceState(null, "", url || "./");
}

export const SHARE_URL_SOFT_LIMIT = 6000;
