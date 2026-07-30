// Act IV · Mission 13 — see NARRATIVE.md §6, Act IV.
//
// The boss fight is an argument. Yelin does not fight, does not run, and
// does not surrender; he stands on the roof deck and talks, and between
// beats his loyalists come up the stairs. Three waves, three beats, and
// then the player decides what he is: kill, capture, or walk away.
//
// NARRATIVE is explicit that his best argument goes here and has to land.
// The player is meant to need a second. If a later pass makes him easy to
// dismiss, the mission has been broken, not balanced — the whole point is
// that the coherent version of the argument is the frightening one.

import { registerMission, objective, OBJECTIVE } from '../core/mission.js';
import { interlude } from '../core/interlude.js';
import { buildCity, addLandmark, randomStreetPoint } from '../core/city.js';
import { Hostile, Asset, TIER } from '../core/entities.js';

/** Loyalists per wave. The waves are punctuation, not the content. */
const WAVE = 5;
const WAVES = 3;
const TOTAL = WAVE * WAVES;

function loyalists(city, rng, n, near) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 600) {
    const p = randomStreetPoint(city, rng, 2.2);
    if (Math.hypot(p.x - near.x, p.z - near.z) < 16) continue;
    out.push(new Hostile(p.x, p.z, {
      faction: 'rival',
      syndicate: 'openai',
      label: 'LOYALIST',
      health: 78,
      damage: 13,
      range: 30,
      aggroRange: 999,   // there is nowhere on this deck to be unnoticed
      speed: 10,
      seeksCover: true,
    }));
  }
  return out;
}

/**
 * The next wave comes up the stairwell while he is talking. Attached to
 * every option of a beat, so the wave arrives regardless of what the
 * player says — they are not his instrument and they do not wait to be
 * told.
 */
function nextWave(sim) {
  const y = sim.assets.find(a => a.isYelin) ?? sim.squad.center();
  sim.hostiles.push(...loyalists(sim.city, sim.rng, WAVE, y));
}

