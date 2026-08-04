// localStorage persistence. Lives in the UI layer because `src/core/` is
// not allowed to know the browser exists — which is also what keeps the
// campaign logic testable in Node.

import { newCampaign, migrate } from '../core/campaign.js';

const KEY = 'syndicate2026.campaign';
const MUTE_KEY = 'syndicate2026.muted';

export function loadCampaign() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newCampaign();
    return migrate(JSON.parse(raw));
  } catch {
    // Private browsing, a quota error, or somebody's hand-edited JSON.
    // A broken save should cost the player their progress, not the game.
    return newCampaign();
  }
}

export function saveCampaign(campaign) {
  try {
    localStorage.setItem(KEY, JSON.stringify(campaign));
    return true;
  } catch {
    return false;
  }
}

export function clearCampaign() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do — the next save will fail the same way */
  }
  return newCampaign();
}

/**
 * Whether the player has the sound off.
 *
 * Kept out of the campaign save on purpose: it is a property of the
 * machine somebody is sitting at, not of the run they are playing, and
 * wiping the record should not turn the audio back on.
 */
export function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}
