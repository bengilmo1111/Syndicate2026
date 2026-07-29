// localStorage persistence. Lives in the UI layer because `src/core/` is
// not allowed to know the browser exists — which is also what keeps the
// campaign logic testable in Node.

import { newCampaign, migrate } from '../core/campaign.js';

const KEY = 'syndicate2026.campaign';

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
