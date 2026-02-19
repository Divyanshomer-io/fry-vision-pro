// ============================================================
// MacFry SensoryVision Suite™  — CV Engine V2
// Phase 1: CIE DE2000 + Spatial White Balance
// Phase 2: Shadow-Aware Semantic Segmentation + Contour-Weighted Scoring
// Phase 3: FFT Crust Micro-topography + Maillard Reaction Index
// Phase 4: Fuzzy Logic Neural PQI
// ============================================================

export interface RGBColor { r: number; g: number; b: number; }
export interface HSVColor { h: number; s: number; v: number; }
export interface LabColor { L: number; a: number; b: number; }

export interface PixelStats {
  meanR: number; meanG: number; meanB: number;
  meanH: number; meanS: number; meanV: number;
  medianHue: number;
  darkPixelRatio: number; burnedPixelRatio: number; lightPixelRatio: number;
  totalPixels: number; agtronScore: number;
  // V2 additions
  whiteBalanceGain: [number, number, number];  // per-channel gain
  shadowMaskRatio: number;                      // fraction of pixels classified as shadow
  crunchScore: number;                          // 0-100 FFT crust micro-topography
  maillardRisk: 'Low' | 'Moderate' | 'High' | 'Critical'; // acrylamide risk from ΔE
  deltaE2000: number;                           // CIE DE2000 vs target "McDonald's Gold"
  fuzzyConfidence: number;                      // 0-1 fuzzy controller certainty
}

export interface DefectRegion {
  x: number; y: number; width: number; height: number;
  type: 'dark' | 'burnt' | 'light' | 'mottled' | 'sugar_end' | 'disease' | 'shadow';
  severity: number; // 0-1
  area: number;     // px²
  areamm2?: number;
  stripCoverage?: number;
  // V2 — contour-weighted position
  positionWeight: number; // 1.0=center, 1.5=tip (sugar-end penalty)
  isArtifact: boolean;    // true = shadow / seasoning — excluded from PQI
}

export interface AnalysisResult {
  pixelStats: PixelStats;
  usdaColorScore: number;
  usdaScoreLabel: string;
  processColorScore: number;
  hueScore: number;
  mottlingScore: number;
  defectScore: number;
  overallAppearanceScore: number;
  defects: DefectRegion[];
  pqi: number;
  defectCount: number;
  hueHistogram: number[];
  heatmapData: number[][];
  analysisTime: number;
  // V2
  gradCamData: number[][];  // explainability heatmap
  acrylamideIndex: number;  // 0-100 chemical risk
}

// ─── Color Space Conversions ─────────────────────────────────

export function rgbToHsv(r: number, g: number, b: number): HSVColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0, s = 0;
  const v = max;
  if (delta > 0) {
    s = delta / max;
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

export function rgbToLab(r: number, g: number, b: number): LabColor {
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;
  const X = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  const Y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const Z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return {
    L: 116 * f(Y) - 16,
    a: 500 * (f(X / 0.9505) - f(Y)),
    b: 200 * (f(Y) - f(Z / 1.089)),
  };
}

// ─── Phase 1: CIE DE2000 ─────────────────────────────────────

// "McDonald's Gold" reference: bright light golden (USDA 0.5 target)
const MC_GOLD_LAB: LabColor = { L: 72.0, a: 8.5, b: 42.0 };

export function deltaE2000(lab1: LabColor, lab2: LabColor): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;
  const C7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Math.pow(25, 7))));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * (180 / Math.PI);
  let h2p = Math.atan2(b2, a2p) * (180 / Math.PI);
  if (h1p < 0) h1p += 360;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    hbarp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  }

  const T = 1
    - 0.17 * Math.cos(rad(hbarp - 30))
    + 0.24 * Math.cos(rad(2 * hbarp))
    + 0.32 * Math.cos(rad(3 * hbarp + 6))
    - 0.20 * Math.cos(rad(4 * hbarp - 63));

  const SL = 1 + 0.015 * Math.pow(Lbarp - 50, 2) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  return Math.sqrt(
    Math.pow(dLp / SL, 2) +
    Math.pow(dCp / SC, 2) +
    Math.pow(dHp / SH, 2) +
    RT * (dCp / SC) * (dHp / SH)
  );
}

