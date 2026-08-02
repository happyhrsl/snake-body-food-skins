'use client';

import { useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════════════════════
//  SLITHER.IO — ACCURATE RECREATION
// ═══════════════════════════════════════════════════════════

// ─── Tuning Constants ─────────────────────────────────────
const MAP_RADIUS = 32000;          // Real slither.io: 64,000×64,000 (radius 32,000)
const BASE_SPEED = 2.0;
const BOOST_SPEED = 3.8;
const TURN_RATE_MIN = 0.020;     // Turn rate at max fatness
const TURN_RATE_MAX = 0.060;     // Turn rate at min size
const BOOST_TURN_RATE = 0.020;  // Boost always uses slow turn (intentional)
const SEG_SPACING = 4.5;
const FOOD_EAT_RADIUS = 2;
const FOOD_COUNT = 4000;          // Scaled up for 8x larger map area
const BOT_COUNT = 10;
const INITIAL_SEGMENTS = 10;      // Real slither.io: start with 10 segments
const MIN_SEGMENTS = 10;          // Can drain below initial via boost
const BOOST_DRAIN_RATE = 10;       // 6 pellets/sec at 60fps (60/6=10 frames)
const COLLISION_SKIP = 3;
const MAX_SEGMENTS = 400;          // Real slither.io: 400 hard cap
const MIN_BODY_RADIUS = 14;       // Real slither.io: 14px spawn radius
const MAX_BODY_RADIUS = 30;       // Real slither.io: 30px cap (thickness = main growth past ~250)
const MAX_SCORE = 50000;

// ─── Mutable Game Config (admin panel writes here) ─────
const CFG: Record<string, number> = {
  // Map
  MAP_RADIUS: MAP_RADIUS,
  // Snake
  INITIAL_SEGMENTS: INITIAL_SEGMENTS,
  MIN_SEGMENTS: MIN_SEGMENTS,
  MAX_SEGMENTS: MAX_SEGMENTS,
  MIN_BODY_RADIUS: MIN_BODY_RADIUS,
  MAX_BODY_RADIUS: MAX_BODY_RADIUS,
  // Speed
  BASE_SPEED: BASE_SPEED,
  BOOST_SPEED: BOOST_SPEED,
  TURN_RATE_MIN: TURN_RATE_MIN,
  TURN_RATE_MAX: TURN_RATE_MAX,
  BOOST_TURN_RATE: BOOST_TURN_RATE,
  SEG_SPACING: SEG_SPACING,
  // Food
  FOOD_EAT_RADIUS: FOOD_EAT_RADIUS,
  FOOD_COUNT: FOOD_COUNT,
  BOT_COUNT: BOT_COUNT,
  // Boost
  BOOST_DRAIN_RATE: BOOST_DRAIN_RATE,
  // Growth: simple linear — GROWTH_COST food points per segment
  GROWTH_COST: 6,
  // Food tier values
  FOOD_S_VALUE: 1,
  FOOD_M_VALUE: 3,
  FOOD_L_VALUE: 5,
  FOOD_S_CHANCE: 0.93,
  FOOD_M_CHANCE: 0.04,
  FOOD_L_CHANCE: 0.03,
  // Score
  MAX_SCORE: MAX_SCORE,
  // Collision
  COLLISION_SKIP: COLLISION_SKIP,
  // Camera
  MIN_ZOOM: 0.12,              // Max zoom-out threshold
  ZOOM_LERP: 0.015,            // Camera zoom smoothing speed (delayed feel)
  // Body radius curve: R = MIN + (MAX-MIN) * t^RADIUS_POWER
  RADIUS_POWER: 0.6,           // <1 = fast early growth, >1 = slow early / fast late
  // Bot AI
  BOT_FOOD_RANGE: 1500,        // How far bots search for food (px)
  BOT_RESPAWN_TIME: 180,       // Frames before bot respawns
  BOT_MIN_SEGS: 10,            // Min starting segments for bots
  BOT_MAX_SEGS: 50,            // Max starting segments for bots
  BOUNDARY_WARN_PCT: 0.92,     // Bot turns toward center at this % of map radius
  BOUNDARY_DANGER_PCT: 0.96,   // Bot boosts toward center at this %
  // 3D Effects
  HIGHLIGHT_OFFSET: 0.35,      // Light position offset for 3D gradient
  HIGHLIGHT_BRIGHT: 70,         // Highlight brightness boost
  SHADOW_DARK: 55,              // Shadow darkness
  HEAD_SIZE_MULT: 1.05,         // Head radius multiplier vs body
  // Bite Effect
  BITE_DARKEN_CENTER: 0.7,     // Center opacity of bite shadow
  BITE_DARKEN_MID: 0.4,        // Mid opacity of bite shadow
  BITE_TINT_OPACITY: 0.25,     // Skin color tint on bite area
  // Camera
  CAM_FOLLOW_SPEED: 0.08,      // Camera follow lerp speed
  // Food Drop
  BOOST_DROP_VALUE: 1,          // Food value dropped while boosting
  BOOST_DROP_SPREAD: 2,         // Lateral spread of boost drops
  // Instant Boost Burst
  BOOST_INSTANT_DROP: 3,        // Food orbs dropped the moment boost activates (0 = off)
  BOOST_INSTANT_VALUE: 1,       // Food value of instant burst orbs
  DEATH_DROP_L_CHANCE: 0.12,   // Chance of L tier food on death
  DEATH_DROP_M_CHANCE: 0.35,   // Chance of M tier food on death
  DEATH_DROP_MAX: 200,          // Max food items from a single death
  // Score
  SCORE_PER_POINT: 1,           // Score gained per food point eaten
  // Growth & Boost Score
  GROWTH_MULTIPLIER: 1.0,       // Multiplier on food value when eating (1=normal, 2=double growth, 0.5=half)
  BOOST_SCORE_DRAIN: 5,         // Score drained per second while boosting at min segments (0=off)
  BOOST_MIN_SCORE: 0,           // Minimum score required to activate boost (0=always)
  // Tiered boost drops — value of orbs increases with score
  BOOST_DROP_TIER2_SCORE: 1000, // Score threshold for tier 2 drop value
  BOOST_DROP_TIER2_VALUE: 3,    // Food value of boost orbs when score >= tier2 threshold
  BOOST_DROP_TIER3_SCORE: 5000, // Score threshold for tier 3 drop value
  BOOST_DROP_TIER3_VALUE: 5,    // Food value of boost orbs when score >= tier3 threshold
  // Food Radii
  FOOD_S_RADIUS: 3,             // S tier food visual radius
  FOOD_M_RADIUS: 4.5,           // M tier food visual radius
  FOOD_L_RADIUS: 6,             // L tier food visual radius
  // Grid & Visual
  GRID_SIZE: 100,               // Grid line spacing in world units
  // Food management
  FOOD_CAP_MULT: 3,             // Max food = FOOD_COUNT * this
};

// ─── CFG Persistence (survives reload / hot-reload) ─────
function saveCFG() {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('snake_cfg', JSON.stringify(CFG)); } catch {}
}
function loadCFG() {
  try {
    const s = typeof localStorage !== 'undefined' && localStorage.getItem('snake_cfg');
    if (!s) return;
    const parsed = JSON.parse(s);
    // Check ALL values before applying — if any is NaN/Infinity, discard entire saved config
    for (const k in parsed) {
      if (typeof parsed[k] === 'number' && !isFinite(parsed[k])) {
        // Corrupted config — clear it and use defaults
        try { localStorage.removeItem('snake_cfg'); } catch {}
        return;
      }
    }
    for (const k in parsed) { if (k in CFG) CFG[k] = parsed[k]; }
  } catch { try { localStorage.removeItem('snake_cfg'); } catch {} }
  // Safety: clamp critical values to prevent crashes
  if (!isFinite(CFG.MAP_RADIUS) || CFG.MAP_RADIUS < 500) CFG.MAP_RADIUS = 32000;
  if (!isFinite(CFG.MAX_SEGMENTS) || CFG.MAX_SEGMENTS < 10) CFG.MAX_SEGMENTS = 400;
  if (!isFinite(CFG.MIN_ZOOM) || CFG.MIN_ZOOM <= 0) CFG.MIN_ZOOM = 0.12;
  if (!isFinite(CFG.ZOOM_LERP) || CFG.ZOOM_LERP <= 0) CFG.ZOOM_LERP = 0.015;
  if (!isFinite(CFG.INITIAL_SEGMENTS) || CFG.INITIAL_SEGMENTS < 1) CFG.INITIAL_SEGMENTS = 10;
  if (!isFinite(CFG.CAM_FOLLOW_SPEED) || CFG.CAM_FOLLOW_SPEED <= 0) CFG.CAM_FOLLOW_SPEED = 0.08;
  if (!isFinite(CFG.MAX_BODY_RADIUS) || CFG.MAX_BODY_RADIUS < 1) CFG.MAX_BODY_RADIUS = 30;
  if (!isFinite(CFG.MIN_BODY_RADIUS) || CFG.MIN_BODY_RADIUS < 1) CFG.MIN_BODY_RADIUS = 14;
  if (!isFinite(CFG.GROWTH_MULTIPLIER) || CFG.GROWTH_MULTIPLIER <= 0) CFG.GROWTH_MULTIPLIER = 1.0;
  if (!isFinite(CFG.BOOST_SCORE_DRAIN) || CFG.BOOST_SCORE_DRAIN < 0) CFG.BOOST_SCORE_DRAIN = 5;
  if (!isFinite(CFG.BOOST_MIN_SCORE) || CFG.BOOST_MIN_SCORE < 0) CFG.BOOST_MIN_SCORE = 0;
  if (!isFinite(CFG.BOOST_DROP_TIER2_SCORE) || CFG.BOOST_DROP_TIER2_SCORE < 0) CFG.BOOST_DROP_TIER2_SCORE = 1000;
  if (!isFinite(CFG.BOOST_DROP_TIER2_VALUE) || CFG.BOOST_DROP_TIER2_VALUE <= 0) CFG.BOOST_DROP_TIER2_VALUE = 3;
  if (!isFinite(CFG.BOOST_DROP_TIER3_SCORE) || CFG.BOOST_DROP_TIER3_SCORE < 0) CFG.BOOST_DROP_TIER3_SCORE = 5000;
  if (!isFinite(CFG.BOOST_DROP_TIER3_VALUE) || CFG.BOOST_DROP_TIER3_VALUE <= 0) CFG.BOOST_DROP_TIER3_VALUE = 5;
}
loadCFG(); // restore saved settings on module load

// Admin panel parameter definitions
interface AdminParam { key: string; label: string; min: number; max: number; step: number; unit?: string; }
interface AdminSection { title: string; params: AdminParam[]; }
const ADMIN_SECTIONS: AdminSection[] = [
  { title: 'MAP & GRID', params: [
    { key: 'MAP_RADIUS', label: 'Map Radius', min: 1000, max: 192000, step: 500 },
    { key: 'GRID_SIZE', label: 'Grid Size', min: 10, max: 1500, step: 10 },
  ]},
  { title: 'SNAKE BODY', params: [
    { key: 'INITIAL_SEGMENTS', label: 'Start Length', min: 1, max: 150, step: 1 },
    { key: 'MIN_SEGMENTS', label: 'Min Length', min: 1, max: 60, step: 1 },
    { key: 'MAX_SEGMENTS', label: 'Max Length', min: 10, max: 6000, step: 10 },
    { key: 'MIN_BODY_RADIUS', label: 'Min Thick', min: 1, max: 75, step: 1 },
    { key: 'MAX_BODY_RADIUS', label: 'Max Thick', min: 5, max: 300, step: 1 },
    { key: 'SEG_SPACING', label: 'Seg Spacing', min: 0.5, max: 30, step: 0.5 },
    { key: 'HEAD_SIZE_MULT', label: 'Head Mult', min: 0.5, max: 4.5, step: 0.01 },
  ]},
  { title: 'SPEED & TURN', params: [
    { key: 'BASE_SPEED', label: 'Base Speed', min: 0.1, max: 15, step: 0.1 },
    { key: 'BOOST_SPEED', label: 'Boost Speed', min: 0.5, max: 30, step: 0.1 },
    { key: 'TURN_RATE_MAX', label: 'Turn Thin', min: 0.005, max: 0.45, step: 0.005 },
    { key: 'TURN_RATE_MIN', label: 'Turn Fat', min: 0.001, max: 0.15, step: 0.005 },
    { key: 'BOOST_TURN_RATE', label: 'Turn Boost', min: 0.001, max: 0.15, step: 0.005 },
  ]},
  { title: 'GROWTH & SCORE', params: [
    { key: 'GROWTH_COST', label: 'Pts/Segment', min: 1, max: 750, step: 1 },
    { key: 'GROWTH_MULTIPLIER', label: 'Growth Mult', min: 0.1, max: 150, step: 0.1 },
    { key: 'RADIUS_POWER', label: 'Thick Curve', min: 0.01, max: 30, step: 0.05 },
    { key: 'SCORE_PER_POINT', label: 'Score/Pt', min: 0.1, max: 150, step: 0.1 },
    { key: 'MAX_SCORE', label: 'Max Score', min: 100, max: 3000000, step: 1000 },
  ]},
  { title: 'FOOD SPAWN', params: [
    { key: 'FOOD_COUNT', label: 'Count', min: 50, max: 1200000, step: 100 },
    { key: 'FOOD_CAP_MULT', label: 'Cap Mult', min: 0.5, max: 30, step: 0.5 },
    { key: 'FOOD_EAT_RADIUS', min: 0.1, max: 30, step: 0.5, label: 'Eat Radius' },
    { key: 'FOOD_S_VALUE', label: 'S Value', min: 0.1, max: 15, step: 0.5 },
    { key: 'FOOD_M_VALUE', label: 'M Value', min: 0.5, max: 30, step: 0.5 },
    { key: 'FOOD_L_VALUE', label: 'L Value', min: 1, max: 60, step: 1 },
    { key: 'FOOD_S_CHANCE', label: 'S Chance', min: 0.1, max: 1.0, step: 0.01 },
    { key: 'FOOD_M_CHANCE', label: 'M Chance', min: 0, max: 0.9, step: 0.01 },
    { key: 'FOOD_L_CHANCE', label: 'L Chance', min: 0, max: 0.9, step: 0.01 },
    { key: 'FOOD_S_RADIUS', label: 'S Radius', min: 0.5, max: 30, step: 0.5 },
    { key: 'FOOD_M_RADIUS', label: 'M Radius', min: 0.5, max: 45, step: 0.5 },
    { key: 'FOOD_L_RADIUS', label: 'L Radius', min: 0.5, max: 60, step: 0.5 },
  ]},
  { title: 'BOOST DRAIN', params: [
    { key: 'BOOST_DRAIN_RATE', label: 'Drain Rate', min: 1, max: 450, step: 1, unit: 'f' },
    { key: 'BOOST_DROP_VALUE', label: 'Drop Value', min: 0.1, max: 150, step: 0.5 },
    { key: 'BOOST_DROP_SPREAD', label: 'Drop Spread', min: 0, max: 150, step: 0.5 },
    { key: 'BOOST_INSTANT_DROP', label: 'Burst Count', min: 0, max: 150, step: 1 },
    { key: 'BOOST_INSTANT_VALUE', label: 'Burst Value', min: 0.1, max: 150, step: 0.5 },
    { key: 'BOOST_SCORE_DRAIN', label: 'Score Drain/s', min: 0, max: 1500, step: 1, unit: '/s' },
    { key: 'BOOST_MIN_SCORE', label: 'Min Score', min: 0, max: 5000, step: 1 },
    { key: 'BOOST_DROP_TIER2_SCORE', label: 'Tier2 At Score', min: 10, max: 50000, step: 10 },
    { key: 'BOOST_DROP_TIER2_VALUE', label: 'Tier2 Value', min: 0.5, max: 150, step: 0.5 },
    { key: 'BOOST_DROP_TIER3_SCORE', label: 'Tier3 At Score', min: 10, max: 100000, step: 10 },
    { key: 'BOOST_DROP_TIER3_VALUE', label: 'Tier3 Value', min: 0.5, max: 300, step: 0.5 },
  ]},
  { title: 'DEATH DROP', params: [
    { key: 'DEATH_DROP_L_CHANCE', label: 'L Chance', min: 0, max: 1.0, step: 0.01 },
    { key: 'DEATH_DROP_M_CHANCE', label: 'M Chance', min: 0, max: 1.0, step: 0.01 },
    { key: 'DEATH_DROP_MAX', label: 'Max Orbs', min: 5, max: 7500, step: 10 },
  ]},
  { title: 'CAMERA', params: [
    { key: 'MIN_ZOOM', label: 'Min Zoom', min: 0.01, max: 1.5, step: 0.01 },
    { key: 'ZOOM_LERP', label: 'Zoom Smooth', min: 0.001, max: 0.3, step: 0.005 },
    { key: 'CAM_FOLLOW_SPEED', label: 'Follow Speed', min: 0.001, max: 0.9, step: 0.01 },
  ]},
  { title: '3D EFFECTS', params: [
    { key: 'HIGHLIGHT_OFFSET', label: 'Light Offset', min: 0, max: 1.5, step: 0.01 },
    { key: 'HIGHLIGHT_BRIGHT', label: 'Bright Boost', min: 0, max: 450, step: 5 },
    { key: 'SHADOW_DARK', label: 'Shadow Dark', min: 0, max: 450, step: 5 },
  ]},
  { title: 'BITE EFFECT', params: [
    { key: 'BITE_DARKEN_CENTER', label: 'Center Dark', min: 0, max: 1.0, step: 0.05 },
    { key: 'BITE_DARKEN_MID', label: 'Mid Dark', min: 0, max: 1.0, step: 0.05 },
    { key: 'BITE_TINT_OPACITY', label: 'Tint Strength', min: 0, max: 1.0, step: 0.05 },
  ]},
  { title: 'BOTS', params: [
    { key: 'BOT_COUNT', label: 'Count', min: 0, max: 450, step: 1 },
    { key: 'BOT_FOOD_RANGE', label: 'Food Range', min: 50, max: 75000, step: 100 },
    { key: 'BOT_RESPAWN_TIME', label: 'Respawn', min: 10, max: 9000, step: 10, unit: 'f' },
    { key: 'BOT_MIN_SEGS', label: 'Min Start', min: 1, max: 750, step: 1 },
    { key: 'BOT_MAX_SEGS', label: 'Max Start', min: 5, max: 3000, step: 1 },
    { key: 'BOUNDARY_WARN_PCT', label: 'Warn %', min: 0.5, max: 0.999, step: 0.01 },
    { key: 'BOUNDARY_DANGER_PCT', label: 'Danger %', min: 0.5, max: 0.999, step: 0.01 },
  ]},
  { title: 'COLLISION', params: [
    { key: 'COLLISION_SKIP', label: 'Skip Segs', min: 1, max: 150, step: 1 },
  ]},
];

