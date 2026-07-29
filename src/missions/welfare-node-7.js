// Act II · Mission 7 — see NARRATIVE.md §6, Act II. Closes the act.
//
// Premise as briefed: inspect security at an OpenAI welfare datacenter.
// Truth: it is a forced-upgrade facility. The people inside are being
// prepared for involuntary Instance install at Frontier tier — the same
// conscription pipeline that produced ALPHA through DELTA, and EXEC-7.
//
// The "infiltrators" the briefing sends you to kill are the only people
// trying to stop it.
//
// The hidden objective is the mission. Nothing tells the player it is
// there; the detainees are simply present, and the Aligner reaches them.
// Freeing them sets `playerSuspicion` and is what earns the defection
// branch in Act III.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, addLandmark, randomStreetPoint } from '../core/city.js';
import { Hostile, Civilian, TIER } from '../core/entities.js';

const DETAINEES = 12;

export const welfareNode7 = registerMission({
  id: 'welfare-node-7',
  name: 'WELFARE NODE 7 — SECURITY INSPECTION',
  sector: 'Austin · Node 7 · OpenAI Welfare Provisioning',
  act: 'ACT II',
  rival: 'openai',
  requires: ['calibration-window'],
  cityseed: 20411104,
  bravoHesitation: 0.4,

  briefing: [
    'OPENAI FIELD OPS — DEPLOYMENT MEMO 41-0455',
    'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: INTERNAL',
    '',
    'Node 7 processes unquantized intake for the welfare provisioning programme. Perimeter security has been penetrated four times this quarter.',
    '',
    '• Clear the infiltrators. Four on last count.',
    '• Do not interfere with provisioning. The install rig runs on a schedule and the schedule is not ours to hold.',
    '• Intake are not civilians for reporting purposes. They are pre-provisioning.',
    '',
    'This one is housekeeping, and it is ours rather than a rival\'s, so I would rather it were quiet. You have never asked me where the pipeline gets its designations, EXEC-7. I have always taken that as professionalism.',
  ],

  // Freeing the holding block earns a different debrief. Nothing told the
  // player to do it, which is the point.
  debriefKey: sim => (sim.mission.flags.playerSuspicion ? 'freed' : 'win'),

  debrief: {
    titles: { win: 'NODE SECURED', freed: 'NODE SECURED' },
    win: [
      'Node 7 is secure. The install rig resumes on schedule.',
      'Yelin\'s note thanks EXEC-7 for keeping it quiet, and confirms the quarter\'s intake figures are unaffected.',
      'Nobody in the holding block was a civilian for reporting purposes.',
    ],
    freed: [
      'Node 7 is secure. The install rig is not.',
      'Twelve intake walked out of the holding block with their own Instances still their own. The quarter\'s figures will not reconcile and somebody will be asked why.',
      'Yelin\'s debrief runs ninety seconds and covers nothing. It ends: <em>"We\'ll discuss this on your next visit."</em>',
      'He does not smile on the way out.',
    ],
    loss: [
      'The deployment was lost inside an OpenAI facility, to four people with no syndicate behind them.',
      'The incident is filed against the perimeter contractor.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.ELIMINATE, { id: 'clear', label: 'CLEAR INFILTRATORS', target: 4 }),
    // Hidden, optional, and the only reason the mission exists. Nothing
    // announces it — the detainees are simply there, and the Aligner
    // reaches them like it reaches anyone.
    objective(OBJECTIVE.ALIGN, {
      id: 'free',
      label: 'FREE THE HOLDING BLOCK',
      target: DETAINEES,
      optional: true,
      hidden: true,
      flag: { playerSuspicion: true },
    }),
  ],

  setup(rng) {
    const city = buildCity({
      seed: 20411104,
      cols: 7,
      rows: 7,
      syndicate: 'openai',
      density: 0.7,
      coverDensity: 0.9,
      maxFloors: 5,
      plaza: { col: 2, row: 4, w: 3, h: 2 },
    });

    const rig = addLandmark(city, {
      name: 'INSTALL RIG',
      near: { x: 0, z: -city.halfD * 0.35 },
      hp: 420,
      height: 16,
    });

    // The holding block: detainees penned beside the rig, not wandering.
    // They are Free-tier because that is what the programme is for.
    const detainees = [];
    for (let i = 0; i < DETAINEES; i++) {
      const ring = 7 + (i % 3) * 2.4;
      const a = (i / DETAINEES) * Math.PI * 2;
      const c = new Civilian(rig.x + Math.cos(a) * ring, rig.z + Math.sin(a) * ring, rng);
      c.tier = TIER.FREE;
      c.detained = true;
      c.wanderSpeed = 0;   // they are not going anywhere on their own
      detainees.push(c);
    }

    const hostiles = [];
    let guard = 0;
    while (hostiles.length < 4 && guard++ < 400) {
      const p = randomStreetPoint(city, rng, 2.4);
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'openai',
        label: 'INFILTRATOR',
        health: 52,
        damage: 10,
        range: 24,
      }));
    }

    return { city, hostiles, civilianCount: 8, extras: detainees };
  },
});
