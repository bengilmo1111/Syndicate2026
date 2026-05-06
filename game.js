import { Agent, Enemy, Projectile, obstacles, spawnEnemies } from './entities.js';
import { updateHUD, showOverlay, hideOverlay, updateOverlayText } from './ui.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('start-button');
const overlay = document.getElementById('overlay');

const state = {
  mode: 'menu',
  mapWidth: canvas.width,
  mapHeight: canvas.height,
  player: null,
  enemies: [],
  projectiles: [],
  startTime: 0,
  kills: 0,
  objective: 'Secure the sector',
  isMouseDown: false,
  mouse: { x: 0, y: 0 },
};

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
};

function resetGame() {
  state.player = new Agent(512, 600);
  state.enemies = spawnEnemies();
  state.projectiles = [];
  state.kills = 0;
  state.startTime = performance.now();
  state.mode = 'playing';
  hideOverlay();
  updateHUD(state);
}

function update(delta) {
  if (state.mode !== 'playing') return;

  state.player.update(delta, input, state.mouse);
  state.enemies.forEach(enemy => enemy.update(delta, state.player, obstacles));
  state.projectiles.forEach(proj => proj.update(delta));

  state.projectiles = state.projectiles.filter(proj => !proj.dead);
  state.enemies = state.enemies.filter(enemy => {
    if (enemy.dead) {
      state.kills += 1;
      return false;
    }
    return true;
  });

  if (state.player.dead) {
    state.mode = 'gameover';
    updateOverlayText('Mission failed. Reload to retry.');
    showOverlay();
  }

  if (state.enemies.length === 0) {
    state.mode = 'victory';
    updateOverlayText('Sector secured. Mission complete.');
    showOverlay();
  }

  resolveCollisions();
  updateHUD(state);
}

function resolveCollisions() {
  state.projectiles.forEach(proj => {
    state.enemies.forEach(enemy => {
      if (!proj.dead && !enemy.dead && proj.collides(enemy)) {
        enemy.takeDamage(proj.damage);
        proj.dead = true;
      }
    });
  });

  state.enemies.forEach(enemy => {
    if (!enemy.dead && state.player.collides(enemy)) {
      state.player.takeDamage(15);
      enemy.bump();
    }
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  obstacles.forEach(ob => ob.draw(ctx));
  state.player.draw(ctx);
  state.enemies.forEach(enemy => enemy.draw(ctx));
  state.projectiles.forEach(proj => proj.draw(ctx));
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#121529');
  gradient.addColorStop(1, '#07080f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

let lastFrame = performance.now();
function frame(time) {
  const delta = Math.min((time - lastFrame) / 16.67, 4);
  lastFrame = time;
  update(delta);
  render();
  requestAnimationFrame(frame);
}

function onKeyChange(key, isDown) {
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': input.up = isDown; break;
    case 'ArrowDown': case 's': case 'S': input.down = isDown; break;
    case 'ArrowLeft': case 'a': case 'A': input.left = isDown; break;
    case 'ArrowRight': case 'd': case 'D': input.right = isDown; break;
  }
}

canvas.addEventListener('mousemove', event => {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
  state.mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
});

canvas.addEventListener('mousedown', () => {
  state.isMouseDown = true;
});

canvas.addEventListener('mouseup', () => {
  state.isMouseDown = false;
});

window.addEventListener('keydown', event => onKeyChange(event.key, true));
window.addEventListener('keyup', event => onKeyChange(event.key, false));

startButton.addEventListener('click', resetGame);

function maybeFire() {
  if (state.mode !== 'playing' || !state.isMouseDown) return;
  const projectile = state.player.fire(state.mouse);
  if (projectile) {
    state.projectiles.push(projectile);
  }
}

setInterval(maybeFire, 120);
requestAnimationFrame(frame);
