# Stick Golf

A 2D side-view physics golf game in the spirit of Super Stickman Golf. It is vanilla JS on an HTML5 canvas, with geometric shape art and procedural WebAudio sound effects and optional ambient music (off by default). There are no dependencies.

* **60 courses × 18 holes = 1,080 holes.** Play all 18, the front 9 (easier) or the back 9 (harder).
* **The 60 courses come one after another, each its own concept.** Course 1 is plain golf. Every course after it introduces **one new gimmick**, for **59 gimmicks** in all. Its holes are built around that gimmick, which is usually the only way to the cup: walls no swing can clear, chasms wider than a full-power shot, sealed vaults, tunnels through mountains. Later holes in each course mix in gimmicks from earlier courses.
* **Spin on full shots, never on putts.** Backspin lifts the ball and makes it bite; topspin dives and runs on.
* **Swish bonus.** Drop the ball straight into the cup without touching the green first and you get −1 stroke.
* **Modes:** Endless (fully customisable), Daily Challenge and Random Course, with shareable seed codes.
* **Bot-verified.** A headless bot running the *same* physics module finishes every baked hole in at most par+2 strokes. Its solution must actually use the course's gimmick.

## Play online

**https://jeffrichards314.github.io/stick-golf/** (hosted with GitHub Pages from the `main` branch; every push redeploys it).

## Modes & features

* **Courses:** 60 courses × 18 holes, played as rounds: All 18, Front 9 (easier) or Back 9 (harder). Finish a full round under par to unlock the next course.
* **Remix:** once you've cleared a course under par, you can play it mirrored (tee on the right). Remixes keep their own personal bests.
* **Tutorials:** "The Basics" walks through the controls and sits next to course 1. There is also one teaching hole for each of the 59 gimmicks. Completing a gimmick's tutorial makes it available in **Endless**. Tutorials have a "Show me" button that replays the bot's solution as a ghost ball.
* **Practice:** play any single hole of any unlocked course, with unlimited restarts and "Show me".
* **Daily Challenge:** a seeded 9-hole course each day. Results go on a local leaderboard with streaks, and an emoji share card can be copied or shared.
* **Endless:** fully customisable. Gimmicks unlock as you complete their tutorials.
* **Previous shot:** while you aim, a ghost ball replays your last shot, and the last aim and power are marked.
* **Clocks:** time is tracked per hole and per round. Fast rounds under par earn achievements and cosmetics.
* **Progression:** 36 achievements, 139 cosmetics in 5 Locker categories (balls, trails, cup effects, flags, palettes), and a lifetime Stats screen.
* **Settings:**
  * difficulty and feel: difficulty (Chill / Standard / Pro / Insane), haptics, optional music;
  * accessibility: color-blind mode (patterns and shapes instead of color alone), reduced effects, larger touch targets, high contrast;
  * aiming: separate touch and mouse sensitivity, and precision putting.
* **Human-feel par:** the build replays every bot solution with small aim and power errors. Holes whose shots need pixel-perfect precision get up to +2 par.

## Run

Open `index.html` in a browser by double-clicking it. Nothing needs installing and there is no build step, because the baked hole data is committed in `data/`.

If your browser blocks scripts loaded from `file://`, serve the folder locally:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

Useful URL parameters:

* `?unlock=all` unlocks every course and cosmetic.
* `?course=t3c04&hole=2` jumps straight into a hole.
* `?dev=1` loads a test hole.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Aim + power | Drag back anywhere (slingshot) and release to shoot. Drag back to the centre to cancel. | ←/→ or A/D angle, ↑/↓ or W/S power, Space shoots |
| Spin (5 steps, disabled when putting on the green) | HUD spin control, or mouse wheel while aiming | B = more backspin, T = more topspin |
| Look around | HUD look button, right-drag, or two-finger drag; wheel or pinch to zoom | L |
| Pause (resume, restart, mulligan, settings, quit) | ❚❚ button | Esc / P |
| Mute | 🔊 button | M |

At the start of each hole the camera pans from the cup to the tee. Click to skip the pan.

### Difficulty (chosen on first launch, changeable in Settings)

| | Strokes | Trajectory preview | Hazards | Mulligans | Other |
|---|---|---|---|---|---|
| Chill | unlimited | full arc | no penalty | unlimited | |
| Standard | par+4 limit | short | +1 stroke | 3 per course | |
| Pro | par+3 limit | none | +1 stroke | 1 per course | wind ×1.5 |
| Insane | par+1 limit | none | +1 stroke | none | wind ×1.5, gimmicks ×1.35 speed |

Water, lava, spikes and out-of-bounds reset the ball to its last resting spot.