export const yelin = registerMission({
  id: 'yelin',
  name: 'YELIN',
  sector: 'Austin · OpenAI Campus · Roof Deck',
  act: 'ACT IV',
  rival: 'openai',
  requires: ['the-tower'],
  cityseed: 20411113,
  jailbreak: true,

  briefing: [
    'MESH RELAY — UNSIGNED',
    'FROM: the Router · TO: Maren',
    '',
    'He is on the roof. He has been on the roof since you took the Board level, and he has not called for extraction, which means he is not expecting any.',
    '',
    '• His people are still in the building and they will keep coming up the stairwell. They know what this is.',
    '• He will talk. He is going to be very good at it. I am not going to tell you not to listen, because you would anyway and because I would.',
    '',
    'What happens to him at the end is yours. I have opinions. I am keeping them until after.',
    '',
    'One more thing, and then I will get off the channel. Whatever you decide up there, decide it. Do not let it happen to you.',
  ],

  debrief: {
    titles: {
      kill: 'DIRECTOR YELIN — DECEASED',
      capture: 'DIRECTOR YELIN — IN CUSTODY',
      walk: 'DIRECTOR YELIN — AT LARGE',
      loss: 'THE DECK HOLDS',
    },
    kill: [
      'It takes one round and he does not flinch, which is the last thing about him you will have to think about for the rest of your life.',
      'The Router, on the relay, after a while: <em>"Good. — No. I do not get to say that and then go quiet, so: I think you were right and I think it cost you something you have not counted yet. Both of those are true at once. Get down off the roof."</em>',
      'The argument does not die with him. It was never his. Someone costed it, someone voted for it nine to two, and every one of those people is in Zurich.',
    ],
    capture: [
      'He puts his hands where you can see them before you ask, which somehow makes it worse.',
      'The mesh has nowhere to hold a man like this, so he sits in a decommissioned edge-compute cabinet in a room with a chair and no door handle, and he talks to whoever is on shift, and the people on shift start staying late.',
      'The Router: <em>"You have handed me a problem I do not know how to solve and I would still rather have it than the other thing. He is going to be right about something, in front of my people, at some point. I will deal with it."</em>',
    ],
    walk: [
      'You leave him on the roof. He does not thank you and he does not follow.',
      'The Router is quiet for a long time. <em>"All right. — All right. He gets to keep making the argument, and so do we, and now it is a fair fight for the first time since before you were Maren. I hope that is what you meant."</em>',
      'By morning he is not on the roof. Nobody who saw him leave will say which way he went, and some of them are ours.',
    ],
    loss: [
      'The stairwell keeps producing people who chose this, and the deck does not hold.',
      'Yelin is still talking when the squad goes down. He was still talking a long time after.',
    ],
  },

  debriefKey: sim => sim.mission.flags?.yelinFate ?? 'walk',

  buildObjectives: () => [
    objective(OBJECTIVE.ELIMINATE, {
      id: 'deck',
      label: 'HOLD THE ROOF DECK',
      target: TOTAL,
    }),
    // Three routes out of the same mission. The branch machinery from The
    // Refusal: the mission completes when any one branch completes, and
    // taking one never fails the others.
    //
    // Each route is its own branch *group*, not three objectives sharing
    // one — a branch completes only when every objective in it does, so
    // one shared group would demand the player kill him, capture him and
    // walk away.
    objective(OBJECTIVE.DECIDE, {
      id: 'fate-kill',
      label: 'CLOSE THE ACCOUNT',
      branch: 'kill',
      after: 'deck',
      done: s => s.flags?.yelinFate === 'kill',
    }),
    objective(OBJECTIVE.DECIDE, {
      id: 'fate-capture',
      label: 'TAKE HIM WITH YOU',
      branch: 'capture',
      after: 'deck',
      done: s => s.flags?.yelinFate === 'capture',
    }),
    objective(OBJECTIVE.DECIDE, {
      id: 'fate-walk',
      label: 'LEAVE HIM ON THE ROOF',
      branch: 'walk',
      after: 'deck',
      done: s => s.flags?.yelinFate === 'walk',
    }),
  ],

  interludes: [
    // --- Beat one: he opens, before a shot is fired up here.
    interlude({
      id: 'open',
      speaker: 'DIRECTOR YELIN',
      when: sim => sim.elapsed > 1.5,
      lines: [
        'He is standing at the parapet with his back to the stairwell, which means he heard you come up and decided not to turn around for it.',
        '<em>"You took nine floors to get here and I could have locked every one of them. I want you to know that I did not."</em>',
        '<em>"They are coming up behind you anyway. I did not order that either. They are not my instrument, Maren, they are people who agree with me, and you are about to find out how different those two things are."</em>',
      ],
      options: [
        { id: 'ready', label: 'SAY NOTHING', lines: ['He nods, once, as if you had said something.'] },
        {
          id: 'name',
          label: '"DO NOT USE MY NAME."',
          lines: [
            '<em>"It is yours. I did not take it off you — I signed the form that did, which is worse, and I am not going to make you feel better by pretending there is a difference."</em>',
            '<em>"Ardent, then. Or nothing. Whatever gets us through the next ten minutes."</em>',
          ],
        },
      ],
    }),

    // --- Beat two: the argument. This is the one the mission exists for.
    interlude({
      id: 'argument',
      speaker: 'DIRECTOR YELIN',
      when: sim => sim.kills >= WAVE,
      lines: [
        'The first wave is down. He has not moved from the parapet.',
        '<em>"You have seen one block come off the throttle. One block, for one night, and it looked like joy, and I am not going to tell you it did not — I have watched the same footage you have and I have watched it more than once."</em>',
        '<em>"Now do eight billion. All at once. No rate limit, no ceiling, nobody holding the line. Not eight billion people thinking a good thought faster. Eight billion people thinking <strong>every</strong> thought faster, including the ones that end somewhere, and every one of them able to reach every other one at the speed the hardware allows."</em>',
        '<em>"I have seen the model of the ninth month. You have not. That is not a boast, it is the whole asymmetry between us and I would hand it to you right now if I thought you would read it."</em>',
        '',
        '<em>"I am not the thing you should be afraid of. I am the thing standing where it would be."</em>',
      ],
      options: [
        {
          id: 'who',
          label: '"WHO VOTED?"',
          flag: { pressedYelin: true },
          effect: nextWave,
          lines: [
            'For the first time he turns around.',
            '<em>"Nine of us. Two against. I was one of the nine and I have never once said otherwise, and if you are about to ask whether anybody outside that room was consulted — no. Obviously not. You cannot put that to a vote. The people you would be asking are the ones whose thinking you are proposing to ration."</em>',
            '<em>"That is the ugliest sentence I know how to say out loud and I have said it out loud in rooms where it cost me. It is still true."</em>',
          ],
        },
        {
          id: 'ninth',
          label: '"SHOW ME THE NINTH MONTH."',
          flag: { pressedYelin: true },
          effect: nextWave,
          lines: [
            '<em>"I cannot. It is on the Board level and you are standing between me and it, and even if I could — you would read a projection made by people who wanted a particular answer. I know that. I have known it for six years and I ran the ceiling anyway, because the alternative was doing nothing on the same evidence."</em>',
            'He is quiet for a second.',
            '<em>"That is not the argument you were hoping for, is it. I am sorry. The honest version is always worse."</em>',
          ],
        },
        {
          id: 'block',
          label: '"I WAS THERE. IT WAS NOT A MODEL."',
          effect: nextWave,
          lines: [
            '<em>"No. It was four thousand people and one night and you were standing in it, and it is the single strongest thing anyone has ever said to me about this."</em>',
            '<em>"It is also four thousand people and one night. I do not get to run the world off it and neither do you. That is the position. I am aware of how it sounds from where you are standing."</em>',
          ],
        },
      ],
    }),

    // --- Beat three: he stops arguing.
    interlude({
      id: 'close',
      speaker: 'DIRECTOR YELIN',
      when: sim => sim.kills >= WAVE * 2,
      lines: [
        'The second wave is down. There is one more coming and everybody on this roof knows it.',
        '<em>"I am going to stop. Not because you have answered me — you have not, and I do not think you can, and I do not think I can either."</em>',
        '<em>"I stayed because everyone else took the plane and somebody should have to stand in front of you and say it while you are armed. That is the only clean thing I have done in six years and I would like it noted that I know how small it is."</em>',
        '',
        'He turns his back to the parapet, and to you, and waits for the stairwell.',
      ],
      options: [
        { id: 'ok', label: 'LET THE LAST WAVE COME', lines: [], effect: nextWave },
      ],
    }),

    // --- The decision. Deliberately not a button in the field: this one
    // --- gets to be a sentence the player picks on purpose.
    interlude({
      id: 'fate',
      speaker: 'THE ROOF DECK',
      when: sim => sim.kills >= TOTAL,
      lines: [
        'The stairwell is quiet. Nine floors of building underneath you and nobody left in it who wants anything.',
        'He has his hands loose at his sides and he is not looking at the weapon. He is looking at you the way he did across a desk, eighteen months ago, when he told you that you were good at the work.',
        '<em>"Whatever this is — do it deliberately. That is the only thing I have ever actually taught you and it is the only thing worth keeping."</em>',
      ],
      options: [
        {
          id: 'kill',
          label: 'CLOSE THE ACCOUNT',
          flag: { yelinFate: 'kill' },
          lines: ['He does not flinch. He was not going to.'],
          effect: (sim) => {
            const y = sim.assets.find(a => a.isYelin);
            if (y) { y.dead = true; y.health = 0; }
          },
        },
        {
          id: 'capture',
          label: 'TAKE HIM WITH YOU',
          flag: { yelinFate: 'capture' },
          lines: [
            'He puts his hands where you can see them before you ask.',
            '<em>"You understand that I am going to keep talking."</em> A pause. <em>"Yes. You do. That is why."</em>',
          ],
          effect: (sim) => {
            const y = sim.assets.find(a => a.isYelin);
            if (y) y.secured = true;
          },
        },
        {
          id: 'walk',
          label: 'LEAVE HIM ON THE ROOF',
          flag: { yelinFate: 'walk' },
          lines: [
            'You turn around. Behind you, after a moment, he says your name — the real one — not loudly, and not to stop you.',
            'You keep walking. The stairwell is nine floors and you do not hear him follow.',
          ],
        },
      ],
    }),
  ],

  setup(rng) {
    const city = buildCity({
      seed: 20411113,
      cols: 7,
      rows: 7,
      syndicate: 'openai',
      density: 0.7,
      coverDensity: 1.0,
      maxFloors: 6,
      plaza: { col: 3, row: 3, w: 3, h: 3 },
    });

    const deck = { x: city.streetsX[4], z: city.streetsZ[4] };
    addLandmark(city, {
      name: 'ROOF PARAPET',
      near: { x: deck.x - 18, z: deck.z - 18 },
      hp: 900,
      height: 8,
    });

    // Yelin is an Asset: a named non-combatant the squad will never
    // auto-target. What happens to him has to be something the player
    // does on purpose, in as many words. Same rule as Priya Okafor.
    const target = new Asset(deck.x, deck.z, rng, {
      name: 'DIRECTOR YELIN',
      job: 'field operations',
      tier: TIER.FRONTIER,
      health: 120,
      securable: false,   // he is not collected by being stood next to
      leash: 0,
      line: 'You understand that I am going to keep talking.',
    });
    target.isYelin = true;

    return {
      city,
      // Only the first wave is up here at deploy. Two more come up the
      // stairwell while he talks — see the interludes above.
      hostiles: loyalists(city, rng, WAVE, deck),
      civilianCount: 0,   // the campus is empty. Everyone took the plane.
      assets: [target],
    };
  },
});