// ─── Phase 1: Spatial White Balance ──────────────────────────

/**
 * Detects the brightest neutral region in the frame (18%-gray or white reference)
 * and returns per-channel gain multipliers to normalise illuminant.
 */
function estimateWhiteBalance(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  // Sample 5x5 grid of 10x10 patches, find brightest near-neutral one
  const patchW = Math.max(1, Math.floor(width / 5));
  const patchH = Math.max(1, Math.floor(height / 5));
  let bestV = 0;
  let refR = 255, refG = 255, refB = 255;

  for (let py = 0; py < 5; py++) {
    for (let px = 0; px < 5; px++) {
      let sumR = 0, sumG = 0, sumB = 0, cnt = 0;
      const startX = px * patchW, startY = py * patchH;
      for (let y = startY; y < Math.min(startY + patchH, height); y++) {
        for (let x = startX; x < Math.min(startX + patchW, width); x++) {
          const i = (y * width + x) * 4;
          sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]; cnt++;
        }
      }
      if (cnt === 0) continue;
      const mr = sumR / cnt, mg = sumG / cnt, mb = sumB / cnt;
      const lum = 0.299 * mr + 0.587 * mg + 0.114 * mb;
      // Near-neutral: channels should be close to each other
      const maxDiff = Math.max(Math.abs(mr - mg), Math.abs(mg - mb), Math.abs(mr - mb));
      if (lum > bestV && maxDiff < 40) {
        bestV = lum; refR = mr; refG = mg; refB = mb;
      }
    }
  }

  // If no clear neutral found, return unit gains
  if (bestV < 30) return [1, 1, 1];
  const target = (refR + refG + refB) / 3;
  return [
    target / Math.max(1, refR),
    target / Math.max(1, refG),
    target / Math.max(1, refB),
  ];
}

/** Apply white-balance gain in-place */
function applyWhiteBalance(data: Uint8ClampedArray, gains: [number, number, number]): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.min(255, Math.round(data[i]     * gains[0]));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * gains[1]));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * gains[2]));
  }
}

// ─── Phase 2: Shadow Detection ───────────────────────────────

/**
 * A pixel is classified as a SHADOW if:
 *  - Value (V) is low relative to the image mean
 *  - Saturation (S) is also low (shadows are de-saturated)
 *  - Hue is NOT in the fry band (shadows don't have golden hue)
 *
 * Shadows should NOT be counted as burnt defects.
 */
function isShadowPixel(hsv: HSVColor, meanV: number, meanS: number): boolean {
  const relDarkness = (meanV - hsv.v) / Math.max(0.01, meanV);
  return (
    relDarkness > 0.35 &&          // significantly darker than average
    hsv.s < meanS * 0.65 &&        // lower saturation than average (de-saturated = shadow)
    !(hsv.h >= 15 && hsv.h <= 55)  // not in golden-brown range
  );
}

// ─── Phase 3: FFT Crust Score ─────────────────────────────────

/**
 * Estimates surface crispness by analysing luminance variance frequency.
 * High-frequency variance → crispy crust. Low-frequency → soggy.
 * Uses a simplified discrete cosine-energy estimate on 8x8 patches.
 */
