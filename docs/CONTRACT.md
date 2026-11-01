# Internal contract (engine ⇄ content ⇄ client)

Everything runs from `index.html` opened via `file://` — so **no ES modules, no fetch()**.
Every shared module is a UMD file: in the browser it attaches to `window.GOLF.<Name>`,
in Node it is `require()`-able. Data files are JS too.

## File layout

```
index.html                 loads scripts in order (see below)
src/rng.js        GOLF.RNG        hashStr, makeRng(seed) -> {next,float,int,chance,pick,shuffle,fork}, seedToCode, codeToSeed
src/physics.js    GOLF.Physics    shared deterministic physics (game + bot)
src/manifest.js   GOLF.Manifest   60 course definitions (linear, one new gimmick each) + gimmick info/packs
src/designs/*.js  GOLF.Designs    per-gimmick hole set-pieces (registered into the generator)
src/templates.js  GOLF.Templates  layout templates
src/generator.js  GOLF.Generator  seeded hole/course generator
src/bot.js        GOLF.Bot        shot-search solver (sync for Node, chunked for browser)
data/courses/<courseId>.js        baked holes: GOLF.registerCourse(id, holes)  (Node: module.exports = holes)
data/index.js                     GOLF.BAKED = { <courseId>: {pars:[...9]} }   (Node: module.exports)
game/*.js                         client (render, audio, ui, storage, main)
tools/ test/                      Node-only build + verification
```

