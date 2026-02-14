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
 * Layout (10×10 grid):
 *   Rows 0–2  COMMAND room  (cols 2–6, walled)
 *   Rows 3–5  MEETING area  (cols 3–6, open center)
 *   Rows 6–9  left:  INTEL room    (cols 0–4, glass walls)
 *             right: DEV FLOOR     (cols 5–9, open — no walls)
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

  // Command room floor (cols 2–6, rows 0–2) — brighter
  for (let c = 2; c <= 6; c++) {
    for (let r = 0; r <= 2; r++) {
      drawIsoTile(floor, c, r, 0x0c1220, 0.85);
      strokeIsoTile(floor, c, r, 0x00f0ff, 0.05, 0.5);
    }
  }

  // Meeting area floor (cols 3–6, rows 3–5) — subtle tint
  for (let c = 3; c <= 6; c++) {
    for (let r = 3; r <= 5; r++) {
      drawIsoTile(floor, c, r, 0x0a0f1c, 0.85);
      strokeIsoTile(floor, c, r, 0x00f0ff, 0.04, 0.5);
    }
  }

  // Intel room floor (cols 0–4, rows 6–9) — slightly blue-tinted
  for (let c = 0; c <= 4; c++) {
    for (let r = 6; r <= 9; r++) {
      drawIsoTile(floor, c, r, 0x0a1020, 0.8);
      strokeIsoTile(floor, c, r, 0x38bdf8, 0.04, 0.5);
    }
  }

  // Web3 Lab cubicle (cols 7–9, rows 2–5) — orange-tinted private office
  for (let c = 7; c <= 9; c++) {
    for (let r = 2; r <= 5; r++) {
      drawIsoTile(floor, c, r, 0x0f0d18, 0.8);
      strokeIsoTile(floor, c, r, 0xf97316, 0.04, 0.5);
    }
  }

  // Soul office (cols 0–1, rows 2–5) — magenta-tinted alcove
  for (let c = 0; c <= 1; c++) {
    for (let r = 2; r <= 5; r++) {
      drawIsoTile(floor, c, r, 0x120818, 0.8);
      strokeIsoTile(floor, c, r, 0xff006e, 0.04, 0.5);
    }
  }

  // Dev floor (cols 5–9, rows 6–9) — standard open floor
  for (let c = 5; c <= 9; c++) {
    for (let r = 6; r <= 9; r++) {
      drawIsoTile(floor, c, r, 0x080d18, 0.7);
      strokeIsoTile(floor, c, r, 0x39ff14, 0.02, 0.5);
    }
  }

  // General floor (remaining tiles)
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      // Skip already-drawn areas
      if (c >= 2 && c <= 6 && r >= 0 && r <= 2) continue;
      if (c >= 3 && c <= 6 && r >= 3 && r <= 5) continue;
      if (c >= 7 && c <= 9 && r >= 2 && r <= 5) continue;  // Web3 Lab
      if (c >= 0 && c <= 4 && r >= 6 && r <= 9) continue;
      if (c >= 5 && c <= 9 && r >= 6 && r <= 9) continue;
      drawIsoTile(floor, c, r, 0x080d18, 0.7);
      strokeIsoTile(floor, c, r, 0x00f0ff, 0.03, 0.5);
    }
  }

  scene.addChild(floor);

  // -- Walls ----------------------------------------------------------
  const walls = new Graphics();
  const WALL_H = 45;
  const PART_H = 28;

  // ── Command room walls ─────────────────────────────────────────
  // Back wall (row 0, cols 2–7)
  drawIsoWall(walls, 2, 0, 7, 0, WALL_H, 0x0c1425, 0x00f0ff, 0.12);
  // Left wall (col 2, rows 0–3)
  drawIsoWall(walls, 2, 0, 2, 3, WALL_H, 0x0c1425, 0x00f0ff, 0.08);
  // Right wall (col 7, rows 0–3) — very transparent
  drawIsoWall(walls, 7, 0, 7, 3, WALL_H, 0x0c1425, 0x00f0ff, 0.05);
  // Glass partitions at bottom of command room
  drawIsoWall(walls, 2, 3, 4, 3, PART_H, 0x0c1425, 0x00f0ff, 0.08);
  drawIsoWall(walls, 5, 3, 7, 3, PART_H, 0x0c1425, 0x00f0ff, 0.08);

  // ── Intel room walls (glass enclosed) ──────────────────────────
  // Back wall (row 6, cols 0–4.5)
  drawIsoWall(walls, 0, 6, 4.5, 6, PART_H, 0x0c1425, 0x38bdf8, 0.10);
  // Left wall (col 0, rows 6–10)
  drawIsoWall(walls, 0, 6, 0, 10, PART_H, 0x0c1425, 0x38bdf8, 0.06);
  // Right wall (col 4.5, rows 6–10) — glass partition
  drawIsoWall(walls, 4.5, 6, 4.5, 10, PART_H, 0x0c1425, 0x38bdf8, 0.08);
  // Front wall (row 10, cols 0–4.5) — lower glass
  drawIsoWall(walls, 0, 10, 4.5, 10, PART_H * 0.6, 0x0c1425, 0x38bdf8, 0.06);

  // ── Web3 Lab cubicle (private office, right side) ─────────────
  // Back wall (row 2, cols 7–10)
  drawIsoWall(walls, 7, 2, 10, 2, PART_H, 0x0c1425, 0xf97316, 0.10);
  // Left wall (col 7, rows 2–5.5) — glass partition
  drawIsoWall(walls, 7, 2, 7, 5.5, PART_H, 0x0c1425, 0xf97316, 0.08);
  // Right wall (col 10, rows 2–5.5)
  drawIsoWall(walls, 10, 2, 10, 5.5, PART_H, 0x0c1425, 0xf97316, 0.06);
  // Front wall (row 5.5, cols 7–10) — lower glass with gap for entry
  drawIsoWall(walls, 7, 5.5, 8, 5.5, PART_H * 0.6, 0x0c1425, 0xf97316, 0.06);
  drawIsoWall(walls, 9, 5.5, 10, 5.5, PART_H * 0.6, 0x0c1425, 0xf97316, 0.06);

  // ── Soul office (private alcove, left side) ───────────────────
  // Back wall (row 2, cols 0–2) — connects to command room
  drawIsoWall(walls, 0, 2, 2, 2, PART_H, 0x140818, 0xff006e, 0.10);
  // Left wall (col 0, rows 2–5.5)
  drawIsoWall(walls, 0, 2, 0, 5.5, PART_H, 0x140818, 0xff006e, 0.06);
  // Front wall (row 5.5, cols 0–2) — lower glass with entry gap
  drawIsoWall(walls, 0, 5.5, 0.5, 5.5, PART_H * 0.6, 0x140818, 0xff006e, 0.06);
  drawIsoWall(walls, 1.5, 5.5, 2, 5.5, PART_H * 0.6, 0x140818, 0xff006e, 0.06);

  scene.addChild(walls);

  // -- Room labels ----------------------------------------------------
  const labelStyle = {
    fontFamily: "monospace",
    fontSize: 8,
    fill: "#00f0ff",
    letterSpacing: 2,
  };

  // COMMAND label
  const cmdLabel = new Text({
    text: "COMMAND",
    style: { ...labelStyle, fontSize: 9 },
  });
  const cmdPos = toScreen(4.5, 0.3);
  cmdLabel.anchor.set(0.5, 0.5);
  cmdLabel.position.set(cmdPos.x, cmdPos.y - 55);
  cmdLabel.alpha = 0.25;
  scene.addChild(cmdLabel);

  // MEETING label
  const meetLabel = new Text({ text: "MEETING", style: labelStyle });
  const meetPos = toScreen(4.5, 3.5);
  meetLabel.anchor.set(0.5, 0.5);
  meetLabel.position.set(meetPos.x, meetPos.y - 15);
  meetLabel.alpha = 0.2;
  scene.addChild(meetLabel);

  // INTEL label (inside intel room)
  const intelLabel = new Text({
    text: "INTEL",
    style: { ...labelStyle, fill: "#38bdf8" },
  });
  const intelPos = toScreen(2, 6.3);
  intelLabel.anchor.set(0.5, 0.5);
  intelLabel.position.set(intelPos.x, intelPos.y - 10);
  intelLabel.alpha = 0.25;
  scene.addChild(intelLabel);

  // WEB3 LAB label (private cubicle, right side)
  const labLabel = new Text({
    text: "WEB3 LAB",
    style: { ...labelStyle, fill: "#f97316" },
  });
  const labPos = toScreen(8.5, 2.3);
  labLabel.anchor.set(0.5, 0.5);
  labLabel.position.set(labPos.x, labPos.y - 10);
  labLabel.alpha = 0.25;
  scene.addChild(labLabel);

  // DEV FLOOR label (open area, right side)
  const devLabel = new Text({
    text: "DEV FLOOR",
    style: { ...labelStyle, fill: "#39ff14" },
  });
  const devPos = toScreen(7, 6.3);
  devLabel.anchor.set(0.5, 0.5);
  devLabel.position.set(devPos.x, devPos.y - 10);
  devLabel.alpha = 0.2;
  scene.addChild(devLabel);

  // SOUL label (private alcove, left side)
  const soulLabel = new Text({
    text: "SOUL",
    style: { ...labelStyle, fill: "#ff006e", fontSize: 8 },
  });
  const soulPos = toScreen(0.5, 2.3);
  soulLabel.anchor.set(0.5, 0.5);
  soulLabel.position.set(soulPos.x, soulPos.y - 10);
  soulLabel.alpha = 0.25;
  scene.addChild(soulLabel);

  // -- Ambient particles (in scene, around office area) ---------------
  const particles: { g: Graphics; vx: number; vy: number }[] = [];
  const topLeft = toScreen(0, 0);
  const bottomRight = toScreen(GRID_COLS, GRID_ROWS);
  const pMinX = topLeft.x - 100;
  const pMaxX = bottomRight.x + 100;
  const pMinY = topLeft.y - 60;
  const pMaxY = bottomRight.y + 60;
  const pW = pMaxX - pMinX;
  const pH = pMaxY - pMinY;

  for (let i = 0; i < 50; i++) {
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
  };
}