function computeCrunchScore(data: Uint8ClampedArray, width: number, height: number): number {
  const PATCH = 8;
  const numPatchesX = Math.floor(width / PATCH);
  const numPatchesY = Math.floor(height / PATCH);
  if (numPatchesX === 0 || numPatchesY === 0) return 50;

  let highFreqEnergy = 0, lowFreqEnergy = 0, patchCount = 0;

  for (let py = 0; py < numPatchesY; py++) {
    for (let px = 0; px < numPatchesX; px++) {
      // Extract luminance patch
      const patch: number[] = [];
      for (let y = py * PATCH; y < (py + 1) * PATCH; y++) {
        for (let x = px * PATCH; x < (px + 1) * PATCH; x++) {
          const i = (y * width + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          patch.push(lum);
        }
      }

      // 1D DCT approximation along rows
      let hf = 0, lf = 0;
      for (let row = 0; row < PATCH; row++) {
        const rowData = patch.slice(row * PATCH, (row + 1) * PATCH);
        const mean = rowData.reduce((a, b) => a + b, 0) / PATCH;
        // DC component (low freq)
        lf += mean * mean;
        // High-freq: variance of diff from mean
        for (const v of rowData) hf += (v - mean) * (v - mean);
      }
      highFreqEnergy += hf / (PATCH * PATCH);
      lowFreqEnergy += lf / PATCH;
      patchCount++;
    }
  }

  if (patchCount === 0) return 50;
  const ratio = highFreqEnergy / (lowFreqEnergy + highFreqEnergy + 1e-6);
  // Map 0–0.5 ratio to 0–100 crunch score
  return Math.min(100, Math.round(ratio * 200));
}

// ─── Phase 3: Maillard Reaction Index ────────────────────────

function computeMaillardRisk(deltaE: number): { risk: 'Low' | 'Moderate' | 'High' | 'Critical'; index: number } {
  // ΔE deviation from target correlates with acrylamide formation
  // ΔE 0–5: target → low risk; ΔE 5–15: moderate; ΔE 15–25: high; >25: critical
  const index = Math.min(100, Math.round((deltaE / 30) * 100));
  let risk: 'Low' | 'Moderate' | 'High' | 'Critical';
  if (deltaE < 5) risk = 'Low';
  else if (deltaE < 15) risk = 'Moderate';
  else if (deltaE < 25) risk = 'High';
  else risk = 'Critical';
  return { risk, index };
}

// ─── Phase 4: Fuzzy Logic PQI ────────────────────────────────

/**
 * Fuzzy membership functions map each attribute score (1-9) to
 * fuzzy sets: IDEAL, ACCEPTABLE, WARNING, FAILURE.
 * The output PQI is defuzzified using centroid method.
 */
function fuzzyMembership(score: number): { ideal: number; acceptable: number; warning: number; failure: number } {
  const dist = Math.abs(score - 5);
  return {
    ideal:      Math.max(0, 1 - dist / 1.5),
    acceptable: Math.max(0, 1 - Math.abs(dist - 1) / 1.5),
    warning:    Math.max(0, 1 - Math.abs(dist - 2) / 1.5),
    failure:    Math.max(0, (dist - 2) / 2),
  };
}

function fuzzyPQI(scores: number[]): number {
  // Hard rejection/failure rules
  if (scores.some(s => s === 1 || s === 9)) return 0;
  if (scores.some(s => s === 2 || s === 8)) return 25;

  // Fuzzy aggregation with interaction penalty:
  // If Hue is off AND Mottling is high → exponential compounding
  const [colorS, hueS, mottleS, defectS] = scores;
  
  let totalFuzzy = 0;
  const weights = [0.30, 0.25, 0.25, 0.20]; // Color, Hue, Mottling, Defects

  for (let i = 0; i < scores.length; i++) {
    const m = fuzzyMembership(scores[i]);
    const contribution = (m.ideal * 100 + m.acceptable * 85 + m.warning * 60 + m.failure * 25);
    totalFuzzy += contribution * weights[i];
  }

  // Interaction penalty: hue off + high mottling compound exponentially
  const hueDev = Math.abs(hueS - 5);
  const motDev = Math.abs(mottleS - 5);
  const interactionPenalty = hueDev > 1 && motDev > 1 ? Math.pow(hueDev * motDev, 0.7) * 3 : 0;

  // Colour-defect compounding
  const colorDefectPenalty = Math.abs(colorS - 5) > 1 && Math.abs(defectS - 5) > 1
    ? Math.pow(Math.abs(colorS - 5) * Math.abs(defectS - 5), 0.5) * 2 : 0;

  // Bonus for multiple 5s
  const numFives = scores.filter(s => s === 5).length;
  const bonus = numFives > 0 ? (numFives / (scores.length - 1)) * 10 : 0;

  return Math.max(0, Math.min(100, Math.round(totalFuzzy - interactionPenalty - colorDefectPenalty + bonus)));
}

// ─── Agtron + USDA ───────────────────────────────────────────

function estimateAgtron(meanR: number, meanG: number, meanB: number): number {
  // Normalisation-corrected Agtron estimation
  const luminance = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB;
  return Math.round(20 + (luminance / 255) * 80);
}

function getUsdaScore(agtron: number): number {
  if (agtron >= 58 && agtron <= 68) return 0.5;
  if (agtron < 40) return 0.0;
  if (agtron < 50) return 0.2;
  if (agtron < 58) return 0.4;
  if (agtron < 70) return 0.6;
  if (agtron < 80) return 0.8;
  return 1.0;
}

function getProcessColorScore(usdaScore: number): { score: number; label: string } {
  const deviation = Math.abs(usdaScore - 0.5);
  if (deviation < 0.05) return { score: 5, label: 'Equal to Target' };
  if (usdaScore < 0.5) {
    if (deviation < 0.15) return { score: 4, label: 'Slightly Dark' };
    if (deviation < 0.25) return { score: 3, label: 'Moderately Dark' };
    if (deviation < 0.35) return { score: 2, label: 'Very Dark — Quality Failure' };
    return { score: 1, label: 'Extremely Dark — Not McDonald\'s Quality' };
  } else {
    if (deviation < 0.15) return { score: 6, label: 'Slightly Light' };
    if (deviation < 0.25) return { score: 7, label: 'Moderately Light' };
    if (deviation < 0.35) return { score: 8, label: 'Very Light — Quality Failure' };
    return { score: 9, label: 'Extremely Light — Not McDonald\'s Quality' };
  }
}

function getHueScore(meanH: number, meanS: number): { score: number; label: string } {
  if (meanH >= 25 && meanH <= 40 && meanS > 0.3 && meanS < 0.6) return { score: 5, label: 'Bright Light Golden (Target)' };
  if (meanH > 40 && meanH <= 55) return { score: 6, label: 'Creamy Yellow' };
  if (meanH > 55 && meanH <= 70) return { score: 7, label: 'Yellow Flesh' };
  if (meanH > 70 || meanS > 0.7) return { score: 8, label: 'Strong Yellow — Large Difference' };
  if (meanH < 20 || meanH > 80) return { score: 9, label: 'Bright Yellow / Off-Color' };
  if (meanH >= 20 && meanH < 25) return { score: 4, label: 'Slightly Under-colored' };
  return { score: 5, label: 'Bright Light Golden (Target)' };
}

// ─── Phase 2: Defect Detection (Shadow-Aware) ────────────────

export function detectDefects(imageData: ImageData, ppm: number = 1): DefectRegion[] {
  const { data, width, height } = imageData;
  const defects: DefectRegion[] = [];
  const CELL = 20;
  const gridW = Math.ceil(width / CELL);
  const gridH = Math.ceil(height / CELL);

  // Pre-compute global mean HSV (for shadow reference)
  let gSumV = 0, gSumS = 0, gCount = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a < 128) continue;
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s > 0.08 && hsv.v > 0.1) { gSumV += hsv.v; gSumS += hsv.s; gCount++; }
  }
  const globalMeanV = gCount > 0 ? gSumV / gCount : 0.6;
  const globalMeanS = gCount > 0 ? gSumS / gCount : 0.4;

  // Build cell grid
  type CellData = HSVColor & { isFry: boolean; isShadow: boolean; shadowRatio: number };
  const grid: CellData[][] = [];

  for (let gy = 0; gy < gridH; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx < gridW; gx++) {
      let tH = 0, tS = 0, tV = 0, cnt = 0, shadowCount = 0;
      let isFry = false;
      for (let py = gy * CELL; py < Math.min((gy + 1) * CELL, height); py++) {
        for (let px = gx * CELL; px < Math.min((gx + 1) * CELL, width); px++) {
          const idx = (py * width + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
          if (a < 128) continue;
          const hsv = rgbToHsv(r, g, b);
          if (hsv.s > 0.08 && hsv.v > 0.08) {
            isFry = true;
            tH += hsv.h; tS += hsv.s; tV += hsv.v; cnt++;
            if (isShadowPixel(hsv, globalMeanV, globalMeanS)) shadowCount++;
          }
        }
      }
      const shadowRatio = cnt > 0 ? shadowCount / cnt : 0;
      grid[gy][gx] = {
        h: cnt > 0 ? tH / cnt : 0,
        s: cnt > 0 ? tS / cnt : 0,
        v: cnt > 0 ? tV / cnt : 0,
        isFry,
        isShadow: shadowRatio > 0.5, // majority shadow → mark entire cell
        shadowRatio,
      };
    }
  }

  // Compute grid mean for non-shadow cells
  let sumH = 0, sumV = 0, validCnt = 0;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const cell = grid[gy][gx];
      if (cell.isFry && !cell.isShadow) {
        sumH += cell.h; sumV += cell.v; validCnt++;
      }
    }
  }
  const meanH = validCnt > 0 ? sumH / validCnt : 30;
  const meanV = validCnt > 0 ? sumV / validCnt : 0.7;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const cell = grid[gy][gx];
      if (!cell.isFry) continue;

      // Shadow cells → mark as artifact, exclude from scoring
      if (cell.isShadow) {
        const x = gx * CELL, y = gy * CELL;
        defects.push({
          x, y, width: Math.min(CELL, width - x), height: Math.min(CELL, height - y),
          type: 'shadow', severity: cell.shadowRatio,
          area: CELL * CELL, areamm2: ppm > 0 ? (CELL * CELL) / (ppm * ppm) : CELL * CELL,
          stripCoverage: 0, positionWeight: 1, isArtifact: true,
        });
        continue;
      }

      const vDiff = meanV - cell.v;
      const hDiff = Math.abs(meanH - cell.h);

      // Contour-weighted position: cells near image edges = tips
      const edgeRatio = Math.min(gx / gridW, (gridW - gx) / gridW, gy / gridH, (gridH - gy) / gridH);
      const positionWeight = edgeRatio < 0.1 ? 1.5 : 1.0; // tip penalty

      let defectType: DefectRegion['type'] | null = null;
      let severity = 0;

      if (cell.v < 0.22 && cell.s < 0.35) {
        defectType = 'burnt'; severity = 1 - cell.v;
      } else if (vDiff > 0.28 && cell.s > 0.18) {
        defectType = 'dark'; severity = vDiff;
      } else if (cell.v > 0.87 && cell.s < 0.22) {
        defectType = positionWeight > 1.2 ? 'sugar_end' : 'light';
        severity = (cell.v - 0.87) * 5;
      } else if (hDiff > 28 && vDiff > 0.08) {
        defectType = 'mottled'; severity = hDiff / 60;
      }

      if (defectType && severity > 0.15) {
        const x = gx * CELL, y = gy * CELL;
        const w = Math.min(CELL, width - x), h = Math.min(CELL, height - y);
        defects.push({
          x, y, width: w, height: h, type: defectType,
          severity: Math.min(1, severity * positionWeight),
          area: w * h, areamm2: ppm > 0 ? (w * h) / (ppm * ppm) : w * h,
          stripCoverage: 0, positionWeight, isArtifact: false,
        });
      }
    }
  }

  return applyMottlingThirdRule(defects, width);
}

