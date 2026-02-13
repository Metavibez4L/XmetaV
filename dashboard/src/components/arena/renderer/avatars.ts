import { Application, Container, Graphics, BlurFilter } from "pixi.js";
import {
  ARENA_AGENTS,
  MEETING_TABLE_TILE,
  MEETING_SEATS,
  type AgentNodeConfig,
} from "../agents";
import { toScreen } from "./iso";

export type NodeState = "idle" | "busy" | "offline";

export interface NodesApi {
  setState(agentId: string, state: NodeState): void;
  getPosition(agentId: string): { x: number; y: number } | null;
  startMeeting(agentIds: string[]): void;
  endMeeting(): void;
  isMeetingActive(): boolean;
  resize(w: number, h: number): void;
  destroy(): void;
}

interface AvatarEntry {
  config: AgentNodeConfig;
  container: Container;
  glow: Graphics;
  core: Graphics;
  silhouette: Graphics;
  ring: Graphics;
  state: NodeState;
  /** Home (desk) position in iso-space */
  homeX: number;
  homeY: number;
  /** Current interpolated position (for smooth movement) */
  currentX: number;
  currentY: number;
  /** Meeting seat target (null if not in meeting) */
  meetingTarget: { x: number; y: number } | null;
  inMeeting: boolean;
}

// -- Seat positions around the meeting table ---------------------------

const tableCenter = toScreen(MEETING_TABLE_TILE.col, MEETING_TABLE_TILE.row);
const SEAT_RADIUS_X = 38;
const SEAT_RADIUS_Y = 19;
const AVATAR_Y_OFFSET = -18;

function getSeatPosition(angle: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return {
    x: tableCenter.x + Math.cos(rad) * SEAT_RADIUS_X,
    y: tableCenter.y + Math.sin(rad) * SEAT_RADIUS_Y + AVATAR_Y_OFFSET,
  };
}

// -- Init -------------------------------------------------------------

