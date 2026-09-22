/**
 * Canonical classroom check-in wheel, stored as a share token (deflate + base64url).
 * Domain-agnostic: always redirect/load via `#w=<token>` so GitHub Pages and localhost match.
 *
 * Keep this module free of static imports so `/default/` can load it alone.
 */

export const BUILTIN_SHARE_TOKEN =
  "AYVTTWscMQz9K0K9ust-QHc7lx4CLTn3kEMaitaW12b8MbU9Mwwh_73Yky2htBv7YCFbT09P8jNO2O0EFuzwzlHOKUYPd4Zl__E-wINhdiiQsXt8xAdDBSgx5OgZirHhkqFUp2E3wBJHkOQ8qDiHLyjww_bT4fT5UC3dFortk6g4nBhsjWUYHEmGubkqgmZ24GMu4GzfXCmz0w1P7VnqfbV2u91pf_yDR6XCVVqNVQNSVkFiyaG4ZWXpSb3JMaQ4qgarue5_w2YTR6dWwAhWNyvzqkEMDOfE1NecBGl0DDVGmhjdLQW-myojNblqbGFpgv018ua9MmdaZTtzLjBQKhAbpwSKFgEUFMxv3xlK6vr03WIlhbU-WqBE8NRXkjpZDmoV7cylcKrtChV-aeNgaFoFOJOqNG73_u9e9Tao19kJ18zXrq-J6uUrF29zoZ5vTcNX6xzYsKrkKPRZwA-8B_JwSVRYjw50TD_bOrOkMXOzNzfk-Wan1q_6RTyVal84jDYwyOgHZz2Hsvlf3U8CM3bPmAt2R4GUsNsKnFP7elK3I8d2TNFhdzgKnCfsTtuXl98";

export async function loadBuiltinDefault() {
  const { decodeShareToken, expandSharePayload } = await import("./share.js");
  return expandSharePayload(await decodeShareToken(BUILTIN_SHARE_TOKEN));
}

export function builtinShareHash() {
  return `#w=${BUILTIN_SHARE_TOKEN}`;
}
