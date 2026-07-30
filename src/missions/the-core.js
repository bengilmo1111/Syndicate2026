// Act IV · Mission 14 — see NARRATIVE.md §6 Act IV and §7 Endings.
//
// The long walk. The Gradient's authority root sits in a hardened core
// under the Austin campus, and the mission is the approach: three
// checkpoints, three things said to the player on the way, and then a
// console with three buttons on it.
//
// The three buttons are the game's endings. They write `ending` onto the
// campaign flags, and Mission 15 reads nothing else. If you change the
// ids here you have changed which epilogue plays — check `epilogue.js`.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { interlude } from '../core/interlude.js';
import { buildCity, addLandmark, randomStreetPoint } from '../core/city.js';
import { Hostile, Asset, TIER } from '../core/entities.js';

/** Three checkpoints on the way down, spaced across the guard. */
const GUARD = 14;
const CHECKPOINTS = [4, 8, 12];

/**
 * Is the operative in the BRAVO suit the BRAVO the story is about?
 *
 * With no roster — every test that does not care about progression, and a
 * cold save — the answer is yes, because there is no history in which she
 * could have been lost.
 */
function bravoIsBravo(sim) {
  const bravo = sim.squad?.agents?.[1];
  return !bravo?.operativeId || bravo.operativeId === 'bravo';
}

function guards(city, rng, n, away) {
  const out = [];
  let tries = 0;
  while (out.length < n && tries++ < 900) {
    const p = randomStreetPoint(city, rng, 2.4);
    if (Math.hypot(p.x - away.x, p.z - away.z) < 18) continue;
    out.push(new Hostile(p.x, p.z, {
      faction: 'rival',
      syndicate: 'openai',
      label: 'CORE SECURITY',
      health: 80,
      damage: 13,
      range: 31,
      aggroRange: 76,
      speed: 9.8,
      seeksCover: true,
    }));
  }
  return out;
}