// Tiered boost drop value — higher score = higher value food dropped while boosting
function getBoostDropValue(score: number): number {
  if (score >= CFG.BOOST_DROP_TIER3_SCORE) return CFG.BOOST_DROP_TIER3_VALUE;
  if (score >= CFG.BOOST_DROP_TIER2_SCORE) return CFG.BOOST_DROP_TIER2_VALUE;
  return CFG.BOOST_DROP_VALUE;
}

// Quadratic score: (segCount/MAX)² × MAX_SCORE — small snakes score low, max = MAX_SCORE
function calcScore(segCount: number): number {
  return Math.round(Math.pow(segCount / CFG.MAX_SEGMENTS, 2) * CFG.MAX_SCORE);
}
// Food tiers: S = common, M = uncommon, L = rare
const FOOD_TIERS = {
  S: { value: 1, radius: 3,  chance: 0.93 },
  M: { value: 3, radius: 4.5, chance: 0.04 },
  L: { value: 5, radius: 6,  chance: 0.03 },
} as const;
type FoodTier = 'S' | 'M' | 'L';

// Per-tier color palettes (color + glow)
const FOOD_COLORS_S = [
  { c: '#2ed573', g: 'rgba(46,213,115,0.4)' },
  { c: '#7bed9f', g: 'rgba(123,237,159,0.4)' },
  { c: '#26de81', g: 'rgba(38,222,129,0.4)' },
  { c: '#20bf6b', g: 'rgba(32,191,107,0.4)' },
];
const FOOD_COLORS_M = [
  { c: '#1e90ff', g: 'rgba(30,144,255,0.45)' },
  { c: '#70a1ff', g: 'rgba(112,161,255,0.45)' },
  { c: '#45aaf2', g: 'rgba(69,170,242,0.45)' },
  { c: '#4b7bec', g: 'rgba(75,123,236,0.45)' },
];
const FOOD_COLORS_L = [
  { c: '#fd79a8', g: 'rgba(253,121,168,0.5)' },
  { c: '#e84393', g: 'rgba(232,67,147,0.5)' },
  { c: '#ff6b81', g: 'rgba(255,107,129,0.5)' },
  { c: '#f368e0', g: 'rgba(243,104,224,0.5)' },
];

// Random tier by spawn chance (reads from CFG so admin can tweak)
function randomFoodTier(): FoodTier {
  const r = Math.random();
  if (r < CFG.FOOD_S_CHANCE) return 'S';
  if (r < CFG.FOOD_S_CHANCE + CFG.FOOD_M_CHANCE) return 'M';
  return 'L';
}

// ─── Types ───────────────────────────────────────────────
interface Vec2 { x: number; y: number }

interface Food {
  x: number; y: number;
  radius: number;
  color: string;
  glow: string;
  value: number;
  tier: FoodTier;
}

interface Wall {
  x1: number; y1: number;
  x2: number; y2: number;
  thickness: number;
}

type SnakeShape = 'circle' | 'box' | 'triangle' | 'mix_ct' | 'mix_cb' | 'mix_bt' | 'mix_all';

const SNAKE_SHAPES: SnakeShape[] = ['circle', 'box', 'triangle', 'mix_ct', 'mix_cb', 'mix_bt', 'mix_all'];

const SHAPE_LABELS: Record<SnakeShape, string> = {
  circle: 'Circle',
  box: 'Box',
  triangle: 'Triangle',
  mix_ct: 'Circle + Triangle',
  mix_cb: 'Circle + Box',
  mix_bt: 'Box + Triangle',
  mix_all: 'All Mixed',
};

interface Snake {
  path: Vec2[];
  segCount: number;
  angle: number;
  targetAngle: number;
  speed: number;
  boosting: boolean;
  alive: boolean;
  color: string;
  stripeColor: string;
  headColor: string;
  name: string;
  isPlayer: boolean;
  shape: SnakeShape;
  score: number;              // Total food points eaten (scaled by SCORE_PER_POINT)
  growAccum: number;          // Fractional growth accumulator
  drainAccum: number;         // Fractional drain accumulator
  _cacheFrame: number;
  _bodyRadius: number;
  _headRadius: number;
  _segPos: Vec2[];
  _segAngles: number[];       // Direction angle per segment
  _arrowDist: number;       // Smoothed arrow distance for lerp
  _clipOverlaps: { segIdx: number; ox: number; oy: number; or: number }[];  // Overlap bite positions
  _pupilX: number;         // Smoothed pupil offset X
  _pupilY: number;         // Smoothed pupil offset Y
  aiWanderAngle: number;
  aiTick: number;
  boostCooldown: number;
  respawnTimer: number;
}

// ─── Spatial Hash Grid (for O(1) food/bot lookups) ──────
class SpatialHash {
  private cellSize: number;
  private cells: Map<number, number[]> = new Map();
  private _keys: number[] = [];

  constructor(cellSize: number) { this.cellSize = cellSize; }

  private key(x: number, y: number): number {
    return ((x / this.cellSize | 0) * 73856093) ^ ((y / this.cellSize | 0) * 19349663);
  }

  clear() { this.cells.clear(); }

  insert(idx: number, x: number, y: number) {
    const k = this.key(x, y);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(idx);
  }

  // Returns indices of items in cells near (x,y) within radius
  query(x: number, y: number, radius: number): number[] {
    const cs = this.cellSize;
    const x0 = (x - radius) / cs | 0;
    const x1 = (x + radius) / cs | 0;
    const y0 = (y - radius) / cs | 0;
    const y1 = (y + radius) / cs | 0;
    const out = this._keys;
    out.length = 0;
    const seen = new Set<number>();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = ((cx) * 73856093) ^ ((cy) * 19349663);
        const arr = this.cells.get(k);
        if (arr) for (let i = 0; i < arr.length; i++) {
          const id = arr[i];
          if (!seen.has(id)) { seen.add(id); out.push(id); }
        }
      }
    }
    return out;
  }
}

// Global spatial hash for food (rebuilt each frame)
const foodHash = new SpatialHash(200);
// Global spatial hash for bot head positions (rebuilt each frame)
const snakeHeadHash = new SpatialHash(300);

// ─── Math Helpers ────────────────────────────────────────
const TAU = Math.PI * 2;

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function lerpAngle(from: number, to: number, maxDelta: number): number {
  const delta = shortestAngleDelta(from, to);
  if (Math.abs(delta) <= maxDelta) return from + delta;
  return from + Math.sign(delta) * maxDelta;
}

function randInCircle(cx: number, cy: number, maxR: number): Vec2 {
  const a = Math.random() * TAU;
  const r = Math.sqrt(Math.random()) * maxR;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

function distFromOrigin(p: Vec2): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}

// ─── 3D Color Helpers ─────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Creates a radial gradient fill for 3D sphere/block look
// Light from top-left, highlight at center, shadow at edge
function make3DGrad(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): CanvasGradient {
  // Guard ALL params — any NaN from broken segment positions kills the gradient
  if (!isFinite(cx)) cx = 0;
  if (!isFinite(cy)) cy = 0;
  const [cr, cg, cb] = hexToRgb(color);
  const safeR = Math.max(0.1, isFinite(r) ? r : 10);
  const offX = cx - safeR * CFG.HIGHLIGHT_OFFSET, offY = cy - safeR * CFG.HIGHLIGHT_OFFSET;
  const grad = ctx.createRadialGradient(offX, offY, Math.max(0.001, safeR * 0.05), cx, cy, safeR);
  const hb = CFG.HIGHLIGHT_BRIGHT, sd = CFG.SHADOW_DARK;
  grad.addColorStop(0, `rgb(${Math.min(255, cr + hb)},${Math.min(255, cg + hb)},${Math.min(255, cb + hb)})`);
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, `rgb(${Math.max(0, cr - sd)},${Math.max(0, cg - sd)},${Math.max(0, cb - sd)})`);
  return grad;
}

// ─── Color Palettes ──────────────────────────────────────
const SNAKE_PALETTES = [
  { color: '#ff4757', stripe: '#ff6b81', head: '#ff8a98', name: 'Crimson' },
  { color: '#2ed573', stripe: '#7bed9f', head: '#a5f3c4', name: 'Jade' },
  { color: '#1e90ff', stripe: '#70a1ff', head: '#a0bfff', name: 'Azure' },
  { color: '#ffa502', stripe: '#ffbe76', head: '#ffd093', name: 'Amber' },
  { color: '#ff6348', stripe: '#ff9f7f', head: '#ffb8a5', name: 'Coral' },
  { color: '#a55eea', stripe: '#c9a5ff', head: '#dcc2ff', name: 'Violet' },
  { color: '#2bcbba', stripe: '#6eddd3', head: '#a2ebe4', name: 'Teal' },
  { color: '#fd9644', stripe: '#fdbf7f', head: '#fed6aa', name: 'Tangerine' },
  { color: '#45aaf2', stripe: '#78c4f7', head: '#a5d7fa', name: 'Sky' },
  { color: '#fc5c65', stripe: '#fd8a90', head: '#feadaf', name: 'Rose' },
  { color: '#26de81', stripe: '#67e8a5', head: '#93eebf', name: 'Emerald' },
  { color: '#e17055', stripe: '#eaa18f', head: '#f0c0b3', name: 'Terracotta' },
  { color: '#f7b731', stripe: '#fcd776', head: '#fde5a0', name: 'Gold' },
  { color: '#4b7bec', stripe: '#7ea3f5', head: '#a8bff8', name: 'Royal' },
  { color: '#fc5c9c', stripe: '#fd8eb8', head: '#feadc9', name: 'Pink' },
  { color: '#20bf6b', stripe: '#5ed49a', head: '#8ce3b8', name: 'Forest' },
  { color: '#eb3b5a', stripe: '#f07a8e', head: '#f5a1ad', name: 'Ruby' },
  { color: '#3867d6', stripe: '#6b91e3', head: '#94b3ed', name: 'Sapphire' },
  // --- Mixed-color skins ---
  { color: '#ff4757', stripe: '#1e90ff', head: '#c46bff', name: 'Fire & Ice' },
  { color: '#2ed573', stripe: '#ffa502', head: '#7bed9f', name: 'Tropical' },
  { color: '#a55eea', stripe: '#fc5c9c', head: '#ff6b81', name: 'Neon Nights' },
  { color: '#1e90ff', stripe: '#2ed573', head: '#70a1ff', name: 'Ocean Mint' },
  { color: '#fd9644', stripe: '#ff4757', head: '#ffd093', name: 'Sunset' },
  { color: '#2bcbba', stripe: '#45aaf2', head: '#6eddd3', name: 'Lagoon' },
  { color: '#f7b731', stripe: '#eb3b5a', head: '#fcd776', name: 'Mango Crush' },
  { color: '#3867d6', stripe: '#a55eea', head: '#7ea3f5', name: 'Cosmic' },
  { color: '#26de81', stripe: '#1e90ff', head: '#5ed49a', name: 'Aurora' },
  { color: '#fc5c65', stripe: '#f7b731', head: '#fd8a90', name: 'Candy' },
  { color: '#e17055', stripe: '#20bf6b', head: '#eaa18f', name: 'Autumn' },
  { color: '#ff4757', stripe: '#2ed573', head: '#ffa502', name: 'Traffic' },
];

const BOT_NAMES = [
  'Viper', 'Cobra', 'Mamba', 'Python', 'Anaconda',
  'Rattler', 'Sidewinder', 'Asp', 'Boa', 'Adder',
  'Krait', 'Taipan', 'Copperhead', 'Kingsnake', 'Coral',
];

