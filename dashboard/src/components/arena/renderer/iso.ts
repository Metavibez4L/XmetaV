import { Graphics } from "pixi.js";

// -- Isometric grid constants -----------------------------------------

export const TILE_W = 80;
export const TILE_H = 40;
export const GRID_COLS = 10;
export const GRID_ROWS = 10;

// -- Coordinate conversion --------------------------------------------

/** Convert isometric tile (col, row) to screen-space pixel coords.
 *  Coords are relative to the scene container origin. */
export function toScreen(
  col: number,
  row: number,
): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

/** Compute the scene container offset that centers the iso grid on the viewport. */
export function getSceneOffset(
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const center = toScreen(GRID_COLS / 2, GRID_ROWS / 2);
  return {
    x: viewW / 2 - center.x,
    y: viewH / 2 - center.y,
  };
}

// -- Drawing primitives -----------------------------------------------

/** Draw a filled isometric floor tile (diamond shape). */
export function drawIsoTile(
  g: Graphics,
  col: number,
  row: number,
  color: number,
  alpha: number,
) {
  const { x, y } = toScreen(col, row);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  g.poly([x, y - hh, x + hw, y, x, y + hh, x - hw, y], true).fill({
    color,
    alpha,
  });
}

/** Stroke an isometric floor tile outline. */
export function strokeIsoTile(
  g: Graphics,
  col: number,
  row: number,
  color: number,
  alpha: number,
  width: number,
) {
  const { x, y } = toScreen(col, row);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  g.poly([x, y - hh, x + hw, y, x, y + hh, x - hw, y], true).stroke({
    color,
    width,
    alpha,
  });
}

/** Draw an isometric extruded box (cube) filling one tile.
 *  Faces are drawn back-to-front: right, left, top. */
export function drawIsoCube(
  g: Graphics,
  col: number,
  row: number,
  h: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  alpha: number,
) {
  const { x, y } = toScreen(col, row);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;

  // Right face (darkest)
  g.poly(
    [x + hw, y - h, x, y + hh - h, x, y + hh, x + hw, y],
    true,
  ).fill({ color: rightColor, alpha });

  // Left face (medium)
  g.poly(
    [x - hw, y - h, x, y + hh - h, x, y + hh, x - hw, y],
    true,
  ).fill({ color: leftColor, alpha });

  // Top face (brightest)
  g.poly(
    [x, y - hh - h, x + hw, y - h, x, y + hh - h, x - hw, y - h],
    true,
  ).fill({ color: topColor, alpha });
}

/** Draw a smaller isometric box at screen-space center (cx, cy).
 *  hw/hh control the diamond base half-dimensions. */
export function drawBox(
  g: Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  h: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  alpha: number,
) {
  // Right face
  g.poly(
    [cx + hw, cy - h, cx, cy + hh - h, cx, cy + hh, cx + hw, cy],
    true,
  ).fill({ color: rightColor, alpha });
  // Left face
  g.poly(
    [cx - hw, cy - h, cx, cy + hh - h, cx, cy + hh, cx - hw, cy],
    true,
  ).fill({ color: leftColor, alpha });
  // Top face
  g.poly(
    [cx, cy - hh - h, cx + hw, cy - h, cx, cy + hh - h, cx - hw, cy - h],
    true,
  ).fill({ color: topColor, alpha });
}

/** Draw a wall segment between two iso tile positions with vertical extrusion.
 *  Face is semi-transparent, top edge has neon glow. */
export function drawIsoWall(
  g: Graphics,
  c1: number,
  r1: number,
  c2: number,
  r2: number,
  h: number,
  faceColor: number,
  edgeColor: number,
  faceAlpha: number,
) {
  const p1 = toScreen(c1, r1);
  const p2 = toScreen(c2, r2);

  // Wall face
  g.poly(
    [p1.x, p1.y, p1.x, p1.y - h, p2.x, p2.y - h, p2.x, p2.y],
    true,
  ).fill({ color: faceColor, alpha: faceAlpha });

  // Neon top edge
  g.moveTo(p1.x, p1.y - h);
  g.lineTo(p2.x, p2.y - h);
  g.stroke({ color: edgeColor, width: 1.5, alpha: 0.6 });

  // Subtle bottom edge
  g.moveTo(p1.x, p1.y);
  g.lineTo(p2.x, p2.y);
  g.stroke({ color: edgeColor, width: 0.5, alpha: 0.12 });
}
