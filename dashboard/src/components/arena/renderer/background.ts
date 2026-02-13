import { Application, Container, Graphics, Text } from "pixi.js";
import {
  GRID_COLS,
  GRID_ROWS,
  drawIsoTile,
  strokeIsoTile,
  drawIsoWall,
  toScreen,
} from "./iso";

/**
 * Draw the isometric office floor, glass partition walls, room labels,
 * ambient particles, and scanline sweep.
 *
 * Floor/walls are added to `scene` (iso coords).
 * Scanline is added to `app.stage` behind the scene.
 */
export function initBackground(
  app: Application,
  scene: Container,
): () => void {
  const w = app.screen.width;
  const h = app.screen.height;

  // -- Scanline (fullscreen, behind scene) ----------------------------
  const scanline = new Graphics();
  scanline.rect(0, 0, w, 1).fill({ color: 0x00f0ff, alpha: 0.04 });
  scanline.rect(0, -3, w, 7).fill({ color: 0x00f0ff, alpha: 0.01 });
  app.stage.addChildAt(scanline, 0);

  // -- Floor tiles ----------------------------------------------------
  const floor = new Graphics();

  // Boss office floor (cols 2-6, rows 0-2) — slightly brighter
  for (let c = 2; c <= 6; c++) {
    for (let r = 0; r <= 2; r++) {
      drawIsoTile(floor, c, r, 0x0c1220, 0.85);
      strokeIsoTile(floor, c, r, 0x00f0ff, 0.05, 0.5);
    }
  }

  // Meeting area floor (cols 3-6, rows 3-5) — subtle tint
  for (let c = 3; c <= 6; c++) {
    for (let r = 3; r <= 5; r++) {
      drawIsoTile(floor, c, r, 0x0a0f1c, 0.85);
      strokeIsoTile(floor, c, r, 0x00f0ff, 0.04, 0.5);
    }
  }

  // General floor (remaining tiles)
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      // Skip already-drawn areas
      if (c >= 2 && c <= 6 && r >= 0 && r <= 2) continue;
      if (c >= 3 && c <= 6 && r >= 3 && r <= 5) continue;
      drawIsoTile(floor, c, r, 0x080d18, 0.7);
      strokeIsoTile(floor, c, r, 0x00f0ff, 0.03, 0.5);
    }
  }

  scene.addChild(floor);

  // -- Walls ----------------------------------------------------------
  const walls = new Graphics();
  const WALL_H = 45;
  const PART_H = 28;

  // Boss office back wall (row 0, col 2 to col 7)
  drawIsoWall(walls, 2, 0, 7, 0, WALL_H, 0x0c1425, 0x00f0ff, 0.12);

  // Boss office left wall (col 2, row 0 to row 3)
  drawIsoWall(walls, 2, 0, 2, 3, WALL_H, 0x0c1425, 0x00f0ff, 0.08);

  // Boss office right wall (col 7, row 0 to row 3) — very transparent
  drawIsoWall(walls, 7, 0, 7, 3, WALL_H, 0x0c1425, 0x00f0ff, 0.05);

  // Partition walls (lower, glass)
  drawIsoWall(walls, 2, 3, 4, 3, PART_H, 0x0c1425, 0x00f0ff, 0.08);
  drawIsoWall(walls, 5, 3, 7, 3, PART_H, 0x0c1425, 0x00f0ff, 0.08);

  scene.addChild(walls);

  // -- Room labels ----------------------------------------------------
  const labelStyle = {
    fontFamily: "monospace",
    fontSize: 8,
    fill: "#00f0ff",
    letterSpacing: 2,
  };

  const bossLabel = new Text({
    text: "BOSS OFFICE",
    style: { ...labelStyle, fontSize: 9 },
  });
  const bossPos = toScreen(4.5, 0.3);
  bossLabel.anchor.set(0.5, 0.5);
  bossLabel.position.set(bossPos.x, bossPos.y - 55);
  bossLabel.alpha = 0.25;
  scene.addChild(bossLabel);

  const meetLabel = new Text({ text: "MEETING", style: labelStyle });
  const meetPos = toScreen(4.5, 3.5);
  meetLabel.anchor.set(0.5, 0.5);
  meetLabel.position.set(meetPos.x, meetPos.y - 15);
  meetLabel.alpha = 0.2;
  scene.addChild(meetLabel);

  const supportLabel = new Text({ text: "SUPPORT", style: labelStyle });
  const supportPos = toScreen(4.5, 7);
  supportLabel.anchor.set(0.5, 0.5);
  supportLabel.position.set(supportPos.x, supportPos.y + 12);
  supportLabel.alpha = 0.2;
  scene.addChild(supportLabel);

  // -- Ambient particles (in scene, around office area) ---------------
  const particles: { g: Graphics; vx: number; vy: number }[] = [];
  // Get bounding box of the iso grid for particle spawn
  const topLeft = toScreen(0, 0);
  const bottomRight = toScreen(GRID_COLS, GRID_ROWS);
  const pMinX = topLeft.x - 100;
  const pMaxX = bottomRight.x + 100;
  const pMinY = topLeft.y - 60;
  const pMaxY = bottomRight.y + 60;
  const pW = pMaxX - pMinX;
  const pH = pMaxY - pMinY;

  for (let i = 0; i < 40; i++) {
    const p = new Graphics();
    const r = Math.random() * 1.5 + 0.5;
    p.circle(0, 0, r).fill({
      color: 0x00f0ff,
      alpha: Math.random() * 0.1 + 0.03,
    });
    p.position.set(
      pMinX + Math.random() * pW,
      pMinY + Math.random() * pH,
    );
    scene.addChild(p);
    particles.push({
      g: p,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -Math.random() * 0.25 - 0.05,
    });
  }

  // -- Ticker ---------------------------------------------------------
  let time = 0;
  const tick = (ticker: { deltaMS: number }) => {
    time += ticker.deltaMS / 1000;

    // Scanline sweep (viewport coords)
    scanline.position.y = ((time * 30) % (h + 20)) - 10;

    // Particle drift
    for (const p of particles) {
      p.g.position.x += p.vx;
      p.g.position.y += p.vy;
      if (p.g.position.y < pMinY) {
        p.g.position.y = pMaxY;
        p.g.position.x = pMinX + Math.random() * pW;
      }
      if (p.g.position.x < pMinX) p.g.position.x = pMaxX;
      if (p.g.position.x > pMaxX) p.g.position.x = pMinX;
    }
  };
  app.ticker.add(tick);

  return () => {
    app.ticker.remove(tick);
    scanline.destroy();
    // Floor, walls, labels, particles are children of scene — destroyed with scene
  };
}