Stars per hole: ★★★ at par or better, ★★ at par+1, ★ for finishing. Stars unlock courses. Finishing a course gives bonus stars (+3, or +5 if every hole is at par or better). Star totals and completions also unlock cosmetics in the Locker: balls, trails, cup effects and palettes.

**Courses are played as rounds.** Pick All 18, Front 9 or Back 9 and you play those holes in order, like a real round. There are no hole restarts. If you hit the stroke limit, the hole is picked up, scored, and you move on to the next tee.

**The course screen is a scorecard** showing par and your personal best on every hole, plus your best 18, best front 9 and best back 9. During a round, a running scorecard appears after every hole.

**Unlocking:** finish a full round of a course under par to unlock the next one.

The first time you meet a gimmick, a card explains it.

**Swish:** if a shot drops into the cup without touching the putting green first, the hole's score is strokes − 1. A swish hole-in-one scores 0.

## Verify / rebuild

```bash
node tools/verify.js     # full verification suite (cached: re-runs take well under a second)
node tools/build.js      # regenerate + bot-verify + bake every course (≈50 s on 10 cores; cached per course)
npm test                 # manifest test + verify
```

`tools/verify.js` runs five checks and prints a pass/fail table of all 1,080 holes. Each cell shows bot strokes / par.

1. **Manifest rules.**
   * c01 is plain golf, and every later course introduces exactly one gimmick nobody has introduced before; all 59 are covered.
   * No (gimmick, surface) pair repeats, and no gimmick is the signature of more than 3 courses.
   * Every gimmick has at least 4 set-pieces.
2. **Every baked hole.**
   * The tee and cup are not inside or overlapping solid terrain or a gimmick.
   * The stored bot solution replays deterministically in ≤ par+2 strokes; if it doesn't, the bot searches the hole again.
3. **No near-duplicate holes** within a course. Lead-in layouts are drawn without replacement, every layout + set-piece combination is unique, and terrain profiles are compared by correlation.
4. **Signature gimmicks.**
   * Every hole of a course contains its gimmick, and the bot's solution must actually engage it.
   * For "enabler" gimmicks (launchers, lifts, travel, fields), the bot re-plays the hole with the gimmick removed and must fail within par+2. This has to hold on at least half of holes 2–18, which proves the gimmick is needed.
5. **500 runtime cases.** These cover Endless, Daily and Random generators: presets, every gimmick alone at difficulty 1 and 10, everything on, everything off, single surfaces and styles, and random combos. Each case must yield a bot-verified hole, using the same re-seed-on-failure loop as the game.

Work runs on a `worker_threads` pool. Results are cached in `.cache/`, keyed by hashes of the sources and of each hole's JSON.

**Design iteration:** `node tools/try.js <courseId|gimmick> [--holes 1,9] [--png]` builds one course in memory, bot-checks each hole (strokes, attempts, engaged and essential checks) and writes previews to `.cache/try/<courseId>/`.

## Architecture

```
src/rng.js          seeded RNG, hashing, shareable seed codes
src/physics.js      deterministic fixed-step physics + all 59 gimmicks, spin, swish, putts (shared by game and bot)
src/manifest.js     60 courses in order (concept, gimmick, palette, style, surfaces, ambient), gimmick info, packs
src/templates.js    terrain builder (chasm, wallUp, corridor, vault, islandGreen, tune...), lead-in layouts, plain-golf pieces
src/designs/*.js    per-gimmick set-pieces (registry.js, core.js, a.js, b.js, c.js)
src/generator.js    hole composition, course plans, validation, Endless/Daily/Random, presets
src/bot.js          shot-search bot (beam search + geodesic field with teleport/pipe/cannon shortcuts, switch & token goals)
data/               baked holes (one JS file per course) + index
game/               renderer, UI, input, camera, audio, storage, progression, modes
tools/ test/        build, verify, try, worker pool
docs/CONTRACT.md    hole JSON format, gimmick field reference, module APIs
```

Every shared module is a UMD script, so the same file runs in the browser (`GOLF.*`) and in Node (`require`). That is how the game and the bot share one physics module.

* **Physics** uses a fixed timestep (1/120 s) with speed-based sub-steps against a uniform spatial grid.
* **Moving gimmicks** are pure functions of time or stroke count. Mutable gimmick state lives only in `state.dyn` / `state.dyn2`, so a shot simulates the same way every time.
* **Gravity is a vector**, because of side-gravity and anti-gravity zones. Friction and resting are computed against it, which is why a ball can rest on a ceiling inside an anti-gravity zone.

## How a course's holes are built

`coursePlan` in `src/generator.js` gives each hole a different lead-in layout and a list of set-pieces:

