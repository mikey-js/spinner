/** Tiny wrapper around vendored qrcode-generator (global `qrcode`). */

let loading = null;

function ensureQrcode() {
  if (typeof window.qrcode === "function") return Promise.resolve(window.qrcode);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./js/vendor/qrcode-generator.js";
    script.async = true;
    script.onload = () => {
      if (typeof window.qrcode === "function") resolve(window.qrcode);
      else reject(new Error("QR library failed to load"));
    };
    script.onerror = () => reject(new Error("Could not load QR library"));
    document.head.appendChild(script);
  });
  return loading;
}

/** @returns {Promise<string>} data URL (PNG) */
export async function qrDataUrl(text, cellSize = 4, margin = 2) {
  const qrcode = await ensureQrcode();
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cellSize, margin);
}