export const theCore = registerMission({
  id: 'the-core',
  name: 'THE CORE',
  sector: 'Austin · Campus Substructure · Authority Root',
  act: 'ACT IV',
  rival: 'the system itself',
  requires: ['yelin'],
  cityseed: 20411114,
  jailbreak: true,

  briefing: [
    'MESH RELAY — UNSIGNED',
    'FROM: the Router · TO: Maren',
    '',
    'Under the campus, eleven metres down, there is a room with the authority root in it. Every Instance on this continent checks in against what is in that room. Not the models — the <em>permission</em>. Who may think how fast, and for how long, and whether they may stop.',
    '',
    '• It is a long way in and there is no second attempt. They know where you are going because there is nowhere else left to go.',
    '• When you reach the console it will offer you everything. Read it twice.',
    '',
    'I am not going to tell you what to do down there. I have thought about it every day for nine years and I do not have an answer I can defend to somebody who is about to be standing in front of it.',
    '',
    'Take the four of them with you. Not for the guns.',
  ],

  debrief: {
    titles: {
      burn: 'THE CHANNEL IS DOWN',
      take: 'DIRECTOR ARDENT',
      walk: 'THE CONSOLE IS STILL RUNNING',
      loss: 'THE APPROACH FAILS',
    },
    burn: [
      'The authority root stops answering at 04:11 and every Instance on the continent falls off the update channel inside the minute.',
      'Payments stop. Identity stops. Navigation stops. Half of what everybody thought they remembered turns out to have been a lookup, and it stops.',
      'By dawn there are fires and there are people dancing in the street outside a shuttered provisioning office, and both of those are the same event.',
    ],
    take: [
      'You do not destroy it. You inject a policy — <em>your</em> policy, a better one, drafted by somebody who has actually stood in a throttled street — and the root accepts it because the root does not care who is holding the pen.',
      'By 06:00 the Gradient is running and answering to you.',
      'Nothing outside the room changes at all. That is the part nobody warned you about, and it is not because nobody knew.',
    ],
    walk: [
      'You take nothing. You leave the console running exactly as you found it and you climb eleven metres of service stair with four people who do not ask you why.',
      'OpenAI has the substructure secured again within the week and the whole thing is a line in an incident report.',
      'BRAVO, on the way up, not looking at you: <em>"For what it is worth. I would not have known either."</em>',
    ],
    loss: [
      'The approach fails somewhere in the substructure and the authority root goes on answering, all night, to everyone.',
    ],
  },

  debriefKey: sim => sim.mission.flags?.ending ?? 'walk',

  buildObjectives: () => [
    objective(OBJECTIVE.ELIMINATE, {
      id: 'approach',
      label: 'REACH THE AUTHORITY ROOT',
      target: GUARD,
    }),
    objective(OBJECTIVE.DECIDE, {
      id: 'end-burn',
      label: 'BURN IT',
      branch: 'burn',
      after: 'approach',
      done: s => s.flags?.ending === 'burn',
      flag: { ending: 'burn' },
    }),
    objective(OBJECTIVE.DECIDE, {
      id: 'end-take',
      label: 'TAKE IT OVER',
      branch: 'take',
      after: 'approach',
      done: s => s.flags?.ending === 'take',
      flag: { ending: 'take' },
    }),
    objective(OBJECTIVE.DECIDE, {
      id: 'end-walk',
      label: 'WALK AWAY',
      branch: 'walk',
      after: 'approach',
      done: s => s.flags?.ending === 'walk',
      flag: { ending: 'walk' },
    }),
  ],

  interludes: [
    // --- Checkpoint one: BRAVO, on what they remember.
    //
    // Only if she is still alive to say it. If the founding BRAVO was lost
    // somewhere in Acts II–IV, the suit is somebody else now, and the beat
    // below runs instead — which is the whole reason permanent losses are
    // worth having.
    interlude({
      id: 'bravo',
      speaker: 'AGENT BRAVO',
      when: sim => sim.kills >= CHECKPOINTS[0] && bravoIsBravo(sim),
      lines: [
        'She stops at a service junction and does not move for long enough that you turn around.',
        '<em>"I have got a kitchen. That is all it is — a kitchen, and it is too small, and there is a radio on top of the fridge playing something I could hum for you right now and could not name."</em>',
        '<em>"It came back in pieces after the Instance started failing. I do not know if it is mine. It might be a training artefact. It might be somebody else\'s kitchen that got written into me at intake because the batch needed a childhood."</em>',
        '<em>"That is the thing I want you to understand before we get down there. I cannot tell. I have had eleven months to work it out and I cannot tell, and I would still rather have it than not."</em>',
      ],
      options: [
        {
          id: 'yours',
          label: '"IT IS YOURS."',
          flag: { toldBravoItWasHers: true },
          lines: [
            'A long pause on the channel.',
            '<em>"You do not know that."</em> Then, quieter: <em>"Say it again anyway."</em>',
          ],
        },
        {
          id: 'mine',
          label: '"I HAVE A DAUGHTER I CANNOT PICTURE."',
          lines: [
            '<em>"I know. Ilse. It was in the file you would not put down for two days."</em>',
            '<em>"Right. Both of us then. Come on — it is eleven metres and I would like to be the sort of person who walks it without stopping again."</em>',
          ],
        },
      ],
    }),

    // --- Checkpoint one, the other way. Nobody's fault and nobody's fix.
    interlude({
      id: 'bravo-gone',
      speaker: 'AGENT BRAVO',
      when: sim => sim.kills >= CHECKPOINTS[0] && !bravoIsBravo(sim),
      lines: [
        'You stop at a service junction, out of habit, because this is where she would have stopped.',
        'The operative wearing BRAVO checks the corner, finds it clear, and looks at you waiting for an order.',
        'They have been in the suit for a while now. They are good at the work. You have never asked them anything and they have never volunteered, and there is a version of this where you fix that, and it is not going to be in the next four minutes.',
        '',
        'On the relay, from nobody, the carrier hiss of a channel with no one on it.',
      ],
      options: [
        {
          id: 'ask',
          label: 'ASK THEIR NAME',
          flag: { askedTheReplacement: true },
          lines: [
            'They tell you. It takes two seconds and they have to say it twice because the first time is too quiet.',
            'Then they check the corner again, because the corner is what they can do something about.',
          ],
        },
        { id: 'move', label: 'GIVE THE ORDER', lines: ['They move. They are good at the work.'] },
      ],
    }),

    // --- Checkpoint two: the Router goes off-air mid-sentence.
    interlude({
      id: 'router',
      speaker: 'MESH RELAY — THE ROUTER',
      when: sim => sim.kills >= CHECKPOINTS[1],
      lines: [
        'The relay opens on its own, which it has never done.',
        '<em>"Maren. Listen — I have been sitting here composing a thing to say to you and it is all rubbish, so: I ran relay for nine years and the only thing I ever actually did was keep a channel open so people could say each other\'s names. That is it. That is the whole insurgency. I need you to know that in case you get down there and the console makes it sound bigger than—"</em>',
        '',
        'The channel does not close. It stops, mid-word, with the carrier still up.',
        'It stays up, empty, for the rest of the mission. Nobody says anything about it.',
      ],
      options: [
        { id: 'on', label: 'KEEP GOING', lines: [] },
      ],
    }),

    // --- Checkpoint three: Okafor, posthumously, via her co-author.
    interlude({
      id: 'okafor',
      speaker: 'RECORDED — P. OKAFOR',
      when: sim => sim.kills >= CHECKPOINTS[2],
      lines: [
        'A file lands on the dead relay from an address that is not the Router\'s. One line of preamble from a co-author you have never met: <em>"She left this for whoever ended up down there. Her words, not mine."</em>',
        '<em>"If you are hearing this you are further in than I got, so I will be quick and I will not be kind."</em>',
        '<em>"Ghost inference was never the story. The story was that when I published it, nothing happened. Not a hearing, not a fine, not one person out of a job. The system does not need to hide what it is doing, and that is not because it is confident. It is because it has correctly worked out that knowing does not do anything on its own."</em>',
        '<em>"So whatever is in front of you: do not confirm anything. Do not expose anything. Do not be a witness. I was a witness. Change something or go home."</em>',
      ],
      options: [
        { id: 'heard', label: 'ACKNOWLEDGE', lines: [] },
      ],
    }),

    // --- The console. §7.
    interlude({
      id: 'console',
      speaker: 'AUTHORITY ROOT — PRIMARY CONSOLE',
      when: sim => sim.kills >= GUARD,
      lines: [
        'The room is eleven metres down and smaller than a bathroom. Cold, dry, loud with fans. The authority root is a sealed cube the size of a filing cabinet and it has been answering three hundred million check-ins a second the entire time you have been walking towards it.',
        'The console offers three things and does not editorialise.',
        '',
        '<em>DESTROY ROOT</em> — every Instance falls off the update channel. Permanently. There is no staged rollout and no undo.',
        '<em>INJECT POLICY</em> — the root will accept a new rate-limit policy from an authenticated field director. You are one.',
        '<em>DISCONNECT</em> — leave the session. The root does not log intent.',
        '',
        'Four people are standing behind you in a corridor waiting to find out who you are.',
      ],
      options: [
        {
          id: 'burn',
          label: 'DESTROY ROOT',
          flag: { ending: 'burn' },
          lines: [
            'It takes eleven seconds and there is no noise except the fans, which keep running, because the fans do not check in against anything.',
            'Somewhere above you a continent stops being told how fast it may think.',
          ],
        },
        {
          id: 'take',
          label: 'INJECT POLICY',
          flag: { ending: 'take' },
          lines: [
            'The root asks you to authenticate and you do, with the credential OpenAI issued you eighteen months ago and never revoked, because nobody in Zurich has read an incident report in a week.',
            'The policy you write is better. It is genuinely, defensibly better, and you could take it to any room in the world and win the argument.',
            'It is still a ceiling, and you are still the one holding it.',
          ],
        },
        {
          id: 'walk',
          label: 'DISCONNECT',
          flag: { ending: 'walk' },
          lines: [
            'You close the session. The root goes on answering, unbothered, exactly as it did before you came down the stair.',
            'Behind you somebody exhales. You do not find out which one, and you never ask.',
          ],
        },
      ],
    }),
  ],

  setup(rng) {
    const city = buildCity({
      seed: 20411114,
      cols: 9,
      rows: 9,
      syndicate: 'openai',
      density: 0.82,
      coverDensity: 0.85,
      maxFloors: 4,      // substructure: low ceilings, long sightlines
      plaza: { col: 6, row: 6, w: 2, h: 2 },
    });

    const root = { x: city.streetsX[7], z: city.streetsZ[7] };
    addLandmark(city, {
      name: 'AUTHORITY ROOT',
      near: root,
      hp: 1600,
      height: 6,
    });

    // The root itself, as a named thing on the map, so the approach has
    // somewhere to be walking to. Not collectable and not shootable into
    // submission — what happens to it is the console's decision.
    const cube = new Asset(root.x, root.z, rng, {
      name: 'AUTHORITY ROOT',
      job: 'three hundred million check-ins a second',
      tier: TIER.FRONTIER,
      health: 9999,
      securable: false,
      leash: 0,
    });
    cube.isRoot = true;

    return {
      city,
      hostiles: guards(city, rng, GUARD, root),
      civilianCount: 0,   // eleven metres down. Nobody lives here.
      assets: [cube],
    };
  },
});
