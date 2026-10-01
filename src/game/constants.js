// Central constants: modes, difficulties, quality presets, storage keys.
export const MODES = {
  circuit: {
    id: 'circuit',
    name: 'CIRCUIT',
    desc: 'Classic wheel-to-wheel racing. 2 laps, 5 AI rivals, checkpoints.',
    laps: 2,
    racers: 5,
    traffic: 0.35,
  },
  sprint: {
    id: 'sprint',
    name: 'HIGHWAY SPRINT',
    desc: 'Point-to-point dash through heavy traffic. Overtake, draft, survive.',
    laps: 1,
    racers: 5,
    traffic: 1.0,
    sprint: true,
  },
  timeattack: {
    id: 'timeattack',
    name: 'TIME ATTACK',
    desc: 'You against the clock. 3 laps, split times, local best saved.',
    laps: 3,
    racers: 0,
    traffic: 0.25,
    solo: true,
  },
};

export const DIFFICULTIES = {
  easy:   { id: 'easy',   name: 'EASY',   aiTop: 0.86, aiGrip: 0.85, aiError: 0.055, aiAggr: 0.5,  trafficSpeed: 0.9 },
  normal: { id: 'normal', name: 'NORMAL', aiTop: 0.94, aiGrip: 0.95, aiError: 0.028, aiAggr: 0.75, trafficSpeed: 1.0 },
  hard:   { id: 'hard',   name: 'HARD',   aiTop: 1.0,  aiGrip: 1.0,  aiError: 0.012, aiAggr: 1.0,  trafficSpeed: 1.08 },
};

export const QUALITY = {
  low:    { particles: 500,  traffic: 10, shadows: 0,    shadowSize: 512,  envDetail: 0.45, dpr: 1 },
  medium: { particles: 1100, traffic: 16, shadows: 1,    shadowSize: 1024, envDetail: 0.75, dpr: 1.25 },
  high:   { particles: 1800, traffic: 24, shadows: 1,    shadowSize: 2048, envDetail: 1.0,  dpr: 1.5 },
};
// auto -> resolved at race start by a quick heuristic + runtime downgrade guard
export const QUALITY_AUTO = 'auto';

export const STORE = {
  settings: 'velocity-rush:settings:v1',
  bests: 'velocity-rush:bests:v1',
  records: 'velocity-rush:records:v1',
  pilot: 'velocity-rush:pilot:v1',
  unlocks: 'velocity-rush:unlocks:v1',
};

export const TRAFFIC_TYPES = [
  { id: 'compact', name: 'Compact',  len: 3.6, w: 1.7, h: 1.35, speed: [16, 24], colors: [0x9aa7c4, 0xc4b49a, 0x7fa3c4] },
  { id: 'sedan',   name: 'Sedan',    len: 4.4, w: 1.85, h: 1.4,  speed: [18, 27], colors: [0x3a4a63, 0x6b7280, 0x8a2f3c, 0xd8d8d8] },
  { id: 'suv',     name: 'SUV',      len: 4.7, w: 1.95, h: 1.75, speed: [17, 25], colors: [0x2f3b2f, 0x4a4a52, 0x7a6a55] },
  { id: 'van',     name: 'Van',      len: 5.2, w: 2.0,  h: 2.1,  speed: [15, 22], colors: [0xd8d8d8, 0x3f6fb5, 0xb5b5b5] },
  { id: 'truck',   name: 'Truck',    len: 8.5, w: 2.4,  h: 2.9,  speed: [14, 20], colors: [0xb5433a, 0x3a6eb5, 0xd8d8d8, 0x3f8a5a] },
];