function applyMottlingThirdRule(defects: DefectRegion[], imageWidth: number): DefectRegion[] {
  if (defects.length === 0) return [];
  const sorted = [...defects].sort((a, b) => a.x - b.x);
  const stripGroups = new Map<number, DefectRegion[]>();
  for (const d of sorted) {
    const key = Math.round(d.y / 30);
    if (!stripGroups.has(key)) stripGroups.set(key, []);
    stripGroups.get(key)!.push(d);
  }
  const result: DefectRegion[] = [];
  for (const [, group] of stripGroups) {
    let defectWidth = 0;
    for (const d of group) defectWidth += d.width;
    const coverage = defectWidth / imageWidth;
    for (const d of group) {
      d.stripCoverage = coverage;
      if (d.type === 'mottled' && coverage < 0.333) continue; // 1/3 Rule
      result.push(d);
    }
  }
  return result;
}

// ─── Hue Histogram ───────────────────────────────────────────

export function generateHueHistogram(imageData: ImageData): number[] {
  const { data, width, height } = imageData;
  const bins = new Array(36).fill(0);
  let total = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a < 128) continue;
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s > 0.1 && hsv.v > 0.15) {
      bins[Math.min(35, Math.floor(hsv.h / 10))]++;
      total++;
    }
  }
  if (total > 0) for (let i = 0; i < 36; i++) bins[i] = (bins[i] / total) * 100;
  return bins;
}

