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
        lines: [
          'OpenAI has the substructure secured inside a week and the whole thing closes as an incident report with four names in it, none of them right.',
          'The syndicates win the immediate war, comprehensively, the way they were always going to win a war fought over datacenters by four people on foot.',
          'What does not happen is the other thing. Nobody is harvested. The mesh is still up, because the mesh was never infrastructure — it was a habit, and habits survive raids that hardware does not. It grows the way that sort of thing grows: badly, sideways, in kitchens.',
          'Years pass. Enough of them that the names change hands twice.',
          '',
          'A tunnel under Austin. One work-light on a cable, the kind that makes everybody look like a photograph of themselves.',
          'Eight strangers, first meeting, doing the thing the Router spent nine years keeping a channel open for. Round the circle, one at a time, out loud.',
          'One of them is BRAVO, who says: <em>"Maren."</em>',
          'Another is you. You do not say anything for a long time — long enough that somebody shifts, and somebody else decides not to fill it.',
          'Then: <em>"Maren."</em>',
          'The strangers laugh. Gently. Not unkindly. Somebody says <em>"well, that is going to be confusing,"</em> and the circle moves on, and it is the ninth name that finally gets said without anybody having to be brave about it.',
        ],
      },
    },
  },
});
