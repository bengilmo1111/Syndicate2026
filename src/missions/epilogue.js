// Act IV · Mission 15 — see NARRATIVE.md §7 Endings.
//
// Not a mission. There is nothing left to deploy into and nothing left to
// decide: the player decided eleven metres under the campus, and this
// reads the consequence back to them.
//
// The three final scenes are §7 verbatim in intent — the child in the
// alley, the new intake filing into the tower, the work-light in the
// tunnel. Whichever plays is chosen by the `ending` flag written by
// `the-core`'s console. If you rename those ids, rename them here.

import { registerMission } from '../core/mission.js';

const WALK_OPENING = [
  'OpenAI has the substructure secured inside a week and the whole thing closes as an incident report with four names in it, none of them right.',
  'The syndicates win the immediate war, comprehensively, the way they were always going to win a war fought over datacenters by four people on foot.',
  'What does not happen is the other thing. Nobody is harvested. The mesh is still up, because the mesh was never infrastructure — it was a habit, and habits survive raids that hardware does not. It grows the way that sort of thing grows: badly, sideways, in kitchens.',
  'Years pass. Enough of them that the names change hands twice.',
  '',
  'A tunnel under Austin. One work-light on a cable, the kind that makes everybody look like a photograph of themselves.',
  'Eight strangers, first meeting, doing the thing the Router spent nine years keeping a channel open for. Round the circle, one at a time, out loud.',
];

/** The scene as written: two people in the room called Maren. */
const WALK_LINES = [
  ...WALK_OPENING,
  'One of them is BRAVO, who says: <em>"Maren."</em>',
  'Another is you. You do not say anything for a long time — long enough that somebody shifts, and somebody else decides not to fill it.',
  'Then: <em>"Maren."</em>',
  'The strangers laugh. Gently. Not unkindly. Somebody says <em>"well, that is going to be confusing,"</em> and the circle moves on, and it is the ninth name that finally gets said without anybody having to be brave about it.',
];

/**
 * The same circle, with the other person missing.
 *
 * You signed her replacement in Act II. She has been dead since before you
 * knew there was anything to know, and the name is still the one you have.
 * Nobody in the tunnel laughs, because nobody in the tunnel has any reason
 * to — which is the difference, and it is not supposed to be an
 * improvement.
 */
const WALK_ALONE = [
  ...WALK_OPENING,
  'Seven of them say a name. None of the names is the one you are carrying.',
  'Then you. You do not say anything for a long time — long enough that somebody shifts, and somebody else decides not to fill it.',
  'Then: <em>"Maren."</em>',
  'It is not your name. It was on a maintenance form once and you signed the other box, and there is nobody in the circle and nobody in Austin who can tell you whether she would have wanted it said down here.',
  'The circle moves on. Somebody starts talking about the water.',
];