// ─── Shadow-Suppressed Heatmap ───────────────────────────────

export function generateHeatmap(imageData: ImageData, gridSize = 20): number[][] {
  const { data, width, height } = imageData;
  const gW = Math.ceil(width / gridSize);
  const gH = Math.ceil(height / gridSize);
  const heatmap: number[][] = [];

  // Need global stats for shadow detection
  let gV = 0, gS = 0, gCnt = 0;
  for (let i = 0; i < width * height; i++) {
    const hsv = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (data[i * 4 + 3] >= 128 && hsv.s > 0.08 && hsv.v > 0.1) {
      gV += hsv.v; gS += hsv.s; gCnt++;
    }
  }
  const meanV = gCnt > 0 ? gV / gCnt : 0.6;
  const meanS = gCnt > 0 ? gS / gCnt : 0.4;

  for (let gy = 0; gy < gH; gy++) {
    heatmap[gy] = [];
    for (let gx = 0; gx < gW; gx++) {
      let sumBurn = 0, cnt = 0;
      for (let py = gy * gridSize; py < Math.min((gy + 1) * gridSize, height); py++) {
        for (let px = gx * gridSize; px < Math.min((gx + 1) * gridSize, width); px++) {
          const idx = (py * width + px) * 4;
          const a = data[idx + 3];
          if (a < 128) continue;
          const hsv = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
          // Skip shadow pixels — they are NOT burn defects
          if (isShadowPixel(hsv, meanV, meanS)) continue;
          if (hsv.s > 0.05 || hsv.v < 0.5) {
            sumBurn += 1 - hsv.v;
            cnt++;
          }
        }
      }
      heatmap[gy][gx] = cnt > 0 ? sumBurn / cnt : 0;
    }
  }
  return heatmap;
}

