import { Application, Container, Graphics, BlurFilter } from "pixi.js";
import { ARENA_AGENTS, type AgentNodeConfig } from "../agents";
import { toScreen } from "./iso";

export type NodeState = "idle" | "busy" | "offline";

export interface NodesApi {
  setState(agentId: string, state: NodeState): void;
  getPosition(agentId: string): { x: number; y: number } | null;
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
  screenX: number;
  screenY: number;
}

export function initAvatars(
  app: Application,
  scene: Container,
): NodesApi {
  const layer = new Container();
  scene.addChild(layer);

  const avatars = new Map<string, AvatarEntry>();

  // -- Create each avatar ---------------------------------------------
  for (const cfg of ARENA_AGENTS) {
    const pos = toScreen(cfg.tile.col, cfg.tile.row);
    // Floating agents hover above their position
    const yOff = cfg.floating ? -35 : -18;
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
      screenX: sx,
      screenY: sy,
    });
  }

  // -- Animation ticker -----------------------------------------------
  let time = 0;
  const tick = (ticker: { deltaMS: number }) => {
    time += ticker.deltaMS / 1000;

    for (const entry of avatars.values()) {
      const phase = entry.config.tile.col * 3 + entry.config.tile.row * 7;

      switch (entry.state) {
        case "idle": {
          // Gentle breathing pulse
          const s = 1 + Math.sin(time * 1.5 + phase) * 0.06;
          entry.container.scale.set(s);
          entry.glow.alpha = 0.35 + Math.sin(time * 1.2 + phase) * 0.12;
          entry.core.alpha = 0.8;
          entry.silhouette.alpha = 0.15;
          entry.ring.visible = false;

          // Floating agents bob gently
          if (entry.config.floating) {
            entry.container.position.y =
              entry.screenY + Math.sin(time * 0.8 + phase) * 4;
          }
          break;
        }
        case "busy": {
          // Active glow + spinning ring
          const s = 1 + Math.sin(time * 3) * 0.04;
          entry.container.scale.set(s);
          entry.glow.alpha = 0.7 + Math.sin(time * 4) * 0.2;
          entry.core.alpha = 1;
          entry.silhouette.alpha = 0.3;
          entry.ring.visible = true;
          entry.ring.rotation = time * 2.5;

          if (entry.config.floating) {
            entry.container.position.y =
              entry.screenY + Math.sin(time * 1.5 + phase) * 3;
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
    }
  };
  app.ticker.add(tick);

  // -- Public API -----------------------------------------------------
  return {
    setState(agentId, state) {
      const a = avatars.get(agentId);
      if (a) a.state = state;
    },
    getPosition(agentId) {
      const a = avatars.get(agentId);
      return a ? { x: a.screenX, y: a.screenY } : null;
    },
    resize() {
      // Positions are in iso-space (scene container handles viewport centering)
      // Nothing to do here — scene container position handles it
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
