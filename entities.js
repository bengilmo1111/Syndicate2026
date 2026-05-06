const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const MAP_WIDTH = 1024;
export const MAP_HEIGHT = 768;

export class Entity {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.dead = false;
  }

  collides(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.hypot(dx, dy) < this.radius + other.radius;
  }
}

export class Agent extends Entity {
  constructor(x, y) {
    super(x, y, 14, '#56e0ff');
    this.id = 0;
    this.name = 'AGENT';
    this.speed = 220;
    this.health = 100;
    this.maxHealth = 100;
    this.fireRate = 0.18;
    this.cooldown = 0;
    this.weapon = 'Pulse Rifle';
    this.damage = 22;
    this.selected = true;
    this.facing = 0;
    this.muzzleFlash = 0;
  }

  fire(target) {
    if (this.cooldown > 0 || this.dead) return null;
    this.cooldown = this.fireRate;
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    this.facing = angle;
    this.muzzleFlash = 0.08;
    return new Projectile(this.x, this.y, angle, this.damage);
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  draw(ctx) {
    if (this.dead) {
      ctx.save();
      ctx.fillStyle = 'rgba(120, 130, 150, 0.35)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.selected) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a1020';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.rotate(this.facing);
    ctx.fillStyle = '#0a1020';
    ctx.fillRect(this.radius - 2, -2, 8, 4);

    if (this.muzzleFlash > 0) {
      ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
      ctx.beginPath();
      ctx.arc(this.radius + 8, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  tickCooldown(delta) {
    this.cooldown = Math.max(0, this.cooldown - delta);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - delta / 60);
  }

  moveBy(dx, dy) {
    this.x = clamp(this.x + dx, this.radius, MAP_WIDTH - this.radius);
    this.y = clamp(this.y + dy, this.radius, MAP_HEIGHT - this.radius);
  }
}

export class Enemy extends Entity {
  constructor(x, y) {
    super(x, y, 14, '#ff4d91');
    this.speed = 130;
    this.health = 50;
    this.damage = 14;
    this.bumpTimer = 0;
    this.facing = 0;
  }

  update(delta, agents, obstacles) {
    if (this.dead) return;

    let target = null;
    let bestDist = Infinity;
    for (const a of agents) {
      if (a.dead) continue;
      const d = Math.hypot(a.x - this.x, a.y - this.y);
      if (d < bestDist) {
        bestDist = d;
        target = a;
      }
    }
    if (!target) return;

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      this.facing = Math.atan2(dy, dx);
      this.x += nx * this.speed * delta;
      this.y += ny * this.speed * delta;

      obstacles.forEach(ob => {
        const overlapX = Math.max(0, Math.min(this.x + this.radius, ob.x + ob.w) - Math.max(this.x - this.radius, ob.x));
        const overlapY = Math.max(0, Math.min(this.y + this.radius, ob.y + ob.h) - Math.max(this.y - this.radius, ob.y));
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            this.x += (this.x < ob.x + ob.w / 2) ? -overlapX : overlapX;
          } else {
            this.y += (this.y < ob.y + ob.h / 2) ? -overlapY : overlapY;
          }
        }
      });
    }
    this.bumpTimer = Math.max(0, this.bumpTimer - delta);
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) this.dead = true;
  }

  bump() {
    if (this.bumpTimer > 0) return;
    this.x -= Math.cos(this.facing) * 6;
    this.y -= Math.sin(this.facing) * 6;
    this.bumpTimer = 0.2;
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a0a1f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.rotate(this.facing);
    ctx.fillStyle = '#3a0a1f';
    ctx.fillRect(this.radius - 2, -2, 7, 4);
    ctx.restore();
  }
}

export class Projectile extends Entity {
  constructor(x, y, angle, damage) {
    super(x, y, 4, '#b0fbff');
    this.speed = 540;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.damage = damage;
    this.life = 1.5;
  }

  update(delta) {
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.life -= delta / 60;
    if (this.x < -20 || this.x > MAP_WIDTH + 20 || this.y < -20 || this.y > MAP_HEIGHT + 20 || this.life <= 0) {
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function block(x, y, w, h) {
  return {
    x, y, w, h,
    draw(ctx) {
      ctx.fillStyle = '#0e1a30';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = 'rgba(86, 224, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.w - 1, this.h - 1);
      // window grid
      ctx.fillStyle = 'rgba(86, 224, 255, 0.18)';
      const cols = Math.max(2, Math.floor(this.w / 22));
      const rows = Math.max(2, Math.floor(this.h / 22));
      const stepX = this.w / cols;
      const stepY = this.h / rows;
      for (let i = 1; i < cols; i++) {
        for (let j = 1; j < rows; j++) {
          const wx = this.x + i * stepX - 1.5;
          const wy = this.y + j * stepY - 1.5;
          ctx.fillRect(wx, wy, 3, 3);
        }
      }
    },
  };
}

export const obstacles = [
  block(160, 100, 200, 80),
  block(640, 90, 220, 110),
  block(120, 320, 160, 140),
  block(420, 300, 180, 110),
  block(740, 320, 180, 200),
  block(180, 540, 240, 110),
  block(560, 580, 220, 90),
];

export function spawnEnemies() {
  return [
    new Enemy(200, 250),
    new Enemy(880, 240),
    new Enemy(340, 470),
    new Enemy(720, 510),
    new Enemy(500, 660),
  ];
}