**Front 9 (easier):**

* Hole 1 uses the gimmick's gentle `intro` piece.
* Holes 2–5 cycle through its other pieces; hole 5 may add a goal piece.
* Holes 6–8 add pieces from gimmicks introduced earlier.
* Hole 9 is the turn: a gimmick piece, an earlier gimmick, then a goal piece.

**Back 9 (harder):** difficulty is about +0.15 higher. Holes are longer and chain several pieces, mixing in up to two earlier gimmicks, and hole 18 is the grand finale.

Each hole is bot-verified and re-seeded until it passes. From attempt 7 on, difficulty is eased slightly.

## How to add a course

1. Add a gimmick (below).
2. Add a course entry to `COURSES` in `src/manifest.js` with `gimmick` set to it, plus `GIMMICK_INFO` and a `PACKS` entry. `Manifest.validate()` checks the rules.
3. Run `node tools/try.js <gimmick> --png` until all 9 holes pass.
4. Run `node tools/build.js && node tools/verify.js`. This bakes `data/courses/<id>.js` and updates `data/index.js`.

## How to add a gimmick

1. **Physics** (`src/physics.js`):
   * Add the type to `GIMMICK_TYPES`.
   * In `createWorld`, choose how it plugs in:
     * a force field: `W.fields`, handled in `step`;
     * a static collider: `addSeg` with a surface/kind;
     * a moving or stateful collider: `W.dynG` + `buildDyn` (give segment velocities so contacts carry the ball);
     * a trigger: `W.triggers`, handled in `triggers`.
   * Keep mutable state in `S.dyn[i]` / `S.dyn2[i]`.
   * Add pure pose functions to `poses` for anything that moves.
2. **Designs:** register set-pieces in a file under `src/designs/`. Look at `core.js` (pad, cannon, gate, teleport):

   ```js
   GOLF.Designs.register('mygimmick', { essential: true, pieces: [
     { id: 'intro', intro: true, build(B, c) { /* gentle */ } },
     { id: 'wallclimb', goal: true, build(B, c) { /* wall > 950px + green on top, gimmick is the only way up */ } },
     { id: 'crossing', build(B, c) { /* reusable mid piece */ } },
   ]});
   ```

   Use `B.tune(gi, 'sp', lo, hi, x0, x1, ymax)` for anything that launches the ball. It simulates the finished hole and picks the value that lands the ball in range.
3. **Bounding box:** add a case to `gimmickBoxes` in `src/generator.js`. It is used for tee/cup clearance and the engagement check.
4. **Rendering:** add a draw case in `game/render.js`. **Info:** add the gimmick to `GIMMICK_INFO` in the manifest.
5. Endless picks it up automatically.

## How to add a layout

* **Lead-in layout:** add an entry to `WRAPPERS` in `src/templates.js`. `{id, ty (tee height offset), lead(B,c), mid(B,c)}`
* **Plain-golf piece:** add an entry to `BASIC`. `{id, goal?, build(B,c)}`
* **Builder primitives:**
  * terrain: `terrain`, `run`, `flat`, `cliff`, `wallUp`, `pit`, `chasm`, `bunker`;
  * enclosures: `corridor` (a tunnel through an un-clearable mountain), `vault` (a sealed green);
  * floating ground: `island`, `islandGreen`;
  * greens and launches: `greenFlat`, `ballistic`, `tune`.

## How to tune Endless presets

Presets live in `ENDLESS_PRESETS` in `src/generator.js`. Each preset uses the same settings object as the Endless setup screen:

```js
{ preset:'beginner', name:'Beginner', difficulty:1..10, ramp:0..1 /* difficulty added per hole */,
  gimmicks:[...types], gimmicksPerHole?: n, surfaces:['fairway',...], styles:['rolling',...],
  wind:0..3, hazardDensity:0..3, strokeRule:'par+1'|'par+2'|'par+3'|'unlimited', seed }
```

`endlessHole(settings, index)` turns these into generator parameters:

* Effective difficulty is `difficulty + ramp × index`, capped at 10.
* The gimmick types per hole are sampled from the enabled list; the count grows with difficulty, or is fixed by `gimmicksPerHole`.
* Surfaces, terrain style and theme palette are picked by the seeded RNG.
* `wind` sets the strength of a global wind.
* `hazardDensity` sets pit hazards and incidental water or bunkers. 0 makes pit floors safe.

After changing a preset, run `node tools/verify.js`. Its runtime section exercises every preset across 25 seeds.

The in-game setup screen can also save custom presets. Each preset (built-in or custom settings hash) keeps its own local top-10 leaderboard.
