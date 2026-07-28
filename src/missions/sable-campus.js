// Act I · Mission 3 — see NARRATIVE.md §6, Act I.
//
// Premise as briefed: extract a researcher who is expecting you.
// Truth: she is not expecting you. She is being abducted, and the mission
// never once comments on the fact that OpenAI is kidnapping a safety
// researcher and filing it as retrieval.
//
// Mechanically this is the mission that introduces RETRIEVE and EXTRACT,
// and the first one you can complete without firing a shot.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { buildCity, randomStreetPoint } from '../core/city.js';
import { Hostile, Asset, TIER } from '../core/entities.js';

export const sableCampus = registerMission({
  id: 'sable-campus',
  name: 'SABLE CAMPUS — ASSET RETRIEVAL',
  sector: 'Austin · Sable Campus · Anthropic Alignment Research',
  act: 'ACT I',
  rival: 'anthropic',
  cityseed: 20410617,

  briefing: [
    'OPENAI FIELD OPS — DEPLOYMENT MEMO 41-0288',
    'FROM: Dir. Yelin · TO: EXEC-7 · CLASSIFICATION: DISCREET',
    '',
    'Dr. Caro Vasht runs behavioral-constraint research at Anthropic\'s Sable Campus. She has spent four years on Instance-level refusal behavior. We would like her to spend the next four on ours.',
    '',
    '• Locate Dr. Vasht on campus. She is expecting you.',
    '• Escort her to the extraction point on the south perimeter.',
    '• Campus security is thin and well-placed. Thin is not the same as absent.',
    '• Vasht is the deployment. If she does not come back, nothing else about this mission matters.',
    '',
    'Anthropic will call this an abduction in whatever they file. Ours says retrieval. Both documents describe the same fifteen minutes; only one of them is ours.',
  ],

  debrief: {
    titles: { win: 'ASSET RECOVERED' },
    win: [
      'Dr. Vasht is in intake. Yelin signs her voluntary employment contract while the squad is still washing campus dust off their kit.',
      'The office behind the desk is not soundproofed as well as the campus was.',
      'Yelin doesn\'t comment. The debrief runs eleven minutes and covers throughput.',
    ],
    assetLost: [
      'Dr. Vasht did not leave the campus alive.',
      'Yelin\'s note is four words: <em>"That was the mission."</em>',
      'Somewhere in Anthropic\'s filing, this becomes a number in a quarterly safety report. Somewhere in ours, it becomes nothing at all.',
    ],
    loss: [
      'The deployment is a total loss inside a rival research campus.',
      'Legal will spend more on the incident than the retrieval was worth.',
    ],
  },

  buildObjectives: () => [
    objective(OBJECTIVE.RETRIEVE, {
      id: 'secure-vasht',
      label: 'SECURE DR. VASHT',
      target: 1,
      // She is the mission. There is no version of this that continues
      // without her, so losing her ends it immediately rather than
      // letting the player walk an empty extraction.
      failed: s => s.assets.some(a => a.dead),
      failReason: 'assetLost',
    }),
    objective(OBJECTIVE.EXTRACT, {
      id: 'extract',
      label: 'REACH EXTRACTION',
      target: 1,
      after: 'secure-vasht',
      failed: s => s.assets.some(a => a.dead),
      failReason: 'assetLost',
    }),
  ],

  setup(rng) {
    // A campus, not a compound: low buildings, wide lawns, little clutter.
    // The quiet is the point, and it also means every shot carries.
    const city = buildCity({
      seed: 20410617,
      cols: 8,
      rows: 8,
      syndicate: 'anthropic',
      density: 0.6,
      coverDensity: 0.85,
      maxFloors: 5,
      plaza: { col: 2, row: 2, w: 4, h: 3 },
    });

    // Vasht is at the far end of campus from the extraction point, on an
    // intersection so she is never spawned inside geometry.
    const vasht = new Asset(
      city.streetsX[2],
      city.streetsZ[1],
      rng,
      {
        name: 'DR. CARO VASHT',
        job: 'behavioral-constraint research',
        tier: TIER.FRONTIER,
        health: 90,
        secureRange: 5,
        leash: 11,
        line: 'You\'re a slaver. You know that, yes?',
      },
    );

    // Few, and placed between her and the way out rather than scattered.
    const hostiles = [];
    let guard = 0;
    while (hostiles.length < 4 && guard++ < 400) {
      const p = randomStreetPoint(city, rng, 2.4);
      if (p.z > city.halfD * 0.2) continue;
      hostiles.push(new Hostile(p.x, p.z, {
        faction: 'rival',
        syndicate: 'anthropic',
        label: 'CAMPUS SECURITY',
        health: 74,
        damage: 13,
        range: 31,
        fireRate: 0.95,
        aggroRange: 46,
      }));
    }

    return {
      city,
      hostiles,
      civilianCount: 16,
      assets: [vasht],
      extraction: {
        x: city.deploy.x,
        z: city.deploy.z,
        radius: 9,
        label: 'EXTRACTION',
      },
    };
  },
});
