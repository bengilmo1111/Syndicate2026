// Act II · Mission 6 — see NARRATIVE.md §6, Act II.
//
// There is no combat. The entire mission is a conversation in a briefing
// room and one choice, and the choice is whether BRAVO is a person.
//
// Yelin never says the word "kill". He says "replace", and he says it the
// way you would say it about a part. Whatever the player chooses, he
// smiles the same way.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';

export const calibrationWindow = registerMission({
  id: 'calibration-window',
  name: 'CALIBRATION WINDOW',
  sector: 'Austin · OpenAI Campus · Deployment Maintenance',
  act: 'ACT II',
  rival: 'none',
  requires: ['okafor-contract'],

  /**
   * A briefing-room mission: no city, no squad on the ground, one
   * decision. `choice` is what tells the shell to render a decision
   * instead of a DEPLOY button.
   */
  choice: {
    prompt: [
      'OPENAI FIELD OPS — MAINTENANCE NOTICE 41-0417',
      'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: INTERNAL',
      '',
      'Routine maintenance on the deployment. Three units are nominal. BRAVO is not.',
      '',
      'Instance drift, eleven percent and climbing. Calibration will hold it for a while — a fortnight of shop time, and the unit comes back slower than it went in. We would carry the cost.',
      '',
      'The alternative is that we replace the unit. There is a fresh designation in the pipeline and it can be field-ready by Thursday. Faster, cheaper, and the drift does not recur.',
      '',
      'I am not going to make this decision for you, EXEC-7. It is your deployment. I would only note that you have been running four units for eighteen months and you have never once asked me what happens to the ones we replace.',
    ],
    options: [
      {
        id: 'calibrate',
        label: 'CALIBRATE THE UNIT',
        flag: { bravoCalibrated: true },
        outcome: [
          'The maintenance form comes back for countersignature. Most of it is part numbers.',
          'Halfway down, under PRE-CONSCRIPTION IDENTIFIER, there is a name. <strong>Maren.</strong>',
          'It is the same name EXEC-7 has never been told is theirs. The form does not explain it, and there is no field on it for asking.',
          'Yelin signs off on the fortnight without comment. He smiles on the way out.',
        ],
      },
      {
        id: 'replace',
        label: 'REPLACE THE UNIT',
        flag: { bravoCalibrated: false },
        outcome: [
          'The requisition clears in under a minute. Thursday is confirmed.',
          'Nobody says where BRAVO goes, and the form has no field for it either. The paperwork simply stops referring to a unit and starts referring to a designation.',
          'The new one will answer to BRAVO. That is what the designation is for.',
          'Yelin signs off on the replacement without comment. He smiles on the way out.',
        ],
      },
    ],
  },

  briefing: [
    'OPENAI FIELD OPS — MAINTENANCE NOTICE 41-0417',
    '',
    'Report to deployment maintenance. No field component.',
  ],

  debrief: {
    titles: { win: 'MAINTENANCE CLOSED' },
    win: ['The window closes.'],
    loss: ['The window closes.'],
  },

  // Nothing to shoot; the decision closes it.
  buildObjectives: () => [
    objective(OBJECTIVE.DECIDE, { id: 'decision', label: 'CLOSE THE MAINTENANCE WINDOW', target: 1 }),
  ],

  setup() {
    return { city: null, hostiles: [], civilianCount: 0 };
  },
});