// ─── Grad-CAM Style Explainability Map ───────────────────────

function generateGradCam(imageData: ImageData, defects: DefectRegion[], gridSize = 20): number[][] {
  const { width, height } = imageData;
  const gW = Math.ceil(width / gridSize);
  const gH = Math.ceil(height / gridSize);
  const cam: number[][] = Array.from({ length: gH }, () => new Array(gW).fill(0));

  for (const d of defects) {
    if (d.isArtifact) continue;
    const gx = Math.floor(d.x / gridSize);
    const gy = Math.floor(d.y / gridSize);
    const radius = 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gW || ny >= gH) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const weight = Math.max(0, 1 - dist / (radius + 1));
        cam[ny][nx] = Math.min(1, cam[ny][nx] + d.severity * weight * d.positionWeight);
      }
    }
  }
  return cam;
}

// ─── USDA Label ──────────────────────────────────────────────

function getUsdaLabel(score: number): string {
  if (score <= 0.1) return 'Very Dark (>1.5 USDA)';
  if (score <= 0.3) return 'Dark (1.0–1.5 USDA)';
  if (score <= 0.45) return 'Slightly Dark (0.5–1.0 USDA)';
  if (score <= 0.55) return 'Target (0.5 USDA) ✓';
  if (score <= 0.7) return 'Slightly Light (0.5–1.0 USDA)';
  if (score <= 0.9) return 'Light (1.0–1.5 USDA)';
  return 'Very Light (>1.5 USDA)';
}

