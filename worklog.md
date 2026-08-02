---
Task ID: 1
Agent: Main
Task: Build offline slither.io-style snake game for mobile portrait

Work Log:
- Studied slither.io core mechanics: path-history body system, angular steering with rate limiting, boost-drain-length tradeoff, head-to-body collision with front-skip, circular map boundary
- Implemented accurate path-history based body movement (not naive chain-following)
- Built complete game engine: movement, food system, bot AI (3-priority: boundary > avoidance > food seeking), collision detection, death/food-drop
- Created canvas renderer with grid, boundary glow, food with glow halos, striped snake bodies with eyes, minimap, score HUD
- Added touch steering (direction from screen center to touch point), boost button (bottom-right), keyboard Space for desktop
- Fixed pointer-events blocking on overlays (pointerEvents: 'none' on start/death screens)
- Used ctx.save()/restore() for HUD text to prevent state leaks
- Verified 11/11 E2E tests passed via agent browser

Stage Summary:
- Complete slither.io clone running at http://localhost:3000/
- Key features: 10 bot snakes, 800 food items, 4000-radius circular map, boost mechanic, minimap, score/length HUD
- All rendering on HTML5 Canvas with DPR support
- Mobile portrait optimized with touch controls
