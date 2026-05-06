import { Projectile, obstacles, spawnEnemies, spawnCivilians, spawnPolice, MAP_WIDTH, MAP_HEIGHT } from './entities.js';
import { Squad } from './squad.js';
import { updateHUD, showOverlay, hideOverlay, setOverlayContent } from './ui.js';
import { drawCity } from './city.js';
import { buildMission, getMissionDef, updateMissionStatus, isMissionComplete } from './world.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');

const ACTIVE_MISSION_ID = 'sector-7';

const state = {
  mode: 'briefing',
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  squad: null,
  enemies: [],
  civilians: [],
  projectiles: [],
  startTime: 0,
  kills: 0,
  followers: 0,
  persuadertron: false,
  mission: null,
  isMouseDown: false,
  mouse: { x: 0, y: 0 },
};

const input = { up: false, down: false, left: false, right: false };

function startMission() {
  state.squad = new Squad(MAP_WIDTH / 2, MAP_HEIGHT - 90);
  state.enemies = spawnEnemies();
  state.civilians = spawnCivilians(10, obstacles);
  state.projectiles = [];
  state.kills = 0;
  state.followers = 0;
  state.persuadertron = false;
  state.heat = 0;
  state.policeAlertT = 0;
  state.mission = buildMission(ACTIVE_MISSION_ID);
  state.startTime = performance.now();
  state.mode = 'playing';
  hideOverlay();
  updateHUD(state);
}

function showBriefing() {
  state.mode = 'briefing';
  const def = getMissionDef(ACTIVE_MISSION_ID);
  setOverlayContent({
    title: 'SYNDICATE 2026',
    body: def.briefing,
    button: { label: 'DEPLOY SQUAD', onClick: startMission },
    hint: '1-4 select · Q all · WASD / right-click move · Left-click focus fire · Space: Persuadertron',
  });
  showOverlay();
}

function showDebrief(victory) {
  state.mode = victory ? 'victory' : 'gameover';
  setOverlayContent({
    title: victory ? 'SECTOR SECURED' : 'SQUAD WIPED',
    body: victory
      ? [
        'Rival presence in Sector 7 is neutralized. The board will hear of it.',
        `Hostiles eliminated: <strong>${state.kills}</strong>.`,
      ]
      : [
        'Recovery teams will collect what’s left. The syndicate continues.',
        'Try again, executive.',
      ],
    button: { label: 'REDEPLOY', onClick: startMission },
  });
  showOverlay();
}