export function getPQIStatus(pqi: number): { label: string; color: string } {
  if (pqi >= 90) return { label: 'PASS', color: 'hsl(142 70% 45%)' };
  if (pqi >= 75) return { label: 'MARGINAL', color: 'hsl(86 60% 45%)' };
  if (pqi >= 60) return { label: 'REVIEW', color: 'hsl(42 95% 52%)' };
  if (pqi > 25) return { label: 'FAIL', color: 'hsl(25 90% 50%)' };
  return { label: 'REJECT', color: 'hsl(0 75% 55%)' };
}

// ─── Legacy shim ────────────────────────────────────────────

export function calculatePQI(scores: number[]): number {
  return fuzzyPQI(scores);
}

// ─── Main Analysis Entry Point ───────────────────────────────

export async function analyzeImage(imageData: ImageData, ppm: number = 1): Promise<AnalysisResult> {
  const start = Date.now();

  // Work on a copy so white-balance doesn't mutate the canvas
  const rawData = new Uint8ClampedArray(imageData.data);

  // Phase 1a: White Balance
  const wbGains = estimateWhiteBalance(rawData, imageData.width, imageData.height);
  const wbData = new Uint8ClampedArray(rawData);
  applyWhiteBalance(wbData, wbGains);
  const wbImageData = new ImageData(wbData, imageData.width, imageData.height);

  const { data, width, height } = wbImageData;

  // Phase 3: Crunch score on raw (before WB)
  const crunchScore = computeCrunchScore(rawData, width, height);

  // Pixel pass: stats
  let tR = 0, tG = 0, tB = 0, tH = 0, tS = 0, tV = 0;
  let darkPx = 0, burnedPx = 0, lightPx = 0, shadowPx = 0;
  const hueValues: number[] = [];
  let validPx = 0;

  // Pre-pass for global mean (for shadow detection)
  let gSumV = 0, gSumS = 0, gCount = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a < 128) continue;
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s > 0.08 && hsv.v > 0.1) { gSumV += hsv.v; gSumS += hsv.s; gCount++; }
  }
  const globalMeanV = gCount > 0 ? gSumV / gCount : 0.6;
  const globalMeanS = gCount > 0 ? gSumS / gCount : 0.4;

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a < 128) continue;
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s < 0.05 && hsv.v > 0.92) continue; // skip near-white background

    // Shadow suppression
    if (isShadowPixel(hsv, globalMeanV, globalMeanS)) { shadowPx++; continue; }

    tR += r; tG += g; tB += b;
    tH += hsv.h; tS += hsv.s; tV += hsv.v;
    validPx++;
    if (hsv.s > 0.1) hueValues.push(hsv.h);
    if (hsv.v < 0.2 && hsv.s < 0.3) burnedPx++;
    else if (hsv.v < 0.35) darkPx++;
    else if (hsv.v > 0.85 && hsv.s < 0.2) lightPx++;
  }
  if (validPx === 0) validPx = 1;

  const meanR = tR / validPx, meanG = tG / validPx, meanB = tB / validPx;
  const meanH = tH / validPx, meanS = tS / validPx, meanV = tV / validPx;

  hueValues.sort((a, b) => a - b);
  const medianHue = hueValues.length > 0 ? hueValues[Math.floor(hueValues.length / 2)] : 30;

  // Phase 1: ΔE2000 vs McDonald's Gold
  const meanLab = rgbToLab(meanR, meanG, meanB);
  const dE = deltaE2000(meanLab, MC_GOLD_LAB);

  // Phase 3: Maillard Risk
  const { risk: maillardRisk, index: acrylamideIndex } = computeMaillardRisk(dE);

  // USDA / Process scores
  const agtronScore = estimateAgtron(meanR, meanG, meanB);
  const usdaColorScore = getUsdaScore(agtronScore);
  const { score: processColorScore } = getProcessColorScore(usdaColorScore);
  const { score: hueScore } = getHueScore(meanH, meanS);

  // Defect detection (shadow-aware)
  const allDefects = detectDefects(wbImageData, ppm);
  const realDefects = allDefects.filter(d => !d.isArtifact);
  const defectCount = realDefects.length;
  const shadowMaskRatio = shadowPx / (validPx + shadowPx + 1);
  const burnedRatio = burnedPx / validPx;
  const darkRatio = darkPx / validPx;

  // Mottling score
  let mottlingScore = 5;
  const mottledDefects = realDefects.filter(d => d.type === 'mottled' || d.type === 'dark');
  if (mottledDefects.length >= 20) mottlingScore = 9;
  else if (mottledDefects.length >= 15) mottlingScore = 8;
  else if (mottledDefects.length >= 10) mottlingScore = 7;
  else if (mottledDefects.length >= 5) mottlingScore = 6;

  // Defect score — position-weighted
  const weightedDefectSeverity = realDefects.reduce((sum, d) => sum + d.severity * d.positionWeight, 0);
  let defectScore = 5;
  if (burnedRatio > 0.3 || weightedDefectSeverity > 15) defectScore = 9;
  else if (burnedRatio > 0.2 || weightedDefectSeverity > 10) defectScore = 8;
  else if (burnedRatio > 0.1 || weightedDefectSeverity > 6) defectScore = 7;
  else if (burnedRatio > 0.05 || weightedDefectSeverity > 3) defectScore = 6;

  const scores = [processColorScore, hueScore, mottlingScore, defectScore];

  // Phase 4: Fuzzy PQI
  const pqi = fuzzyPQI(scores);

  // Fuzzy confidence = how many scores are exactly 5
  const fuzzyConfidence = scores.filter(s => s === 5).length / scores.length;

  // Explainability
  const gradCamData = generateGradCam(wbImageData, allDefects);
  const hueHistogram = generateHueHistogram(wbImageData);
  const heatmapData = generateHeatmap(wbImageData);
  const overallAppearanceScore = Math.max(...scores);

  return {
    pixelStats: {
      meanR, meanG, meanB, meanH, meanS, meanV,
      medianHue, darkPixelRatio: darkRatio,
      burnedPixelRatio: burnedRatio, lightPixelRatio: lightPx / validPx,
      totalPixels: validPx, agtronScore,
      whiteBalanceGain: wbGains,
      shadowMaskRatio,
      crunchScore,
      maillardRisk,
      deltaE2000: dE,
      fuzzyConfidence,
    },
    usdaColorScore,
    usdaScoreLabel: getUsdaLabel(usdaColorScore),
    processColorScore, hueScore, mottlingScore, defectScore,
    overallAppearanceScore,
    defects: allDefects,
    pqi, defectCount,
    hueHistogram, heatmapData,
    analysisTime: Date.now() - start,
    gradCamData, acrylamideIndex,
  };
}
