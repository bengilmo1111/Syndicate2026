import { OBJECTIVE_TYPES, OBJECTIVE_STATUS } from '../world.js';

export const sector7 = {
  id: 'sector-7',
  name: 'Sector 7 — Reclamation',
  briefing: [
    '<strong>// EXECUTIVE BRIEFING — 03:42 LOCAL</strong>',
    'EuroCorp’s monopoly is in pieces. Three syndicates contest the city-states; the CHIP that once enforced order now answers to whoever owns the uplink. You command the field arm of a rising house.',
    'Sector 7 is held by a rival cell. Deploy your squad. Eliminate the guards and persuade the locals — the more bodies on our side when the Hong Kong board convenes, the better.',
  ],
  buildObjectives() {
    return [
      {
        id: 'kill-guards',
        type: OBJECTIVE_TYPES.ELIMINATE,
        description: 'Eliminate rival guards',
        target: 5,
        progress: 0,
        status: OBJECTIVE_STATUS.PENDING,
      },
    ];
  },
};
