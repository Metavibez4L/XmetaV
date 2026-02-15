import { Application, Container, Graphics, BlurFilter } from "pixi.js";
import type { NodesApi } from "./avatars";
import type { OfficeApi } from "./office";
import { toScreen } from "./iso";
import { MEETING_TABLE_TILE } from "../agents";

export interface EffectsApi {
  commandPulse(targetAgentId: string): void;
  streamStart(agentId: string): void;
  streamStop(agentId: string): void;
  dispatchBeam(fromId: string, toId: string): void;
  completionBurst(agentId: string): void;
  failureGlitch(agentId: string): void;
  meetingStart(agentIds: string[]): void;
  meetingEnd(): void;
  swarmStart(runId: string, agentIds: string[], mode: string): void;
  swarmTaskUpdate(runId: string, agentId: string, status: string): void;
  swarmEnd(runId: string): void;
  destroy(): void;
}

// -- Internal types ---------------------------------------------------

interface Particle {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface WaypointPulse {
  g: Graphics;
  trail: Graphics;
  waypoints: { x: number; y: number }[];
  progress: number;
  totalDist: number;
  segDists: number[];
}

interface BeamEntry {
  lines: Graphics[];
  dots: Graphics[];
  waypoints: { x: number; y: number }[];
  progress: number;
  duration: number;
}

interface BurstEntry {
  ring: Graphics;
  progress: number;
  x: number;
  y: number;
}

interface GlitchEntry {
  rects: Graphics[];
  progress: number;
  x: number;
  y: number;
}

interface MeetingState {
  active: boolean;
  ring: Graphics;
  beam: Graphics;
  connectionLines: Graphics;
  holoDiscs: Graphics[];
  scanlines: Graphics;
  glitchArtifacts: Graphics;
  agentIds: string[];
  fadeIn: number; // 0→1 fade
}

interface SwarmLinkState {
  runId: string;
  mode: string; // parallel | pipeline | collaborative
  agentIds: string[];
  taskStatuses: Map<string, string>; // agentId → pending|running|completed|failed
  container: Container;
  links: Graphics;
  dataParticles: Graphics;
  statusRings: Map<string, Graphics>;
  fadeIn: number;
  active: boolean;
}

// -- Helpers ----------------------------------------------------------

function distBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function lerpOnPath(
  waypoints: { x: number; y: number }[],
  segDists: number[],
  totalDist: number,
  t: number,
): { x: number; y: number } {
  const d = t * totalDist;
  let acc = 0;
  for (let i = 0; i < segDists.length; i++) {
    if (acc + segDists[i] >= d) {
      const segT = (d - acc) / segDists[i];
      return {
        x: waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * segT,
        y: waypoints[i].y + (waypoints[i + 1].y - waypoints[i].y) * segT,
      };
    }
    acc += segDists[i];
  }
  return waypoints[waypoints.length - 1];
}

function buildPath(points: { x: number; y: number }[]) {
  const segDists = [];
  let totalDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distBetween(points[i], points[i + 1]);
    segDists.push(d);
    totalDist += d;
  }
  return { segDists, totalDist };
}

// -- Init -------------------------------------------------------------