Browser script order: `src/rng.js, src/physics.js, src/manifest.js, src/templates.js, src/generator.js, src/bot.js, data/index.js, game/*.js`.
Course data files `data/courses/<id>.js` are loaded on demand by injecting a `<script>` tag
(works on file://). Before injecting, the client must define
`GOLF.registerCourse = (id, holes) => {...}`.

## Coordinates & units
Pixels, **y grows downward**, gravity +y (`Physics.C.G = 900 px/s²`). Ball radius `C.R = 6`.
Typical hole: `w` 1800–6000, `h` 1200–2400. The sky extends above y=0 (ball can fly to negative y).

## Hole JSON (compact)
```js
{
  v: 1, id: 't1c01h1', name: 'Hole name', par: 3, seed: 12345,
  tpl: 'valley', role: 'intro'|'vary'|'secondary'|'combo'|'boss'|'chaos'|'endless',
  theme: 't1c01',          // course id whose palette/ambient to use
  boss: 'twistId'|undefined,
  w: 3200, h: 1400,
  tee: [x, y],             // ball centre resting on ground (y = groundY - R)
  cup: [x, y], cupW: 30,   // cup = point ON the ground surface (flat around it)
  ground: [x0,y0, x1,y1, ...],  // heightfield polyline, x strictly increasing, spans 0..w; everything below is solid
  gs: 'ffrrsw...',          // one surface char per ground segment (length = points-1)
  solids: [ { p:[x,y,...], s:'k' } ],   // closed polygons (overhangs, caves, walls, islands); s = one char or one char per edge
  gm: [ {t:'wind', ...}, ... ]          // gimmicks, see below
}
```

### Surface chars (`Physics.SURF_LIST`)
`f` fairway, `n` putting GREEN (around every cup — shots from it are putts: no spin), `r` rough, `s` sand, `i` ice,
`g` goo (sticky — ball sticks, even on walls), `b` bouncy, `k` rock (walls/solids), `q` ricochet, `m` metal (gimmick parts),
`c` conveyor/spinner, `u` quicksand (ball sinks if it stops on it), `h` cushion (soft, absorbs bounce),
`j` skim water (fast shallow hits skip across, otherwise splash),
hazards: `w` water, `l` lava, `o` out-of-bounds, `x` spikes, `z` laser, `v` void.
Water/lava segments are flat pit floors: draw the liquid from the segment y up ~18px (ball "sinks" in before reset).

### Gimmicks (`hole.gm[i]`, field `t` = type). 59 types. Rects use top-left `x,y` + `w,h`. Angles radians (0 = +x, -π/2 = up).
`tg = state.t * world.opts.gspeed` (gimmick time). Per-gimmick mutable state: `S.dyn[i]`, `S.dyn2[i]`.

| t | fields | behaviour / render notes |
|---|---|---|
| wind | ax, ay, gust, f, ph; optional x,y,w,h zone (absent = global) | accel on airborne ball, `poses.windFactor` |
| fan | x,y,w,h, a, ang | updraft zone |
| windmill | x,y hub, n, L, w, ph | rotating blades, `poses.angle` |
| movplat | x,y → x2,y2, w,h, T, ph | `poses.movplat` → [x,y,vx,vy] |
| rotplat | x,y centre, L, w, ph | rotating plank |
| pad | x,y, L, ang (normal), boost | bounce pad |
| teleport | x,y, x2,y2, r | keeps velocity, bidirectional |
| portal | x,y,a, x2,y2,a2, r | exits along a2 (entering at x,y) / a |
| conveyor | x,y → x2,y2, v | belt |
| gwell | x,y, r, k (>0 attract, <0 repel) | |
| lowgrav / antigrav | x,y,w,h, g (multiplier, antigrav < 0) | ball can rest on ceilings in antigrav |
| cannon | x,y, r, ang, amp, f, sp | `poses.cannonAngle` |
| bumper | x,y, r, boost | |
| breakable | x,y,w,h, th | gone when `S.dyn[i]` |
| gate | x,y,w,h, sx,sy | switch at sx,sy; open when `S.dyn[i]` |
| door | x,y,w,h, T, open, ph | `poses.doorClosed / doorOpenAmt` |
| oneway | x,y → x2,y2 | solid from above |
| vanish | x,y,w,h, T, on, ph | `poses.vanishOn / vanishLeft` |
| sticky | x,y,w,h | goo block |
| ricochet | x,y → x2,y2 | super-bouncy wall |
| fog | x,y,w,h | render-only cover, client reveal |
| movcup | x1, x2, T, ph | use `Physics.cupState(W,S)` for every cup draw |
| shrinkcup | per, min | `cupState().w` |
| spikes | x,y → x2,y2 | hazard strip |
| crumble | x,y,w,h, delay | `S.dyn[i]` 0 intact, >0 collapse time, -1 gone |
| **boost** | x,y → x2,y2, v (target speed), a | speed strip: accelerates rolling ball along a→b (draw chevrons/arrows) |
| **magnet** | x,y → x2,y2 (solid metal bar), r (range), k | pulls ball toward the bar (ball can slide along its underside) |
| **bubble** | x,y, r, vy (rise speed <0), dx, T | captures ball, floats it for T s then pops; respawns when `S.t >= S.dyn[i]`; ball inside when `S.bub === i` |
| **piston** | x,y,w,h (retracted rect), dx,dy (extension), T, ph | `poses.piston` → [ox,oy,vx,vy]; punches |
| **pendulum** | x,y pivot, L, A (amplitude rad), w (rad/s), ph, r (head radius) | `poses.pendulum` → [theta, omega]; rod + round hammer head at end |
| **seesaw** | x,y pivot, L, max, k | plank angle = `S.dyn[i]` (tilts toward ball) |
| **zipline** | x,y → x2,y2, sp, r | grab point at start; ball hangs 12px below line while `S.ride === i` |
| **pipe** | p:[x0,y0,...] polyline, sp, r | entry p[0], exit at last point; ball hidden inside while `S.ride === i` (draw thick tube) |
| **floatpool** | x,y,w,h, cur (current px/s), b | non-hazard buoyant water: ball floats and drifts (draw clear blue water w/ current arrows) |
| **quicksand** | x,y → x2,y2 | surface strip `u`: stop on it and you sink |
| **blackhole** | x,y, r, k, core | pull field; touching core = hazard 'void' |
| **sidegrav** | x,y,w,h, gx, gy | gravity inside points along (gx,gy) (draw arrows) |
| **slowmo** | x,y,w,h, f | ball moves at f× time inside (clock-ish tint) |
| **drag** | x,y,w,h, k | thick air/honey zone damping velocity |
| **laser** | x,y → x2,y2, T, on, ph | hazard beam while `poses.laserOn`; `poses.laserWarn` flicker before |
| **saw** | x,y → x2,y2 (travel), r, T, ph | hazard disc at `poses.sawPos` |
| **crusher** | x,y,w,h (up rect), dy (drop), T, ph | `poses.crusher` → [yOff, vy]; `poses.crusherWarn` shake; bottom deadly while falling |
| **tokens** | pts:[x,y,...], r | collectibles; bit i of `S.dyn[i]` = collected; cup is CLOSED (lid) until all taken (`cupState().open`) |
| **spinner** | x,y, r, w | spinning disc (flings) |
| **glass** | x,y,w,h, th | panel; shatters if hit harder than th (`S.dyn[i]` = broken) |
| **flood** | y0, dy, top | water level `poses.floodLevel(g, S.strokes)` rises per stroke; draw water across whole hole below level; ball under rising water at shot time = hole failed |
| **decoy** | pts:[x,y,...] | fake cups (with flags!) on ground — dropping in = hazard 'decoy' |
| **geyser** | x,y (base), w, h, a, T, on, ph | periodic vertical blast, `poses.geyserOn` |
| **phase** | blocks:[[x,y,w,h],...], odd | solid only when `poses.phaseSolid(g, S.strokes)`; draw ghosted otherwise |
| **toggle** | sx,sy switch, a:[[x,y,w,h]..], b:[[..]] | set a solid when `S.dyn[i]==0`, set b when 1; switch flips |
| **ring** | x,y, r, ang, mul, min | booster ring: ball through it is redirected along ang, sped up |
| **skim** | x,y,w (surface at y) | skimmable pond surface (char `j`) |
| **cushion** | x,y → x2,y2 | soft one-way cloud platform (char `h`) |
| **tornado** | x,y (base), w, h, x2 (travel), T, ph, a | moving lift vortex, centre x = `poses.tornadoX` |
| **catapult** | x,y (plate centre, on ground), w, ang, sp, delay | when ball rests on plate it arms then flings |
| **mine** | x,y, r (trigger), imp | explodes once when ball comes near (`S.dyn[i]` = spent) |
| **liftcup** | x, w, y1 (top high), y2 (top low), yb (bottom), T, ph | rising/falling column carrying the cup (`poses.liftTop` → [y, vy]); `cupState` follows it |
| **blinkcup** | pts:[x,y,...], T, ph | cup jumps between spots, `poses.blinkIndex`; draw inactive spots as faint rings |

### Spin / swish / putts
* `shoot(W,S,angle,power,spin)`: spin -1 (backspin: lifts in flight, bites/checks back on landing) .. +1 (topspin: dives, runs on).
  If `Physics.isPutt(S)` (ball resting on a green `n`), spin is forced to 0 — UI must disable spin there.
* Holing a shot by dropping straight into the cup without touching the green that shot = **swish**: `S.swish = true`, `S.bonus += 1`
  (event `swish`). Score for the hole = `S.strokes - S.bonus`.
* `S.failed` (e.g. 'flood') = hole failed immediately; `step` returns 4.

## Generator API (`GOLF.Generator`)
```js
Generator.generateHole(params) -> hole
// params: { seed, difficulty 0..1, style, gimmicks:[types to place], counts:{type:n}, surfaces:{main,alt}, hazard:'water'|'lava'|'oob',
//           hazardDensity 0..1, wind 0..1, role, theme, boss, tplPool:[ids], id, name }
Generator.endlessHole(settings, index) -> hole          // settings schema below
Generator.dailyCourse(dateStr 'YYYY-MM-DD') -> { def, holeParams:[9] }  // def like a manifest course
Generator.randomCourse(seed) -> { def, holeParams:[9] }
Generator.courseHoleParams(courseDef, holeIndex, attempt) -> params
```
Runtime-generated holes (endless/daily/random) must be bot-checked in the browser before play:
```js
const solver = GOLF.Bot.createSolver(hole, { maxStrokes: hole.par + 2 });
// call each frame until it returns non-null:
const res = solver.run(12 /*ms budget*/);  // -> null (working) | { ok:bool, strokes, shots:[{a,p}] }
```
If `!ok`, regenerate with `seed+1` (hole.seed changes) and try again.

### Endless settings
```js
{ preset:'beginner'|'gauntlet'|'hazard'|'random'|'custom', difficulty:1..10, ramp:0..1 (difficulty added per hole),
  gimmicks:[types], surfaces:['fairway','rough','sand','ice','goo','bouncy'], styles:[style ids],
  wind:0..3, hazardDensity:0..3, strokeRule:'par+1'|'par+2'|'par+3'|'unlimited', seed:int }
```
`GOLF.Generator.ENDLESS_PRESETS` holds the presets; `GOLF.Manifest.PACKS` groups gimmicks by category.

## Manifest (`GOLF.Manifest`)
There are NO tiers / worlds. 60 courses in one sequence; each is its own concept.
```js
Manifest.COURSES  // 60, in play order. Course 1 = plain golf (gimmick null); course n (2..60) introduces exactly ONE new gimmick.
// { id:'c01'..'c60', index:0..59, name, concept (one-line pitch), gimmick (type introduced here | null), 
//   palette:{ skyTop, skyBottom, far, mid, near, ground, groundDark, accent, text },
//   surface, altSurface ('fairway'|'rough'|'sand'|'ice'|'bouncy'), hazard ('water'|'lava'|'oob'),
//   style ('rolling'|'hills'|'cliffs'|'caves'|'islands'|'canyon'|'dunes'|'terraces'|'spires'|'mesa'),
//   ambient:{ particles, bg },  unlock:{ prev: 'c0n' | null } }
Manifest.byId[id]; Manifest.STYLES; Manifest.GIMMICKS (59, in introduction order); Manifest.GIMMICK_INFO[type] = {name, desc, tip}
Manifest.PACKS  // [{id, name, gimmicks:[...]}] gimmick categories (Endless toggles by pack)
Manifest.introducedBy[type] -> course id
```
Endless `settings.gimmicks` may contain any of the 59 types. No music anywhere.

## v3 additions (tutorials, remix, practice, achievements, time)

### Data
* `data/tutorials.js` → `GOLF.TUTORIALS = { <gimmickType>: hole }` — one short, bot-verified teaching hole per gimmick (59).
  `hole.tutorial = type`, normal hole JSON otherwise (has `par`, `bot.shots`). Node: `module.exports`.
* Every baked hole has `bot: { s, shots:[[angle, power], ...] }` — the verified solution (usable as a "show me" ghost / hint).
* Course ORDER was reshuffled (ids c01..c60 are by position): saved progress keyed by course id must be migrated/reset
  (bump the progress storage key and tell the player once).

### Generator additions
* `GOLF.Generator.mirrorHole(hole)` → deep-copied, left↔right mirrored hole (tee on the right). Its `bot.shots` are mirrored
  too and remain valid (verified offline for all 1080 holes). Used by **Remix** rounds.

### Achievements (ids are fixed; the client evaluates them, cosmetics may reference them)
first_hole, first_round, under_par_round, ace, ace5, swish, swish10, swish_ace, birdie10, birdie100, eagle,
clean_nine (9 holes, no bogeys), perfect_round (18 holes, every hole ≤ par), no_mulligan_round (18 holes, 0 mulligans),
lightning_hole (hole under par in < 8 s), speed_nine (nine under par in < 3 min), speed_18 (18 under par in < 8 min),
courses10, courses30, courses60 (courses cleared under par), tutorials_all (all 59 tutorials), gimmick_hunter (met 30 gimmicks),
gimmick_master (met all 59), daily3 / daily7 (daily streak of 3 / 7 days), endless10 / endless25 / endless50 (holes in one endless run),
remix_round, remix_under_par, practice50 (50 practice holes), spin_doctor (25 holes finished with a spin shot),
pro_round (any round under par on Pro), insane_round (finish any round on Insane), comeback (hole under par after a hazard on it),
marathon (1000 lifetime strokes).

### Extra cosmetic unlock types
`{type:'achievement', id}` · `{type:'achievements', n}` (count earned) · `{type:'fastrounds', n}` (rounds finished under par AND
faster than 20 s × round par) · `{type:'tutorials', n}` (tutorial holes completed) · `{type:'remix', n}` (remix rounds finished).

### Frame additions for the renderer (`R.draw(frame)`)
* `frame.ghost = { points:[x0,y0,...], t }` — translucent ghost ball replaying the previous shot (or the bot hint); t = 0..1 progress.
* `frame.prevAim = { angle, power }` — draw a faint marker of the previous shot's aim/power on the aim UI.
* `frame.a11y = { colorblind:bool, reducedFx:bool }` — colour-blind-safe hazards (patterns/shapes, not just colour; decoy tell by shape),
  reduced effects (fewer particles/ambient motion).
