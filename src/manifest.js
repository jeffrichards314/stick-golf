/* Course manifest: 60 single-sequence courses (each introduces one gimmick) + gimmick packs. Browser: GOLF.Manifest; Node: require. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.Manifest = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STYLES = ['rolling', 'hills', 'cliffs', 'caves', 'islands', 'canyon', 'dunes', 'terraces', 'spires', 'mesa'];
  const SURFACES = ['fairway', 'rough', 'sand', 'ice', 'bouncy'];
  const HAZARDS = ['water', 'lava', 'oob'];
  const PARTICLES = ['leaves', 'snow', 'embers', 'bubbles', 'stars', 'dust', 'rain', 'spores', 'sparks', 'petals', 'none'];
  const BGS = ['hills', 'mountains', 'city', 'crystals', 'forest', 'pillars', 'clouds', 'waves', 'gears', 'mushrooms', 'dunes', 'volcano', 'space', 'ruins'];
  const PALETTE_KEYS = ['skyTop', 'skyBottom', 'far', 'mid', 'near', 'ground', 'groundDark', 'accent', 'text'];

  const GIMMICK_INFO = {
    pad: { name: 'Bounce Pad', desc: 'Springy pads that launch the ball off along their face.', tip: 'Land on a pad to rebound high — its angle sets the direction.' },
    conveyor: { name: 'Conveyor', desc: 'Moving belts that drag a rolling ball along.', tip: 'Roll onto a belt heading your way and let it carry you.' },
    boost: { name: 'Speed Strip', desc: 'Chevron strips that accelerate a rolling ball along the arrows.', tip: 'A gentle putt onto the strip comes out at full speed.' },
    bumper: { name: 'Bumper', desc: 'Round bumpers that kick the ball away with extra speed.', tip: 'Glance off the side of a bumper to bend your line.' },
    oneway: { name: 'One-Way Ledge', desc: 'Ledges that are solid from above but let the ball pass up through.', tip: 'Shoot up through a ledge from below and drop onto it.' },
    fan: { name: 'Fan', desc: 'Updraft zones that push the ball along the fan direction.', tip: 'Drift into the airflow to gain height and carry.' },
    wind: { name: 'Wind', desc: 'Steady breezes and gusts push the ball while it is airborne.', tip: 'Watch the wind sock — aim upwind and keep shots low into it.' },
    breakable: { name: 'Breakable Wall', desc: 'Barriers that shatter when struck hard enough.', tip: 'Hit it with real pace — a soft shot just bounces off.' },
    sticky: { name: 'Sticky Block', desc: 'Goo-covered blocks the ball clings to on contact.', tip: 'Use goo to stop dead next to the pin.' },
    ricochet: { name: 'Ricochet Wall', desc: 'Super-bouncy walls that return almost all of the ball\'s speed.', tip: 'Plan a bank shot — angle in equals angle out.' },
    teleport: { name: 'Teleporter', desc: 'Paired rings that warp the ball across, keeping its velocity.', tip: 'Your speed and direction carry through — aim for after the exit.' },
    cushion: { name: 'Cloud Cushion', desc: 'Soft one-way cloud platforms that absorb landings.', tip: 'Pop up through a cloud and settle softly on top.' },
    spinner: { name: 'Spinner', desc: 'Spinning discs that fling the ball off their rim.', tip: 'Touch the side spinning your way to get a free push.' },
    movplat: { name: 'Moving Platform', desc: 'Platforms that glide back and forth, carrying the ball.', tip: 'Land on a platform and ride it before shooting again.' },
    gate: { name: 'Switch Gate', desc: 'Gates that open when the ball hits their switch.', tip: 'Hit the switch first, then go for the green.' },
    skim: { name: 'Skim Pond', desc: 'Glassy water a fast, low ball can skip across.', tip: 'Keep it low and fast to hop over the water.' },
    rotplat: { name: 'Rotating Plank', desc: 'Spinning planks that tilt, carry and fling.', tip: 'Time your landing for when the plank is level.' },
    cannon: { name: 'Cannon', desc: 'Catches the ball and fires it on a swinging aim.', tip: 'Roll in, then wait for the barrel to point where you want.' },
    lowgrav: { name: 'Low Gravity', desc: 'Zones where gravity weakens and shots float.', tip: 'Use less power — the ball hangs and carries far.' },
    tokens: { name: 'Gold Tokens', desc: 'The cup stays lidded until every token has been collected.', tip: 'Plan a route that sweeps all tokens before the putt.' },
    seesaw: { name: 'Seesaw', desc: 'Pivoting planks that tilt toward the ball\'s weight.', tip: 'Land on the far end to tip it down toward the cup.' },
    glass: { name: 'Glass Panel', desc: 'Panels that deflect soft hits but shatter on hard ones.', tip: 'Soft to bank off it, hard to blast through.' },
    zipline: { name: 'Zipline', desc: 'Cables that carry the ball from the grab point to the far end.', tip: 'Touch the start of the line and enjoy the ride.' },
    floatpool: { name: 'Float Pool', desc: 'Safe, buoyant water whose current drifts the ball along.', tip: 'Drop in upstream and let the current deliver you.' },
    ring: { name: 'Booster Ring', desc: 'Rings that redirect the ball along their arrow and speed it up.', tip: 'Thread the ring — it handles the rest of the distance.' },
    magnet: { name: 'Magnet Bar', desc: 'Metal bars that pull the ball in; it can slide along their underside.', tip: 'Get close and the magnet carries you along the bar.' },
    door: { name: 'Timed Door', desc: 'Doors that open and close on a timer.', tip: 'Count the rhythm and shoot as the door begins to open.' },
    geyser: { name: 'Geyser', desc: 'Vents that periodically blast anything above them skyward.', tip: 'Sit over the vent and wait for the eruption.' },
    catapult: { name: 'Catapult', desc: 'Plates that arm when the ball rests on them, then fling it.', tip: 'Stop the ball on the plate and it launches on its own.' },
    quicksand: { name: 'Quicksand', desc: 'Sand strips that swallow a ball that comes to rest on them.', tip: 'Never stop on it — fly over or roll straight through.' },
    windmill: { name: 'Windmill', desc: 'Rotating blades that swat the ball away.', tip: 'Shoot through the gap just after a blade passes.' },
    pendulum: { name: 'Pendulum', desc: 'Swinging hammers that knock the ball aside.', tip: 'Go when the hammer swings away from your line.' },
    pipe: { name: 'Warp Pipe', desc: 'Tubes that suck the ball in and spit it out at the other end.', tip: 'Find the entry — the exit points where you will go.' },
    bubble: { name: 'Bubble', desc: 'Floating bubbles that capture the ball, rise, then pop.', tip: 'Catch a bubble to be carried up over walls.' },
    drag: { name: 'Thick Air', desc: 'Syrupy zones that damp the ball\'s velocity.', tip: 'Hit harder — everything inside loses speed fast.' },
    portal: { name: 'Portal', desc: 'Directional portals that re-aim the ball on exit.', tip: 'Speed is kept, but direction comes from the exit portal.' },
    antigrav: { name: 'Anti-Gravity', desc: 'Zones where gravity flips and the ball falls up.', tip: 'Inside, the ceiling is the floor — it can rest up there.' },
    toggle: { name: 'Toggle Switch', desc: 'A switch that swaps which of two wall sets is solid.', tip: 'Flip the switch to open the path you need.' },
    piston: { name: 'Piston', desc: 'Pistons that punch out and shove the ball.', tip: 'Rest in front of a piston for a free launch.' },
    vanish: { name: 'Vanishing Block', desc: 'Blocks that blink in and out of existence.', tip: 'Land while it is solid and leave before it fades.' },
    crumble: { name: 'Crumbling Ledge', desc: 'Ledges that collapse shortly after the ball lands.', tip: 'Do not linger — shoot again quickly or fall through.' },
    gwell: { name: 'Gravity Well', desc: 'Orbs that attract or repel the ball.', tip: 'Curve your shot around a well like a slingshot.' },
    sidegrav: { name: 'Side Gravity', desc: 'Zones where gravity points sideways along the arrows.', tip: 'Inside, the ball falls the way the arrows point.' },
    spikes: { name: 'Spikes', desc: 'Hazard strips that reset the ball on contact.', tip: 'Fly over them — any touch sends you back.' },
    saw: { name: 'Buzzsaw', desc: 'Spinning blades that slide along a track; touching one is a hazard.', tip: 'Wait for the saw to move to the far end of its track.' },
    laser: { name: 'Laser', desc: 'Beams that switch on and off; touching a live beam is a hazard.', tip: 'Watch for the flicker warning, then shoot as it dies.' },
    slowmo: { name: 'Slow-Mo Zone', desc: 'Zones where the ball moves in slow motion.', tip: 'Time slows inside — use it to slip past moving things.' },
    mine: { name: 'Mine', desc: 'Proximity mines that explode once and blast the ball away.', tip: 'A mine can be a launcher if you approach from the right side.' },
    crusher: { name: 'Crusher', desc: 'Heavy blocks that slam down on a rhythm.', tip: 'Shoot underneath right after it lifts.' },
    phase: { name: 'Phase Blocks', desc: 'Blocks that are solid only on alternating strokes.', tip: 'Check which set is solid before each shot.' },
    tornado: { name: 'Tornado', desc: 'Roaming vortices that lift any ball they catch.', tip: 'Meet the twister mid-path for a ride upward.' },
    blackhole: { name: 'Black Hole', desc: 'A powerful pull field whose core swallows the ball.', tip: 'Skirt the edge fast enough to escape the pull.' },
    fog: { name: 'Fog', desc: 'Fog banks that hide the course, lifting only near the ball.', tip: 'Feel your way forward with shorter shots.' },
    decoy: { name: 'Decoy Cups', desc: 'Fake cups with flags; dropping into one is a hazard.', tip: 'Only one flag is real — look for the true green.' },
    movcup: { name: 'Moving Cup', desc: 'The cup slides back and forth along the green.', tip: 'Lead the cup — putt to where it will be.' },
    liftcup: { name: 'Lift Cup', desc: 'The cup rides a column that rises and falls.', tip: 'Land when the column is low and level with you.' },
    blinkcup: { name: 'Blink Cup', desc: 'The cup jumps between several spots on a timer.', tip: 'Learn the order and putt to the next spot.' },
    shrinkcup: { name: 'Shrinking Cup', desc: 'The cup gets smaller with every stroke.', tip: 'Make your early shots count — the cup only gets tighter.' },
    flood: { name: 'Flood', desc: 'Water rises with every stroke; a submerged ball fails the hole.', tip: 'Climb high and finish fast before the tide catches you.' },
  };

  const GIMMICKS = ['pad', 'conveyor', 'boost', 'bumper', 'oneway', 'fan', 'wind', 'breakable', 'sticky', 'ricochet', 'teleport',
    'cushion', 'spinner', 'movplat', 'gate', 'skim', 'rotplat', 'cannon', 'lowgrav', 'tokens', 'seesaw', 'glass', 'zipline',
    'floatpool', 'ring', 'magnet', 'door', 'geyser', 'catapult', 'quicksand', 'windmill', 'pendulum', 'pipe', 'bubble', 'drag',
    'portal', 'antigrav', 'toggle', 'piston', 'vanish', 'crumble', 'gwell', 'sidegrav', 'spikes', 'saw', 'laser', 'slowmo', 'mine',
    'crusher', 'phase', 'tornado', 'blackhole', 'fog', 'decoy', 'movcup', 'liftcup', 'blinkcup', 'shrinkcup', 'flood'];

  const PACKS = [
    { id: 'launch', name: 'Launchers & Lifts', gimmicks: ['pad', 'fan', 'cannon', 'catapult', 'geyser', 'boost', 'ring', 'bubble', 'tornado'] },
    { id: 'movers', name: 'Movers & Platforms', gimmicks: ['movplat', 'rotplat', 'seesaw', 'vanish', 'crumble', 'oneway', 'cushion', 'glass', 'piston'] },
    { id: 'travel', name: 'Travel', gimmicks: ['teleport', 'portal', 'zipline', 'pipe', 'conveyor', 'floatpool', 'skim', 'magnet'] },
    { id: 'fields', name: 'Fields', gimmicks: ['wind', 'lowgrav', 'antigrav', 'gwell', 'blackhole', 'sidegrav', 'slowmo', 'drag'] },
    { id: 'hazards', name: 'Obstacles & Hazards', gimmicks: ['windmill', 'pendulum', 'saw', 'laser', 'crusher', 'spikes', 'mine', 'spinner', 'bumper', 'ricochet', 'sticky', 'quicksand'] },
    { id: 'locks', name: 'Switches & Locks', gimmicks: ['gate', 'door', 'breakable', 'toggle', 'phase', 'tokens'] },
    { id: 'cup', name: 'Cup Tricks', gimmicks: ['fog', 'movcup', 'shrinkcup', 'liftcup', 'blinkcup', 'decoy', 'flood'] },
  ];

  // [name, gimmick, concept, surface, altSurface, hazard, style, particles, bg,
  //  palette: skyTop skyBottom far mid near ground groundDark accent text]
  const DEFS = [
    ['First Tee Meadows', null, 'Just you, the ball and the flag — pure golf over gentle green hills.', 'fairway', 'rough', 'water', 'rolling', 'leaves', 'hills',
      '#7ec8f0 #d8f1ff #a9d4a8 #7fbf73 #4f8a46 #7cc95a #3d7a32 #ffd34d #1d3b1a'],
    ['Springhollow', 'pad', 'Bounce pads tucked into the hollows turn short hops into soaring arcs.', 'fairway', 'bouncy', 'water', 'terraces', 'leaves', 'mushrooms',
      '#8fd3e8 #e6fbe0 #c3dfa0 #9cc96e #5f8f3e #8fd45e #4c8530 #ff6f61 #233818'],
    ['Millrace Downs', 'conveyor', 'Belts along the old mill race carry rolling balls toward — or away from — the pin.', 'fairway', 'rough', 'water', 'canyon', 'dust', 'gears',
      '#88b8d8 #e4eef2 #b0b8a0 #8f9c78 #5c6a4a #7fb85a #44702f #e0a040 #26301c'],
    ['Speedway Straights', 'boost', 'Long flat runways where chevron strips rocket putts toward distant greens.', 'fairway', 'rough', 'oob', 'mesa', 'dust', 'city',
      '#f2a65a #fde2b8 #d8a878 #b8845a #7a5238 #a6c25a #6a7a34 #ff3b3b #2e1a0c'],
    ['Pinball Prairie', 'bumper', 'Bumpers dot the open grassland — bank off them like a pinball wizard.', 'rough', 'fairway', 'oob', 'rolling', 'petals', 'hills',
      '#f0b46a #fde7c0 #d8b884 #c09a60 #8a6a3c #b8c252 #6e7030 #ff3d7f #3a2a14'],
    ['Ledgeway Lofts', 'oneway', 'Stacked wooden ledges let shots rise through from below and land on top.', 'fairway', 'rough', 'oob', 'terraces', 'leaves', 'forest',
      '#9ec8e0 #eaf4e8 #9cb894 #6f9a6a #3e5e40 #78b860 #3e6a30 #f4b13c #182a16'],
    ['Updraft Orchard', 'fan', 'Orchard fans blow rising columns of air that loft balls over the treetops.', 'fairway', 'rough', 'oob', 'hills', 'petals', 'clouds',
      '#9fd8ff #fff0f5 #b8d8b0 #8cc28a #5a8c5a #9ad06a #477a36 #ff8fb1 #2a3a22'],
    ['Meadowbreeze Links', 'wind', 'Exposed seaside links where the breeze decides every carry.', 'fairway', 'rough', 'water', 'islands', 'leaves', 'waves',
      '#6ab4e8 #d4eefa #a0c8c0 #78aaa0 #4a7c78 #8cc860 #4e8a38 #ffe14d #133030'],
    ['Crackerjack Quarry', 'breakable', 'Quarry walls block every line — hit them hard enough to smash through.', 'rough', 'sand', 'oob', 'canyon', 'dust', 'ruins',
      '#a8b4c4 #e8e2d6 #b4a898 #96887a #5e534a #a4b06a #5c6438 #f2c14e #2e2820'],
    ['Honeycomb Hollow', 'sticky', 'Honey-slick blocks catch the ball dead — perfect for stopping on a dime.', 'fairway', 'rough', 'water', 'caves', 'spores', 'mushrooms',
      '#ffd98a #fff6d8 #d8c07a #b89a50 #7a5e28 #a8c850 #657a2c #ffb000 #3a2a0a'],
    ['Ricochet Ravine', 'ricochet', 'Rubber-walled ravines where the only way to the green is a bank shot.', 'rough', 'bouncy', 'oob', 'canyon', 'dust', 'pillars',
      '#c87a8a #f8d8d0 #b88a88 #966a6a #643e44 #98b85a #5a7034 #3ae0ff #2a1418'],
    ['Warpstone Wilds', 'teleport', 'Twin warpstones link fairways split by a chasm no shot can cross.', 'fairway', 'rough', 'oob', 'cliffs', 'sparks', 'crystals',
      '#5a6ab8 #c8c8f0 #8a8ac8 #6a6aa8 #3c3c78 #78c878 #3a7a48 #c860ff #f0f0ff'],
    ['Cumulus Commons', 'cushion', 'A sky course of soft cloud platforms you can pop up through and settle on.', 'fairway', 'rough', 'oob', 'spires', 'none', 'clouds',
      '#5aa8f0 #e8f6ff #d8eaf8 #b8d4ec #4e6e98 #88d070 #4c8a3c #ffffff #1a2c48'],
    ['Whirligig Wharf', 'spinner', 'Spinning discs along the docks fling the ball in wild new directions.', 'fairway', 'rough', 'water', 'islands', 'bubbles', 'waves',
      '#3a98c8 #b8e4f4 #7ab8c8 #5a98a8 #3a6a78 #d0c080 #8a7a48 #ff7a3a #0c2a36'],
    ['Ferryboat Fjord', 'movplat', 'Greens perched across a fjord — ride the drifting ferries to reach them.', 'fairway', 'rough', 'water', 'islands', 'snow', 'mountains',
      '#5a7a96 #b8ccd8 #8496a6 #627888 #3a4c5a #7ab86a #3a6438 #ffcf5a #1a2630'],
    ['Switchback Keep', 'gate', 'Castle gates bar the green; strike the switch first to throw them open.', 'fairway', 'rough', 'oob', 'terraces', 'dust', 'ruins',
      '#8a9ab0 #e0e0d8 #a8a49a #888478 #545048 #8cb05a #4e6a30 #e84a3a #22201a'],
    ['Skipstone Isles', 'skim', 'Skim the ball across glassy lagoons, hopping from islet to islet.', 'fairway', 'sand', 'water', 'islands', 'bubbles', 'waves',
      '#3fa9f5 #bfeaff #7fd0d8 #52b4be #2a7a86 #f0dca0 #c0a868 #ff5e5b #10303c'],
    ['Plankspin Peaks', 'rotplat', 'Rotating planks bridge the mountain gaps — time your shot to their turn.', 'rough', 'fairway', 'oob', 'spires', 'snow', 'mountains',
      '#8ab4d8 #eef6ff #c0d4e4 #a0b8cc #6a809a #e8f2fa #a8bccc #ff7a3d #1c2c3c'],
    ['Cannonball Cliffs', 'cannon', 'Sheer walls no swing can clear — only the cannons reach the greens.', 'fairway', 'rough', 'water', 'cliffs', 'dust', 'pillars',
      '#c07040 #f0c890 #a87858 #885c40 #54362a #a8b860 #6c7438 #ff6a00 #2a1608'],
    ['Moonmilk Grotto', 'lowgrav', 'Gravity thins in the glowing grotto — shots float like feathers.', 'fairway', 'rough', 'oob', 'caves', 'stars', 'crystals',
      '#1e2448 #4a4a8a #5a5aa0 #46468a #2a2a5a #7ac0a8 #4a8070 #c8a8ff #e8e8ff'],
    ['Treasure Trove Dunes', 'tokens', 'The cup stays sealed until every gold coin in the dunes is collected.', 'fairway', 'sand', 'oob', 'dunes', 'sparks', 'ruins',
      '#f6a85c #ffe6b8 #e8c486 #d4a462 #9a6c38 #9cc058 #5e7a30 #ffd700 #3c2810'],
    ['Seesaw Sierra', 'seesaw', 'Giant planks pivot under the ball — land on the right end to tip toward the cup.', 'rough', 'fairway', 'oob', 'mesa', 'dust', 'mountains',
      '#c87a5a #f4d0a8 #b48a74 #946a58 #604036 #a0aa58 #5a6030 #ffe066 #2c1c14'],
    ['Glasshouse Gardens', 'glass', 'A city conservatory of fragile panes — tap them to bank, smash them to pass.', 'fairway', 'rough', 'water', 'terraces', 'petals', 'city',
      '#a0d8d0 #f0fff8 #b8d8d0 #90b8b0 #4a6e68 #8ad078 #4a8840 #ff8ac8 #14302c'],
    ['Zipline Canopy', 'zipline', 'Catch a zipline across the jungle canopy to greens far below.', 'fairway', 'rough', 'oob', 'cliffs', 'leaves', 'forest',
      '#6ac8a0 #d8f8d0 #6aa87a #4a8c5a #24502e #8ac85a #34702a #ffde59 #102a14'],
    ['Lazy River Links', 'floatpool', 'Buoyant pools float the ball downstream on a gentle current.', 'fairway', 'rough', 'oob', 'rolling', 'bubbles', 'waves',
      '#78c8f0 #e0f8ff #a8d8c8 #80b8a8 #4a8070 #98d468 #4e8a38 #2ab8ff #102a24'],
    ['Hoop Dream Heights', 'ring', 'Booster rings hang in the sky — thread one and it hurls you onward.', 'fairway', 'rough', 'oob', 'spires', 'stars', 'clouds',
      '#3a5aa8 #f0b8d8 #b898c8 #9078b0 #584880 #88c870 #4a7a40 #ffb030 #f8f0ff'],
    ['Lodestone Mine', 'magnet', 'Iron bars pull the ball in — slide along their undersides through the mine.', 'rough', 'fairway', 'oob', 'caves', 'sparks', 'gears',
      '#3a3028 #8a7058 #6a5a48 #544638 #2e261e #8a9450 #50542c #ff4040 #f4e4c8'],
    ['Clockwork Courtyard', 'door', 'Timed doors swing shut on the beat — shoot only when the way is open.', 'fairway', 'rough', 'oob', 'terraces', 'sparks', 'city',
      '#7aa0c4 #dce8f0 #98a4b0 #78868e #4a5860 #7cb05a #44682e #ffb347 #1e2830'],
    ['Old Faithful Flats', 'geyser', 'Volcanic vents erupt on a schedule, blasting anything above them skyward.', 'rough', 'sand', 'lava', 'mesa', 'embers', 'volcano',
      '#5a3a3a #e8a070 #a06a50 #7e4e3a #4a2a20 #b09a58 #6e5a30 #7ae8ff #fff0e0'],
    ['Trebuchet Ridge', 'catapult', 'Siege catapults arm when you stop on them and fling you over the ramparts.', 'fairway', 'rough', 'oob', 'hills', 'dust', 'ruins',
      '#a8b8c8 #f0ece0 #b8b098 #988e74 #5e5644 #90b058 #566c30 #d04030 #2a2418'],
    ['Sinking Sands', 'quicksand', 'Quicksand troughs swallow any ball that stops — keep it moving.', 'sand', 'fairway', 'oob', 'dunes', 'dust', 'dunes',
      '#e8905a #fcd8a0 #e0b080 #c89060 #8a5a34 #e8c878 #a88848 #a050ff #3a2010'],
    ['Windmill Polders', 'windmill', 'Dutch windmills sweep their blades across every approach.', 'fairway', 'rough', 'water', 'rolling', 'petals', 'hills',
      '#78b8f0 #e0f2ff #b0d0a0 #88b878 #4e7e48 #84cc5c #427834 #ff5a36 #1a2c18'],
    ['Pendulum Pass', 'pendulum', 'Great hammers swing across the mountain pass — slip through between beats.', 'rough', 'fairway', 'oob', 'canyon', 'snow', 'mountains',
      '#4a3a5a #b8a0a8 #7a6a74 #5e5060 #3a2e40 #8a9a62 #4e5a38 #e8b84a #f0e8d8'],
    ["Plumber's Labyrinth", 'pipe', 'Warp pipes snake beneath the hills, spitting balls out far away.', 'fairway', 'rough', 'oob', 'caves', 'none', 'gears',
      '#3a6ad8 #a8d0ff #6a90c8 #4a70a8 #2a4478 #5cc84a #2a8030 #ffd020 #f0f8ff'],
    ['Bubblegum Lagoon', 'bubble', 'Bubbles capture the ball and carry it skyward before they pop.', 'fairway', 'bouncy', 'water', 'islands', 'bubbles', 'waves',
      '#ff9ccc #ffe8f4 #f0b8d8 #d898c0 #9a5a88 #9ae0a0 #4a9a68 #40d8ff #3a1030'],
    ['Molasses Marsh', 'drag', 'Thick, syrupy air slows everything — only firm shots push through.', 'rough', 'fairway', 'water', 'rolling', 'spores', 'forest',
      '#6a7a5a #c8ccb0 #6a7a58 #506044 #2e3a28 #7a9a50 #3a5428 #e0a040 #1a1e12'],
    ['Portal Plateau', 'portal', 'Paired portals re-aim your shot — enter one, emerge pointing a new way.', 'fairway', 'rough', 'oob', 'mesa', 'sparks', 'crystals',
      '#2a1a48 #a060c0 #7a4a8a #5e386e #3a2048 #c09a68 #7a5e3a #ff8a20 #f8e8ff'],
    ['Topsy-Turvy Vaults', 'antigrav', 'Gravity flips in the vaults — balls fall up and rest on the ceilings.', 'fairway', 'rough', 'oob', 'caves', 'stars', 'ruins',
      '#2a2418 #6a5a3a #5a4c34 #483c28 #2a2218 #a08a5a #6a5a38 #40ffd0 #f4ead0'],
    ['Flip-Switch Factory', 'toggle', 'One switch, two sets of walls — flip it to swap which path is open.', 'fairway', 'rough', 'oob', 'terraces', 'sparks', 'gears',
      '#5a6468 #a8b0b0 #7a8480 #606a66 #3a4240 #7a9a58 #3a4630 #ffcc00 #e8eee8'],
    ['Piston Foundry', 'piston', 'Hydraulic pistons punch out of the foundry walls to launch or block the ball.', 'rough', 'fairway', 'lava', 'canyon', 'embers', 'volcano',
      '#2a0e0e #8a2a14 #5a2a20 #441c18 #2a100e #8a6a4a #4a3226 #ffa020 #ffe8d0'],
    ['Blinkstone Bluffs', 'vanish', 'Cliffside platforms blink in and out — land while they are solid.', 'fairway', 'rough', 'oob', 'cliffs', 'stars', 'clouds',
      '#4a6a9a #c8d8f0 #8aa0c0 #6a80a8 #3e5078 #7ac080 #3e7048 #80f0ff #eef4ff'],
    ['Crumbling Citadel', 'crumble', 'Ancient ledges collapse moments after you land — never stand still.', 'rough', 'sand', 'oob', 'spires', 'dust', 'ruins',
      '#3a2a4a #c08a7a #8a5a5a #704444 #482a2a #b89060 #7a5030 #40c0ff #f8e8e0'],
    ['Orbit Observatory', 'gwell', 'Gravity wells bend shots into slingshot orbits around glowing orbs.', 'fairway', 'rough', 'oob', 'spires', 'stars', 'space',
      '#0a1030 #2a3a78 #2a3a5a #22304a #141c30 #4a8a5a #24442e #ffe680 #e0e8ff'],
    ['Sideways Stacks', 'sidegrav', 'Inside the arrow zones gravity points sideways — shots fall left or right.', 'fairway', 'rough', 'oob', 'terraces', 'none', 'city',
      '#e8c040 #fff4c8 #d0b080 #b09060 #6a5434 #88b848 #4a6a28 #2050ff #2a2008'],
    ['Thornback Ridge', 'spikes', 'Bramble spike strips line the ridge — one touch and you are sent back.', 'rough', 'fairway', 'oob', 'hills', 'leaves', 'forest',
      '#4a6a5a #a8c4a0 #6a8a6a #52725a #2c4232 #7a9a50 #3a5228 #ff3a5a #142018'],
    ['Sawmill Gulch', 'saw', 'Buzzsaws race along their tracks through the lumber gulch.', 'rough', 'fairway', 'oob', 'canyon', 'sparks', 'gears',
      '#a8683a #f0d0a0 #b08860 #8a6644 #5a3e28 #a0a850 #626430 #e0e0f0 #2a1808'],
    ['Laser Grid Labs', 'laser', 'Pulsing laser beams switch on and off — read the warning flicker.', 'fairway', 'rough', 'oob', 'terraces', 'sparks', 'city',
      '#05060f #1a1c38 #3a3c58 #2c2e48 #1a1c2e #8890a8 #505868 #ff2050 #e8eaf8'],
    ['Hourglass Hollow', 'slowmo', 'Time drags inside the amber zones — shots slow to a dreamy crawl.', 'fairway', 'sand', 'oob', 'dunes', 'dust', 'dunes',
      '#d89850 #fce8c0 #e0c088 #c8a068 #8a6438 #b8b860 #7a7838 #40e0d0 #3a2408'],
    ['Minefield Mesa', 'mine', 'Proximity mines blast the ball sky-high — turn the explosions into launchers.', 'rough', 'sand', 'oob', 'mesa', 'embers', 'pillars',
      '#3a3028 #c08050 #8a6448 #6e4e38 #44302a #a49058 #6a5a34 #ff5020 #fff0d8'],
    ['Crusher Canyon', 'crusher', 'Stone crushers slam down on a rhythm — shoot under them between drops.', 'rough', 'fairway', 'lava', 'canyon', 'embers', 'volcano',
      '#1a0808 #6a1a10 #4a1a14 #38120e #200a08 #7a5a48 #382620 #ff3a10 #ffd8c0'],
    ['Phantom Phase Fields', 'phase', 'Ghostly blocks fade in and out with each stroke — odd and even shots play different courses.', 'fairway', 'rough', 'oob', 'rolling', 'stars', 'crystals',
      '#1a1630 #3c3060 #4a3c78 #3a2e64 #221a40 #6a9ab8 #3e5470 #6ff0ff #e0f0ff'],
    ['Twister Plains', 'tornado', 'Roaming tornadoes sweep across the plains, lifting any ball they catch.', 'fairway', 'rough', 'oob', 'rolling', 'rain', 'clouds',
      '#46607a #a6bccc #7890a0 #5a7486 #34485a #8aaa62 #4e6a3a #ffd040 #142030'],
    ['Event Horizon', 'blackhole', 'A black hole devours anything that strays too close — ride the edge of its pull.', 'fairway', 'ice', 'oob', 'spires', 'stars', 'space',
      '#000000 #1a0a30 #2a1448 #200e3a #120822 #5a5a7a #2a2a44 #ff8a2a #f0e8ff'],
    ['Mistveil Moor', 'fog', 'Thick moorland fog hides the course; it lifts only around the ball.', 'rough', 'fairway', 'water', 'hills', 'rain', 'hills',
      '#6a8aa0 #c4d4dc #8c9c9a #6e807c #445450 #7aaa66 #426634 #f0a030 #1c2a28'],
    ['Mirage Oasis', 'decoy', 'Fake flags shimmer across the dunes — only one cup is real.', 'sand', 'fairway', 'oob', 'dunes', 'dust', 'dunes',
      '#f0b870 #fff0d0 #e8d0a0 #d8b880 #a8844e #f0d890 #b89a58 #3ad6c4 #3c2810'],
    ['Wandering Green', 'movcup', 'The cup glides back and forth across island greens — lead your putt.', 'fairway', 'rough', 'water', 'islands', 'petals', 'waves',
      '#1ec8d8 #b0f4f0 #ff9c8c #e8746c #a84440 #9ad870 #4a8a40 #ffe04a #0c3038'],
    ['Elevator Summit', 'liftcup', 'The cup rides a rising stone column — time your approach to its height.', 'fairway', 'rough', 'oob', 'spires', 'snow', 'mountains',
      '#6a8ac8 #dcecff #b0c8e8 #90acd4 #5a74a0 #e4f0fc #a0b8d4 #b080ff #1a2440'],
    ["Will-o'-Wisp Woods", 'blinkcup', 'In the haunted woods the cup flickers from spot to spot.', 'fairway', 'rough', 'water', 'cliffs', 'spores', 'mushrooms',
      '#140c30 #48207a #3a2a6a #2c1e58 #1a1038 #3ad4a0 #188a60 #ff2bd6 #f0f0ff'],
    ["Needle's Eye Narrows", 'shrinkcup', 'The cup shrinks with every stroke on these icy ledges — make the first shots count.', 'fairway', 'ice', 'oob', 'cliffs', 'snow', 'crystals',
      '#a0c8ff #fff0fa #d8d8f4 #b8bce8 #7a80b8 #8cd0a0 #5a9a70 #ff70c0 #2a2a50'],
    ['Rising Tide Finale', 'flood', 'The tide climbs with every stroke — finish before the whole course goes under.', 'fairway', 'sand', 'water', 'islands', 'rain', 'waves',
      '#0e3a5a #3a8aa8 #2a6a80 #1e5468 #10303e #b8a878 #6e6444 #50ffb0 #d8f4ff'],
  ];

  const COURSES = DEFS.map((d, i) => {
    const id = 'c' + String(i + 1).padStart(2, '0');
    const cols = d[9].split(' ');
    const palette = {};
    PALETTE_KEYS.forEach((k, j) => { palette[k] = cols[j]; });
    return {
      id, index: i, name: d[0], concept: d[2], gimmick: d[1], palette,
      surface: d[3], altSurface: d[4], hazard: d[5], style: d[6],
      ambient: { particles: d[7], bg: d[8] },
      unlock: { prev: i === 0 ? null : 'c' + String(i).padStart(2, '0') },
      // backward-compat
      tier: 1, chaos: 0, primary: d[1], secondary: null,
    };
  });

  const byId = {};
  COURSES.forEach((c) => { byId[c.id] = c; });
  const introducedBy = {};
  COURSES.forEach((c) => { if (c.gimmick) introducedBy[c.gimmick] = c.id; });

  // backward-compat aliases
  const TIERS = ['Courses'];
  const THEME_PACKS = PACKS.map((p) => ({ id: p.id, name: p.name, gimmicks: p.gimmicks, surfaces: [] }));

  const HEX = /^#[0-9a-fA-F]{6}$/;

  function validate() {
    const e = [];
    if (COURSES.length !== 60) e.push('expected 60 courses, got ' + COURSES.length);
    if (GIMMICKS.length !== 59) e.push('expected 59 gimmicks, got ' + GIMMICKS.length);
    if (new Set(GIMMICKS).size !== GIMMICKS.length) e.push('GIMMICKS has duplicates');
    const ids = new Set(), names = new Set(), pairs = new Set(), seen = new Set();
    const sig = {}, styleCount = {}, introCount = {};
    COURSES.forEach((c, i) => {
      const p = (c && c.id ? c.id : '#' + i) + ': ';
      const id = 'c' + String(i + 1).padStart(2, '0');
      if (c.id !== id) e.push(p + 'expected id ' + id);
      if (c.index !== i) e.push(p + 'bad index');
      if (ids.has(c.id)) e.push(p + 'duplicate id');
      ids.add(c.id);
      if (typeof c.name !== 'string' || !c.name) e.push(p + 'missing name');
      if (names.has(c.name)) e.push(p + 'duplicate name ' + c.name);
      names.add(c.name);
      if (typeof c.concept !== 'string' || c.concept.length < 10) e.push(p + 'missing concept');
      if (i === 0) {
        if (c.gimmick !== null) e.push(p + 'c01 gimmick must be null');
      } else {
        if (GIMMICKS.indexOf(c.gimmick) < 0) e.push(p + 'unknown gimmick ' + c.gimmick);
        else if (seen.has(c.gimmick)) e.push(p + 'gimmick ' + c.gimmick + ' already introduced');
        if (c.gimmick !== GIMMICKS[i - 1]) e.push(p + 'gimmick out of introduction order (expected ' + GIMMICKS[i - 1] + ')');
        seen.add(c.gimmick);
        introCount[c.gimmick] = (introCount[c.gimmick] || 0) + 1;
      }
      const key = c.gimmick + '|' + c.surface;
      if (pairs.has(key)) e.push(p + 'duplicate (gimmick,surface) ' + key);
      pairs.add(key);
      if (c.gimmick) sig[c.gimmick] = (sig[c.gimmick] || 0) + 1;
      if (!c.palette) e.push(p + 'missing palette');
      else PALETTE_KEYS.forEach((k) => { if (!HEX.test(c.palette[k] || '')) e.push(p + 'bad palette.' + k); });
      if (SURFACES.indexOf(c.surface) < 0) e.push(p + 'bad surface');
      if (SURFACES.indexOf(c.altSurface) < 0) e.push(p + 'bad altSurface');
      if (c.surface === c.altSurface) e.push(p + 'altSurface equals surface');
      if (HAZARDS.indexOf(c.hazard) < 0) e.push(p + 'bad hazard');
      if (STYLES.indexOf(c.style) < 0) e.push(p + 'bad style');
      styleCount[c.style] = (styleCount[c.style] || 0) + 1;
      if (!c.ambient || PARTICLES.indexOf(c.ambient.particles) < 0) e.push(p + 'bad ambient.particles');
      if (!c.ambient || BGS.indexOf(c.ambient.bg) < 0) e.push(p + 'bad ambient.bg');
      if (i > 0 && c.ambient && COURSES[i - 1].ambient && c.ambient.bg === COURSES[i - 1].ambient.bg) e.push(p + 'same bg as previous course');
      const prev = i === 0 ? null : COURSES[i - 1].id;
      if (!c.unlock || c.unlock.prev !== prev) e.push(p + 'bad unlock.prev');
      if ('music' in c) e.push(p + 'music field not allowed');
      if (byId[c.id] !== c) e.push(p + 'byId mismatch');
    });
    GIMMICKS.forEach((g) => {
      if (introCount[g] !== 1) e.push('gimmick ' + g + ' introduced ' + (introCount[g] || 0) + ' times');
      if ((sig[g] || 0) > 3) e.push('gimmick ' + g + ' is signature of ' + sig[g] + ' courses (max 3)');
      if (introducedBy[g] !== (COURSES[GIMMICKS.indexOf(g) + 1] || {}).id) e.push('introducedBy wrong for ' + g);
      const info = GIMMICK_INFO[g];
      if (!info || !info.name || !info.desc || !info.tip) e.push('GIMMICK_INFO incomplete for ' + g);
    });
    Object.keys(GIMMICK_INFO).forEach((g) => { if (GIMMICKS.indexOf(g) < 0) e.push('GIMMICK_INFO has unknown type ' + g); });
    STYLES.forEach((s) => { if ((styleCount[s] || 0) < 4) e.push('style ' + s + ' used fewer than 4 times'); });
    const packed = {};
    PACKS.forEach((pk) => pk.gimmicks.forEach((g) => {
      packed[g] = (packed[g] || 0) + 1;
      if (GIMMICKS.indexOf(g) < 0) e.push('pack ' + pk.id + ' has unknown gimmick ' + g);
    }));
    GIMMICKS.forEach((g) => { if (packed[g] !== 1) e.push('gimmick ' + g + ' in ' + (packed[g] || 0) + ' packs'); });
    if (PACKS.length !== 7) e.push('expected 7 packs');
    return e;
  }

  return { COURSES, STYLES, SURFACES, HAZARDS, PARTICLES, BGS, PALETTE_KEYS, GIMMICKS, GIMMICK_INFO, PACKS, introducedBy, byId,
    TIERS, THEME_PACKS, validate };
});
