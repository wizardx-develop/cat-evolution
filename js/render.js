'use strict';

/**
 * Canvas-рендер игрового поля: зона кликера + сетка мержа 6×4.
 * Рисует кадр по сцене из game.js, знает только геометрию и графику.
 */
CG.Render = (function () {
  const C = CG.CONFIG;
  const TAU = Math.PI * 2;
  const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif';

  let canvas = null;
  let ctx = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let layout = {
    clicker: { cx: 0, cy: 0, r: 0 },
    gridY: 0,
    cell: 0,
    gap: 8,
    hintY: 0
  };

  function init(el) {
    canvas = el;
    ctx = el.getContext('2d');
    resize();
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(el.parentElement);
    } else {
      window.addEventListener('resize', resize);
    }
  }

  function resize() {
    if (!canvas || !ctx) return;
    const width = Math.max(260, Math.floor(canvas.parentElement.clientWidth));
    const gap = 8;
    const cell = (width - gap * (C.COLS - 1)) / C.COLS;
    const gridH = cell * C.ROWS + gap * (C.ROWS - 1);
    const clickerH = Math.round(Math.min(212, Math.max(168, width * 0.42)));
    const height = Math.round(clickerH + 12 + gridH);

    W = width;
    H = height;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    layout = {
      clicker: {
        cx: W / 2,
        cy: (clickerH - 20) / 2,
        r: Math.min((clickerH - 48) / 2, W * 0.2)
      },
      gridY: clickerH + 12,
      cell: cell,
      gap: gap,
      hintY: clickerH - 8
    };
  }

  function cellRect(i) {
    const col = i % C.COLS;
    const row = Math.floor(i / C.COLS);
    return {
      x: col * (layout.cell + layout.gap),
      y: layout.gridY + row * (layout.cell + layout.gap),
      w: layout.cell,
      h: layout.cell
    };
  }

  function cellCenter(i) {
    const r = cellRect(i);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  function clickerCenter() {
    return { x: layout.clicker.cx, y: layout.clicker.cy };
  }

  /** Тест точки (координаты CSS внутри canvas). */
  function hit(x, y) {
    const cl = layout.clicker;
    if (Math.hypot(x - cl.cx, y - cl.cy) <= cl.r + 10) return { type: 'clicker' };
    for (let i = 0; i < C.CELLS; i++) {
      const r = cellRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { type: 'cell', index: i };
      }
    }
    return null;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawClicker(s) {
    const cl = layout.clicker;
    const bob = Math.sin(s.time / 700) * 3;
    const pulse = 1 + 0.07 * (s.clickerPulse || 0);

    ctx.save();
    ctx.translate(cl.cx, cl.cy + bob);
    ctx.scale(pulse, pulse);

    ctx.shadowColor = 'rgba(255,182,77,.5)';
    ctx.shadowBlur = 28;
    const g = ctx.createRadialGradient(-cl.r * 0.35, -cl.r * 0.4, cl.r * 0.15, 0, 0, cl.r);
    g.addColorStop(0, '#fff3c9');
    g.addColorStop(0.55, '#ffd76e');
    g.addColorStop(1, '#ff9f43');
    ctx.beginPath();
    ctx.arc(0, 0, cl.r, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.stroke();

    const icon = CG.TIERS[Math.max(1, s.bestTier || 1) - 1].icon;
    ctx.font = Math.round(cl.r * 0.9) + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, cl.r * 0.04);
    ctx.restore();

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Тапай по котику — зарабатывай монеты', W / 2, layout.hintY);
  }

  function drawGrid(s) {
    for (let i = 0; i < C.CELLS; i++) {
      const r = cellRect(i);
      const tier = s.board[i];
      const fromDrag = s.drag && s.drag.from === i;
      const selected = s.selected === i;
      const hover = s.hover && s.hover.cell === i;

      roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = tier ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.035)';
      ctx.fill();

      if (hover && s.hover.kind === 'merge') {
        ctx.fillStyle = 'rgba(123,237,159,.14)';
        ctx.fill();
      }

      const flash = s.flash[i] || 0;
      if (flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * flash).toFixed(3) + ')';
        ctx.fill();
      }

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      if (selected) {
        ctx.strokeStyle = '#ffd76e';
        ctx.lineWidth = 3;
      }
      if (hover) {
        ctx.strokeStyle =
          s.hover.kind === 'merge'
            ? '#7bed9f'
            : s.hover.kind === 'swap'
              ? '#ffb347'
              : 'rgba(255,255,255,.55)';
        ctx.lineWidth = 3;
      }
      ctx.stroke();

      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;

      if (!tier) {
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.font = 'bold ' + Math.round(r.w * 0.36) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', cx, cy);
        continue;
      }

      ctx.save();
      if (fromDrag) ctx.globalAlpha = 0.3;
      ctx.font = Math.round(r.w * (tier >= 7 ? 0.48 : 0.52)) + 'px ' + EMOJI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CG.TIERS[tier - 1].icon, cx, cy + r.h * 0.02);
      ctx.restore();

      // Плашка уровня в углу ячейки
      ctx.beginPath();
      ctx.arc(r.x + r.w - 11, r.y + 11, 9, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fill();
      ctx.fillStyle = '#ffd76e';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(tier), r.x + r.w - 11, r.y + 11.5);
    }
  }

  function drawGhost(s) {
    const d = s.drag;
    const tier = s.board[d.from];
    if (!tier) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(d.x, d.y, layout.cell * 0.5, 0, TAU);
    ctx.fillStyle = 'rgba(10,12,26,.78)';
    ctx.fill();
    ctx.font = Math.round(layout.cell * 0.6) + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CG.TIERS[tier - 1].icon, d.x, d.y);
    ctx.restore();
  }

  function drawFloats(floats) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i];
      const alpha = Math.max(0, 1 - f.life / f.max);
      ctx.globalAlpha = alpha;
      ctx.font = '800 ' + (f.size || 16) + 'px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  function drawParticles(particles) {
    ctx.save();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const alpha = Math.max(0, 1 - p.life / p.max);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.restore();
  }

  /** Сцена: { time, bestTier, board, selected, drag, hover, clickerPulse, flash, floats, particles } */
  function draw(s) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawClicker(s);
    drawGrid(s);
    drawParticles(s.particles);
    drawFloats(s.floats);
    if (s.drag) drawGhost(s);
  }

  return {
    init: init,
    resize: resize,
    draw: draw,
    hit: hit,
    cellRect: cellRect,
    cellCenter: cellCenter,
    clickerCenter: clickerCenter
  };
})();
