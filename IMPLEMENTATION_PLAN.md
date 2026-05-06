# 2026 Bulldog Remake Implementation Plan

## TL;DR
Build the game in four phases: setup, prototype gameplay, cyberpunk polish, and syndicate systems. Start with a minimal working browser prototype before expanding features.

## Phase 1: Setup
1. Create project skeleton:
   - `index.html`
   - `styles.css`
   - `game.js`
   - `entities.js`
   - `ui.js`
   - `assets/`
2. Choose rendering approach:
   - Option A: vanilla HTML5 canvas
   - Option B: lightweight game framework
3. Build the browser shell:
   - game canvas
   - HUD overlay
   - main menu screen

## Phase 2: Prototype gameplay
4. Implement the game loop in `game.js`
5. Add the player agent in `entities.js`
6. Support keyboard movement and mouse shooting
7. Add enemy AI with simple navigation
8. Implement projectiles, health, and damage
9. Create a mission level with objective flow

## Phase 3: Cyberpunk polish
10. Add city tile visuals and environment detail
11. Style HUD and menus with neon/cyberpunk UI
12. Add particle effects for shooting and impacts
13. Improve camera and viewport behavior

## Phase 4: Syndicate systems
14. Add a shop/upgrade screen in `ui.js`
15. Add support for multiple agents
16. Add mission selection and retry flow
17. Add basic session state or persistence

## Files to modify
- `index.html` — browser entry, canvas, menus
- `styles.css` — cyberpunk HUD and menu styling
- `game.js` — main loop, state machine, input
- `entities.js` — agent, enemy, projectile, environment logic
- `ui.js` — HUD, mission UI, upgrades
- `assets/` — placeholder sprites, effects, icons

## Verification
1. Open `index.html` and verify the game loads
2. Confirm agent movement and shooting
3. Confirm enemies appear and react
4. Confirm HUD displays health, objective, and weapon state
5. Validate menu flow and mission start/retry
6. Test in Chrome and Edge

## Notes
- The initial prototype is single-player only
- Focus on playable tactical combat first
- Reserve full campaign/story for later iterations
