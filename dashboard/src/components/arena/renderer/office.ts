import { Application, Container, Graphics } from "pixi.js";
import { toScreen, drawBox, TILE_W, TILE_H } from "./iso";
import { ARENA_AGENTS, MEETING_TABLE_TILE } from "../agents";

export type ScreenState = "idle" | "busy" | "fail" | "off";

export interface OfficeApi {
  setScreenState(agentId: string, state: ScreenState): void;
  setMeetingMode(active: boolean): void;
  destroy(): void;
}

// -- Internal screen display ------------------------------------------

interface ScreenEntry {
  container: Container;
  bg: Graphics;
  lines: Graphics[];
  border: Graphics;
  state: ScreenState;
  color: number;
  w: number;
  h: number;
}

function createScreen(
  x: number,
  y: number,
  sw: number,
  sh: number,
  color: number,
): ScreenEntry {
  const container = new Container();
  container.position.set(x - sw / 2, y - sh);

  // Background
  const bg = new Graphics();
  bg.rect(0, 0, sw, sh).fill({ color: 0x050a15, alpha: 0.9 });
  container.addChild(bg);

  // Border
  const border = new Graphics();
  border.rect(0, 0, sw, sh).stroke({ color, width: 1, alpha: 0.35 });
  container.addChild(border);

  // Scrolling code lines (hidden by default)
  const lines: Graphics[] = [];
  for (let i = 0; i < 6; i++) {
    const line = new Graphics();
    const lw = 4 + Math.random() * (sw - 8);
    line.rect(2, 0, lw, 1).fill({ color, alpha: 0.4 });
    line.position.y = i * (sh / 6) + 2;
    line.visible = false;
    container.addChild(line);
    lines.push(line);
  }

  return { container, bg, lines, border, state: "idle", color, w: sw, h: sh };
}

// -- Init -------------------------------------------------------------

