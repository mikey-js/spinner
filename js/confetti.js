/** Star confetti burst drawn on a full-screen canvas. */

const particles = [];
let canvas;
let ctx;
let raf = 0;
let running = false;

function starPath(c, x, y, spikes, outer, inner) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  c.beginPath();
  c.moveTo(x, y - outer);
  for (let i = 0; i < spikes; i++) {
    c.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    rot += step;
    c.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
    rot += step;
  }
  c.lineTo(x, y - outer);
  c.closePath();
}

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function tick() {
  if (!ctx) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += 0.12;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.spin;
    p.life -= 0.012;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    starPath(ctx, 0, 0, 5, p.size, p.size * 0.45);
    ctx.fill();
    ctx.restore();
  }
  if (particles.length) {
    raf = requestAnimationFrame(tick);
  } else {
    running = false;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

export function initConfetti(el) {
  canvas = el;
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
}

export function burstConfetti(colors = ["#063893", "#d2ecf2", "#fefefe", "#8b7cf6", "#fbbf24"]) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.38;
  for (let i = 0; i < 90; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 8;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 4 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.25,
      life: 0.85 + Math.random() * 0.4,
      color: colors[i % colors.length],
    });
  }
  if (!running) {
    running = true;
    raf = requestAnimationFrame(tick);
  }
}

export function stopConfetti() {
  particles.length = 0;
  cancelAnimationFrame(raf);
  running = false;
  if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}
