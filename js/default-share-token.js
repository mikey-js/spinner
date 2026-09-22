/**
 * Canonical classroom check-in wheel, stored as a share token (deflate + base64url).
 * Domain-agnostic: always redirect/load via `#w=<token>` so GitHub Pages and localhost match.
 *
 * Keep this module free of static imports so `/default/` can load it alone.
 */

export const BUILTIN_SHARE_TOKEN =
  "AYVTy27bMBD8lcX2yhp-ALGriw8BUuScQw5JUKzJlUmID5WkJAhB_r0gZQMpijrUQQuKO7MzHL3jiM1GYMYG7y2lFENwcK9Zdt8fPTxrZosCGZuXF3zWlIEiQwqOIWvjzwly2dRse5jDAJKsAxUmf0SB39Z3u8OPXanaulCs30TB4chgSi9Db0kyTHWrILTMFlxIGazp6lZMbNuKp7Ys222pNpvNYbu_4D3pMhRVcuPPkFlqb34PvKrUXJ5_mqqYpMNgVeVVAUxbq8SLwuAZTpGpK5gEcbAMpUfqEOxtfZRBkl_QaIYcwFFXRmyjYa8WkSfOmWOR7osTc7VW07jQnUiBovmW7soz0eLjiVOGnmKGUGXE0i2AvILp8zlNUV2PHl_xhkM_zVhdLbFwlEt9Zj8YzyCD661x7PPqhg8PxlowfhnPku-SgFd8BHJwjpS5HSy0If6q68SShsS1Xn0l2qR6QzWC0BmvLuHzV7uvsVncLR8vF-BMytTx8atk_MVQ82EURJbss52X0DtSnyLbxzCo_6biTWDC5h1TxmYvkCI2a4GyrT9fCvU1BovNbi9wGrE5rD8-_gA";

export async function loadBuiltinDefault() {
  const { decodeShareToken, expandSharePayload } = await import("./share.js");
  return expandSharePayload(await decodeShareToken(BUILTIN_SHARE_TOKEN));
}

export function builtinShareHash() {
  return `#w=${BUILTIN_SHARE_TOKEN}`;
}