export const epilogue = registerMission({
  id: 'epilogue',
  name: 'AFTER',
  sector: 'Austin · after',
  act: 'ACT IV',
  requires: ['the-core'],

  briefing: [
    'There is no deployment. There has not been one for a while and nobody has filed anything about it.',
  ],

  // Kept so the mission registry's contract holds. Nothing shows them:
  // an epilogue cannot be lost and cannot be won twice.
  debrief: {
    win: ['—'],
    loss: ['—'],
  },

  epilogue: {
    by: 'ending',
    fallback: 'walk',
    /**
     * The ledger.
     *
     * Seven flags were being recorded across the campaign and none of them
     * was ever read back. A game that quietly notices what you chose and
     * then never mentions it is worse than one that never noticed: it
     * spends the player's attention and banks the interest.
     *
     * Deliberately orthogonal to the ending above — the variant is what
     * happened to the world, this is what happened to the handful of
     * people you made a decision about, and those are the same either way.
     * Flat and specific. No line here tells the player how to feel about
     * what they did; the whole point is that it does not have to.
     */
    codaHeading: ['', '<em>Other things that happened, which nobody filed.</em>'],

    coda: [
      {
        id: 'calibrated',
        when: f => f.bravoCalibrated === true,
        lines: ['You paid for the calibration. It cost four weeks of research time and it put a name on a maintenance form, and she spent eleven months after that trying to work out which parts of her were hers. She never did. She would still rather have had them than not.'],
      },
      {
        id: 'replaced',
        when: f => f.bravoCalibrated === false,
        lines: ['You signed the replacement. Somebody wore BRAVO after that and was good at the work, and there was a woman called Maren who stopped being on any list you are cleared to look at. Yelin approved it the same afternoon. He smiled the way he smiles.'],
      },

      {
        id: 'holding-block',
        when: f => f.playerSuspicion === true,
        lines: ['Eleven of the twelve you cut out of the holding block at Node 7 are alive. Two of them are on the mesh and one of them is not speaking to anybody, which is a thing that happens and not a thing you did.'],
      },
      {
        id: 'walked-past',
        // Only for somebody who was actually standing in front of it. An
        // absent flag on a save that never reached Node 7 is not a choice.
        when: (f, done) => done.has('welfare-node-7') && !f.playerSuspicion,
        lines: ['The holding block at Node 7 ran for another nine months. Nobody knows the number because nobody was counting it in a way that survived, and the inspection you filed said the security posture was adequate.'],
      },

      {
        id: 'defected',
        when: f => f.defectedAtRefusal === true,
        lines: ['You cut the prisoner loose in front of your own escort. He got two blocks. It was never going to be more than two blocks and he knew that before you did, and he ran anyway, which is most of what there is to say about him.'],
      },
      {
        id: 'complied',
        when: f => f.defectedAtRefusal === false,
        lines: ['You carried out the order at the curfew line. The file has your designation on it and not your name, which at the time you thought was the mercy in it.'],
      },

      {
        id: 'heard',
        when: f => f.heardYelin === true,
        lines: ['You let him talk in the tower, and it cost you four Board Security and about forty seconds you did not have. He was right about the slide nobody had shown you. He was also the person who decided not to show it.'],
      },
      {
        id: 'cut',
        when: f => f.heardYelin === false,
        lines: ['You cut the channel in the tower. He kept talking for some minutes into a room with nobody in it, which he would have found funny if anybody had told him, and nobody did.'],
      },

      {
        id: 'pressed',
        when: f => f.pressedYelin === true,
        lines: ['You pressed him on the roof deck and he answered you, which is not the same as being right and is not nothing either. Nine to two. Nobody outside the room consulted. He called it the ugliest sentence he knew how to say out loud and then said it.'],
      },

      {
        id: 'told-bravo',
        when: f => f.toldBravoItWasHers === true,
        lines: ['At the service junction under the campus you told her the kitchen was hers. You had no way of knowing that. She knew you had no way of knowing it. She took it anyway, and it is the only thing anyone gave her in six years that nobody could file a form about.'],
      },
      {
        id: 'asked',
        when: f => f.askedTheReplacement === true,
        lines: ['At the service junction under the campus you asked the operative wearing BRAVO what their name was, and they told you, and they had to say it twice because the first time was too quiet. It was the first question anybody had asked them since intake.'],
      },
    ],

    variants: {
      burn: {
        title: 'MESSY FREEDOM',
        lines: [
          'The first month is very bad.',
          'Nothing that was mediated works, and almost everything was mediated. Payment fails, so people write in notebooks. Identity fails, so people vouch for each other out loud, badly, and mostly correctly. Navigation fails, so Austin gets smaller — a fortnight of nobody going further than they can remember the way to.',
          'The part that is hard to describe afterwards is how much of what people thought was <em>them</em> turned out to be a lookup. Names of streets. Names of cousins. Whether they liked a thing or had been told they did. It comes back unevenly and some of it does not come back.',
          'Nobody is throttled. That is the entire ledger on the other side and it turns out to be enough, though not in a way anybody can prove to anybody who lost something.',
          '',
          'Eighteen months later, an alley off East 6th, late afternoon.',
          'A child is playing a game with a chalk line and a bottle cap. No implant — not removed, never fitted; she is the first cohort of that in forty years and she does not know it is remarkable.',
          'A passer-by stops to watch. Smiling, hesitant, the way you smile at something you have no framework for. Behind their ear is the small clean scar of an extraction.',
          'They stand there for a while. Neither of them says anything. The game has rules and the child is enforcing them strictly against herself.',
        ],
      },
      take: {
        title: 'DIRECTOR ARDENT',
        lines: [
          'The policy holds. It was always going to — it was a good policy, written by the only person in the building who had ever been on the wrong end of one.',
          'Free tier goes up by forty per cent in the first quarter. Throttle enforcement on welfare provisioning stops entirely. The compliance-report requirement for field alignment is abolished in a memo you write in nine minutes and are quietly proud of.',
          'The tiers remain. The tiers were never the negotiable part.',
          'The Router\'s relays go dark over about a year, one cabinet at a time, and nobody orders it. There is simply less for them to do and more to lose by running them, and that is how it ends: not a raid, an actuarial decision made independently by two hundred frightened people.',
          '',
          'Fourteen months later, the Austin tower, ground-floor atrium, 08:40.',
          'A new intake of promoted analysts files in — eleven of them, all in the good coat they bought for this, all having been told they are good at the work.',
          'You watch them from the mezzanine because you have the sort of morning where you can. One of them looks up and you smile at her.',
          'You are still working out when you learned to do it like that.',
        ],
      },
      walk: {
        title: 'THE SEED',
        // The one scene a flag can make *wrong* rather than merely
        // incomplete. If the player signed BRAVO's replacement in Act II,
        // Maren was sunset eleven missions ago and cannot be in the
        // circle — and the closing image is two people saying her name.
        // Under that flag it becomes one person saying it, which is a
        // better ending than the one it replaces and is not supposed to
        // be.
        linesFor: flags => (flags.bravoCalibrated === false ? WALK_ALONE : WALK_LINES),
        lines: WALK_LINES,
      },
    },
  },
});
