// Moving network of points behind the home page intro and the log in / sign up panel: points drift,
// nearby points are joined by faint lines, and the pointer pulls the lines toward it.
// Pauses while off screen; draws one still frame when the visitor prefers reduced motion.
export function startNetwork(canvas, { density = 1 } = {}) {
    if (!canvas?.getContext || canvas.dataset.running) return;
    canvas.dataset.running = "true";
    const ctx = canvas.getContext("2d");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["23, 221, 252", "123, 97, 255", "79, 163, 255"];
    const linkDistance = 140;
    let width = 0, height = 0, points = [], frame = null, visible = true;
    const pointer = { x: -9999, y: -9999 };

    function resize() {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const count = Math.round(Math.min(110, (width * height) / 14000) * density);
        points = Array.from({ length: count }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            r: Math.random() * 1.6 + 0.6,
            color: colors[Math.floor(Math.random() * colors.length)],
        }));
        if (still) draw();
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        for (const p of points) {
            if (!still) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;
                // Gentle pull toward the pointer
                const dx = pointer.x - p.x, dy = pointer.y - p.y, d = Math.hypot(dx, dy);
                if (d < 180 && d > 1) {
                    p.x += (dx / d) * 0.25;
                    p.y += (dy / d) * 0.25;
                }
            }
        }
        for (let i = 0; i < points.length; i++) {
            const a = points[i];
            for (let j = i + 1; j < points.length; j++) {
                const b = points[j];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d < linkDistance) {
                    ctx.strokeStyle = `rgba(${a.color}, ${0.18 * (1 - d / linkDistance)})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
            const near = Math.hypot(pointer.x - a.x, pointer.y - a.y) < 180;
            ctx.fillStyle = `rgba(${a.color}, ${near ? 0.95 : 0.6})`;
            ctx.beginPath();
            ctx.arc(a.x, a.y, near ? a.r + 0.8 : a.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function loop() {
        frame = null;
        if (!visible || document.hidden) return;
        draw();
        frame = requestAnimationFrame(loop);
    }
    const play = () => { if (!still && !frame) frame = requestAnimationFrame(loop); };

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; play(); }).observe(canvas);
    document.addEventListener("visibilitychange", play);
    const host = canvas.parentElement.parentElement || canvas.parentElement;
    host.addEventListener("pointermove", e => {
        const r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
    });
    host.addEventListener("pointerleave", () => { pointer.x = pointer.y = -9999; });
    resize();
    play();
}
