// 6 original fictional sports cars. All names, shapes and stats are invented.
export const CARS = [
  {
    id: 'vortex',
    name: 'VORTEX S',
    tagline: 'Balanced sports coupe',
    desc: 'The all-rounder. Predictable, quick and forgiving — the perfect first car.',
    color: 0x1e6fff, accent: 0x9fd0ff,
    stats: { topSpeed: 78, accel: 23, handling: 0.82, braking: 31, nitro: 1.0, weight: 1.0 },
    body: { style: 'coupe', len: 4.4, wide: 2.0, low: 0.62, cabin: 0.42, spoiler: 'lip', nose: 0.9 },
  },
  {
    id: 'falcon',
    name: 'FALCON X',
    tagline: 'Extreme top speed',
    desc: 'Blisteringly fast on straights, nervous in corners. For brave drivers.',
    color: 0xd21f2e, accent: 0xffb3ab,
    stats: { topSpeed: 89, accel: 26, handling: 0.62, braking: 28, nitro: 1.15, weight: 0.95 },
    body: { style: 'wedge', len: 4.5, wide: 1.95, low: 0.55, cabin: 0.5, spoiler: 'wing', nose: 1.15 },
  },
  {
    id: 'dart',
    name: 'DART RS',
    tagline: 'Agile sprinter',
    desc: 'Explosive acceleration and razor steering. Owns the twisty sections.',
    color: 0xffb020, accent: 0xffe1a1,
    stats: { topSpeed: 74, accel: 31, handling: 0.95, braking: 33, nitro: 0.95, weight: 0.9 },
    body: { style: 'hatch', len: 4.1, wide: 1.95, low: 0.68, cabin: 0.35, spoiler: 'none', nose: 0.7 },
  },
  {
    id: 'mammoth',
    name: 'MAMMOTH GT',
    tagline: 'Heavy and planted',
    desc: 'A heavyweight grand tourer. Shrugs off contact and stays glued at speed.',
    color: 0x2f3542, accent: 0x8a93a8,
    stats: { topSpeed: 76, accel: 19, handling: 0.7, braking: 29, nitro: 1.05, weight: 1.35 },
    body: { style: 'muscle', len: 4.7, wide: 2.1, low: 0.72, cabin: 0.45, spoiler: 'ducktail', nose: 1.0 },
  },
  {
    id: 'sylph',
    name: 'SYLPH R',
    tagline: 'Cornering specialist',
    desc: 'Surgical precision through chicanes. Carries speed where others brake.',
    color: 0x12b886, accent: 0xb2f2dd,
    stats: { topSpeed: 75, accel: 22, handling: 1.0, braking: 35, nitro: 0.9, weight: 0.92 },
    body: { style: 'roadster', len: 4.2, wide: 1.9, low: 0.6, cabin: 0.55, spoiler: 'lip', nose: 0.8 },
  },
  {
    id: 'apexone',
    name: 'APEX ONE',
    tagline: 'Unlockable hypercar',
    desc: 'Prototype hypercar. Absurd in every stat. Win any race to unlock.',
    color: 0x8a1fff, accent: 0xd9b8ff, locked: true,
    stats: { topSpeed: 96, accel: 33, handling: 0.86, braking: 36, nitro: 1.3, weight: 0.88 },
    body: { style: 'hyper', len: 4.6, wide: 2.05, low: 0.52, cabin: 0.5, spoiler: 'active', nose: 1.2 },
  },
];

export function getCar(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}
// 0..100 normalized display values for the stat bars
export function carStatBars(car) {
  const s = car.stats;
  return [
    { label: 'TOP SPEED', v: Math.round(((s.topSpeed - 60) / 40) * 100) },
    { label: 'ACCEL', v: Math.round(((s.accel - 15) / 20) * 100) },
    { label: 'HANDLING', v: Math.round(s.handling * 100) },
    { label: 'BRAKING', v: Math.round(((s.braking - 24) / 14) * 100) },
    { label: 'NITRO', v: Math.round(((s.nitro - 0.7) / 0.7) * 100) },
    { label: 'WEIGHT', v: Math.round(((s.weight - 0.8) / 0.6) * 100) },
  ].map((b) => ({ ...b, v: Math.max(4, Math.min(100, b.v)) }));
}
