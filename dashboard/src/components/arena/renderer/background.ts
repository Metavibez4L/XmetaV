import { Application, Container, Graphics } from "pixi.js";

/**
 * Render the arena background: animated hex grid, scanline sweep, ambient particles.
 * Returns a cleanup function.
 */
export function initBackground(app: Application): () => void {
  const container = new Container();
  app.stage.addChildAt(container, 0);

  const w = app.screen.width;
  const h = app.screen.height;

  // -- Hex grid -------------------------------------------------------
  const hexGrid = new Graphics();
  const HEX_SIZE = 60;
  drawHexGrid(hexGrid, w + HEX_SIZE * 4, h + HEX_SIZE * 4, HEX_SIZE);
  hexGrid.position.set(-HEX_SIZE * 2, -HEX_SIZE * 2);
  container.addChild(hexGrid);

  // -- Scanline -------------------------------------------------------
  const scanline = new Graphics();
  scanline.rect(0, 0, w, 1).fill({ color: 0x00f0ff, alpha: 0.06 });
  scanline.rect(0, -4, w, 9).fill({ color: 0x00f0ff, alpha: 0.015 });
  container.addChild(scanline);

  // -- Ambient particles ----------------------------------------------
  const particles: { g: Graphics; vx: number; vy: number }[] = [];
  for (let i = 0; i < 50; i++) {
    const p = new Graphics();
    const r = Math.random() * 1.5 + 0.5;
    p.circle(0, 0, r).fill({
      color: 0x00f0ff,
      alpha: Math.random() * 0.15 + 0.05,
    });
    p.position.set(Math.random() * w, Math.random() * h);
    container.addChild(p);
    particles.push({
      g: p,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.2,
    });
  }

  // -- Animation ticker -----------------------------------------------
  let time = 0;

  const tick = (ticker: { deltaMS: number }) => {
    time += ticker.deltaMS / 1000;

    hexGrid.position.x = -HEX_SIZE * 2 + Math.sin(time * 0.08) * 12;
    hexGrid.position.y = -HEX_SIZE * 2 + Math.cos(time * 0.06) * 10;

    scanline.position.y = ((time * 35) % (h + 30)) - 15;

    for (const p of particles) {
      p.g.position.x += p.vx;
      p.g.position.y += p.vy;
      if (p.g.position.x < -10) p.g.position.x = w + 10;
      if (p.g.position.x > w + 10) p.g.position.x = -10;
      if (p.g.position.y < -10) p.g.position.y = h + 10;
      if (p.g.position.y > h + 10) p.g.position.y = -10;
    }
  };

  app.ticker.add(tick);

  return () => {
    app.ticker.remove(tick);
    container.destroy({ children: true });
  };
}

// -- Helpers -----------------------------------------------------------

function drawHexGrid(g: Graphics, w: number, h: number, size: number) {
  const sqrt3 = Math.sqrt(3);
  const colW = size * 1.5;
  const rowH = size * sqrt3;
  const cols = Math.ceil(w / colW) + 2;
  const rows = Math.ceil(h / rowH) + 2;

  for (let col = -1; col < cols; col++) {
    for (let row = -1; row < rows; row++) {
      const cx = col * colW;
      const cy = row * rowH + (col % 2 === 0 ? 0 : rowH / 2);
      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 3) * i;
        const a2 = (Math.PI / 3) * ((i + 1) % 6);
        g.moveTo(cx + size * Math.cos(a1), cy + size * Math.sin(a1));
        g.lineTo(cx + size * Math.cos(a2), cy + size * Math.sin(a2));
      }
    }
  }
  g.stroke({ color: 0x00f0ff, width: 0.5, alpha: 0.035 });
}
