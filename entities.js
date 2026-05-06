const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Entity {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.dead = false;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  collides(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dist = Math.hypot(dx, dy);
    return dist < this.radius + other.radius;
  }
}

export class Agent extends Entity {
  constructor(x, y) {
    super(x, y, 18, '#56e0ff');
    this.speed = 250;
    this.health = 100;
    this.maxHealth = 100;
    this.fireRate = 0.15;
    this.cooldown = 0;
    this.weapon = 'Pulse Rifle';
    this.damage = 22;
  }

  update(delta, input, mouse) {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const length = Math.hypot(dx, dy) || 1;
    this.x += (dx / length) * this.speed * delta;
    this.y += (dy / length) * this.speed * delta;
    this.x = clamp(this.x, this.radius, 1024 - this.radius);
    this.y = clamp(this.y, this.radius, 768 - this.radius);
    this.cooldown = Math.max(0, this.cooldown - delta);
  }

  fire(target) {
    if (this.cooldown > 0) return null;
    this.cooldown = this.fireRate;
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    return new Projectile(this.x, this.y, angle, this.damage);
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = '#56e0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 248, 255, 0.2)';
    ctx.fill();
    ctx.restore();
  }
}

export class Enemy extends Entity {
  constructor(x, y) {
    super(x, y, 16, '#ff4d91');
    this.speed = 140;
    this.health = 45;
    this.damage = 16;
    this.bumpTimer = 0;
  }

  update(delta, player, obstacles) {
    if (this.dead) return;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      this.x += nx * this.speed * delta;
      this.y += ny * this.speed * delta;
    }
    this.bumpTimer = Math.max(0, this.bumpTimer - delta);
    obstacles.forEach(ob => {
      const overlapX = Math.max(0, Math.min(this.x + this.radius, ob.x + ob.w) - Math.max(this.x - this.radius, ob.x));
      const overlapY = Math.max(0, Math.min(this.y + this.radius, ob.y + ob.h) - Math.max(this.y - this.radius, ob.y));
      if (overlapX > 0 && overlapY > 0) {
        if (Math.abs(overlapX - overlapY) < 6) {
          this.x -= nx * 2;
          this.y -= ny * 2;
        }
      }
    });
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
    }
  }

  bump() {
    if (this.bumpTimer > 0) return;
    this.x -= 8;
    this.y -= 8;
    this.bumpTimer = 0.2;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.dead ? 'rgba(255,77,145,0.2)' : this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class Projectile extends Entity {
  constructor(x, y, angle, damage) {
    super(x, y, 6, '#b0fbff');
    this.speed = 520;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.damage = damage;
  }

  update(delta) {
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    if (this.x < -20 || this.x > 1044 || this.y < -20 || this.y > 788) {
      this.dead = true;
    }
  }
}

export const obstacles = [
  { x: 220, y: 120, w: 180, h: 60, draw(ctx) {
      ctx.fillStyle = '#11203c';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = '#56e0ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
  },
  { x: 620, y: 180, w: 120, h: 160, draw(ctx) {
      ctx.fillStyle = '#11203c';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = '#56e0ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
  },
  { x: 350, y: 420, w: 300, h: 80, draw(ctx) {
      ctx.fillStyle = '#11203c';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = '#56e0ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
  }
];

export function spawnEnemies() {
  return [
    new Enemy(160, 160),
    new Enemy(880, 140),
    new Enemy(360, 540),
    new Enemy(760, 520),
  ];
}
