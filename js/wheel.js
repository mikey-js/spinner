/** Canvas spinner wheel with eased spin + segment hit detection. */

function cryptoRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

export class Wheel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.entries = [];
    this.rotation = 0; // radians; 0 means first segment starts at top after pointer offset
    this.spinning = false;
    this.textureOpacity = 0.6;
    this._lastTickIndex = -1;
    this.onTick = null;
    this.onDone = null;
  }

  setEntries(entries) {
    this.entries = entries.filter((e) => e && String(e.value || "").trim());
    this.draw();
  }

  get count() {
    return this.entries.length;
  }

  segmentAngle() {
    return this.count ? (Math.PI * 2) / this.count : 0;
  }

  /** Index under the top pointer for current rotation. */
  indexAtPointer() {
    if (!this.count) return -1;
    const seg = this.segmentAngle();
    // Pointer is at -PI/2 (top). Segments drawn starting at -PI/2.
    const normalized = ((-this.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(normalized / seg) % this.count;
  }

  colorAtPointer() {
    const i = this.indexAtPointer();
    return i >= 0 ? this.entries[i].backgroundColor : "#8b7cf6";
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const css = canvas.clientWidth || 640;
    if (canvas.width !== Math.round(css * dpr)) {
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
    }
    const size = canvas.width;
    const r = size / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(this.rotation);

    const n = this.count;
    if (!n) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1b33";
      ctx.fill();
      ctx.restore();
      return;
    }

    const seg = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const start = -Math.PI / 2 + i * seg;
      const end = start + seg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.98, start, end);
      ctx.closePath();
      ctx.fillStyle = this.entries[i].backgroundColor || "#888";
      ctx.fill();

      // Radial texture overlay
      if (this.textureOpacity > 0) {
        const grad = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 0.98);
        grad.addColorStop(0, `rgba(255,255,255,${0.18 * this.textureOpacity})`);
        grad.addColorStop(0.55, `rgba(0,0,0,0)`);
        grad.addColorStop(1, `rgba(0,0,0,${0.22 * this.textureOpacity})`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Label
      const label = String(this.entries[i].value || "");
      const mid = start + seg / 2;
      ctx.save();
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.entries[i].textColor || "#111";
      const fontSize = Math.max(11, Math.min(15, (r / dpr) * 0.045));
      ctx.font = `600 ${fontSize * dpr}px Outfit, system-ui, sans-serif`;
      const maxW = r * 0.62;
      const text = truncateToWidth(ctx, label, maxW);
      ctx.fillText(text, r * 0.9, 0);
      ctx.restore();
    }

    // Outer rim
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(2, r * 0.012);
    ctx.stroke();

    // Divider ticks
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = Math.max(1, r * 0.004);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * seg;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
      ctx.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Spin to a random weighted entry.
   * @param {number} durationSec
   * @returns {Promise<object>} winning entry
   */
  spin(durationSec = 7) {
    if (this.spinning || this.count < 1) return Promise.resolve(null);
    this.spinning = true;
    this._lastTickIndex = this.indexAtPointer();

    const weights = this.entries.map((e) => Math.max(0.0001, Number(e.weight) || 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = cryptoRandom() * total;
    let winnerIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i];
      if (pick <= 0) {
        winnerIndex = i;
        break;
      }
    }

    const seg = this.segmentAngle();
    // Land near center of winning segment, with slight jitter
    const jitter = (cryptoRandom() - 0.5) * seg * 0.55;
    const targetCenter = winnerIndex * seg + seg / 2 + jitter;
    // We want: (-rotation) mod 2π === targetCenter  (since index uses -rotation)
    const current = ((this.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const desired = (-targetCenter + Math.PI * 2) % (Math.PI * 2);
    let delta = desired - current;
    if (delta < 0) delta += Math.PI * 2;
    const extraTurns = 4 + Math.floor(cryptoRandom() * 3); // 4-6 full spins
    const finalRotation = this.rotation + delta + extraTurns * Math.PI * 2;

    const startRot = this.rotation;
    const start = performance.now();
    const duration = durationSec * 1000;

    return new Promise((resolve) => {
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        this.rotation = startRot + (finalRotation - startRot) * eased;
        this.draw();

        const idx = this.indexAtPointer();
        if (idx !== this._lastTickIndex) {
          this._lastTickIndex = idx;
          this.onTick?.(idx);
        }

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          this.rotation = finalRotation;
          this.draw();
          this.spinning = false;
          const winner = this.entries[winnerIndex];
          this.onDone?.(winner);
          resolve(winner);
        }
      };
      requestAnimationFrame(frame);
    });
  }
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}