// ─── Test Hurdles (walls with gaps near spawn) ────────
function createTestWalls(): Wall[] {
  const walls: Wall[] = [];
  const T = 8; // wall thickness

  // All walls placed far from spawn (0,0) — minimum ~500 units away

  // Wall 1: horizontal, gap in center (at y=-500)
  walls.push({ x1: -200, y1: -500, x2: -18, y2: -500, thickness: T });
  walls.push({ x1: 18, y1: -500, x2: 200, y2: -500, thickness: T });

  // Wall 2: vertical, gap in center (at x=500)
  walls.push({ x1: 500, y1: -200, x2: 500, y2: -18, thickness: T });
  walls.push({ x1: 500, y1: 18, x2: 500, y2: 200, thickness: T });

  // Wall 3: diagonal, gap (top-right area)
  walls.push({ x1: 650, y1: 100, x2: 555, y2: 8, thickness: T });
  walls.push({ x1: 535, y1: -8, x2: 460, y2: -100, thickness: T });

  // Wall 4: horizontal, smaller gap (at y=500)
  walls.push({ x1: -180, y1: 500, x2: -10, y2: 500, thickness: T });
  walls.push({ x1: 10, y1: 500, x2: 180, y2: 500, thickness: T });

  // Wall 5: vertical wall left side (at x=-500)
  walls.push({ x1: -500, y1: -180, x2: -500, y2: -15, thickness: T });
  walls.push({ x1: -500, y1: 15, x2: -500, y2: 180, thickness: T });

  // Wall 6: horizontal further out (at y=-600)
  walls.push({ x1: -250, y1: -600, x2: -22, y2: -600, thickness: T });
  walls.push({ x1: 22, y1: -600, x2: 250, y2: -600, thickness: T });

  // Wall 7: angled wall bottom-left
  walls.push({ x1: -570, y1: -460, x2: -490, y2: -370, thickness: T });
  walls.push({ x1: -480, y1: -360, x2: -410, y2: -280, thickness: T });

  // Wall 8: vertical (at x=-600)
  walls.push({ x1: -600, y1: -160, x2: -600, y2: -12, thickness: T });
  walls.push({ x1: -600, y1: 12, x2: -600, y2: 160, thickness: T });

  // Wall 9: horizontal at y=600
  walls.push({ x1: -200, y1: 600, x2: -15, y2: 600, thickness: T });
  walls.push({ x1: 15, y1: 600, x2: 200, y2: 600, thickness: T });

  // Wall 10: diagonal bottom-right
  walls.push({ x1: 460, y1: 560, x2: 540, y2: 480, thickness: T });
  walls.push({ x1: 550, y1: 470, x2: 630, y2: 380, thickness: T });

  return walls;
}

// Distance from point to line segment
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist({ x: px, y: py }, { x: x1, y: y1 });
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return dist({ x: px, y: py }, { x: cx, y: cy });
}

function checkWallCollision(snakes: Snake[], walls: Wall[], food: Food[]): void {
  for (const snake of snakes) {
    if (!snake.alive) continue;
    const head = snake.path[0];
    // Full body radius hitbox for walls
    const headR = snake._headRadius;
    for (const w of walls) {
      const hitR = w.thickness / 2;
      const d = distToSegment(head.x, head.y, w.x1, w.y1, w.x2, w.y2);
      if (d < hitR) {
        killSnake(snake, food);
        break;
      }
    }
  }
}

// ─── Body Overlap Detection (visual only, no death) ────────
function detectBodyClips(snakes: Snake[], walls: Wall[]): void {
  for (const snake of snakes) {
    if (!snake.alive) continue;
    snake._clipOverlaps.length = 0;
    const segs = snake._segPos;
    const bodyR = snake._bodyRadius;

    // Check against walls
    for (let i = 1; i < snake.segCount - 1; i++) {
      const sp = segs[i];
      if (!sp) continue;
      for (const w of walls) {
        const hitR = bodyR + w.thickness / 2;
        const d = distToSegment(sp.x, sp.y, w.x1, w.y1, w.x2, w.y2);
        if (d < hitR) {
          // Find closest point on wall segment for bite position
          const t = Math.max(0, Math.min(1, ((sp.x - w.x1) * (w.x2 - w.x1) + (sp.y - w.y1) * (w.y2 - w.y1)) / ((w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2 + 0.001)));
          snake._clipOverlaps.push({ segIdx: i, ox: w.x1 + t * (w.x2 - w.x1), oy: w.y1 + t * (w.y2 - w.y1), or: w.thickness / 2 });
          break;
        }
      }
    }

    // Check against other snakes' bodies
    const clippedSet = new Set<number>();
    for (const other of snakes) {
      if (other === snake || !other.alive) continue;
      const oSegs = other._segPos;
      const oBodyR = other._bodyRadius;
      const clipDist = bodyR + oBodyR;
      const step = Math.max(1, Math.floor(other.segCount / 60));
      for (let i = 1; i < snake.segCount - 1; i++) {
        if (clippedSet.has(i)) continue;
        const sp = segs[i];
        if (!sp) continue;
        for (let j = CFG.COLLISION_SKIP; j < other.segCount; j += step) {
          const op = oSegs[j];
          if (!op) continue;
          const dx = sp.x - op.x, dy = sp.y - op.y;
          if (dx * dx + dy * dy < clipDist * clipDist) {
            snake._clipOverlaps.push({ segIdx: i, ox: op.x, oy: op.y, or: oBodyR });
            clippedSet.add(i);
            break;
          }
        }
      }
    }
  }
}

// ─── Entity Factories ────────────────────────────────────
function makeFood(x: number, y: number, tier?: FoodTier): Food {
  const t = tier ?? randomFoodTier();
  // Read value & radius from CFG so admin can tune per-tier
  const value = t === 'L' ? CFG.FOOD_L_VALUE : t === 'M' ? CFG.FOOD_M_VALUE : CFG.FOOD_S_VALUE;
  const radius = t === 'L' ? CFG.FOOD_L_RADIUS : t === 'M' ? CFG.FOOD_M_RADIUS : CFG.FOOD_S_RADIUS;
  const palettes = t === 'S' ? FOOD_COLORS_S : t === 'M' ? FOOD_COLORS_M : FOOD_COLORS_L;
  const fc = palettes[Math.floor(Math.random() * palettes.length)];
  return { x, y, radius, color: fc.c, glow: fc.g, value, tier: t };
}

// Thickness curve: power function for non-linear growth
// R = MIN + (MAX - MIN) * t^RADIUS_POWER where t = (seg - MIN) / (MAX - MIN)
// RADIUS_POWER < 1 → fast early thickening; > 1 → slow early, fast late
function calcBodyRadius(segCount: number): number {
  const range = CFG.MAX_SEGMENTS - CFG.MIN_SEGMENTS;
  const t = Math.max(0, Math.min((segCount - CFG.MIN_SEGMENTS) / Math.max(1, range), 1));
  return CFG.MIN_BODY_RADIUS + (CFG.MAX_BODY_RADIUS - CFG.MIN_BODY_RADIUS) * Math.pow(t, CFG.RADIUS_POWER);
}

function calcHeadRadius(segCount: number): number {
  return calcBodyRadius(segCount) * CFG.HEAD_SIZE_MULT;
}

function makeSnake(isPlayer: boolean, shape?: SnakeShape, paletteIdx?: number, initialSegCount?: number): Snake {
  const pi = paletteIdx ?? (isPlayer ? 0 : Math.floor(Math.random() * SNAKE_PALETTES.length));
  const pal = SNAKE_PALETTES[pi];
  const snakeShape = shape || (isPlayer ? 'circle' as SnakeShape : SNAKE_SHAPES[Math.floor(Math.random() * SNAKE_SHAPES.length)]);
  const angle = Math.random() * TAU;
  const startPos = isPlayer ? { x: 0, y: 0 } : randInCircle(0, 0, CFG.MAP_RADIUS * 0.7);
  const segCount = initialSegCount ?? CFG.INITIAL_SEGMENTS;
  const path: Vec2[] = [];
  const pathLen = segCount * CFG.SEG_SPACING + 20;
  for (let i = 0; i < pathLen; i++) {
    path.push({
      x: startPos.x - Math.cos(angle) * i,
      y: startPos.y - Math.sin(angle) * i,
    });
  }
  return {
    path,
    segCount: segCount,
    angle,
    targetAngle: angle,
    speed: CFG.BASE_SPEED,
    boosting: false,
    alive: true,
    color: pal.color,
    stripeColor: pal.stripe,
    headColor: pal.head,
    name: isPlayer ? 'You' : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    isPlayer,
    shape: snakeShape,
    score: 0,
    growAccum: 0,
    drainAccum: 0,
    _cacheFrame: -1,
    _bodyRadius: calcBodyRadius(segCount),
    _headRadius: calcHeadRadius(segCount),
    _segPos: [],
    _segAngles: [],
    _arrowDist: 0,    _clipOverlaps: [],
    _pupilX: 0,
    _pupilY: 0,
    aiWanderAngle: angle,
    aiTick: Math.floor(Math.random() * 60),
    boostCooldown: 0,
    respawnTimer: 0,
  };
}

// ─── Precompute segment positions (once per frame) ───────
function cacheSegmentPositions(snake: Snake, frame: number): void {
  if (snake._cacheFrame === frame) return;
  snake._cacheFrame = frame;
  snake._bodyRadius = calcBodyRadius(snake.segCount);
  snake._headRadius = calcHeadRadius(snake.segCount);

  const count = snake.segCount;
  const pos = snake._segPos;
  const angles = snake._segAngles;
  pos.length = count;
  angles.length = count;
  if (count === 0) return;

  pos[0] = snake.path[0];
  angles[0] = snake.angle;
  if (count === 1) return;

  let segIdx = 1;
  let walked = 0;
  let nextTarget = CFG.SEG_SPACING;

  for (let i = 0; i < snake.path.length - 1 && segIdx < count; i++) {
    const dx = snake.path[i + 1].x - snake.path[i].x;
    const dy = snake.path[i + 1].y - snake.path[i].y;
    const edgeLen = Math.sqrt(dx * dx + dy * dy);
    const edgeEnd = walked + edgeLen;

    while (edgeEnd >= nextTarget && segIdx < count) {
      const t = edgeLen > 0 ? (nextTarget - walked) / edgeLen : 0;
      if (!pos[segIdx]) pos[segIdx] = { x: 0, y: 0 };
      pos[segIdx].x = snake.path[i].x + dx * t;
      pos[segIdx].y = snake.path[i].y + dy * t;
      segIdx++;
      nextTarget += CFG.SEG_SPACING;
    }

    walked = edgeEnd;
  }

  // CRITICAL: Each segment must get its OWN object.
  // Sharing a reference causes permanent corruption: next frame the main
  // loop mutates one index and all siblings move too, creating gaps.
  const lastX = (pos[segIdx - 1] || snake.path[0]).x;
  const lastY = (pos[segIdx - 1] || snake.path[0]).y;
  for (let i = segIdx; i < count; i++) {
    if (!pos[i]) pos[i] = { x: 0, y: 0 };
    pos[i].x = lastX;
    pos[i].y = lastY;
  }

  // Compute per-segment angles for non-circle shapes
  for (let i = 1; i < count; i++) {
    if (pos[i] && pos[i - 1]) {
      angles[i] = Math.atan2(pos[i - 1].y - pos[i].y, pos[i - 1].x - pos[i].x);
    } else {
      angles[i] = snake.angle;
    }
  }
}

// ─── Move snake one frame ────────────────────────────────
function moveSnake(snake: Snake, food: Food[], frame: number): void {
  if (!snake.alive) return;

  const head = snake.path[0];
  // Guard: if head is corrupted, reset path to origin
  if (!head || !isFinite(head.x) || !isFinite(head.y)) {
    snake.path.length = 0;
    snake.path.push({ x: 0, y: 0 });
    return;
  }

  // Steering — small snakes turn snappy, big snakes turn wide
  const radiusRange = CFG.MAX_BODY_RADIUS - CFG.MIN_BODY_RADIUS;
  const sizeT = radiusRange > 0 ? Math.min((snake._bodyRadius - CFG.MIN_BODY_RADIUS) / radiusRange, 1) : 0;
  const normalRate = CFG.TURN_RATE_MAX - sizeT * (CFG.TURN_RATE_MAX - CFG.TURN_RATE_MIN);
  const rate = snake.boosting ? CFG.BOOST_TURN_RATE : normalRate;
  snake.angle = lerpAngle(snake.angle, snake.targetAngle, rate);

  // Speed
  snake.speed = snake.boosting ? CFG.BOOST_SPEED : CFG.BASE_SPEED;

  // New head
  const nx = head.x + Math.cos(snake.angle) * snake.speed;
  const ny = head.y + Math.sin(snake.angle) * snake.speed;

  // Boundary
  if (distFromOrigin({ x: nx, y: ny }) > CFG.MAP_RADIUS) {
    killSnake(snake, food);
    return;
  }

  // Add new head position — always unshift + truncate, never in-place shift.
  // In-place shift (even with new-object assignment for path[0]) leaves the rest
  // of the array as reference copies, which is fragile and can't repair collapsed
  // paths from hot-reload.  unshift is O(n) but n ≤ ~6300 and V8 memmoves it.
  snake.path.unshift({ x: nx, y: ny });
  const maxPathLen = Math.ceil(snake.segCount * CFG.SEG_SPACING) + 20;
  if (snake.path.length > maxPathLen) snake.path.length = maxPathLen;

  // Eat food — use spatial hash for O(1) lookup instead of scanning all food
  const eatDist = calcHeadRadius(snake.segCount) + CFG.FOOD_EAT_RADIUS;
  const eatDist2 = eatDist * eatDist;
  const nearFood = foodHash.query(nx, ny, eatDist + 20);
  for (let j = nearFood.length - 1; j >= 0; j--) {
    const fi = nearFood[j];
    if (fi >= food.length) continue;
    const f = food[fi];
    if (!f) continue;
    const dx = nx - f.x, dy = ny - f.y;
    const totalR = eatDist + f.radius;
    if (dx * dx + dy * dy < totalR * totalR) {
      // Swap-remove from food array
      const lastIdx = food.length - 1;
      if (fi !== lastIdx) {
        food[fi] = food[lastIdx];
      }
      food.pop();
      const effectiveValue = f.value * CFG.GROWTH_MULTIPLIER;
      snake.growAccum += effectiveValue;
      snake.score += effectiveValue * CFG.SCORE_PER_POINT;
      if (snake.growAccum >= CFG.GROWTH_COST) {
        const add = Math.min(Math.floor(snake.growAccum / CFG.GROWTH_COST), CFG.MAX_SEGMENTS - snake.segCount);
        snake.segCount += add;
        snake.growAccum -= add * CFG.GROWTH_COST;
      }
    }
  }

  // Boost drain — drops 1pt food per segment lost, 6/sec at 60fps
  if (snake.boosting && snake.segCount > CFG.MIN_SEGMENTS) {
    snake.drainAccum += 1.0 / CFG.BOOST_DRAIN_RATE;
    if (snake.drainAccum >= 1) {
      const lose = Math.floor(snake.drainAccum);
      for (let d = 0; d < lose && snake.segCount > CFG.MIN_SEGMENTS; d++) {
        snake.segCount -= 1;
        // Always drop 1pt S food behind tail
        const tailIdx = Math.min(snake.segCount, snake.path.length - 1);
        const tp = snake.path[tailIdx] || snake.path[snake.path.length - 1];
        if (tp && distFromOrigin(tp) < CFG.MAP_RADIUS - 50) {
          const offset = (d % 2 === 0 ? 1 : -1) * CFG.BOOST_DROP_SPREAD;
          const prevIdx = Math.min(tailIdx + 1, snake.path.length - 1);
          const pp = snake.path[prevIdx];
          let fx = tp.x, fy = tp.y;
          if (pp) {
            const ddx = tp.x - pp.x, ddy = tp.y - pp.y;
            const len = Math.sqrt(ddx * ddx + ddy * ddy);
            if (len > 0) {
              fx += (ddy / len) * offset;
              fy -= (ddx / len) * offset;
            }
          }
          const dropFood = makeFood(fx, fy, 'S');
          dropFood.value = getBoostDropValue(snake.score);
          food.push(dropFood);
        }
      }
      // Deduct score for segments lost (each segment cost GROWTH_COST pts to grow)
      snake.score = Math.max(0, snake.score - lose * CFG.GROWTH_COST * CFG.SCORE_PER_POINT);
      snake.drainAccum -= lose;
    }
  }
  // Score-based boost drain: when at min segments, drain score AND drop food orbs
  if (snake.boosting && snake.segCount <= CFG.MIN_SEGMENTS && CFG.BOOST_SCORE_DRAIN > 0) {
    const drainThisFrame = CFG.BOOST_SCORE_DRAIN / 60;
    if (snake.score >= drainThisFrame) {
      snake.score -= drainThisFrame;
      // Accumulate fractional food drops (drop 1 orb per point drained)
      snake.drainAccum += drainThisFrame;
      if (snake.drainAccum >= 1) {
        const dropCount = Math.floor(snake.drainAccum);
        const tailIdx = Math.min(snake.segCount - 1, snake.path.length - 1);
        const tp = snake.path[tailIdx] || snake.path[snake.path.length - 1];
        if (tp && distFromOrigin(tp) < CFG.MAP_RADIUS - 50) {
          for (let d = 0; d < dropCount; d++) {
            const offset = (d % 2 === 0 ? 1 : -1) * CFG.BOOST_DROP_SPREAD;
            const prevIdx = Math.min(tailIdx + 1, snake.path.length - 1);
            const pp = snake.path[prevIdx];
            let fx = tp.x + (Math.random() - 0.5) * 8, fy = tp.y + (Math.random() - 0.5) * 8;
            if (pp) {
              const ddx = tp.x - pp.x, ddy = tp.y - pp.y;
              const len = Math.sqrt(ddx * ddx + ddy * ddy);
              if (len > 0) { fx += (ddy / len) * offset; fy -= (ddx / len) * offset; }
            }
            const dropFood = makeFood(fx, fy, 'S');
            dropFood.value = getBoostDropValue(snake.score);
            food.push(dropFood);
          }
        }
        snake.drainAccum -= dropCount;
      }
    } else {
      snake.score = 0;
    }
  }
}

// ─── Kill snake → food explosion (entire score as S/M/L orbs) ──
function killSnake(snake: Snake, food: Food[]): void {
  snake.alive = false;

  // Build list of body positions to place food along
  const positions: Vec2[] = [];
  const step = Math.max(1, Math.floor(snake.segCount / 60));
  for (let i = 0; i < snake.segCount; i += step) {
    const pos = snake._segPos.length > i
      ? snake._segPos[i]
      : snake.path[Math.min(i * 2, snake.path.length - 1)];
    if (pos && distFromOrigin(pos) < CFG.MAP_RADIUS - 50) {
      positions.push(pos);
    }
  }

  // Convert segCount into S/M/L food (total value = segCount)
  let remaining = snake.segCount;
  const maxOrbs = Math.min(positions.length * 2, CFG.DEATH_DROP_MAX); // cap items
  const orbs: FoodTier[] = [];

  while (remaining > 0 && orbs.length < maxOrbs) {
    const r = Math.random();
    if (remaining >= 5 && r < CFG.DEATH_DROP_L_CHANCE) {
      orbs.push('L'); remaining -= 5;
    } else if (remaining >= 3 && r < CFG.DEATH_DROP_M_CHANCE) {
      orbs.push('M'); remaining -= 3;
    } else {
      orbs.push('S'); remaining -= 1;
    }
  }

  // Distribute orbs along body positions
  for (let i = 0; i < orbs.length; i++) {
    const p = positions[i % positions.length];
    food.push(makeFood(
      p.x + (Math.random() - 0.5) * 14,
      p.y + (Math.random() - 0.5) * 14,
      orbs[i]
    ));
  }
}

// ─── Collision Detection (spatial-hash accelerated) ──────
function checkCollisions(snakes: Snake[], food: Food[]): void {
  // Build head position hash
  snakeHeadHash.clear();
  for (let i = 0; i < snakes.length; i++) {
    if (!snakes[i].alive) continue;
    const h = snakes[i].path[0];
    snakeHeadHash.insert(i, h.x, h.y);
  }

  for (let si = 0; si < snakes.length; si++) {
    const snake = snakes[si];
    if (!snake.alive) continue;
    const headPos = snake.path[0];
    const myHeadR = snake._headRadius;
    const queryR = myHeadR + CFG.MAX_BODY_RADIUS + 10;

    // Only check nearby snakes (not all!)
    const nearby = snakeHeadHash.query(headPos.x, headPos.y, queryR);
    for (let ni = 0; ni < nearby.length; ni++) {
      const oi = nearby[ni];
      const other = snakes[oi];
      if (other === snake || !other.alive) continue;
      const bodyR = other._bodyRadius;
      const hitDist = bodyR;
      const hitDist2 = hitDist * hitDist;
      const segs = other._segPos;
      const maxI = Math.min(segs.length, other.segCount);
      for (let i = CFG.COLLISION_SKIP; i < maxI; i++) {
        const sp = segs[i];
        const dx = headPos.x - sp.x;
        const dy = headPos.y - sp.y;
        if (dx * dx + dy * dy < hitDist2) {
          killSnake(snake, food);
          break;
        }
      }
      if (!snake.alive) break;
    }
  }
}

// ─── Bot AI ──────────────────────────────────────────────
function updateBotAI(bot: Snake, snakes: Snake[], food: Food[]): void {
  if (!bot.alive) return;
  const head = bot.path[0];
  const distCenter = distFromOrigin(head);

  // Boundary avoidance (percentage-based, scales with any map size)
  const boundaryWarn = CFG.MAP_RADIUS * CFG.BOUNDARY_WARN_PCT;
  const boundaryDanger = CFG.MAP_RADIUS * CFG.BOUNDARY_DANGER_PCT;
  if (distCenter > boundaryWarn) {
    bot.targetAngle = angleTo(head, { x: 0, y: 0 });
    bot.boosting = distCenter > boundaryDanger;
    return;
  }

  bot.boostCooldown = Math.max(0, bot.boostCooldown - 1);
  bot.boosting = false;

  let danger = false;
  for (const other of snakes) {
    if (other === bot || !other.alive) continue;
    const segs = other._segPos;
    const checkLen = Math.min(segs.length, 50);
    const dangerDist = (bot._headRadius + other._bodyRadius) * 2.5;
    const dangerDist2 = dangerDist * dangerDist;
    const boostDist = (bot._headRadius + other._bodyRadius) * 1.5;
    const boostDist2 = boostDist * boostDist;
    for (let i = CFG.COLLISION_SKIP; i < checkLen; i += Math.max(1, Math.floor(other.segCount / 40))) {
      const sp = segs[i];
      if (!sp) continue;
      const dx = head.x - sp.x;
      const dy = head.y - sp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < dangerDist2) {
        bot.targetAngle = angleTo(sp, head);
        bot.aiTick = 30;
        danger = true;
        if (d2 < boostDist2) bot.boosting = true;
        break;
      }
    }
    if (danger) break;
  }
  if (danger) return;

  bot.aiTick--;
  if (bot.aiTick <= 0) {
    bot.aiTick = 20 + Math.floor(Math.random() * 40);

    // Use spatial hash — only scan nearby food, not all 400K
    let bestFood: Food | null = null;
    let bestDist2 = CFG.BOT_FOOD_RANGE * CFG.BOT_FOOD_RANGE;
    const nearFood = foodHash.query(head.x, head.y, CFG.BOT_FOOD_RANGE);
    for (let j = 0; j < nearFood.length; j++) {
      const fi = nearFood[j];
      if (fi >= food.length) continue;
      const f = food[fi];
      if (!f) continue;
      const dx = head.x - f.x;
      const dy = head.y - f.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestFood = f;
      }
    }

    if (bestFood) {
      bot.targetAngle = angleTo(head, bestFood);
    } else {
      bot.aiWanderAngle += (Math.random() - 0.5) * 1.2;
      bot.targetAngle = bot.aiWanderAngle;
    }
  }
}