export function initEffects(
  app: Application,
  scene: Container,
  nodesApi: NodesApi,
  _officeApi: OfficeApi,
): EffectsApi {
  const layer = new Container();
  scene.addChild(layer);

  const streamingAgents = new Set<string>();
  const particles: Particle[] = [];
  const pulses: WaypointPulse[] = [];
  const beams: BeamEntry[] = [];
  const bursts: BurstEntry[] = [];
  const glitches: GlitchEntry[] = [];

  // -- Particle pool (recycles Graphics objects to reduce GC pressure) --
  const PARTICLE_POOL_MAX = 200;
  const MAX_ACTIVE_PARTICLES = 120;
  const particlePool: Graphics[] = [];

  function acquireParticle(): Graphics {
    const g = particlePool.pop();
    if (g) {
      g.clear();
      g.alpha = 1;
      g.visible = true;
      return g;
    }
    return new Graphics();
  }

  function releaseParticle(g: Graphics): void {
    g.visible = false;
    layer.removeChild(g);
    if (particlePool.length < PARTICLE_POOL_MAX) {
      particlePool.push(g);
    } else {
      g.destroy();
    }
  }

  // -- Meeting position cache (skip connection line redraw if static) --
  let lastMeetingPosHash = "";

  function hashPositions(positions: { x: number; y: number }[]): string {
    // Round to nearest pixel — sub-pixel diffs don't matter visually
    return positions.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join("|");
  }

  // Partition center (gateway between boss office and workstations)
  const partitionCenter = toScreen(4.5, 3);
  const meetingCenter = toScreen(
    MEETING_TABLE_TILE.col,
    MEETING_TABLE_TILE.row,
  );

  // Meeting state (persistent while meeting is active)
  let meeting: MeetingState | null = null;
  let meetingTime = 0;

  // Swarm neural link state
  const activeSwarms = new Map<string, SwarmLinkState>();
  let swarmTime = 0;

  const SWARM_COLORS: Record<string, number> = {
    parallel: 0x39ff14,      // neon green
    pipeline: 0xf59e0b,      // amber
    collaborative: 0xa855f7,  // purple
  };
  const TASK_STATUS_COLORS: Record<string, number> = {
    pending: 0x4a6a8a,
    running: 0x00f0ff,
    completed: 0x39ff14,
    failed: 0xff2d5e,
    skipped: 0x4a6a8a,
  };

  // -- Ticker ---------------------------------------------------------

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS / 1000;

    // -- Streaming particles (rise from desk) ----
    // Cyberpunk: hex rain data torrents — code fragments + hex characters
    // Capped to MAX_ACTIVE_PARTICLES to prevent runaway GC pressure
    for (const agentId of streamingAgents) {
      if (particles.length >= MAX_ACTIVE_PARTICLES) break;
      const pos = nodesApi.getPosition(agentId);
      if (!pos) continue;
      // Emit 2-3 data-torrent particles per frame
      for (let i = 0; i < 2 + (Math.random() > 0.6 ? 1 : 0); i++) {
        if (particles.length >= MAX_ACTIVE_PARTICLES) break;
        const g = acquireParticle();
        const isHex = Math.random() > 0.4;
        if (isHex) {
          // Hex character fragment — tiny bright dots in a column
          const cols = 1 + Math.floor(Math.random() * 3);
          for (let h = 0; h < cols; h++) {
            g.rect(0, h * 3, 2, 1.5).fill({ color: 0x00f0ff, alpha: 0.5 + Math.random() * 0.3 });
          }
        } else {
          // Code fragment — horizontal line
          const lw = 2 + Math.random() * 6;
          g.rect(-lw / 2, 0, lw, 1).fill({ color: 0x00f0ff, alpha: 0.6 });
        }
        g.position.set(pos.x + (Math.random() - 0.5) * 24, pos.y);
        layer.addChild(g);
        particles.push({
          g,
          x: pos.x + (Math.random() - 0.5) * 24,
          y: pos.y,
          vx: (Math.random() - 0.5) * 5,
          vy: -25 - Math.random() * 35,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.6,
        });
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        releaseParticle(p.g);
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.g.position.set(p.x, p.y);
      p.g.alpha = (1 - p.life / p.maxLife) * 0.6;
    }

    // -- Waypoint pulses ----
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.progress += dt / 0.8; // 800ms total travel time
      if (p.progress >= 1) {
        p.g.destroy();
        p.trail.destroy();
        pulses.splice(i, 1);
        continue;
      }
      const pt = lerpOnPath(
        p.waypoints,
        p.segDists,
        p.totalDist,
        p.progress,
      );
      p.g.position.set(pt.x, pt.y);
      p.trail.position.set(pt.x, pt.y);
      const fade =
        p.progress < 0.1
          ? p.progress / 0.1
          : p.progress > 0.85
            ? (1 - p.progress) / 0.15
            : 1;
      p.g.alpha = fade;
      p.trail.alpha = fade * 0.35;
    }

    // -- Dispatch beams ----
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.progress += dt / b.duration;
      if (b.progress >= 1) {
        for (const l of b.lines) l.destroy();
        for (const d of b.dots) d.destroy();
        beams.splice(i, 1);
        continue;
      }
      const alpha =
        b.progress < 0.1
          ? b.progress / 0.1
          : b.progress > 0.8
            ? (1 - b.progress) / 0.2
            : 1;
      for (const l of b.lines) l.alpha = alpha * 0.4;
      // Animate dots along full path
      const { segDists, totalDist } = buildPath(b.waypoints);
      for (let j = 0; j < b.dots.length; j++) {
        const t = (b.progress * 2.5 + j / b.dots.length) % 1;
        const pt = lerpOnPath(b.waypoints, segDists, totalDist, t);
        b.dots[j].position.set(pt.x, pt.y);
        b.dots[j].alpha = alpha * 0.8;
      }
    }

    // -- Completion bursts ----
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.progress += dt / 0.6;
      if (b.progress >= 1) {
        b.ring.destroy();
        bursts.splice(i, 1);
        continue;
      }
      b.ring.scale.set(0.5 + b.progress * 2.5);
      b.ring.alpha = 1 - b.progress;
    }

    // -- Failure glitches ----
    for (let i = glitches.length - 1; i >= 0; i--) {
      const gl = glitches[i];
      gl.progress += dt / 1;
      if (gl.progress >= 1) {
        for (const r of gl.rects) r.destroy();
        glitches.splice(i, 1);
        continue;
      }
      for (const r of gl.rects) {
        r.visible = Math.random() > 0.4;
        r.position.set(
          gl.x + (Math.random() - 0.5) * 50,
          gl.y + (Math.random() - 0.5) * 35,
        );
      }
    }

    // -- Neural swarm links ----
    swarmTime += dt;
    for (const [runId, swarm] of activeSwarms) {
      // Fade in/out
      if (swarm.active && swarm.fadeIn < 1) {
        swarm.fadeIn = Math.min(1, swarm.fadeIn + dt * 1.5);
      } else if (!swarm.active) {
        swarm.fadeIn -= dt * 2;
        if (swarm.fadeIn <= 0) {
          swarm.container.destroy({ children: true });
          activeSwarms.delete(runId);
          continue;
        }
      }

      const alpha = swarm.fadeIn;
      const swarmColor = SWARM_COLORS[swarm.mode] ?? 0x00f0ff;

      // Redraw neural links between agents
      swarm.links.clear();
      swarm.dataParticles.clear();

      const positions: { id: string; x: number; y: number }[] = [];
      for (const id of swarm.agentIds) {
        const pos = nodesApi.getPosition(id);
        if (pos) positions.push({ id, x: pos.x, y: pos.y });
      }

      if (positions.length >= 2) {
        // Draw neural link topology based on mode
        if (swarm.mode === "pipeline") {
          // Pipeline: sequential chain A→B→C
          for (let i = 0; i < positions.length - 1; i++) {
            const a = positions[i];
            const b = positions[i + 1];
            const taskStatus = swarm.taskStatuses.get(a.id) ?? "pending";
            const linkColor = TASK_STATUS_COLORS[taskStatus] ?? swarmColor;
            const pulse = 0.2 + Math.sin(swarmTime * 3 + i) * 0.1;

            // Main link line
            swarm.links.moveTo(a.x, a.y);
            swarm.links.lineTo(b.x, b.y);
            swarm.links.stroke({
              color: linkColor,
              width: 1.2,
              alpha: alpha * pulse,
            });

            // Chromatic ghost line
            swarm.links.moveTo(a.x + 1.5, a.y);
            swarm.links.lineTo(b.x + 1.5, b.y);
            swarm.links.stroke({
              color: 0xff006e,
              width: 0.5,
              alpha: alpha * pulse * 0.3,
            });

            // Flowing data particle along link
            if (taskStatus === "running") {
              const t = (swarmTime * 0.8 + i * 0.3) % 1;
              const px = a.x + (b.x - a.x) * t;
              const py = a.y + (b.y - a.y) * t;
              swarm.dataParticles.circle(px, py, 2.5).fill({
                color: linkColor,
                alpha: alpha * 0.7,
              });
              swarm.dataParticles.circle(px, py, 5).fill({
                color: linkColor,
                alpha: alpha * 0.15,
              });
            }
          }
        } else {
          // Parallel / Collaborative: hub-and-spoke from meeting center
          for (const p of positions) {
            const taskStatus = swarm.taskStatuses.get(p.id) ?? "pending";
            const linkColor = TASK_STATUS_COLORS[taskStatus] ?? swarmColor;
            const pulse = 0.15 + Math.sin(swarmTime * 2.5 + p.x * 0.1) * 0.1;

            // Link to hub
            swarm.links.moveTo(meetingCenter.x, meetingCenter.y - 10);
            swarm.links.lineTo(p.x, p.y);
            swarm.links.stroke({
              color: linkColor,
              width: 1,
              alpha: alpha * pulse,
            });

            // Chromatic ghost
            swarm.links.moveTo(meetingCenter.x - 1.5, meetingCenter.y - 10);
            swarm.links.lineTo(p.x - 1.5, p.y);
            swarm.links.stroke({
              color: 0xff006e,
              width: 0.4,
              alpha: alpha * pulse * 0.25,
            });

            // Data flow particles (bidirectional for collaborative)
            if (taskStatus === "running") {
              const t1 = (swarmTime * 0.6 + p.y * 0.02) % 1;
              const px1 = meetingCenter.x + (p.x - meetingCenter.x) * t1;
              const py1 = (meetingCenter.y - 10) + (p.y - meetingCenter.y + 10) * t1;
              swarm.dataParticles.circle(px1, py1, 2).fill({
                color: linkColor,
                alpha: alpha * 0.6,
              });
              swarm.dataParticles.circle(px1, py1, 4.5).fill({
                color: linkColor,
                alpha: alpha * 0.12,
              });

              if (swarm.mode === "collaborative") {
                // Reverse flow particle
                const t2 = (swarmTime * 0.5 + p.x * 0.02 + 0.5) % 1;
                const px2 = p.x + (meetingCenter.x - p.x) * t2;
                const py2 = p.y + (meetingCenter.y - 10 - p.y) * t2;
                swarm.dataParticles.circle(px2, py2, 1.5).fill({
                  color: 0xa855f7,
                  alpha: alpha * 0.5,
                });
              }
            }
          }

          // Hub pulse ring
          const hubPulse = 0.3 + Math.sin(swarmTime * 2) * 0.15;
          swarm.links.circle(meetingCenter.x, meetingCenter.y - 10, 8 + Math.sin(swarmTime) * 2).stroke({
            color: swarmColor,
            width: 1.5,
            alpha: alpha * hubPulse,
          });
        }
      }

      // Update per-agent status rings
      for (const p of positions) {
        const ring = swarm.statusRings.get(p.id);
        if (!ring) continue;
        const taskStatus = swarm.taskStatuses.get(p.id) ?? "pending";
        const statusColor = TASK_STATUS_COLORS[taskStatus] ?? 0x4a6a8a;

        ring.clear();
        const ringPulse = taskStatus === "running"
          ? 0.4 + Math.sin(swarmTime * 4 + p.x) * 0.2
          : taskStatus === "completed" ? 0.3 : 0.1;
        ring.circle(0, 0, 18).stroke({
          color: statusColor,
          width: taskStatus === "running" ? 1.5 : 0.8,
          alpha: alpha * ringPulse,
        });
        // Outer glow for running tasks
        if (taskStatus === "running") {
          ring.circle(0, 0, 22).stroke({
            color: statusColor,
            width: 0.5,
            alpha: alpha * ringPulse * 0.4,
          });
        }
        ring.position.set(p.x, p.y);
      }

      swarm.container.alpha = alpha;
    }

    // -- Meeting holographic effects ----
    if (meeting) {
      meetingTime += dt;

      // Fade in/out
      if (meeting.active && meeting.fadeIn < 1) {
        meeting.fadeIn = Math.min(1, meeting.fadeIn + dt * 2);
      } else if (!meeting.active) {
        meeting.fadeIn -= dt * 3;
        if (meeting.fadeIn <= 0) {
          // Clean up meeting graphics
          meeting.ring.destroy();
          meeting.beam.destroy();
          meeting.connectionLines.destroy();
          meeting.scanlines.destroy();
          meeting.glitchArtifacts.destroy();
          for (const d of meeting.holoDiscs) d.destroy();
          meeting = null;
          meetingTime = 0;
          lastMeetingPosHash = \"\";
          return; // skip the rest for this frame
        }
      }

      const alpha = meeting.fadeIn;

      // Pulsing ring with chromatic wobble
      const ringScale = 1 + Math.sin(meetingTime * 2.5) * 0.06;
      meeting.ring.scale.set(ringScale);
      meeting.ring.alpha =
        alpha * (0.45 + Math.sin(meetingTime * 3) * 0.15);
      // Subtle ring position glitch (occasional jitter)
      if (Math.random() < 0.03) {
        meeting.ring.position.x = (Math.random() - 0.5) * 2;
      } else {
        meeting.ring.position.x *= 0.9; // ease back
      }

      // Vertical beam pulse
      meeting.beam.alpha =
        alpha * (0.18 + Math.sin(meetingTime * 1.5) * 0.1);

      // Scanline sweep animation
      meeting.scanlines.alpha =
        alpha * (0.3 + Math.sin(meetingTime * 4) * 0.15);
      meeting.scanlines.position.y =
        Math.sin(meetingTime * 0.8) * 3;

      // Glitch artifacts (random chromatic bars that flash briefly)
      meeting.glitchArtifacts.clear();
      if (Math.random() < 0.08) {
        const gy = (Math.random() - 0.5) * 50;
        const gw = 15 + Math.random() * 40;
        meeting.glitchArtifacts
          .rect(
            meetingCenter.x - gw / 2 + 2,
            meetingCenter.y - 8 + gy,
            gw,
            1.5,
          )
          .fill({ color: 0xff006e, alpha: 0.2 + Math.random() * 0.15 });
        meeting.glitchArtifacts
          .rect(
            meetingCenter.x - gw / 2 - 2,
            meetingCenter.y - 8 + gy + 1,
            gw,
            1.5,
          )
          .fill({ color: 0x0040ff, alpha: 0.15 + Math.random() * 0.1 });
      }

      // Holographic floating discs (varied orbits)
      for (let i = 0; i < meeting.holoDiscs.length; i++) {
        const disc = meeting.holoDiscs[i];
        const angle =
          meetingTime * (0.4 + i * 0.1) +
          (i * Math.PI * 2) / meeting.holoDiscs.length;
        const radius = 18 + i * 4;
        disc.position.set(
          meetingCenter.x + Math.cos(angle) * radius,
          meetingCenter.y - 18 - i * 3 + Math.sin(angle) * (6 + i * 2),
        );
        disc.alpha =
          alpha * (0.25 + Math.sin(meetingTime * 2.5 + i * 1.2) * 0.15);
        disc.rotation = Math.sin(meetingTime * 0.3 + i) * 0.15;
      }

      // Connection lines between seated agents (cyberpunk neon links)
      // Only redraw when agent positions have visually changed (>1px)
      const positions: { x: number; y: number }[] = [];
      for (const id of meeting.agentIds) {
        const pos = nodesApi.getPosition(id);
        if (pos) positions.push(pos);
      }
      const posHash = hashPositions(positions);
      if (posHash !== lastMeetingPosHash) {
        lastMeetingPosHash = posHash;
        meeting.connectionLines.clear();
        if (positions.length >= 2) {
          // Draw neon lines from each agent to the table center
          for (const pos of positions) {
            // Core line
            meeting.connectionLines.moveTo(pos.x, pos.y);
            meeting.connectionLines.lineTo(meetingCenter.x, meetingCenter.y - 10);
            meeting.connectionLines.stroke({
              color: 0x00f0ff,
              width: 1,
              alpha: alpha * (0.2 + Math.sin(meetingTime * 2.5) * 0.1),
            });
            // Magenta ghost line (chromatic offset)
            meeting.connectionLines.moveTo(pos.x + 1.5, pos.y + 0.5);
            meeting.connectionLines.lineTo(
              meetingCenter.x + 1.5,
              meetingCenter.y - 9.5,
            );
            meeting.connectionLines.stroke({
              color: 0xff006e,
              width: 0.6,
              alpha: alpha * 0.06,
            });
          }
          // Subtle arcs between adjacent agents
          for (let i = 0; i < positions.length; i++) {
            const next = positions[(i + 1) % positions.length];
            meeting.connectionLines.moveTo(positions[i].x, positions[i].y);
            meeting.connectionLines.lineTo(next.x, next.y);
            meeting.connectionLines.stroke({
              color: 0x00f0ff,
              width: 0.5,
              alpha: alpha * 0.06,
            });
          }
        }
      }
    }
  };

  app.ticker.add(tick);

  // -- Public API -----------------------------------------------------

  return {
    commandPulse(targetAgentId) {
      // Golden energy from boss office to target, via partition center
      const bossPos = nodesApi.getPosition("main") ?? toScreen(4, 1.5);
      const targetPos = nodesApi.getPosition(targetAgentId);
      if (!targetPos) return;

      // Path: boss desk -> partition -> target desk
      const waypoints = [bossPos, partitionCenter, targetPos];
      const { segDists, totalDist } = buildPath(waypoints);

      const g = new Graphics();
      g.circle(0, 0, 5).fill({ color: 0xf59e0b, alpha: 0.9 });
      layer.addChild(g);

      const trail = new Graphics();
      trail.circle(0, 0, 12).fill({ color: 0xf59e0b, alpha: 0.25 });
      layer.addChild(trail);

      pulses.push({ g, trail, waypoints, progress: 0, totalDist, segDists });
    },

    streamStart(agentId) {
      streamingAgents.add(agentId);
    },

    streamStop(agentId) {
      streamingAgents.delete(agentId);
    },

    dispatchBeam(fromId, toId) {
      const from = nodesApi.getPosition(fromId);
      const to = nodesApi.getPosition(toId);
      if (!from || !to) return;

      // Two-segment path: source -> meeting table -> target
      const waypoints = [from, meetingCenter, to];

      // Draw line segments
      const lines: Graphics[] = [];
      for (let s = 0; s < waypoints.length - 1; s++) {
        const lineG = new Graphics();
        lineG.moveTo(waypoints[s].x, waypoints[s].y);
        lineG.lineTo(waypoints[s + 1].x, waypoints[s + 1].y);
        lineG.stroke({ color: 0x00f0ff, width: 1.5, alpha: 0.4 });
        layer.addChild(lineG);
        lines.push(lineG);
      }

      // Traveling dots
      const dots: Graphics[] = [];
      for (let j = 0; j < 4; j++) {
        const d = new Graphics();
        d.circle(0, 0, 2.5).fill({ color: 0x00f0ff, alpha: 0.8 });
        layer.addChild(d);
        dots.push(d);
      }

      beams.push({ lines, dots, waypoints, progress: 0, duration: 2.5 });
    },

    completionBurst(agentId) {
      const pos = nodesApi.getPosition(agentId);
      if (!pos) return;

      const ring = new Graphics();
      ring.circle(0, 0, 18).stroke({
        color: 0x39ff14,
        width: 2,
        alpha: 0.9,
      });
      ring.position.set(pos.x, pos.y);
      layer.addChild(ring);

      bursts.push({ ring, progress: 0, x: pos.x, y: pos.y });
    },

    failureGlitch(agentId) {
      const pos = nodesApi.getPosition(agentId);
      if (!pos) return;

      const rects: Graphics[] = [];

      // ── Cyberpunk: chromatic split bars (RGB separated) ──
      // Red-shifted glitch bars
      for (let j = 0; j < 3; j++) {
        const r = new Graphics();
        const rw = 12 + Math.random() * 25;
        const rh = 1.5 + Math.random() * 3;
        r.rect(-rw / 2, -rh / 2, rw, rh).fill({
          color: 0xff0040,
          alpha: 0.4 + Math.random() * 0.3,
        });
        r.position.set(
          pos.x + 3 + (Math.random() - 0.5) * 55,
          pos.y + (Math.random() - 0.5) * 40,
        );
        layer.addChild(r);
        rects.push(r);
      }
      // Blue-shifted glitch bars
      for (let j = 0; j < 3; j++) {
        const r = new Graphics();
        const rw = 12 + Math.random() * 25;
        const rh = 1.5 + Math.random() * 3;
        r.rect(-rw / 2, -rh / 2, rw, rh).fill({
          color: 0x0040ff,
          alpha: 0.3 + Math.random() * 0.25,
        });
        r.position.set(
          pos.x - 3 + (Math.random() - 0.5) * 55,
          pos.y + (Math.random() - 0.5) * 40,
        );
        layer.addChild(r);
        rects.push(r);
      }
      // Digital decay blocks (original red + new scanline artifacts)
      for (let j = 0; j < 4; j++) {
        const r = new Graphics();
        const rw = 6 + Math.random() * 18;
        const rh = 1 + Math.random() * 4;
        r.rect(-rw / 2, -rh / 2, rw, rh).fill({
          color: 0xff2d5e,
          alpha: 0.5 + Math.random() * 0.3,
        });
        r.position.set(
          pos.x + (Math.random() - 0.5) * 50,
          pos.y + (Math.random() - 0.5) * 35,
        );
        layer.addChild(r);
        rects.push(r);
      }

      glitches.push({ rects, progress: 0, x: pos.x, y: pos.y });
    },

    meetingStart(agentIds) {
      // If already active, update the agent list
      if (meeting && meeting.active) {
        meeting.agentIds = [...agentIds];
        return;
      }

      // ── Cyberpunk holographic meeting ring ──
      const ring = new Graphics();
      // Outer neon ring
      ring.circle(meetingCenter.x, meetingCenter.y - 8, 38).stroke({
        color: 0x00f0ff,
        width: 2,
        alpha: 0.6,
      });
      // Inner ring with chromatic offset
      ring.circle(meetingCenter.x + 1, meetingCenter.y - 8, 30).stroke({
        color: 0xff006e,
        width: 1,
        alpha: 0.3,
      });
      ring.circle(meetingCenter.x - 1, meetingCenter.y - 8, 30).stroke({
        color: 0x0040ff,
        width: 1,
        alpha: 0.3,
      });
      // Core ring
      ring.circle(meetingCenter.x, meetingCenter.y - 8, 30).stroke({
        color: 0x00f0ff,
        width: 0.8,
        alpha: 0.4,
      });
      const ringBlur = new BlurFilter({ strength: 2.5, quality: 2 });
      ring.filters = [ringBlur];
      layer.addChild(ring);

      // ── Holographic beam with glow layers ──
      const beam = new Graphics();
      // Core beam
      beam.rect(meetingCenter.x - 1, meetingCenter.y - 60, 2, 55).fill({
        color: 0x00f0ff,
        alpha: 0.2,
      });
      // Wide glow beam
      beam.rect(meetingCenter.x - 6, meetingCenter.y - 50, 12, 45).fill({
        color: 0x00f0ff,
        alpha: 0.04,
      });
      // Magenta edge glow (left)
      beam.rect(meetingCenter.x - 7, meetingCenter.y - 48, 2, 42).fill({
        color: 0xff006e,
        alpha: 0.03,
      });
      // Blue edge glow (right)
      beam.rect(meetingCenter.x + 5, meetingCenter.y - 48, 2, 42).fill({
        color: 0x0040ff,
        alpha: 0.03,
      });
      layer.addChild(beam);

      // ── Scanline overlay ──
      const scanlines = new Graphics();
      for (let sy = -40; sy < 40; sy += 4) {
        scanlines
          .rect(meetingCenter.x - 38, meetingCenter.y - 8 + sy, 76, 1)
          .fill({ color: 0x00f0ff, alpha: 0.04 });
      }
      layer.addChild(scanlines);

      // ── Glitch artifact overlay (updated per frame) ──
      const glitchArtifacts = new Graphics();
      layer.addChild(glitchArtifacts);

      // Connection lines (redrawn each frame)
      const connectionLines = new Graphics();
      layer.addChild(connectionLines);

      // Floating holographic discs (more + varied)
      const holoDiscs: Graphics[] = [];
      for (let i = 0; i < 5; i++) {
        const disc = new Graphics();
        const w = 4 + Math.random() * 10;
        disc.rect(-w / 2, -1, w, 2).fill({
          color: i < 3 ? 0x00f0ff : 0xff006e,
          alpha: 0.35,
        });
        disc.position.set(meetingCenter.x, meetingCenter.y - 20);
        layer.addChild(disc);
        holoDiscs.push(disc);
      }

      meeting = {
        active: true,
        ring,
        beam,
        connectionLines,
        holoDiscs,
        scanlines,
        glitchArtifacts,
        agentIds: [...agentIds],
        fadeIn: 0,
      };
      meetingTime = 0;
    },

    meetingEnd() {
      if (meeting) {
        meeting.active = false; // Triggers fade-out in ticker
      }
    },

    swarmStart(runId, agentIds, mode) {
      // Don't duplicate
      if (activeSwarms.has(runId)) {
        const existing = activeSwarms.get(runId)!;
        existing.agentIds = [...agentIds];
        existing.active = true;
        return;
      }

      const container = new Container();
      layer.addChild(container);

      const links = new Graphics();
      container.addChild(links);

      const dataParticles = new Graphics();
      container.addChild(dataParticles);

      // Per-agent status ring overlays
      const statusRings = new Map<string, Graphics>();
      for (const id of agentIds) {
        const ring = new Graphics();
        container.addChild(ring);
        statusRings.set(id, ring);
      }

      const taskStatuses = new Map<string, string>();
      for (const id of agentIds) {
        taskStatuses.set(id, "pending");
      }

      activeSwarms.set(runId, {
        runId,
        mode,
        agentIds: [...agentIds],
        taskStatuses,
        container,
        links,
        dataParticles,
        statusRings,
        fadeIn: 0,
        active: true,
      });
    },

    swarmTaskUpdate(runId, agentId, status) {
      const swarm = activeSwarms.get(runId);
      if (!swarm) return;
      swarm.taskStatuses.set(agentId, status);
    },

    swarmEnd(runId) {
      const swarm = activeSwarms.get(runId);
      if (swarm) {
        swarm.active = false; // Triggers fade-out in ticker
      }
    },

    destroy() {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    },
  };
}
