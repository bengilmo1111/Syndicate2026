import { Agent, MAP_WIDTH, MAP_HEIGHT } from './entities.js';

const AGENT_NAMES = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];
const AGENT_COLORS = ['#56e0ff', '#7affad', '#ffce4f', '#ff7ad9'];
const FORMATION = [
  [-30, -30],
  [30, -30],
  [-30, 30],
  [30, 30],
];

const PERSUADE_RANGE = 170;

export class Squad {
  constructor(centerX, centerY) {
    this.agents = FORMATION.map(([dx, dy], i) => {
      const a = new Agent(centerX + dx, centerY + dy);
      a.id = i + 1;
      a.name = AGENT_NAMES[i];
      a.color = AGENT_COLORS[i];
      a.selected = true;
      return a;
    });
    this.persuadertron = false;
  }

  togglePersuadertron() {
    this.persuadertron = !this.persuadertron;
  }

  persuadeNearby(civilians) {
    if (!this.persuadertron) return 0;
    let converted = 0;
    for (const a of this.alive) {
      for (const c of civilians) {
        if (c.dead || c.persuaded) continue;
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d <= PERSUADE_RANGE && c.persuade()) converted += 1;
      }
    }
    return converted;
  }

  get alive() {
    return this.agents.filter(a => !a.dead);
  }

  get selected() {
    return this.agents.filter(a => a.selected && !a.dead);
  }

  get allDead() {
    return this.agents.every(a => a.dead);
  }

  toggleSelect(index) {
    const a = this.agents[index];
    if (!a || a.dead) return;
    a.selected = !a.selected;
  }

  selectOnly(index) {
    this.agents.forEach((a, i) => {
      a.selected = !a.dead && i === index;
    });
  }

  selectAll() {
    const aliveAgents = this.alive;
    if (aliveAgents.length === 0) return;
    const allSelected = aliveAgents.every(a => a.selected);
    aliveAgents.forEach(a => {
      a.selected = !allSelected;
    });
    if (allSelected) {
      // toggling off would leave nothing selected; flip back so at least one is on
      aliveAgents[0].selected = true;
    }
  }

  update(delta, input) {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(dx, dy);

    // Manual WASD movement cancels any standing move orders for selected agents.
    if (len > 0) {
      const speed = 220;
      const moveX = (dx / len) * speed * delta;
      const moveY = (dy / len) * speed * delta;
      for (const a of this.selected) {
        a.moveTarget = null;
        a.moveBy(moveX, moveY);
      }
    }

    // Step any agent with an outstanding move order toward its target.
    for (const a of this.alive) {
      if (!a.moveTarget) continue;
      const tdx = a.moveTarget.x - a.x;
      const tdy = a.moveTarget.y - a.y;
      const dist = Math.hypot(tdx, tdy);
      if (dist < 4) {
        a.moveTarget = null;
        continue;
      }
      const speed = 220;
      const step = Math.min(dist, speed * delta);
      a.moveBy((tdx / dist) * step, (tdy / dist) * step);
    }

    for (const a of this.alive) {
      a.tickCooldown(delta);
    }
  }

  issueMove(point) {
    const sel = this.selected;
    if (sel.length === 0) return;
    let cx = 0;
    let cy = 0;
    for (const a of sel) {
      cx += a.x;
      cy += a.y;
    }
    cx /= sel.length;
    cy /= sel.length;
    for (const a of sel) {
      a.moveTarget = {
        x: point.x + (a.x - cx),
        y: point.y + (a.y - cy),
      };
    }
  }

  fireAt(target) {
    if (this.persuadertron) return [];
    const projectiles = [];
    for (const a of this.selected) {
      const p = a.fire(target);
      if (p) projectiles.push(p);
    }
    return projectiles;
  }

  autoFire(enemies) {
    if (this.persuadertron) return [];
    const projectiles = [];
    for (const a of this.alive) {
      const p = a.autoFire(enemies);
      if (p) projectiles.push(p);
    }
    return projectiles;
  }

  draw(ctx) {
    if (this.persuadertron) {
      ctx.save();
      ctx.strokeStyle = 'rgba(86, 224, 255, 0.35)';
      ctx.fillStyle = 'rgba(86, 224, 255, 0.06)';
      ctx.lineWidth = 1;
      for (const a of this.alive) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, PERSUADE_RANGE, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const a of this.agents) a.draw(ctx);
  }
}
