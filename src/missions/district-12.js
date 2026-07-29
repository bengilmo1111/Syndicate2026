// Act I · Mission 2 — see NARRATIVE.md §6, Act I.
//
// Premise as briefed: win a provisioning vote by aligning enough of the
// district ahead of the count. Truth: the Aligner does not change minds, it
// overwrites them. First mission where the only required objective is
// alignment. No rivals at start — combat is something the player chooses.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity } from '../core/city.js';

export const district12 = registerMission({
  id: 'district-12',
  name: 'DISTRICT 12 — PROVISIONING VOTE',
  sector: 'Austin · District 12 · Residential Metering',
  act: 'ACT I',
  rival: 'google',
  requires: ['sector-7'],
  cityseed: 20410512,

  briefing: [
    'OPENAI FIELD OPS — DEPLOYMENT MEMO 41-0203',
    'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: ROUTINE',
    '',
    'District 12 votes Thursday on provisioning its substation capacity. Google has held the district since the Blackout on a sentiment margin of four points.',
    '',
    '• Field the Aligner. Eighteen conversions closes the margin.',
    '• No engagement required. Nothing in D-12 is armed.',
    '• Do not generate heat. An enforcement response inside a voting window is a compliance finding, and compliance findings are mine to answer for.',
    '',
    'We are in the influence business, EXEC-7. The vote will be decided before the votes are cast. That is not cynicism — it is scheduling.',
  ],

  debrief: {
    win: [
      'The margin closes overnight. District 12 provisions to OpenAI by six points.',
      'Yelin sends a chart. It is a good chart — clean, blue, honest about its axes.',
      'The squad logs eighteen compliance reports. Each one has a name on it.',
    ],
    loss: [
      'Deployment lost inside a residential district during a voting window.',
      'Yelin does not send a note.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.ALIGN, { label: 'ALIGN RESIDENTS', target: 18 }),
  ],

  setup() {
    const city = buildCity({
      seed: 20410512,
      cols: 8,
      rows: 8,
      syndicate: 'google',
      density: 0.74,
      maxFloors: 6,
      plaza: { col: 3, row: 2, w: 2, h: 4 },
    });
    return { city, hostiles: [], civilianCount: 34 };
  },
});