export function initOffice(
  app: Application,
  scene: Container,
): OfficeApi {
  const layer = new Container();
  scene.addChild(layer);

  const screens = new Map<string, ScreenEntry>();

  // -- Boss office desk -----------------------------------------------
  const bossDesk = new Graphics();
  const bdPos = toScreen(4.5, 1.5);
  // L-shaped desk: main slab + return
  drawBox(
    bossDesk,
    bdPos.x, bdPos.y,
    TILE_W * 0.45, TILE_H * 0.35, 10,
    0x1a2538, 0x141c2e, 0x101828, 0.9,
  );
  // Desk neon edge
  const bdHw = TILE_W * 0.45;
  const bdHh = TILE_H * 0.35;
  bossDesk
    .poly(
      [
        bdPos.x, bdPos.y - bdHh - 10,
        bdPos.x + bdHw, bdPos.y - 10,
        bdPos.x, bdPos.y + bdHh - 10,
        bdPos.x - bdHw, bdPos.y - 10,
      ],
      true,
    )
    .stroke({ color: 0x00f0ff, width: 1, alpha: 0.25 });
  layer.addChild(bossDesk);

  // Boss holo screens (3 floating above desk)
  for (let i = 0; i < 3; i++) {
    const sx = bdPos.x - 20 + i * 20;
    const sy = bdPos.y - 30 - i * 3;
    const screen = createScreen(sx, sy, 16, 14, 0x00f0ff);
    layer.addChild(screen.container);
    // Associate center screen with "main" agent
    if (i === 1) screens.set("main", screen);
  }

  // Operator screen (associate with the first boss screen)
  const opScreen = createScreen(bdPos.x + 20, bdPos.y - 36, 14, 12, 0xf59e0b);
  layer.addChild(opScreen.container);
  screens.set("operator", opScreen);

  // -- Meeting table --------------------------------------------------
  const mtPos = toScreen(MEETING_TABLE_TILE.col, MEETING_TABLE_TILE.row);
  const table = new Graphics();

  // Glass-top hexagonal table
  const mtHw = TILE_W * 0.5;
  const mtHh = TILE_H * 0.5;
  drawBox(
    table,
    mtPos.x, mtPos.y,
    mtHw, mtHh, 6,
    0x0a1825, 0x081420, 0x06101a, 0.85,
  );
  // Cyan glass-top edge
  table
    .poly(
      [
        mtPos.x, mtPos.y - mtHh - 6,
        mtPos.x + mtHw, mtPos.y - 6,
        mtPos.x, mtPos.y + mtHh - 6,
        mtPos.x - mtHw, mtPos.y - 6,
      ],
      true,
    )
    .stroke({ color: 0x00f0ff, width: 1, alpha: 0.2 });
  layer.addChild(table);

  // Holographic projector column (center of table)
  const projector = new Graphics();
  projector.circle(mtPos.x, mtPos.y - 8, 3).fill({
    color: 0x00f0ff,
    alpha: 0.5,
  });
  // Vertical glow beam
  projector.moveTo(mtPos.x, mtPos.y - 8);
  projector.lineTo(mtPos.x, mtPos.y - 28);
  projector.stroke({ color: 0x00f0ff, width: 1.5, alpha: 0.15 });
  layer.addChild(projector);

  // Low chairs around table (6 small cubes)
  const chairAngles = [0, 60, 120, 180, 240, 300];
  for (const deg of chairAngles) {
    const rad = (deg * Math.PI) / 180;
    const cx = mtPos.x + Math.cos(rad) * 32;
    const cy = mtPos.y + Math.sin(rad) * 16;
    const chair = new Graphics();
    drawBox(chair, cx, cy, 6, 4, 5, 0x141c2a, 0x101826, 0x0c1420, 0.7);
    layer.addChild(chair);
  }

  // -- Workstations (4 agent desks) -----------------------------------
  const workstationAgents = ["akua", "akua_web", "basedintern", "basedintern_web"];
  for (const agentId of workstationAgents) {
    const cfg = ARENA_AGENTS.find((a) => a.id === agentId);
    if (!cfg) continue;

    const dPos = toScreen(cfg.tile.col, cfg.tile.row);

    // Desk
    const desk = new Graphics();
    drawBox(
      desk,
      dPos.x, dPos.y,
      TILE_W * 0.3, TILE_H * 0.25, 8,
      0x1a2538, 0x141c2e, 0x101828, 0.85,
    );
    // Desk edge glow
    const dHw = TILE_W * 0.3;
    const dHh = TILE_H * 0.25;
    desk
      .poly(
        [
          dPos.x, dPos.y - dHh - 8,
          dPos.x + dHw, dPos.y - 8,
          dPos.x, dPos.y + dHh - 8,
          dPos.x - dHw, dPos.y - 8,
        ],
        true,
      )
      .stroke({ color: cfg.color, width: 0.8, alpha: 0.2 });
    layer.addChild(desk);

    // Chair behind desk
    const chairG = new Graphics();
    drawBox(
      chairG,
      dPos.x, dPos.y + 12,
      5, 3, 5,
      0x141c2a, 0x101826, 0x0c1420, 0.6,
    );
    layer.addChild(chairG);

    // Holo screen above desk
    const screen = createScreen(dPos.x, dPos.y - 22, 22, 16, cfg.color);
    layer.addChild(screen.container);
    screens.set(agentId, screen);
  }

  // -- Animation ticker -----------------------------------------------
  let time = 0;
  let meetingMode = false;
  const tick = (ticker: { deltaMS: number }) => {
    time += ticker.deltaMS / 1000;

    // Animate screens
    for (const [, screen] of screens) {
      if (screen.state === "busy") {
        // Scrolling code lines
        for (let i = 0; i < screen.lines.length; i++) {
          screen.lines[i].visible = true;
          screen.lines[i].position.y =
            ((time * 18 + i * (screen.h / screen.lines.length)) %
              screen.h) +
            1;
        }
        screen.bg.tint = 0x112233;
        screen.border.tint = 0xffffff;
      } else if (screen.state === "fail") {
        // Red flicker
        for (const line of screen.lines) line.visible = false;
        screen.bg.tint = Math.random() > 0.7 ? 0x331111 : 0x220808;
        screen.border.tint = 0xff4444;
      } else if (screen.state === "off") {
        for (const line of screen.lines) line.visible = false;
        screen.bg.tint = 0x0a0a0a;
        screen.border.tint = 0x333333;
      } else {
        // Idle
        for (const line of screen.lines) line.visible = false;
        screen.bg.tint = 0xffffff;
        screen.border.tint = 0xffffff;
      }
    }

    // Projector pulse (brighter during meetings)
    if (meetingMode) {
      projector.alpha = 0.9 + Math.sin(time * 3) * 0.1;
      projector.scale.set(1 + Math.sin(time * 2) * 0.15);
    } else {
      projector.alpha = 0.6 + Math.sin(time * 2) * 0.2;
      projector.scale.set(1);
    }
  };
  app.ticker.add(tick);

  // -- API ------------------------------------------------------------
  return {
    setScreenState(agentId, state) {
      const s = screens.get(agentId);
      if (s) s.state = state;
    },
    setMeetingMode(active) {
      meetingMode = active;
    },
    destroy() {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    },
  };
}