// ─── Canvas Renderer ─────────────────────────────────────
// ─── Cached offscreen canvas for bite effect (reused, never re-created) ──
let _clipCvs: HTMLCanvasElement | null = null;
let _clipCtx: CanvasRenderingContext2D | null = null;
let _clipW = 0, _clipH = 0;
function getClipCanvas(W: number, H: number): { cvs: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!_clipCvs) {
    _clipCvs = document.createElement('canvas');
    _clipCtx = _clipCvs.getContext('2d')!;
    _clipW = W; _clipH = H;
    _clipCvs.width = W; _clipCvs.height = H;
  } else if (_clipW !== W || _clipH !== H) {
    _clipW = W; _clipH = H;
    _clipCvs.width = W; _clipCvs.height = H;
  }
  return { cvs: _clipCvs, ctx: _clipCtx! };
}

function renderGame(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  cam: Vec2,
  player: Snake | null,
  bots: Snake[],
  food: Food[],
  frame: number,
  zoom: number,
  walls: Wall[],
  pointerScreen: Vec2 | null,
) {
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, W, H);

  // Guard: if zoom or camera is broken, fallback to safe values
  if (!isFinite(zoom) || zoom <= 0) zoom = 1;
  if (!isFinite(cam.x)) cam.x = 0;
  if (!isFinite(cam.y)) cam.y = 0;

  // FIX #7: Zoom-aware offset
  const ox = W / 2 - cam.x * zoom;
  const oy = H / 2 - cam.y * zoom;

  // Visible world bounds (for culling)
  const cullMargin = CFG.MAX_BODY_RADIUS + 50;
  const viewL = cam.x - W / (2 * zoom) - cullMargin;
  const viewR = cam.x + W / (2 * zoom) + cullMargin;
  const viewT = cam.y - H / (2 * zoom) - cullMargin;
  const viewB = cam.y + H / (2 * zoom) + cullMargin;

  // ── Grid ─────────────────────────────────────────────
  const GRID = CFG.GRID_SIZE;
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  const gx0 = Math.floor(viewL / GRID) * GRID;
  const gy0 = Math.floor(viewT / GRID) * GRID;
  ctx.beginPath();
  for (let wx = gx0; wx <= viewR + GRID; wx += GRID) {
    const sx = wx * zoom + ox;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, H);
  }
  for (let wy = gy0; wy <= viewB + GRID; wy += GRID) {
    const sy = wy * zoom + oy;
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
  }
  ctx.stroke();

  // ── Map boundary ─────────────────────────────────────
  const mapR = Math.max(1, CFG.MAP_RADIUS);
  ctx.save();
  ctx.beginPath();
  ctx.arc(ox, oy, mapR * zoom, 0, TAU);
  ctx.strokeStyle = 'rgba(255,60,60,0.45)';
  ctx.lineWidth = 6;
  ctx.stroke();
  const dgR0 = Math.max(0.001, (mapR - 120) * zoom);
  const dgR1 = Math.max(dgR0 + 0.001, mapR * zoom);
  const dg = ctx.createRadialGradient(ox, oy, dgR0, ox, oy, dgR1);
  dg.addColorStop(0, 'rgba(255,0,0,0)');
  dg.addColorStop(1, 'rgba(255,0,0,0.12)');
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.restore();

  // ── Food (batched by color for speed) ──────────────
  // Group food by color to minimize fillStyle changes
  const showLabels = zoom > 0.3;
  const showGlow = zoom > 0.15;
  // Pass 1: glow layer (batched)
  if (showGlow) {
    for (const f of food) {
      if (f.x < viewL || f.x > viewR || f.y < viewT || f.y > viewB) continue;
      const sx = f.x * zoom + ox, sy = f.y * zoom + oy;
      const glowPad = f.tier === 'L' ? CFG.FOOD_L_RADIUS : f.tier === 'M' ? CFG.FOOD_M_RADIUS : CFG.FOOD_S_RADIUS;
      ctx.beginPath();
      ctx.arc(sx, sy, f.radius * zoom + glowPad * zoom, 0, TAU);
      ctx.fillStyle = f.glow;
      ctx.fill();
    }
  }
  // Pass 2: core layer (batched)
  for (const f of food) {
    if (f.x < viewL || f.x > viewR || f.y < viewT || f.y > viewB) continue;
    const sx = f.x * zoom + ox, sy = f.y * zoom + oy;
    ctx.beginPath();
    ctx.arc(sx, sy, f.radius * zoom, 0, TAU);
    ctx.fillStyle = f.color;
    ctx.fill();
  }
  // Pass 3: value labels (M/L only)
  if (showLabels) {
    for (const f of food) {
      if (f.tier === 'S') continue;
      if (f.x < viewL || f.x > viewR || f.y < viewT || f.y > viewB) continue;
      const sx = f.x * zoom + ox, sy = f.y * zoom + oy;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(f.radius * 0.9 * zoom + 4)}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(f.value), sx, sy);
    }
  }

  // ── Test Walls ─────────────────────────────────────
  ctx.lineCap = 'round';
  for (const w of walls) {
    const sx1 = w.x1 * zoom + ox, sy1 = w.y1 * zoom + oy;
    const sx2 = w.x2 * zoom + ox, sy2 = w.y2 * zoom + oy;
    // Glow
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.strokeStyle = 'rgba(255,200,50,0.15)';
    ctx.lineWidth = (w.thickness + 12) * zoom;
    ctx.stroke();
    // Wall body
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.strokeStyle = 'rgba(255,200,50,0.7)';
    ctx.lineWidth = w.thickness * zoom;
    ctx.stroke();
  }

  // ── Cache & draw snakes ─────────────────────────────
  for (const b of bots) { if (b.alive) cacheSegmentPositions(b, frame); }
  if (player?.alive) cacheSegmentPositions(player, frame);

  const allAlive = bots.filter(b => b.alive);
  if (player?.alive) allAlive.push(player);

  // Offscreen canvas for overlap bite effect (cached, reused across frames)
  let clipCvs: HTMLCanvasElement | null = null;
  let clipCtx: CanvasRenderingContext2D | null = null;
  const needsClip = allAlive.some(s => s._clipOverlaps.length > 0);
  if (needsClip) {
    const cc = getClipCanvas(W, H);
    if (cc) { clipCvs = cc.cvs; clipCtx = cc.ctx; }
  }

  // Convert pointer screen pos to world pos (for eye tracking)
  const pointerWorld = pointerScreen ? { x: (pointerScreen.x - ox) / zoom, y: (pointerScreen.y - oy) / zoom } : null;

  for (const snake of allAlive) {
    const trackPtr = snake.isPlayer ? pointerWorld : null;
    drawSnake(ctx, snake, ox, oy, W, H, frame, zoom, viewL, viewR, viewT, viewB, clipCvs, clipCtx, trackPtr);
  }

  // ── Minimap ──────────────────────────────────────────
  const mmR = 50;
  const mmX = W - mmR - 14;
  const mmY = mmR + 14;
  const mmS = mmR / CFG.MAP_RADIUS;

  ctx.beginPath();
  ctx.arc(mmX, mmY, mmR, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,60,60,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (const b of bots) {
    if (!b.alive) continue;
    ctx.beginPath();
    ctx.arc(mmX + b.path[0].x * mmS, mmY + b.path[0].y * mmS, 2, 0, TAU);
    ctx.fillStyle = b.color;
    ctx.fill();
  }
  if (player?.alive) {
    ctx.beginPath();
    ctx.arc(mmX + player.path[0].x * mmS, mmY + player.path[0].y * mmS, 3.5, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // ── Score HUD ────────────────────────────────────────
  if (player?.alive) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Score: ${Math.round(player.score).toLocaleString()}`, 16, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Length: ${player.segCount} / ${CFG.MAX_SEGMENTS}  ·  Points: ${player.growAccum.toFixed(1)}/${CFG.GROWTH_COST}`, 16, 42);
    // Boost fuel indicator: show how long boost will last
    const extraSegs = player.segCount - CFG.MIN_SEGMENTS;
    const scoreFuelSec = CFG.BOOST_SCORE_DRAIN > 0 ? player.score / CFG.BOOST_SCORE_DRAIN : 0;
    const segFuelSec = extraSegs > 0 ? (extraSegs / (60 / CFG.BOOST_DRAIN_RATE)) : 0;
    const totalFuelSec = segFuelSec + scoreFuelSec;
    const fuelColor = totalFuelSec > 3 ? 'rgba(100,255,100,0.5)' : totalFuelSec > 1 ? 'rgba(255,200,50,0.5)' : 'rgba(255,80,80,0.6)';
    ctx.fillStyle = fuelColor;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Boost Fuel: ${totalFuelSec.toFixed(1)}s  (seg:${segFuelSec.toFixed(1)}s + score:${scoreFuelSec.toFixed(1)}s)`, 16, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Thick: ${player._bodyRadius.toFixed(1)}px  ·  Dia: ${(player._bodyRadius * 2).toFixed(0)}px  ·  Growth: x${CFG.GROWTH_MULTIPLIER}`, 16, 78);
    ctx.restore();
  }
}