export function initAvatars(
  app: Application,
  scene: Container,
): NodesApi {
  const layer = new Container();
  scene.addChild(layer);

  const avatars = new Map<string, AvatarEntry>();
  let meetingActive = false;

  // -- Create each avatar ---------------------------------------------
  for (const cfg of ARENA_AGENTS) {
    const pos = toScreen(cfg.tile.col, cfg.tile.row);
    const yOff = cfg.floating ? -35 : AVATAR_Y_OFFSET;
    const sx = pos.x;
    const sy = pos.y + yOff;

    const container = new Container();
    container.position.set(sx, sy);

    // Outer glow (blurred, large)
    const glow = new Graphics();
    glow.circle(0, 0, cfg.size * 1.6).fill({
      color: cfg.color,
      alpha: 0.2,
    });
    glow.filters = [new BlurFilter({ strength: 14, quality: 3 })];
    container.addChild(glow);

    // Core orb
    const core = new Graphics();
    core.circle(0, 0, cfg.size * 0.6).fill({
      color: cfg.color,
      alpha: 0.2,
    });
    core.circle(0, 0, cfg.size * 0.6).stroke({
      color: cfg.color,
      width: 1.5,
      alpha: 0.5,
    });
    container.addChild(core);

    // Ghost silhouette (head + shoulders)
    const silhouette = new Graphics();
    drawGhostSilhouette(silhouette, cfg.size, cfg.color);
    container.addChild(silhouette);

    // Busy ring (spinning, hidden by default)
    const ring = new Graphics();
    ring.circle(0, 0, cfg.size * 0.8).stroke({
      color: cfg.color,
      width: 1.5,
      alpha: 0.5,
    });
    ring.visible = false;
    container.addChild(ring);

    layer.addChild(container);
    avatars.set(cfg.id, {
      config: cfg,
      container,
      glow,
      core,
      silhouette,
      ring,
      state: "idle",
      homeX: sx,
      homeY: sy,
      currentX: sx,
      currentY: sy,
      meetingTarget: null,
      inMeeting: false,
    });
  }

  // -- Animation ticker -----------------------------------------------
  let time = 0;
  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS / 1000;
    time += dt;

    for (const entry of avatars.values()) {
      const phase = entry.config.tile.col * 3 + entry.config.tile.row * 7;

      // -- Position interpolation (desk <-> meeting table) ----
      const targetX =
        entry.inMeeting && entry.meetingTarget
          ? entry.meetingTarget.x
          : entry.homeX;
      const targetY =
        entry.inMeeting && entry.meetingTarget
          ? entry.meetingTarget.y
          : entry.homeY;

      // Exponential ease (frame-rate independent)
      const lerpT = 1 - Math.exp(-4 * dt);
      entry.currentX += (targetX - entry.currentX) * lerpT;
      entry.currentY += (targetY - entry.currentY) * lerpT;

      // Apply position with state-specific bobbing
      let bobY = 0;

      switch (entry.state) {
        case "idle": {
          const s = 1 + Math.sin(time * 1.5 + phase) * 0.06;
          entry.container.scale.set(s);
          entry.glow.alpha = 0.35 + Math.sin(time * 1.2 + phase) * 0.12;
          entry.core.alpha = 0.8;
          // INCREASED: More visible silhouette
          entry.silhouette.alpha = entry.inMeeting ? 0.5 : 0.35;
          entry.ring.visible = false;

          if (entry.config.floating) {
            bobY = Math.sin(time * 0.8 + phase) * 4;
          }
          break;
        }
        case "busy": {
          const s = 1 + Math.sin(time * 3) * 0.04;
          entry.container.scale.set(s);
          entry.glow.alpha = 0.7 + Math.sin(time * 4) * 0.2;
          entry.core.alpha = 1;
          // INCREASED: More visible silhouette when busy
          entry.silhouette.alpha = entry.inMeeting ? 0.65 : 0.5;
          entry.ring.visible = true;
          entry.ring.rotation = time * 2.5;

          if (entry.config.floating) {
            bobY = Math.sin(time * 1.5 + phase) * 3;
          }
          break;
        }
        case "offline": {
          entry.container.scale.set(1);
          entry.glow.alpha = 0.05;
          entry.core.alpha = 0.2 + (Math.random() > 0.96 ? 0.25 : 0);
          entry.silhouette.alpha = 0.04;
          entry.ring.visible = false;
          break;
        }
      }

      // Meeting-specific: brighter glow when seated at table
      if (entry.inMeeting && entry.state !== "offline") {
        entry.glow.alpha = Math.max(entry.glow.alpha, 0.6);
        entry.silhouette.alpha = Math.max(entry.silhouette.alpha, 0.5);
      }

      entry.container.position.set(entry.currentX, entry.currentY + bobY);
    }
  };
  app.ticker.add(tick);

  // -- Public API -----------------------------------------------------
  return {
    setState(agentId, state) {
      const a = avatars.get(agentId);
      if (a) {
        a.state = state;
        console.log("[arena] setState:", agentId, "->", state);
      }
    },

    getPosition(agentId) {
      const a = avatars.get(agentId);
      return a ? { x: a.currentX, y: a.currentY } : null;
    },

    startMeeting(agentIds) {
      console.log("[arena] startMeeting called with:", agentIds);
      meetingActive = true;
      for (const id of agentIds) {
        const entry = avatars.get(id);
        if (!entry) {
          console.log("[arena]   - skipping", id, ": not found");
          continue;
        }
        if (entry.state === "offline") {
          console.log("[arena]   - skipping", id, ": offline");
          continue;
        }

        const seat = MEETING_SEATS.find((s) => s.agentId === id);
        if (!seat) {
          console.log("[arena]   - skipping", id, ": no seat assignment");
          continue;
        }

        entry.inMeeting = true;
        entry.meetingTarget = getSeatPosition(seat.angle);
        console.log("[arena]   -", id, "moving to seat at angle", seat.angle, "->", entry.meetingTarget);
      }
    },

    endMeeting() {
      console.log("[arena] endMeeting called");
      meetingActive = false;
      for (const entry of avatars.values()) {
        entry.inMeeting = false;
        entry.meetingTarget = null;
      }
    },

    isMeetingActive() {
      return meetingActive;
    },

    resize() {
      // Positions are in iso-space; scene container handles viewport centering
    },

    destroy() {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    },
  };
}

// -- Ghost silhouette helper ------------------------------------------

function drawGhostSilhouette(
  g: Graphics,
  size: number,
  color: number,
) {
  const s = size * 0.4;

  // Head (circle)
  g.circle(0, -s * 0.6, s * 0.35).fill({ color, alpha: 0.12 });

  // Shoulders + body (tapered trapezoid)
  g.moveTo(-s * 0.5, -s * 0.15);
  g.lineTo(-s * 0.35, -s * 0.4);
  g.lineTo(s * 0.35, -s * 0.4);
  g.lineTo(s * 0.5, -s * 0.15);
  g.lineTo(s * 0.3, s * 0.5);
  g.lineTo(-s * 0.3, s * 0.5);
  g.closePath();
  g.fill({ color, alpha: 0.08 });
}
