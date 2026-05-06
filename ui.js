const hudHealth = document.getElementById('hud-health');
const hudWeapon = document.getElementById('hud-weapon');
const hudObjective = document.getElementById('hud-objective');
const hudKills = document.getElementById('hud-kills');
const hudTime = document.getElementById('hud-time');
const overlay = document.getElementById('overlay');
const overlayText = document.createElement('p');

overlayText.id = 'overlay-text';
overlayText.className = 'overlay-text';
overlayText.textContent = '';
overlay.querySelector('.menu-card').appendChild(overlayText);

export function updateHUD(state) {
  hudHealth.textContent = `${state.player ? state.player.health : 0}`;
  hudWeapon.textContent = state.player ? state.player.weapon : 'Pulse Rifle';
  hudObjective.textContent = state.objective;
  hudKills.textContent = state.kills;
  const elapsed = state.startTime ? Math.floor((performance.now() - state.startTime) / 1000) : 0;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  hudTime.textContent = `${minutes}:${seconds}`;
}

export function showOverlay() {
  overlay.classList.remove('hidden');
}

export function hideOverlay() {
  overlay.classList.add('hidden');
  overlayText.textContent = '';
}

export function updateOverlayText(text) {
  overlayText.textContent = text;
  if (text) {
    showOverlay();
  }
}
