// Story Mode 2.0, floor 1: "Basement · Legacy Server Room" (8 PM). Prototype layout (M1).
// Format: .claude/context/design/11_STORY_MODE_2.md §4. Coordinates in world px (7200 × 4800).
//
//   ┌──────────────┬──────────────┬──────────────┐  y 150
//   │ SERVER ROOM  │ OPEN OFFICE  │ RECORDS      │  nest + lock-in · bug packs · stairs up
//   │  (nest)      │  (infested)  │  (keycard)   │
//   ├──[lock-in]───┴───[open]─────┴──[keycard]───┤  y 1850
//   │                 HALLWAY                    │
//   ├──[open]──────┬───[open]─────┬──[glass]─────┤  y 2950
//   │ LOBBY        │ BREAK ROOM   │ MANAGER      │  spawn · fountain + shop · Ops (joins)
//   └──────────────┴──────────────┴──────────────┘  y 4650
const W = 60;   // partition thickness
const seg = (look, x1, y1, x2, y2, w = W) => ({ kind: 'seg', look, x1, y1, x2, y2, w });
const rect = (look, x, y, w, h) => ({ kind: 'rect', look, x, y, w, h });
const plant = (x, y, r = 60) => ({ kind: 'circle', look: 'plant', x, y, r });

export default {
  id: 'f1',
  name: 'Basement · Legacy Server Room',
  clock: '8:00 PM',
  w: 7200, h: 4800,
  spawn: { x: 900, y: 3900 },
  breakRoom: { x: 3600, y: 3850 },          // fountain: heal, shop, respawn
  startLevel: 3, startGold: 600,

  rooms: [
    { id: 'server',  name: 'Server Room',       rect: [150, 150, 2300, 1700], kind: 'nest' },
    { id: 'office',  name: 'Open Office',       rect: [2450, 150, 2300, 1700], kind: 'infested' },
    { id: 'records', name: 'Records Archive',   rect: [4750, 150, 2300, 1700], kind: 'keycard' },
    { id: 'hall',    name: 'Hallway',           rect: [150, 1850, 6900, 1100], kind: 'calm' },
    { id: 'lobby',   name: 'Stairwell Lobby',   rect: [150, 2950, 2300, 1700], kind: 'calm' },
    { id: 'break',   name: 'Break Room',        rect: [2450, 2950, 2300, 1700], kind: 'break' },
    { id: 'manager', name: "Manager's Office",  rect: [4750, 2950, 2300, 1700], kind: 'calm' },
  ],

  walls: [
    // perimeter
    seg('partition', 150, 150, 7050, 150), seg('partition', 150, 4650, 7050, 4650),
    seg('partition', 150, 150, 150, 4650), seg('partition', 7050, 150, 7050, 4650),
    // hallway, north side (door gaps: server 1100–1400 · office 3400–3800 · records 5800–6100)
    seg('glass', 150, 1850, 1100, 1850), seg('cubicles', 1400, 1850, 3400, 1850),
    seg('partition', 3800, 1850, 5800, 1850), seg('partition', 6100, 1850, 7050, 1850),
    // hallway, south side (gaps: lobby 1000–1400 · break room 3400–3800 · manager 5800–6100)
    seg('partition', 150, 2950, 1000, 2950), seg('partition', 1400, 2950, 3400, 2950),
    seg('partition', 3800, 2950, 5800, 2950), seg('glass', 6100, 2950, 7050, 2950),
    // room dividers
    seg('partition', 2450, 150, 2450, 1850), seg('shelf', 4750, 150, 4750, 1850),
    seg('partition', 2450, 2950, 2450, 4650), seg('glass', 4750, 2950, 4750, 4650),
    // server room: racks
    rect('rack', 420, 380, 120, 380), rect('rack', 720, 380, 120, 380),
    rect('rack', 1660, 380, 120, 380), rect('rack', 1960, 380, 120, 380),
    rect('rack', 420, 1150, 120, 380), rect('rack', 1960, 1150, 120, 380),
    // open office: cubicle blocks
    rect('cubicle', 2750, 430, 380, 230), rect('cubicle', 3420, 430, 380, 230), rect('cubicle', 4080, 430, 380, 230),
    rect('cubicle', 2750, 1120, 380, 230), rect('cubicle', 4080, 1120, 380, 230),
    // records: shelves
    seg('shelf', 5150, 480, 5150, 1300), seg('shelf', 5650, 480, 5650, 1300), seg('shelf', 6150, 760, 6150, 1500),
    // hallway props (clear of every door gap)
    rect('copier', 2080, 2030, 170, 110), plant(2950, 2860), plant(4650, 2060), rect('copier', 6550, 2760, 170, 110),
    // lobby
    rect('sofa', 1650, 3380, 280, 110), plant(400, 4420), plant(2250, 4420),
    // break room
    { kind: 'circle', look: 'cooler', x: 2680, y: 3170, r: 45 }, rect('sofa', 4150, 4330, 320, 110),
    // manager's office
    rect('desk', 5750, 3420, 320, 150), plant(6820, 4420), plant(4980, 3180),
  ],

  // Doors sit in the wall gaps. A closed door is a wall for movement (nav.setDynamic).
  //   lockin  — open; closes when you step into `room` while its bugs / nests live, reopens when cleared
  //   keycard — locked until the party holds `key`
  //   auto    — glass slider, never blocks (looks only)
  doors: [
    { id: 'd_server',  kind: 'lockin',  room: 'server',  x1: 1100, y1: 1850, x2: 1400, y2: 1850 },
    { id: 'd_records', kind: 'keycard', key: 'blue',     x1: 5800, y1: 1850, x2: 6100, y2: 1850 },
    { id: 'd_manager', kind: 'auto',                     x1: 5800, y1: 2950, x2: 6100, y2: 2950 },
  ],

  bushes: [
    { kind: 'circle', x: 3620, y: 1500, r: 120 },                       // office: between the cubicles
    { kind: 'seg', x1: 2700, y1: 1660, x2: 3150, y2: 1660, w: 140 },    // office: along the hallway wall
    { kind: 'seg', x1: 4320, y1: 2120, x2: 4320, y2: 2680, w: 150 },    // hallway: hide from the patrols
    { kind: 'circle', x: 2850, y: 4330, r: 110 },                       // break room
  ],

  packs: [
    { room: 'office', kind: 'bug_null',    at: { x: 3050, y: 880 },  n: 3 },
    { room: 'office', kind: 'bug_ladybug', at: { x: 3700, y: 880 },  n: 3 },
    { room: 'office', kind: 'bug_null',    at: { x: 4300, y: 1550 }, n: 2 },
    { room: 'hall',   kind: 'bug_ladybug', at: { x: 4900, y: 2400 }, n: 2 },
    { room: 'server', kind: 'bug_beetle',  at: { x: 1250, y: 1350 }, n: 2 },
    { room: 'records', kind: 'bug_race',   at: { x: 6400, y: 1100 }, n: 2 },
  ],

  nests: [
    { id: 'n_server', room: 'server', at: { x: 1250, y: 720 }, spawns: ['bug_null', 'bug_beetle', 'bug_null'], everyMs: 5000, cap: 5,
      drops: { kind: 'keycard', key: 'blue' } },
  ],

  npcs: [
    { id: 'npc_ops', champ: 'ops', name: 'Ops', at: { x: 5900, y: 3900 }, joins: true, script: [
      { who: 'ops', line: 'Intern?! You are still here? The Null Crew cut the elevators on their way to the roof.' },
      { who: 'ops', line: 'The stairwell up is in the Records Archive, behind the blue keycard door.' },
      { who: 'ops', line: 'The keycard was in the Server Room... which is a bug nest now. I am coming with you.' },
    ] },
  ],

  pickups: [
    { kind: 'coffee', at: { x: 600, y: 3300 } },
    { kind: 'note', at: { x: 1900, y: 4300 }, text: 'Sticky note: "AURORA v1.0 ships at MIDNIGHT. Do NOT let anyone touch the release branch." — CTO' },
    { kind: 'gold', at: { x: 2250, y: 330 }, amount: 80 },
    { kind: 'coffee', at: { x: 4500, y: 330 } },
    { kind: 'gold', at: { x: 5400, y: 900 }, amount: 120 },
  ],

  exit: { x: 6750, y: 480, r: 150, label: 'STAIRS UP · 1F' },

  script: {
    intro: [
      { who: 'duck', line: 'QUACK! Wake up, intern! It is 8 PM and AURORA v1.0 is gone.' },
      { who: 'duck', line: "0xDEAD's Null Crew stole it and ran for the roof. We go up, floor by floor." },
      { who: 'duck', line: 'Right-click to move and attack. Q W E R are your skills. Find a way out of the basement.' },
    ],
    rooms: {
      office: [{ who: 'duck', line: 'Bugs everywhere. Plants hide you: bugs cannot see you inside one.' }],
      break: [{ who: 'duck', line: 'The break room heals you, and the vending machine takes gold. Press P to shop.' }],
      server: [{ who: 'duck', line: 'A bug nest! The door locked behind us. Smash the nest and everything it spawns.' }],
      records: [{ who: 'duck', line: 'The stairwell! Walk onto the stairs when you are ready to go up.' }],
      manager: [{ who: 'duck', line: 'Somebody is still here. Walk up and talk to them.' }],
    },
    nestDown: [{ who: 'duck', line: 'The nest is down and it dropped the blue keycard. Grab it!' }],
    keycard: [{ who: 'duck', line: 'Blue keycard! It opens the Records Archive door, north side of the hallway.' }],
    doorOpen: [{ who: 'duck', line: 'Door open. The stairs up are inside.' }],
    locked: [{ who: 'duck', line: 'Locked. That door needs the blue keycard.' }],
    cleared: [{ who: 'duck', line: 'Basement cleared! Next stop: 1F, the Open Office. (Coming soon.)' }],
  },
};