// ─── Draw Single Snake ───────────────────────────────────
function drawSnake(
  ctx: CanvasRenderingContext2D,
  snake: Snake,
  ox: number, oy: number,
  W: number, H: number,
  frame: number,
  zoom: number,
  viewL: number, viewR: number, viewT: number, viewB: number,
  clipCvs: HTMLCanvasElement | null,
  clipCtx: CanvasRenderingContext2D | null,
  pointerWorld: Vec2 | null,
) {
  const segs = snake._segPos;
  const segCount = snake.segCount;
  const bodyR = snake._bodyRadius * zoom;   // zoom-scaled
  const headR = snake._headRadius * zoom;

  // Helper: pick shape for segment index based on snake.shape
  const pickShape = (i: number): 'circle' | 'box' | 'triangle' => {
    switch (snake.shape) {
      case 'circle': return 'circle';
      case 'box': return 'box';
      case 'triangle': return 'triangle';
      case 'mix_ct': return (Math.floor(i / 2) % 2 === 0) ? 'circle' : 'triangle';
      case 'mix_cb': return (Math.floor(i / 2) % 2 === 0) ? 'circle' : 'box';
      case 'mix_bt': return (Math.floor(i / 2) % 2 === 0) ? 'box' : 'triangle';
      case 'mix_all': return ['circle', 'box', 'triangle'][i % 3] as 'circle' | 'box' | 'triangle';
    }
  };

  // Draw body segments with 3D gradient + shape (NO shadow — too expensive per-segment)
  for (let i = segCount - 1; i >= 1; i--) {
    const pos = segs[i];
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) continue;
    if (pos.x < viewL || pos.x > viewR || pos.y < viewT || pos.y > viewB) continue;

    const sx = pos.x * zoom + ox, sy = pos.y * zoom + oy;
    const stripe = Math.floor(i / 4) % 2 === 0;
    const fillC = stripe ? snake.color : snake.stripeColor;
    const segAngle = snake._segAngles[i] ?? snake.angle;
    const sh = pickShape(i);

    if (sh === 'circle') {
      ctx.fillStyle = make3DGrad(ctx, sx, sy, bodyR, fillC);
      ctx.beginPath();
      ctx.arc(sx, sy, bodyR, 0, TAU);
      ctx.fill();
    } else if (sh === 'box') {
      const half = bodyR * 1.05;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(segAngle);
      ctx.fillStyle = make3DGrad(ctx, 0, 0, half * 1.2, fillC);
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    } else if (sh === 'triangle') {
      const r = bodyR * 1.25;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(segAngle);
      ctx.fillStyle = make3DGrad(ctx, 0, 0, r, fillC);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.7, -r * 0.85);
      ctx.lineTo(-r * 0.7, r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Bite effect — only erase the overlapping region, not the whole segment
  const clips = snake._clipOverlaps;
  if (clips.length > 0) {
    // Collect unique affected segment indices
    const affectedSegs = new Set<number>();
    for (const c of clips) affectedSegs.add(c.segIdx);

    // Reuse offscreen canvas from parameter
    if (clipCvs && clipCtx) {
      clipCtx.clearRect(0, 0, clipCvs.width, clipCvs.height);

      // Redraw only the affected segments onto offscreen canvas (with 3D gradient)
      for (const si of affectedSegs) {
        const pos = segs[si];
        if (!pos) continue;
        if (pos.x < viewL || pos.x > viewR || pos.y < viewT || pos.y > viewB) continue;
        const sx = pos.x * zoom + ox, sy = pos.y * zoom + oy;
        const stripe = Math.floor(si / 4) % 2 === 0;
        const fillC = stripe ? snake.color : snake.stripeColor;
        const segAngle = snake._segAngles[si] ?? snake.angle;
        const sh = pickShape(si);
        if (sh === 'circle') {
          clipCtx.fillStyle = make3DGrad(clipCtx, sx, sy, bodyR, fillC);
          clipCtx.beginPath(); clipCtx.arc(sx, sy, bodyR, 0, TAU); clipCtx.fill();
        } else if (sh === 'box') {
          const half = bodyR * 1.05;
          clipCtx.save(); clipCtx.translate(sx, sy); clipCtx.rotate(segAngle);
          clipCtx.fillStyle = make3DGrad(clipCtx, 0, 0, half * 1.2, fillC);
          clipCtx.fillRect(-half, -half, half * 2, half * 2);
          clipCtx.restore();
        } else {
          const r = bodyR * 1.25;
          clipCtx.save(); clipCtx.translate(sx, sy); clipCtx.rotate(segAngle);
          clipCtx.fillStyle = make3DGrad(clipCtx, 0, 0, r, fillC);
          clipCtx.beginPath(); clipCtx.moveTo(r, 0); clipCtx.lineTo(-r * 0.7, -r * 0.85); clipCtx.lineTo(-r * 0.7, r * 0.85); clipCtx.closePath(); clipCtx.fill();
          clipCtx.restore();
        }
      }

      // Darken only the overlap circles — use clip() to restrict to bite area only
      // This prevents the segment's gradient border from getting darker
      const darkenColor = snake.color;
      for (const c of clips) {
        const cx = c.ox * zoom + ox, cy = c.oy * zoom + oy;
        const r = Math.max(1, c.or * zoom + 1);
        clipCtx.save();
        // Clip to bite circle — only pixels inside are affected
        clipCtx.beginPath();
        clipCtx.arc(cx, cy, r, 0, TAU);
        clipCtx.clip();
        // Apply radial shadow (source-over, clipped to bite area)
        const grad = clipCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(0,0,0,${CFG.BITE_DARKEN_CENTER})`);
        grad.addColorStop(0.6, `rgba(0,0,0,${CFG.BITE_DARKEN_MID})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        clipCtx.fillStyle = grad;
        clipCtx.beginPath(); clipCtx.arc(cx, cy, r, 0, TAU); clipCtx.fill();
        // Tint with skin color for natural look
        clipCtx.globalAlpha = CFG.BITE_TINT_OPACITY;
        clipCtx.fillStyle = darkenColor;
        clipCtx.beginPath(); clipCtx.arc(cx, cy, r, 0, TAU); clipCtx.fill();
        clipCtx.globalAlpha = 1.0;
        clipCtx.restore(); // removes clip
      }

      // Composite the bitten segments onto the main canvas
      // Erase original segments (exact same radius as drawn — no +0.5 mismatch)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (const si of affectedSegs) {
        const pos = segs[si];
        if (!pos) continue;
        if (pos.x < viewL || pos.x > viewR || pos.y < viewT || pos.y > viewB) continue;
        const sx = pos.x * zoom + ox, sy = pos.y * zoom + oy;
        const segAngle = snake._segAngles[si] ?? snake.angle;
        const sh = pickShape(si);
        if (sh === 'circle') {
          ctx.beginPath(); ctx.arc(sx, sy, bodyR, 0, TAU); ctx.fill();
        } else if (sh === 'box') {
          const half = bodyR * 1.05;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(segAngle);
          ctx.fillRect(-half, -half, half * 2, half * 2);
          ctx.restore();
        } else {
          const r = bodyR * 1.25;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(segAngle);
          ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.85); ctx.lineTo(-r * 0.7, r * 0.85); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();

      // Then draw the bitten version back
      ctx.drawImage(clipCvs, 0, 0);
    }
  }

  // Head — shape matches body style with 3D gradient + ground shadow
  const hx = snake.path[0].x * zoom + ox;
  const hy = snake.path[0].y * zoom + oy;
  const headMargin = headR + 60;
  if (hx < -headMargin || hx > W + headMargin || hy < -headMargin || hy > H + headMargin) return;

  const headShape = pickShape(0);

  // Boost glow
  if (snake.boosting) {
    ctx.beginPath();
    ctx.arc(hx, hy, headR + 8 * zoom, 0, TAU);
    ctx.fillStyle = snake.color + '33';
    ctx.fill();
  }

  // Head with 3D gradient
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = headR * 0.4;
  ctx.shadowOffsetX = headR * 0.08;
  ctx.shadowOffsetY = headR * 0.12;

  if (headShape === 'box') {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(snake.angle);
    const half = headR * 1.05;
    ctx.fillStyle = make3DGrad(ctx, 0, 0, half * 1.2, snake.headColor);
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.restore();
  } else if (headShape === 'triangle') {
    const r = headR * 1.25;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(snake.angle);
    ctx.fillStyle = make3DGrad(ctx, 0, 0, r, snake.headColor);
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.85); ctx.lineTo(-r * 0.7, r * 0.85); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = make3DGrad(ctx, hx, hy, headR, snake.headColor);
    ctx.beginPath(); ctx.arc(hx, hy, headR, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // ── Face coordinate system (used by specular + all features) ──
  const fwdX = Math.cos(snake.angle);
  const fwdY = Math.sin(snake.angle);
  const lftX = -Math.sin(snake.angle);
  const lftY = Math.cos(snake.angle);

  // Specular highlight — face-relative (behind-left of face, rotates with snake)
  const hlFwd = -headR * 0.15;
  const hlLat = -headR * 0.30;
  const hlX = hx + fwdX * hlFwd + lftX * hlLat;
  const hlY = hy + fwdY * hlFwd + lftY * hlLat;
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(hlX, hlY, headR * 0.14, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── Face: eyes ──
  // Pupils move in ALL directions, smoothly interpolated
  const EYE_R = bodyR * 0.46;
  const PUPIL_R = EYE_R * 0.50;
  const PUPIL_MAX = EYE_R - PUPIL_R;
  const EYE_FWD = headR * -0.05;
  const EYE_LAT = headR * 0.40;

  // Use smoothed pupil offset from per-frame update
  const pOffX = snake._pupilX;
  const pOffY = snake._pupilY;

  for (const side of [1, -1]) {
    const ex = hx + fwdX * EYE_FWD + lftX * EYE_LAT * side;
    const ey = hy + fwdY * EYE_FWD + lftY * EYE_LAT * side;
    // Eye white
    ctx.beginPath(); ctx.arc(ex, ey, EYE_R, 0, TAU);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = Math.max(0.8, bodyR * 0.03);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
    // Pupil — 2D offset from smooth tracking
    ctx.beginPath();
    ctx.arc(ex + pOffX, ey + pOffY, PUPIL_R, 0, TAU);
    ctx.fillStyle = '#111'; ctx.fill();
  }

  // ── Nose: two small dots in FRONT of eyes (toward front of face) ──
  const NOSE_FWD = headR * 0.28;      // in front of eyes, toward front of face
  const NOSE_LAT = headR * 0.09;      // between the eyes
  const NOSE_R = Math.max(1.5, bodyR * 0.07);
  const nCX = hx + fwdX * NOSE_FWD;
  const nCY = hy + fwdY * NOSE_FWD;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(nCX + lftX * NOSE_LAT, nCY + lftY * NOSE_LAT, NOSE_R, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(nCX - lftX * NOSE_LAT, nCY - lftY * NOSE_LAT, NOSE_R, 0, TAU); ctx.fill();

  // ── Mouth: smile arc in front of nose (at the front tip of face) ──
  const MOUTH_FWD = headR * 0.50;     // at the front tip, in front of nose
  const MOUTH_W = Math.max(2, bodyR * 0.22);
  const mCX = hx + fwdX * MOUTH_FWD;
  const mCY = hy + fwdY * MOUTH_FWD;
  ctx.save();
  ctx.translate(mCX, mCY);
  ctx.rotate(snake.angle);
  ctx.beginPath();
  ctx.arc(0, 0, MOUTH_W, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(0.8, bodyR * 0.06);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Center line: INVISIBLE — collision still uses spine-only hitbox (20% of body radius)
  // Visual line removed; spine collision in checkCollisions() remains active

  // Direction arrow — player only, smooth lerp, extends when boosting
  if (snake.isPlayer) {
  const arrowAngle = snake.targetAngle;
  const targetDist = bodyR * 7 + (snake.boosting ? 55 * zoom : 0);
  snake._arrowDist += (targetDist - snake._arrowDist) * 0.035; // Slower smooth lerp
  const arrowDist = snake._arrowDist;
  const arrowTipX = hx + Math.cos(arrowAngle) * arrowDist;
  const arrowTipY = hy + Math.sin(arrowAngle) * arrowDist;
  const arrowSize = Math.max(8 * zoom, bodyR * 0.7);
  const perpX = Math.cos(arrowAngle + Math.PI / 2);
  const perpY = Math.sin(arrowAngle + Math.PI / 2);
  const backX = Math.cos(arrowAngle + Math.PI);
  const backY = Math.sin(arrowAngle + Math.PI);

  ctx.beginPath();
  ctx.moveTo(arrowTipX, arrowTipY);
  ctx.lineTo(arrowTipX + backX * arrowSize + perpX * arrowSize * 0.85,
             arrowTipY + backY * arrowSize + perpY * arrowSize * 0.85);
  ctx.lineTo(arrowTipX + backX * arrowSize - perpX * arrowSize * 0.85,
             arrowTipY + backY * arrowSize - perpY * arrowSize * 0.85);
  ctx.closePath();
  ctx.fillStyle = snake.boosting ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)';
  ctx.fill();
  } // end player-only arrow

  // Name label (screen-space font, not zoomed)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const nameSize = Math.max(10, Math.min(13, snake._bodyRadius * 0.9));
  ctx.font = `bold ${nameSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(`${snake.name}`, hx, hy - bodyR - 6 * zoom);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
//  REACT COMPONENT
// ═══════════════════════════════════════════════════════════
export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<'start' | 'playing' | 'dead'>('start');
  const [deathScore, setDeathScore] = useState(0);
  const [isBoosting, setIsBoosting] = useState(false);
  const [shapeIdx, setShapeIdx] = useState(0);
  const shapeRef = useRef(0);
  const [skinIdx, setSkinIdx] = useState(0);
  const skinRef = useRef(0);
  const [showSkinPicker, setShowSkinPicker] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [, setAdminTick] = useState(0); // force re-render on slider change
  const demoRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const g = {
      screen: 'start' as 'start' | 'playing' | 'dead',
      player: null as Snake | null,
      bots: [] as Snake[],
      food: [] as Food[],
      walls: createTestWalls(),
      cam: { x: 0, y: 0 },
      zoom: 1.0,
      touch: { active: false, x: 0, y: 0 },
      boost: false,
      // FIX #6: Track pointer IDs so multi-touch boost works
      steerPointerId: -1,
      boostPointerId: -1,
      frame: 0,
      selectedShape: SNAKE_SHAPES[0],
      _wasBoosting: false,
    };

    // ── Resize ───────────────────────────────────────────
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cvs.width = window.innerWidth * dpr;
      cvs.height = window.innerHeight * dpr;
      cvs.style.width = window.innerWidth + 'px';
      cvs.style.height = window.innerHeight + 'px';
      cvs.getContext('2d')?.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Start / Restart ──────────────────────────────────
    const startGame = () => {
      g.selectedShape = SNAKE_SHAPES[shapeRef.current];
      g.player = makeSnake(true, g.selectedShape, skinRef.current);
      g.bots = Array.from({ length: CFG.BOT_COUNT }, () => {
        const newSegCount = CFG.BOT_MIN_SEGS + Math.floor(Math.random() * (CFG.BOT_MAX_SEGS - CFG.BOT_MIN_SEGS));
        return makeSnake(false, undefined, undefined, newSegCount);
      });
      g.food = Array.from({ length: CFG.FOOD_COUNT }, () => {
        const p = randInCircle(0, 0, CFG.MAP_RADIUS - 100);
        return makeFood(p.x, p.y);
      });
      g.cam = { x: 0, y: 0 };
      g.zoom = 1.0;
      g.frame = 0;
      g.touch.active = false;
      g.boost = false;
      g._wasBoosting = false;
      g.steerPointerId = -1;
      g.boostPointerId = -1;
      g.screen = 'playing';
      setScreen('playing');
    };

    const handleDeath = () => {
      g.screen = 'dead';
      setDeathScore(calcScore(g.player?.segCount ?? 0));
      setScreen('dead');
      g.boost = false;
      setIsBoosting(false);
      g.steerPointerId = -1;
      g.boostPointerId = -1;
    };

    // ── FIX #6: Multi-touch input with pointer ID tracking ──
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const r = cvs.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const bw = window.innerWidth, bh = window.innerHeight;

      if (g.screen === 'playing') {
        // Boost button zone (bottom-right)
        if (x > bw - 110 && y > bh - 110) {
          g.boostPointerId = e.pointerId;
          g.boost = true;
          setIsBoosting(true);
          return;
        }
        // Steer
        g.steerPointerId = e.pointerId;
        g.touch = { active: true, x, y };
        return;
      }
      // Don't auto-start from canvas on start screen (shape selector handles it)
      if (g.screen === 'dead') startGame();
    };

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const r = cvs.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const bw = window.innerWidth, bh = window.innerHeight;

      if (g.screen !== 'playing') return;

      // If this pointer is the boost pointer, track it
      if (e.pointerId === g.boostPointerId) {
        if (x <= bw - 110 || y <= bh - 110) {
          // Moved out of boost zone
          g.boostPointerId = -1;
          g.boost = false;
          setIsBoosting(false);
        }
        return;
      }

      // Steer pointer
      if (e.pointerId === g.steerPointerId || g.steerPointerId === -1) {
        if (x > bw - 110 && y > bh - 110) {
          // Moved into boost zone
          if (g.steerPointerId === e.pointerId) g.steerPointerId = -1;
          g.boostPointerId = e.pointerId;
          g.boost = true;
          setIsBoosting(true);
          return;
        }
        g.steerPointerId = e.pointerId;
        g.touch = { active: true, x, y };
      }
    };

    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      if (e.pointerId === g.steerPointerId) {
        g.steerPointerId = -1;
        g.touch.active = false;
      }
      if (e.pointerId === g.boostPointerId) {
        g.boostPointerId = -1;
        g.boost = false;
        setIsBoosting(false);
      }
    };

    cvs.addEventListener('pointerdown', onDown, { passive: false });
    cvs.addEventListener('pointermove', onMove, { passive: false });
    cvs.addEventListener('pointerup', onUp, { passive: false });
    cvs.addEventListener('pointerleave', onUp, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (g.screen === 'start') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          setShapeIdx(p => { const n = (p - 1 + SNAKE_SHAPES.length) % SNAKE_SHAPES.length; shapeRef.current = n; return n; });
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          setShapeIdx(p => { const n = (p + 1) % SNAKE_SHAPES.length; shapeRef.current = n; return n; });
        } else if (e.code === 'Enter' || e.code === 'Space') {
          startGame();
        }
        return;
      }
      if (g.screen === 'dead') { startGame(); return; }
      if (e.code === 'Space') { g.boost = true; setIsBoosting(true); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { g.boost = false; setIsBoosting(false); }
    });

    // Custom event from Play button on start screen
    const onCustomStart = () => startGame();
    window.addEventListener('snake-start', onCustomStart);

    // ── Seed food for start screen ────────────────────────
    g.food = Array.from({ length: CFG.FOOD_COUNT }, () => {
      const p = randInCircle(0, 0, CFG.MAP_RADIUS - 100);
      return makeFood(p.x, p.y);
    });

    // ── Main Loop ────────────────────────────────────────
    let raf = 0;
    const tick = () => {
      const ctx = cvs.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(tick); return; }

      const W = cvs.width / (window.devicePixelRatio || 1);
      const H = cvs.height / (window.devicePixelRatio || 1);

      if (g.screen === 'playing') {
        const p = g.player;
        const wasAlive = p?.alive ?? false;

        // ── Rebuild food spatial hash (O(n), fast) ──
        foodHash.clear();
        for (let i = 0; i < g.food.length; i++) {
          foodHash.insert(i, g.food[i].x, g.food[i].y);
        }

        if (p?.alive) {
          if (g.touch.active) {
            const dx = g.touch.x - W / 2;
            const dy = g.touch.y - H / 2;
            if (dx * dx + dy * dy > 100) {
              p.targetAngle = Math.atan2(dy, dx);
            }
          }
          // Boost works if: (1) has extra segments to burn, OR (2) has enough score to fuel it
          p.boosting = g.boost && (p.segCount > CFG.MIN_SEGMENTS || p.score >= CFG.BOOST_MIN_SCORE);
          // Auto-stop boost if score hits 0 while at min segments
          if (p.boosting && p.segCount <= CFG.MIN_SEGMENTS && p.score <= 0) {
            p.boosting = false;
            g.boost = false;
            setIsBoosting(false);
          }
          // Instant boost burst — drop food the moment boost activates
          if (p.boosting && !g._wasBoosting) {
            // Burst from extra segments
            if (CFG.BOOST_INSTANT_DROP > 0 && p.segCount > CFG.MIN_SEGMENTS) {
              const burstCount = Math.min(CFG.BOOST_INSTANT_DROP, p.segCount - CFG.MIN_SEGMENTS);
              for (let d = 0; d < burstCount; d++) {
                const tailIdx = Math.min(p.segCount - 1 - d, p.path.length - 1);
                const tp = p.path[tailIdx] || p.path[p.path.length - 1];
                if (tp && distFromOrigin(tp) < CFG.MAP_RADIUS - 50) {
                  const offset = (d % 2 === 0 ? 1 : -1) * CFG.BOOST_DROP_SPREAD * 1.5;
                  const prevIdx = Math.min(tailIdx + 1, p.path.length - 1);
                  const pp = p.path[prevIdx];
                  let fx = tp.x, fy = tp.y;
                  if (pp) {
                    const ddx = tp.x - pp.x, ddy = tp.y - pp.y;
                    const len = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (len > 0) { fx += (ddy / len) * offset; fy -= (ddx / len) * offset; }
                  }
                  const bf = makeFood(fx, fy, 'S');
                  bf.value = getBoostDropValue(p.score);
                  g.food.push(bf);
                }
              }
              p.segCount = Math.max(CFG.MIN_SEGMENTS, p.segCount - burstCount);
              p.score = Math.max(0, p.score - burstCount * CFG.GROWTH_COST * CFG.SCORE_PER_POINT);
            }
            // Burst from score when at min segments — convert score into food orbs
            if (p.segCount <= CFG.MIN_SEGMENTS && p.score > 0) {
              const scoreToSpend = p.score; // spend all available score
              const orbValue = Math.max(0.1, getBoostDropValue(p.score));
              const orbCount = Math.floor(scoreToSpend / orbValue);
              const tailIdx = Math.min(p.segCount - 1, p.path.length - 1);
              const tp = p.path[tailIdx] || p.path[p.path.length - 1];
              for (let d = 0; d < orbCount && tp; d++) {
                if (distFromOrigin(tp) < CFG.MAP_RADIUS - 50) {
                  const offset = (d % 2 === 0 ? 1 : -1) * CFG.BOOST_DROP_SPREAD * 1.5;
                  const prevIdx = Math.min(tailIdx + 1, p.path.length - 1);
                  const pp = p.path[prevIdx];
                  let fx = tp.x + (Math.random() - 0.5) * 10, fy = tp.y + (Math.random() - 0.5) * 10;
                  if (pp) {
                    const ddx = tp.x - pp.x, ddy = tp.y - pp.y;
                    const len = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (len > 0) { fx += (ddy / len) * offset; fy -= (ddx / len) * offset; }
                  }
                  const bf = makeFood(fx, fy, 'S');
                  bf.value = getBoostDropValue(p.score - d * orbValue);
                  g.food.push(bf);
                }
              }
              p.score = Math.max(0, p.score - orbCount * orbValue);
            }
          }
          g._wasBoosting = p.boosting;
          moveSnake(p, g.food, g.frame);

          // Smooth camera follow
          g.cam.x += (p.path[0].x - g.cam.x) * CFG.CAM_FOLLOW_SPEED;
          g.cam.y += (p.path[0].y - g.cam.y) * CFG.CAM_FOLLOW_SPEED;

          // Dynamic zoom: starts close, pulls out as snake grows, delayed lerp
          const maxSeg = Math.max(1, CFG.MAX_SEGMENTS * 0.8);
          const targetZoom = Math.max(CFG.MIN_ZOOM, 1.0 - (p.segCount - CFG.INITIAL_SEGMENTS) / maxSeg);
          g.zoom += (targetZoom - g.zoom) * CFG.ZOOM_LERP;
          if (!isFinite(g.zoom)) g.zoom = CFG.MIN_ZOOM;

          if (wasAlive && !p.alive) handleDeath();
        }

        // Bot updates — frame-skip: only update 1/N bots per frame for massive counts
        const totalBots = g.bots.length;
        const botsPerFrame = Math.max(1, Math.ceil(totalBots / 4)); // update 25% of bots each frame
        const botStart = g.frame % 4;
        const allSnakes: Snake[] = p?.alive ? [p, ...g.bots] : [...g.bots];
        for (let i = 0; i < totalBots; i++) {
          const b = g.bots[i];
          if (!b.alive) {
            b.respawnTimer++;
            if (b.respawnTimer > CFG.BOT_RESPAWN_TIME) {
              const newSegCount = CFG.BOT_MIN_SEGS + Math.floor(Math.random() * (CFG.BOT_MAX_SEGS - CFG.BOT_MIN_SEGS));
              g.bots[i] = makeSnake(false, undefined, undefined, newSegCount);
            }
            continue;
          }
          // Frame-skip: each bot updates every 4 frames
          if ((i % 4) !== botStart) {
            // Still move the bot (cheap), just skip AI
            moveSnake(b, g.food, g.frame);
            cacheSegmentPositions(b, g.frame);
            continue;
          }
          updateBotAI(b, allSnakes, g.food);
          moveSnake(b, g.food, g.frame);
          cacheSegmentPositions(b, g.frame);
        }

        if (p?.alive) cacheSegmentPositions(p, g.frame);

        checkCollisions(allSnakes, g.food);
        checkWallCollision(allSnakes, g.walls, g.food);
        detectBodyClips(allSnakes, g.walls);
        // Update eye tracking (smooth pupil interpolation)
        for (const s of allSnakes) {
          if (!s.alive) continue;
          // Turn direction relative to heading
          const relLook = shortestAngleDelta(s.angle, s.targetAngle);
          const shiftMag = Math.min(1, Math.abs(relLook) / 0.8);
          // Target pupil offset in 2D (forward + lateral)
          const sfX = Math.cos(s.angle);
          const sfY = Math.sin(s.angle);
          const slX = -Math.sin(s.angle);
          const slY = Math.cos(s.angle);
          const pma = s._bodyRadius * 0.23; // max pupil travel
          const tFwd = Math.cos(relLook) * pma * shiftMag;
          const tLat = Math.sin(relLook) * pma * shiftMag;
          const tpx = sfX * tFwd + slX * tLat;
          const tpy = sfY * tFwd + slY * tLat;
          // Smooth ramp (like slither.io)
          const pSpd = pma * 0.18;
          if (s._pupilX < tpx) s._pupilX = Math.min(s._pupilX + pSpd, tpx);
          else s._pupilX = Math.max(s._pupilX - pSpd, tpx);
          if (s._pupilY < tpy) s._pupilY = Math.min(s._pupilY + pSpd, tpy);
          else s._pupilY = Math.max(s._pupilY - pSpd, tpy);
        }
        if (g.player && !g.player.alive && g.screen === 'playing') {
          handleDeath();
        }

        while (g.food.length < CFG.FOOD_COUNT) {
          const fp = randInCircle(0, 0, CFG.MAP_RADIUS - 100);
          g.food.push(makeFood(fp.x, fp.y));
        }
        // Cap food to prevent unbounded growth from snake deaths
        if (g.food.length > CFG.FOOD_COUNT * CFG.FOOD_CAP_MULT) g.food.length = Math.round(CFG.FOOD_COUNT * CFG.FOOD_CAP_MULT);

        g.frame++;
      }

      renderGame(ctx, W, H, g.cam, g.player, g.bots, g.food, g.frame, g.zoom, g.walls, g.touch.active ? { x: g.touch.x, y: g.touch.y } : null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      cvs.removeEventListener('pointerdown', onDown);
      cvs.removeEventListener('pointermove', onMove);
      cvs.removeEventListener('pointerup', onUp);
      cvs.removeEventListener('pointerleave', onUp);
      window.removeEventListener('snake-start', onCustomStart);
      cancelAnimationFrame(raf);
    };
  }, []);

  const previewShape = SNAKE_SHAPES[shapeIdx];

  const selectedSkin = SNAKE_PALETTES[skinIdx];
  const skinIdxRef = useRef(skinIdx);
  skinIdxRef.current = skinIdx;  // Keep ref in sync without triggering effect restart

  const handlePlay = () => {
    shapeRef.current = shapeIdx;
    skinRef.current = skinIdx;
    window.dispatchEvent(new CustomEvent('snake-start'));
  };


  // Scrollable skin list — momentum scrolling, no effect restart on skin change
  useEffect(() => {
    if (screen !== 'start' || !showSkinPicker) return;
    const cvs = demoRefs.current[0];
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const SEGS = 50;
    const SPACING = CFG.SEG_SPACING;
    const BODY_R = 9;
    const HEAD_R = BODY_R * 1.05; // 5% bigger head
    const TAU2 = Math.PI * 2;
    const cw = cvs.width, ch = cvs.height;
    const TOTAL = SNAKE_PALETTES.length;
    const ROW_H = 80;
    const WAVE_SPEED = 0.045;
    const WAVE_FREQ = 0.3;
    const WAVE_AMP = 6;
    const MAX_SCROLL = (TOTAL - 1) * ROW_H;
    const clampScroll = (v: number) => Math.max(0, Math.min(MAX_SCROLL, v));
    const rowFromScroll = (sy: number) => Math.max(0, Math.min(TOTAL - 1, Math.round((sy + ch / 2 - ROW_H / 2) / ROW_H)));

    let scrollY = skinIdxRef.current * ROW_H - ch / 2 + ROW_H / 2;
    let velocity = 0;               // Momentum velocity (pixels per frame)
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;
    let dragMoved = 0;
    let lastPtrY = 0;
    let lastPtrTime = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    const pickShapeFor = (shape: SnakeShape, i: number): 'circle' | 'box' | 'triangle' => {
      switch (shape) {
        case 'circle': return 'circle';
        case 'box': return 'box';
        case 'triangle': return 'triangle';
        case 'mix_ct': return (Math.floor(i / 2) % 2 === 0) ? 'circle' : 'triangle';
        case 'mix_cb': return (Math.floor(i / 2) % 2 === 0) ? 'circle' : 'box';
        case 'mix_bt': return (Math.floor(i / 2) % 2 === 0) ? 'box' : 'triangle';
        case 'mix_all': return ['circle', 'box', 'triangle'][i % 3] as 'circle' | 'box' | 'triangle';
      }
    };

    const computeSegs = (baseY: number, animFrame: number, isAnimated: boolean) => {
      const totalLen = (SEGS - 1) * SPACING;
      const startX = (cw - totalLen) / 2;
      const segs: { x: number; y: number; a: number }[] = [];
      for (let i = 0; i < SEGS; i++) {
        const x = startX + i * SPACING;
        const y = baseY + (isAnimated ? Math.sin(animFrame * WAVE_SPEED - i * WAVE_FREQ) * WAVE_AMP : Math.sin(-i * WAVE_FREQ) * WAVE_AMP * 0.3);
        let a = Math.PI;
        if (i > 0) { const prev = segs[i - 1]; a = Math.atan2(prev.y - y, prev.x - x); }
        segs.push({ x, y, a });
      }
      return segs;
    };

    const drawSnakeRow = (segs: { x: number; y: number; a: number }[], skin: typeof SNAKE_PALETTES[0], shape: SnakeShape, animFrame: number, isAnimated: boolean, alpha: number) => {
      ctx.globalAlpha = alpha;
      // Subtle ground shadow for lobby snakes
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = BODY_R * 0.3;
      ctx.shadowOffsetX = BODY_R * 0.06;
      ctx.shadowOffsetY = BODY_R * 0.1;
      for (let i = segs.length - 1; i >= 1; i--) {
        const sp = segs[i];
        const fillC = Math.floor(i / 4) % 2 === 0 ? skin.color : skin.stripe;
        const sh = pickShapeFor(shape, i);
        if (sh === 'circle') {
          ctx.fillStyle = make3DGrad(ctx, sp.x, sp.y, BODY_R, fillC);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, BODY_R, 0, TAU2); ctx.fill();
        } else if (sh === 'box') {
          ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.a);
          const half = BODY_R * 1.05;
          ctx.fillStyle = make3DGrad(ctx, 0, 0, half * 1.2, fillC);
          ctx.fillRect(-half, -half, half * 2, half * 2);
          ctx.restore();
        } else {
          ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.a);
          const r = BODY_R * 1.25;
          ctx.fillStyle = make3DGrad(ctx, 0, 0, r, fillC);
          ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.85); ctx.lineTo(-r * 0.7, r * 0.85); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore(); // remove shadow
      // Head with 3D gradient
      if (segs.length > 0) {
        const hx = segs[0].x, hy = segs[0].y;
        const headAngle = segs[0].a;
        const headSh = pickShapeFor(shape, 0);
        if (headSh === 'box') {
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(headAngle);
          const half = HEAD_R * 1.05;
          ctx.fillStyle = make3DGrad(ctx, 0, 0, half * 1.2, skin.head);
          ctx.fillRect(-half, -half, half * 2, half * 2);
          ctx.restore();
        } else if (headSh === 'triangle') {
          const r = HEAD_R * 1.25;
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(headAngle);
          ctx.fillStyle = make3DGrad(ctx, 0, 0, r, skin.head);
          ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.85); ctx.lineTo(-r * 0.7, r * 0.85); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = make3DGrad(ctx, hx, hy, HEAD_R, skin.head);
          ctx.beginPath(); ctx.arc(hx, hy, HEAD_R, 0, TAU2); ctx.fill();
        }
        // ── Face coordinate system (forward = headAngle, left = +PI/2) ──
        const lFwdX = Math.cos(headAngle);
        const lFwdY = Math.sin(headAngle);
        const lLftX = -Math.sin(headAngle);
        const lLftY = Math.cos(headAngle);

        // Specular highlight — face-relative (rotates with snake head)
        const lHlFwd = -HEAD_R * 0.15;
        const lHlLat = -HEAD_R * 0.30;
        const lHlX = hx + lFwdX * lHlFwd + lLftX * lHlLat;
        const lHlY = hy + lFwdY * lHlFwd + lLftY * lHlLat;
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(lHlX, lHlY, HEAD_R * 0.14, 0, TAU2); ctx.fill();
        ctx.globalAlpha = alpha;

        // ── Face: eyes (matches game) ──
        const L_EYE_R = BODY_R * 0.46;
        const L_PUPIL_R = L_EYE_R * 0.50;
        const L_EYE_FWD = HEAD_R * -0.05;
        const L_EYE_LAT = HEAD_R * 0.40;

        const headWaveSlope = isAnimated ? Math.cos(animFrame * WAVE_SPEED) * WAVE_FREQ * WAVE_AMP : 0;
        const lPupilAmp = BODY_R * 0.14;
        const lPx = lFwdX * lPupilAmp * Math.cos(headWaveSlope * 0.3) + lLftX * lPupilAmp * Math.sin(headWaveSlope * 0.3);
        const lPy = lFwdY * lPupilAmp * Math.cos(headWaveSlope * 0.3) + lLftY * lPupilAmp * Math.sin(headWaveSlope * 0.3);

        for (const side of [1, -1]) {
          const ex = hx + lFwdX * L_EYE_FWD + lLftX * L_EYE_LAT * side;
          const ey = hy + lFwdY * L_EYE_FWD + lLftY * L_EYE_LAT * side;
          ctx.beginPath(); ctx.arc(ex, ey, L_EYE_R, 0, TAU2);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
          ctx.beginPath(); ctx.arc(ex + lPx, ey + lPy, L_PUPIL_R, 0, TAU2);
          ctx.fillStyle = '#111'; ctx.fill();
        }

        // Nose: two dots in FRONT of eyes (toward front of face)
        const lNoseFwd = HEAD_R * 0.28;
        const lNoseLat = HEAD_R * 0.09;
        const lNoseR = Math.max(1, BODY_R * 0.07);
        const lNCX = hx + lFwdX * lNoseFwd;
        const lNCY = hy + lFwdY * lNoseFwd;
        ctx.fillStyle = `rgba(0,0,0,${0.4 * alpha})`;
        ctx.beginPath(); ctx.arc(lNCX + lLftX * lNoseLat, lNCY + lLftY * lNoseLat, lNoseR, 0, TAU2); ctx.fill();
        ctx.beginPath(); ctx.arc(lNCX - lLftX * lNoseLat, lNCY - lLftY * lNoseLat, lNoseR, 0, TAU2); ctx.fill();

        // Mouth: smile arc in front of nose (front tip of face)
        const lMouthFwd = HEAD_R * 0.50;
        const lMouthW = Math.max(1.5, BODY_R * 0.22);
        const lMCX = hx + lFwdX * lMouthFwd;
        const lMCY = hy + lFwdY * lMouthFwd;
        ctx.save();
        ctx.translate(lMCX, lMCY);
        ctx.rotate(headAngle);
        ctx.beginPath(); ctx.arc(0, 0, lMouthW, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.strokeStyle = `rgba(0,0,0,${0.3 * alpha})`;
        ctx.lineWidth = Math.max(0.8, BODY_R * 0.06);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();


      }
      ctx.globalAlpha = 1;
    };

    // ── Touch / mouse scroll with momentum ──
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      dragging = true;
      velocity = 0;
      dragStartY = e.clientY;
      lastPtrY = e.clientY;
      lastPtrTime = performance.now();
      dragStartScroll = scrollY;
      dragMoved = 0;
      cvs.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const scale = cvs.height / (cvs.clientHeight || 1);
      const dy = (e.clientY - dragStartY) * scale;
      scrollY = clampScroll(dragStartScroll - dy);
      dragMoved += Math.abs(e.clientY - dragStartY);
      // Track velocity for fling
      const now = performance.now();
      const dt = now - lastPtrTime;
      if (dt > 0) {
        velocity = (lastPtrY - e.clientY) * scale / dt * 16; // pixels per frame (~60fps)
      }
      lastPtrY = e.clientY;
      lastPtrTime = now;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (dragMoved < 8) {
        // Tap — select skin under finger
        const scale = cvs.height / (cvs.clientHeight || 1);
        const tapY = (e.clientY - cvs.getBoundingClientRect().top) * scale + scrollY;
        const row = Math.round((tapY - ROW_H / 2) / ROW_H);
        if (row >= 0 && row < TOTAL) {
          setSkinIdx(row);
        }
      }
      // If velocity is tiny, snap to nearest row immediately
      if (Math.abs(velocity) < 0.5) {
        velocity = 0;
        const snapped = rowFromScroll(scrollY);
        setSkinIdx(snapped);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scale = cvs.height / (cvs.clientHeight || 1);
      scrollY = clampScroll(scrollY + e.deltaY * scale);
      velocity = 0; // Wheel doesn't fling
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        setSkinIdx(rowFromScroll(scrollY));
      }, 200);
    };

    cvs.addEventListener('pointerdown', onDown, { passive: false });
    cvs.addEventListener('pointermove', onMove, { passive: false });
    cvs.addEventListener('pointerup', onUp);
    cvs.addEventListener('wheel', onWheel, { passive: false });

    let raf: number;
    let frame = 0;

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, cw, ch);

      const currentSkinIdx = skinIdxRef.current;
      const targetScrollY = currentSkinIdx * ROW_H - ch / 2 + ROW_H / 2;

      if (!dragging) {
        if (Math.abs(velocity) > 0.3) {
          // Fling: apply momentum with friction
          velocity *= 0.92;
          scrollY = clampScroll(scrollY + velocity);
        } else if (velocity !== 0) {
          // Fling ended — snap to nearest row
          velocity = 0;
          const snapped = rowFromScroll(scrollY);
          setSkinIdx(snapped);
        } else {
          // Smooth lerp to target (for button clicks, tap selects, etc.)
          scrollY += (targetScrollY - scrollY) * 0.14;
        }
      }

      const firstRow = Math.max(0, Math.floor(scrollY / ROW_H) - 1);
      const lastRow = Math.min(TOTAL - 1, firstRow + Math.ceil(ch / ROW_H) + 2);

      for (let idx = firstRow; idx <= lastRow; idx++) {
        const rowCenterY = idx * ROW_H - scrollY + ROW_H / 2;
        const edgeDist = Math.min(rowCenterY, ch - rowCenterY);
        const alpha = Math.min(1, Math.max(0.15, edgeDist / 60));
        const isSelected = idx === currentSkinIdx;
        const skin = SNAKE_PALETTES[idx];
        const segs = computeSegs(rowCenterY, frame, isSelected);
        drawSnakeRow(segs, skin, previewShape, frame, isSelected, isSelected ? 1 : alpha * 0.7);

        // Skin name label
        ctx.globalAlpha = isSelected ? 0.95 : alpha * 0.55;
        ctx.fillStyle = skin.color;
        ctx.font = `${isSelected ? '600 13px' : '500 11px'} sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(skin.name, 18, rowCenterY);
        ctx.globalAlpha = 1;

        // Selected indicator
        if (isSelected) {
          ctx.fillStyle = skin.color;
          ctx.fillRect(0, rowCenterY - ROW_H / 2 + 8, 3, ROW_H - 16);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      if (wheelTimer) clearTimeout(wheelTimer);
      cvs.removeEventListener('pointerdown', onDown);
      cvs.removeEventListener('pointermove', onMove);
      cvs.removeEventListener('pointerup', onUp);
      cvs.removeEventListener('wheel', onWheel);
    };
  }, [screen, showSkinPicker, previewShape]);

  // Hold-to-cycle skin buttons (simple setInterval approach)
  const skinHoldRef = useRef<number | null>(null);
  const skinCycle = (dir: -1 | 1) => {
    setSkinIdx(prev => {
      const next = prev + dir;
      return (next >= 0 && next < SNAKE_PALETTES.length) ? next : prev;
    });
  };
  const skinBtnDown = (dir: -1 | 1) => {
    skinCycle(dir);
    skinHoldRef.current = window.setInterval(() => skinCycle(dir), 150);
  };
  const skinBtnUp = () => {
    if (skinHoldRef.current !== null) {
      clearInterval(skinHoldRef.current);
      skinHoldRef.current = null;
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      overflow: 'hidden', touchAction: 'none',
      userSelect: 'none', WebkitUserSelect: 'none',
      background: '#0b1120',
    }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100vw', height: '100vh' }} />

      {/* WARDROBE SCREEN */}
      {screen === 'start' && !showSkinPicker && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(11,17,32,0.95)',
          zIndex: 10,
          overflow: 'hidden',
        }}>
          {/* Title */}
          <div style={{ color: '#fff', fontSize: 32, fontWeight: 800, letterSpacing: 4, marginBottom: 6 }}>SNAKE</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, letterSpacing: 1, marginBottom: 40 }}>Eat · Grow · Survive</div>

          {/* Admin */}
          <div onClick={() => setShowAdmin(true)} style={{ color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 48px', borderRadius: 28, background: 'rgba(255,165,2,0.12)', border: '1.5px solid rgba(255,165,2,0.35)', cursor: 'pointer', marginBottom: 12 }}>ADMIN</div>

          {/* Skins Button */}
          <div onClick={() => setShowSkinPicker(true)} style={{
            color: '#fff', fontSize: 15, fontWeight: 600,
            padding: '13px 48px', borderRadius: 28,
            background: 'rgba(100,140,255,0.15)',
            border: '1.5px solid rgba(100,140,255,0.4)',
            cursor: 'pointer', marginBottom: 16,
          }}>SKINS</div>

          {/* Play Button */}
          <div onClick={handlePlay} style={{
            color: '#fff', fontSize: 16, fontWeight: 600,
            padding: '13px 52px', borderRadius: 28,
            background: 'rgba(46,213,115,0.25)',
            border: '1.5px solid rgba(46,213,115,0.5)',
            cursor: 'pointer',
            animation: 'pulse 2s ease-in-out infinite',
          }}>PLAY</div>

          <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 10, marginTop: 16, textAlign: 'center' }}>
            Touch to steer · Hold boost to sprint
          </div>
        </div>
      )}

      {/* SKIN PICKER OVERLAY */}
      {screen === 'start' && showSkinPicker && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(11,17,32,0.98)',
          zIndex: 20,
          overflow: 'hidden',
        }}>
          {/* Header with back button */}
          <div style={{ display: 'flex', alignItems: 'center', width: '88vw', maxWidth: 440, marginTop: 14, marginBottom: 6 }}>
            <div onClick={() => setShowSkinPicker(false)}
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20, cursor: 'pointer', padding: '4px 10px', userSelect: 'none' }}>←</div>
            <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>SKINS</div>
            <div style={{ width: 40 }} />
          </div>

          {/* Scrollable skin list with nav buttons */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div
              onPointerDown={(e) => { e.preventDefault(); skinBtnDown(-1); }}
              onPointerUp={() => skinBtnUp()}
              onPointerLeave={() => skinBtnUp()}
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 28, cursor: 'pointer', padding: '4px 8px', userSelect: 'none', lineHeight: 1, flexShrink: 0 }}
            >▲</div>
            <canvas
              ref={el => { demoRefs.current[0] = el; }}
              width={600} height={420}
              style={{ width: '78vw', maxWidth: 380, height: '54vh', maxHeight: 380, borderRadius: 14, touchAction: 'none' }}
            />
            <div
              onPointerDown={(e) => { e.preventDefault(); skinBtnDown(1); }}
              onPointerUp={() => skinBtnUp()}
              onPointerLeave={() => skinBtnUp()}
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 28, cursor: 'pointer', padding: '4px 8px', userSelect: 'none', lineHeight: 1, flexShrink: 0 }}
            >▼</div>
          </div>

          {/* Pagination dots — show window around selected */}
          <div style={{ display: 'flex', gap: 4, marginTop: 6, marginBottom: 6, alignItems: 'center' }}>
            {(() => {
              const TOTAL_DOTS = SNAKE_PALETTES.length;
              const WIN = 5;
              let start = Math.max(0, skinIdx - Math.floor(WIN / 2));
              let end = Math.min(TOTAL_DOTS, start + WIN);
              if (end - start < WIN) start = Math.max(0, end - WIN);
              const dots: React.ReactNode[] = [];
              if (start > 0) {
                dots.push(<div key="s" style={{ width: 3, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />);
              }
              for (let i = start; i < end; i++) {
                dots.push(
                  <div key={i} style={{
                    width: i === skinIdx ? 14 : 5, height: 5, borderRadius: 3,
                    background: i === skinIdx ? selectedSkin.color : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.2s ease',
                  }} />
                );
              }
              if (end < TOTAL_DOTS) {
                dots.push(<div key="e" style={{ width: 3, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />);
              }
              return dots;
            })()}
          </div>

          {/* Selected skin name */}
          <div style={{ color: selectedSkin.color, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {selectedSkin.name}
          </div>

          {/* Shape Selector — inside picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <div onClick={() => setShapeIdx(p => (p - 1 + SNAKE_SHAPES.length) % SNAKE_SHAPES.length)}
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', padding: '2px 8px', userSelect: 'none' }}>‹</div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, minWidth: 100, textAlign: 'center' }}>
              {SHAPE_LABELS[previewShape]}
            </div>
            <div onClick={() => setShapeIdx(p => (p + 1) % SNAKE_SHAPES.length)}
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', padding: '2px 8px', userSelect: 'none' }}>›</div>
          </div>

          {/* Done Button */}
          <div onClick={() => setShowSkinPicker(false)} style={{
            color: '#fff', fontSize: 14, fontWeight: 600,
            padding: '10px 44px', borderRadius: 24,
            background: 'rgba(46,213,115,0.2)',
            border: '1.5px solid rgba(46,213,115,0.4)',
            cursor: 'pointer', marginBottom: 20,
          }}>DONE</div>
        </div>
      )}

      {/* ADMIN PANEL OVERLAY */}
      {showAdmin && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(11,17,32,0.98)',
          zIndex: 30, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', width: '88vw', maxWidth: 440, marginTop: 14, marginBottom: 10 }}>
            <div onClick={() => setShowAdmin(false)}
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20, cursor: 'pointer', padding: '4px 10px', userSelect: 'none' }}>←</div>
            <div style={{ flex: 1, textAlign: 'center', color: '#ffa502', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>ADMIN PANEL</div>
            <div onClick={() => setShowGuide(g => !g)}
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', padding: '4px 10px', userSelect: 'none', fontWeight: 600, border: showGuide ? '1.5px solid rgba(255,165,2,0.6)' : '1.5px solid rgba(255,255,255,0.15)', borderRadius: 8, lineHeight: 1 }}>?</div>
          </div>

          {/* Guide panel */}
          {showGuide && (
            <div style={{ width: '88vw', maxWidth: 440, background: 'rgba(255,165,2,0.06)', border: '1px solid rgba(255,165,2,0.2)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ color: '#ffa502', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>HOW TO USE ADMIN PANEL</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 1.6 }}>
                <b style={{ color: '#fff' }}>MAP &amp; GRID</b> — <b>Map Radius</b>: arena size. Bigger = more space, food spreads out. <b>Grid Size</b>: background grid line spacing.<br/><br/>
                <b style={{ color: '#fff' }}>SNAKE BODY</b> — <b>Start/Min/Max Length</b>: segments at spawn, drain floor, hard cap. <b>Min/Max Thick</b>: body radius range. <b>Seg Spacing</b>: gap between segment centers. <b>Head Mult</b>: head size vs body (1.05 = 5% bigger).<br/><br/>
                <b style={{ color: '#fff' }}>SPEED &amp; TURN</b> — <b>Base/Boost Speed</b>: movement speed. Turn rates: thin snakes turn sharper, fat snakes turn wider. Boost turn is always slow.<br/><br/>
                <b style={{ color: '#fff' }}>GROWTH &amp; SCORE</b> — <b>Pts/Segment</b>: food points to grow 1 seg. <b>Growth Mult</b>: multiplier on food value when eating (2 = double growth speed). <b>Thick Curve</b>: power exponent for thickness. <b>Score/Pt</b>: score per food point. <b>Max Score</b>: display cap.<br/><br/>
                <b style={{ color: '#fff' }}>FOOD SPAWN</b> — <b>Count</b>: food on map. <b>Cap Mult</b>: max food = Count x this. <b>Eat Radius</b>: pickup range. <b>S/M/L Value</b>: food points per tier. <b>Chance</b>: spawn probability per tier. <b>Radius</b>: visual size per tier.<br/><br/>
                <b style={{ color: '#fff' }}>BOOST DRAIN</b> — <b>Drain Rate</b>: frames between losing 1 seg (10 = 6/sec). <b>Drop Value</b>: food points left behind while draining (base tier). <b>Drop Spread</b>: lateral offset. <b>Burst Count</b>: orbs dropped the INSTANT you press boost (0 = off). <b>Burst Value</b>: food points of burst orbs. <b>Score Drain/s</b>: score drained/sec when at min length. <b>Min Score</b>: score needed to boost at min length. <b>Tier2/Tier3</b>: at higher scores, dropped orbs become more valuable (e.g., score 1000+ = 3-value orbs, 5000+ = 5-value).<br/><br/>
                <b style={{ color: '#fff' }}>DEATH DROP</b> — When a snake dies, its body becomes food. <b>L/M Chance</b>: probability of large/medium orbs. <b>Max Orbs</b>: cap on food items from one death.<br/><br/>
                <b style={{ color: '#fff' }}>CAMERA</b> — <b>Min Zoom</b>: max zoom-out floor. <b>Zoom Smooth</b>: zoom lerp speed (lower = cinematic). <b>Follow Speed</b>: how fast camera tracks your head.<br/><br/>
                <b style={{ color: '#fff' }}>3D EFFECTS</b> — <b>Light Offset</b>: where the highlight sits (0=center, 0.5=edge). <b>Bright Boost</b>: highlight brightness. <b>Shadow Dark</b>: shadow intensity. Set both to 0 for flat look.<br/><br/>
                <b style={{ color: '#fff' }}>BITE EFFECT</b> — When snakes overlap bodies. <b>Center/Mid Dark</b>: shadow opacity at bite point. <b>Tint Strength</b>: skin color overlay. Set all to 0 to disable.<br/><br/>
                <b style={{ color: '#fff' }}>BOTS</b> — <b>Count</b>: AI snakes. <b>Food Range</b>: scan distance. <b>Respawn</b>: frames before respawn. <b>Min/Max Start</b>: starting segment range. <b>Warn/Danger %</b>: when bots turn/boost toward center.<br/><br/>
                <b style={{ color: '#fff' }}>COLLISION</b> — <b>Skip Segs</b>: first N segments immune to head-body collision (prevents self-kill at neck).<br/><br/>
                <span style={{ color: 'rgba(255,165,2,0.8)' }}>Tip: Changes apply instantly — even mid-game.</span>
              </div>
            </div>
          )}

          {/* Scrollable sections */}
          <div style={{ width: '88vw', maxWidth: 440, flex: 1, overflowY: 'auto', paddingBottom: 80, WebkitOverflowScrolling: 'touch' }}>
            {ADMIN_SECTIONS.map(section => (
              <div key={section.title} style={{ marginBottom: 18 }}>
                <div style={{ color: 'rgba(255,165,2,0.7)', fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 8, paddingLeft: 2 }}>
                  {section.title}
                </div>
                {section.params.map(p => {
                  const val = CFG[p.key] as number;
                  const onChangeSlider = (e: React.ChangeEvent<HTMLInputElement>) => { CFG[p.key] = parseFloat(e.target.value); setAdminTick(t => t + 1); saveCFG(); };
                  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => { const v = parseFloat(e.target.value); if (!isNaN(v) && isFinite(v)) { CFG[p.key] = Math.max(p.min, Math.min(p.max, v)); setAdminTick(t => t + 1); saveCFG(); } };
                  return (
                    <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, width: 85, textAlign: 'right', flexShrink: 0 }}>
                        {p.label}
                      </div>
                      <input
                        type="range" min={p.min} max={p.max} step={p.step}
                        value={val}
                        onChange={onChangeSlider}
                        style={{ flex: 1, height: 4, accentColor: '#ffa502', cursor: 'pointer' }}
                      />
                      <input
                        type="number" min={p.min} max={p.max} step={p.step}
                        value={val % 1 === 0 ? val : val.toFixed(2)}
                        onChange={onChangeInput}
                        style={{
                          width: 56, height: 22, fontSize: 11, color: '#fff', textAlign: 'right',
                          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 4, padding: '0 4px', outline: 'none', fontVariantNumeric: 'tabular-nums',
                          fontFamily: 'inherit',
                        }}
                      />
                      {p.unit && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, width: 18 }}>{p.unit}</div>}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Reset button */}
            <div onClick={() => {
              CFG.MAP_RADIUS = 32000;
              CFG.INITIAL_SEGMENTS = 10; CFG.MIN_SEGMENTS = 10; CFG.MAX_SEGMENTS = 400;
              CFG.MIN_BODY_RADIUS = 14; CFG.MAX_BODY_RADIUS = 30;
              CFG.BASE_SPEED = 2.0; CFG.BOOST_SPEED = 3.8;
              CFG.TURN_RATE_MIN = 0.020; CFG.TURN_RATE_MAX = 0.060; CFG.BOOST_TURN_RATE = 0.020;
              CFG.SEG_SPACING = 4.5; CFG.FOOD_EAT_RADIUS = 2;
              CFG.FOOD_COUNT = 4000; CFG.BOT_COUNT = 10;
              CFG.BOOST_DRAIN_RATE = 10;
              CFG.GROWTH_COST = 6;
              CFG.FOOD_S_VALUE = 1; CFG.FOOD_M_VALUE = 3; CFG.FOOD_L_VALUE = 5;
              CFG.FOOD_S_CHANCE = 0.93; CFG.FOOD_M_CHANCE = 0.04; CFG.FOOD_L_CHANCE = 0.03;
              CFG.MAX_SCORE = 50000; CFG.COLLISION_SKIP = 3;
              CFG.MIN_ZOOM = 0.12; CFG.ZOOM_LERP = 0.015; CFG.RADIUS_POWER = 0.6;
              CFG.BOT_FOOD_RANGE = 1500;
              CFG.BOT_RESPAWN_TIME = 180; CFG.BOT_MIN_SEGS = 10; CFG.BOT_MAX_SEGS = 50;
              CFG.BOUNDARY_WARN_PCT = 0.92; CFG.BOUNDARY_DANGER_PCT = 0.96;
              CFG.HIGHLIGHT_OFFSET = 0.35; CFG.HIGHLIGHT_BRIGHT = 70; CFG.SHADOW_DARK = 55;
              CFG.HEAD_SIZE_MULT = 1.05;
              CFG.BITE_DARKEN_CENTER = 0.7; CFG.BITE_DARKEN_MID = 0.4; CFG.BITE_TINT_OPACITY = 0.25;
              CFG.CAM_FOLLOW_SPEED = 0.08;
              CFG.BOOST_DROP_VALUE = 1; CFG.BOOST_DROP_SPREAD = 2;
              CFG.BOOST_INSTANT_DROP = 3; CFG.BOOST_INSTANT_VALUE = 1;
              CFG.BOOST_SCORE_DRAIN = 5; CFG.BOOST_MIN_SCORE = 0;
              CFG.BOOST_DROP_TIER2_SCORE = 1000; CFG.BOOST_DROP_TIER2_VALUE = 3;
              CFG.BOOST_DROP_TIER3_SCORE = 5000; CFG.BOOST_DROP_TIER3_VALUE = 5;
              CFG.GROWTH_MULTIPLIER = 1.0;
              CFG.DEATH_DROP_L_CHANCE = 0.12; CFG.DEATH_DROP_M_CHANCE = 0.35; CFG.DEATH_DROP_MAX = 200;
              CFG.SCORE_PER_POINT = 1;
              CFG.FOOD_S_RADIUS = 3; CFG.FOOD_M_RADIUS = 4.5; CFG.FOOD_L_RADIUS = 6;
              CFG.GRID_SIZE = 100; CFG.FOOD_CAP_MULT = 3;
              saveCFG();
              setAdminTick(t => t + 1);
            }} style={{
              color: '#ff4757', fontSize: 13, fontWeight: 600,
              padding: '10px 0', borderRadius: 20, textAlign: 'center',
              border: '1.5px solid rgba(255,71,87,0.4)',
              background: 'rgba(255,71,87,0.1)',
              cursor: 'pointer', marginBottom: 20,
            }}>RESET TO DEFAULTS</div>
          </div>
        </div>
      )}

      {/* Death Screen */}
      {screen === 'dead' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(11,17,32,0.9)',
          zIndex: 10, pointerEvents: 'none',
        }}>
          <div style={{ color: '#ff4757', fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: 2 }}>YOU DIED</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 17, marginTop: 18 }}>
            Score: <span style={{ color: '#fff', fontWeight: 700 }}>{deathScore.toLocaleString()}</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 17, marginTop: 40, animation: 'pulse 2s ease-in-out infinite' }}>Tap to Restart</div>
        </div>
      )}

      {/* Boost Button */}
      {screen === 'playing' && (
        <div style={{
          position: 'absolute', bottom: 24, right: 16,
          width: 88, height: 88, borderRadius: '50%',
          background: isBoosting
            ? 'radial-gradient(circle, rgba(255,165,2,0.85), rgba(255,80,0,0.65))'
            : 'radial-gradient(circle, rgba(255,165,2,0.25), rgba(255,80,0,0.1))',
          border: isBoosting
            ? '2.5px solid rgba(255,165,2,0.7)'
            : '2.5px solid rgba(255,165,2,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 5, pointerEvents: 'none',
          transition: 'all 0.12s ease',
          boxShadow: isBoosting ? '0 0 35px rgba(255,165,2,0.35)' : 'none',
        }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
            stroke={isBoosting ? 'rgba(255,240,180,1)' : 'rgba(255,200,50,0.7)'}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