function update(delta) {
  if (state.mode !== 'playing') return;

  state.squad.update(delta, input);
  state.enemies.forEach(enemy => enemy.update(delta, state.squad.alive, obstacles));
  const center = squadCenter();
  state.civilians.forEach(civ => civ.update(delta, center, obstacles));
  state.squad.persuadeNearby(state.civilians);
  state.followers = state.civilians.filter(c => c.persuaded && !c.dead).length;
  state.persuadertron = state.squad.persuadertron;
  state.projectiles.forEach(proj => proj.update(delta));
  state.projectiles = state.projectiles.filter(proj => !proj.dead);

  resolveCollisions();

  state.enemies = state.enemies.filter(enemy => {
    if (enemy.dead) {
      if (enemy.faction === 'rival') state.kills += 1;
      return false;
    }
    return true;
  });

  if (state.heat >= 60) {
    state.enemies.push(...spawnPolice(2));
    state.heat = 20;
    state.policeAlertT = 120;
  }
  if (state.policeAlertT > 0) state.policeAlertT -= 1;

  updateMissionStatus(state.mission, { kills: state.kills, followers: state.followers });

  if (state.squad.allDead) {
    showDebrief(false);
    return;
  }
  if (isMissionComplete(state.mission)) {
    showDebrief(true);
    return;
  }

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
    state.civilians.forEach(civ => {
      if (proj.dead || civ.dead) return;
      if (proj.collides(civ)) {
        const killed = civ.takeDamage(proj.damage);
        proj.dead = true;
        if (killed) state.heat += 15;
      }
    });
  });

  state.enemies.forEach(enemy => {
    if (enemy.dead) return;
    state.squad.alive.forEach(agent => {
      if (agent.collides(enemy)) {
        agent.takeDamage(8);
        enemy.bump();
      }
    });
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCity(ctx, canvas.width, canvas.height);
  obstacles.forEach(ob => ob.draw(ctx));
  state.civilians.forEach(civ => civ.draw(ctx));
  state.enemies.forEach(enemy => enemy.draw(ctx));
  state.projectiles.forEach(proj => proj.draw(ctx));
  if (state.squad) {
    drawMoveOrders(state.squad);
    state.squad.draw(ctx);
  }
  if (state.policeAlertT > 0) drawPoliceAlert(state.policeAlertT);
}

function drawPoliceAlert(ttl) {
  const alpha = Math.min(1, ttl / 120);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 22px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffce4f';
  ctx.shadowColor = 'rgba(255, 206, 79, 0.7)';
  ctx.shadowBlur = 12;
  ctx.fillText('// POLICE INBOUND', canvas.width / 2, 60);
  ctx.restore();
}

function squadCenter() {
  if (!state.squad) return null;
  const alive = state.squad.alive;
  if (alive.length === 0) return null;
  let cx = 0;
  let cy = 0;
  for (const a of alive) {
    cx += a.x;
    cy += a.y;
  }
  return { x: cx / alive.length, y: cy / alive.length };
}

function drawMoveOrders(squad) {
  ctx.save();
  ctx.lineWidth = 1;
  for (const a of squad.alive) {
    if (!a.moveTarget) continue;
    ctx.strokeStyle = a.color;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(a.moveTarget.x, a.moveTarget.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.moveTarget.x - 3, a.moveTarget.y);
    ctx.lineTo(a.moveTarget.x + 3, a.moveTarget.y);
    ctx.moveTo(a.moveTarget.x, a.moveTarget.y - 3);
    ctx.lineTo(a.moveTarget.x, a.moveTarget.y + 3);
    ctx.stroke();
  }
  ctx.restore();
}

let lastFrame = performance.now();
function frame(time) {
  const delta = Math.min((time - lastFrame) / 16.67, 4);
  lastFrame = time;
  update(delta);
  render();
  requestAnimationFrame(frame);
}

function handleKey(event, isDown) {
  const k = event.key;
  switch (k) {
    case 'ArrowUp': case 'w': case 'W': input.up = isDown; break;
    case 'ArrowDown': case 's': case 'S': input.down = isDown; break;
    case 'ArrowLeft': case 'a': case 'A': input.left = isDown; break;
    case 'ArrowRight': case 'd': case 'D': input.right = isDown; break;
  }
  if (!isDown || state.mode !== 'playing' || !state.squad) return;
  if (k === '1' || k === '2' || k === '3' || k === '4') {
    if (event.shiftKey) {
      state.squad.toggleSelect(parseInt(k, 10) - 1);
    } else {
      state.squad.selectOnly(parseInt(k, 10) - 1);
    }
  } else if (k === 'q' || k === 'Q' || k === '`') {
    state.squad.selectAll();
  } else if (k === ' ' || k === 'Spacebar') {
    state.squad.togglePersuadertron();
    state.persuadertron = state.squad.persuadertron;
    event.preventDefault?.();
  }
}

canvas.addEventListener('mousemove', event => {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
  state.mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
});

canvas.addEventListener('mousedown', event => {
  if (event.button === 0) {
    state.isMouseDown = true;
  } else if (event.button === 2) {
    if (state.mode === 'playing' && state.squad) {
      state.squad.issueMove(state.mouse);
    }
  }
});
canvas.addEventListener('mouseup', event => {
  if (event.button === 0) state.isMouseDown = false;
});
canvas.addEventListener('contextmenu', event => event.preventDefault());

window.addEventListener('keydown', event => handleKey(event, true));
window.addEventListener('keyup', event => handleKey(event, false));

function maybeFire() {
  if (state.mode !== 'playing' || !state.squad) return;
  const projs = state.isMouseDown
    ? state.squad.fireAt(state.mouse)
    : state.squad.autoFire(state.enemies);
  for (const p of projs) {
    state.projectiles.push(p);
    for (const c of state.civilians) {
      if (!c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 110) {
        state.heat += 1;
      }
    }
  }
}
setInterval(maybeFire, 60);

showBriefing();
requestAnimationFrame(frame);
