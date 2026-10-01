// Three original fictional circuits, composed from road modules.
import { S, C, TUN, BRU, BRD, JUMP, CHIC, CHL } from '../game/track.js';

export const TRACKS = [
  {
    id: 'azure',
    name: 'AZURE COAST',
    env: 'coast',
    roadWidth: 15,
    sprintFrac: 0.72,
    tagline: 'Sun-soaked seaside highway',
    desc: 'High-speed coastal highway with ocean views, a harbor tunnel, a bay bridge and a kicker jump on the back straight.',
    features: ['Ocean & port', 'Harbor tunnel', 'Bay bridge', 'Kicker jump', 'Heavy traffic'],
    modules: [
      S(520),                                  // main straight — start/finish
      C(150, 90),
      S(200), TUN(260), S(180),                // 640 — harbor tunnel
      C(150, 90),
      S(200), BRU(120, 7), S(80, { bridge: true }), BRD(120, 7), // 520 — bay bridge
      C(150, 90),
      S(160), JUMP(), S(260),                  // 490 — back straight with kicker
      C(150, 90),
    ],
  },
  {
    id: 'ridge',
    name: 'THUNDER RIDGE',
    env: 'mountain',
    roadWidth: 12.5,
    sprintFrac: 0.7,
    tagline: 'Twisty mountain pass',
    desc: 'Technical mountain pass with S-curves, big elevation changes and a tunnel bored through the peak. Braking matters here.',
    features: ['Elevation ±28 m', 'S-curves', 'Peak tunnel', 'Sharp crests', 'Light traffic'],
    modules: [
      S(400),                                  // valley straight
      C(90, 90),
      S(200, { dy: 14 }), CHIC(40, 55), S(294.47, { dy: 14 }), // 560 climb (exact value fixed below)
      C(90, 90),
      S(180), TUN(220),                        // 400 — through the peak
      C(90, 90),
      S(200, { dy: -14 }), CHIC(45, 50), S(201.06, { dy: -14 }), // 470 descent
      C(90, 90),
    ],
  },
  {
    id: 'neonbay',
    name: 'NEON BAY',
    env: 'neon',
    roadWidth: 14,
    sprintFrac: 0.74,
    tagline: 'Night city expressway',
    desc: 'Neon-drenched night expressway: elevated highway, downtown tunnel and 90° city corners on rain-slick asphalt.',
    features: ['Night + rain gloss', 'Elevated highway', 'Downtown tunnel', 'Neon district', 'Dense traffic'],
    modules: [
      S(460),                                  // neon straight
      C(110, 90),
      S(220), TUN(180), S(200),                // 600 — downtown tunnel
      C(110, 90),
      S(180), BRU(110, 9), S(60, { bridge: true }), BRD(110, 9), // 460 — elevated highway
      C(110, 90),
      S(200), CHIC(50, 40), S(225.72),         // 490 — city S-curves
      C(110, 90),
    ],
  },
];

// Fix the ridge climb straight to be exactly 560 m (chicane length is analytic).
TRACKS[1].modules[2] = S(200, { dy: 14 });
TRACKS[1].modules[3] = CHIC(40, 55);
TRACKS[1].modules[4] = S(560 - 200 - CHL(40, 55), { dy: 14 });

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
