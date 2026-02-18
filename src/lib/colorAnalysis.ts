// Color Analysis Engine - HSV, USDA Color Mapping, Defect Detection

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface HSVColor {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

export interface PixelStats {
  meanR: number;
  meanG: number;
  meanB: number;
  meanH: number;
  meanS: number;
  meanV: number;
  medianHue: number;
  darkPixelRatio: number;
  burnedPixelRatio: number;
  lightPixelRatio: number;
  totalPixels: number;
  agtronScore: number;
}

export interface DefectRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'dark' | 'burnt' | 'light' | 'mottled' | 'sugar_end' | 'disease';
  severity: number; // 0-1
  area: number; // px²
  areamm2?: number;
  stripCoverage?: number; // 0-1 (ratio of strip length)
}

export interface AnalysisResult {
  pixelStats: PixelStats;
  usdaColorScore: number; // 0-2 scale
  usdaScoreLabel: string;
  processColorScore: number; // McDonald's 1-9 scale
  hueScore: number; // 1-9 scale (Farm Frites)
  mottlingScore: number; // 1-9 scale
  defectScore: number; // 1-9 scale
  overallAppearanceScore: number; // 1-9 scale
  defects: DefectRegion[];
  pqi: number; // 0-100%
  defectCount: number;
  hueHistogram: number[]; // 36 bins of 10 degrees each
  heatmapData: number[][];
  analysisTime: number;
}

export function rgbToHsv(r: number, g: number, b: number): HSVColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
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

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB to XYZ
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

  const X = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  const Y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const Z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;

  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const L = 116 * f(Y / 1.0) - 16;
  const a = 500 * (f(X / 0.9505) - f(Y / 1.0));
  const bVal = 200 * (f(Y / 1.0) - f(Z / 1.089));

  return [L, a, bVal];
}

// Agtron score estimation from image brightness/color
// Agtron target: 63, range 58-68
function estimateAgtron(meanR: number, meanG: number, meanB: number): number {
  // Simplified Agtron estimation based on luminance and color ratios
  const luminance = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB;
  // Map 0-255 luminance range to Agtron 20-100 range
  const agtron = 20 + (luminance / 255) * 80;
  return Math.round(agtron);
}

// USDA French Fry Color Scale: 0=very dark, 1=dark, 2=slightly dark, 3=light, 4=very light
// Target: 0.5 (bright light golden), spec range: 0-1
function getUsdaScore(meanH: number, meanS: number, meanV: number, agtron: number): number {
  // Map Agtron to USDA 0-2 scale where 0.5 is target
  if (agtron >= 58 && agtron <= 68) return 0.5; // perfect target
  if (agtron < 40) return 0.0; // very dark
  if (agtron < 50) return 0.2; // dark
  if (agtron < 58) return 0.4; // slightly dark
  if (agtron < 70) return 0.6; // slightly light
  if (agtron < 80) return 0.8; // light
  return 1.0; // very light
}

// McDonald's 1-9 intensity scale for process color
function getProcessColorScore(usdaScore: number): { score: number; label: string } {
  const deviation = Math.abs(usdaScore - 0.5);
  if (deviation < 0.05) return { score: 5, label: 'Equal to Target' };
  if (usdaScore < 0.5) {
    // Darker
    if (deviation < 0.15) return { score: 4, label: 'Slightly Dark' };
    if (deviation < 0.25) return { score: 3, label: 'Moderately Dark' };
    if (deviation < 0.35) return { score: 2, label: 'Very Dark - Quality Failure' };
    return { score: 1, label: 'Extremely Dark - Not McDonald\'s Quality' };
  } else {
    // Lighter
    if (deviation < 0.15) return { score: 6, label: 'Slightly Light' };
    if (deviation < 0.25) return { score: 7, label: 'Moderately Light' };
    if (deviation < 0.35) return { score: 8, label: 'Very Light - Quality Failure' };
    return { score: 9, label: 'Extremely Light - Not McDonald\'s Quality' };
  }
}

// Farm Frites Hue Score based on flesh yellowness
// 5 = white flesh (target), 6 = creamy, >7 = yellow
function getHueScore(meanH: number, meanS: number): { score: number; label: string } {
  // Golden fries: hue ~25-45 degrees in HSV
  if (meanH >= 25 && meanH <= 40 && meanS > 0.3 && meanS < 0.6)
    return { score: 5, label: 'Bright Light Golden (Target)' };
  if (meanH > 40 && meanH <= 55)
    return { score: 6, label: 'Creamy Yellow' };
  if (meanH > 55 && meanH <= 70)
    return { score: 7, label: 'Yellow Flesh' };
  if (meanH > 70 || meanS > 0.7)
    return { score: 8, label: 'Strong Yellow - Large Difference' };
  if (meanH < 20 || meanH > 80)
    return { score: 9, label: 'Bright Yellow / Off-Color' };
  if (meanH >= 20 && meanH < 25)
    return { score: 4, label: 'Slightly Under-colored' };
  return { score: 5, label: 'Bright Light Golden (Target)' };
}

// Detect defect regions using pixel analysis
export function detectDefects(imageData: ImageData, ppm: number = 1): DefectRegion[] {
  const { data, width, height } = imageData;
  const defects: DefectRegion[] = [];
  const cellSize = 20; // grid cell size for defect detection

  // Build HSV grid
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const hsvGrid: HSVColor[][] = [];
  const validGrid: boolean[][] = [];

  for (let gy = 0; gy < gridH; gy++) {
    hsvGrid[gy] = [];
    validGrid[gy] = [];
    for (let gx = 0; gx < gridW; gx++) {
      let totalH = 0, totalS = 0, totalV = 0, count = 0;
      let isFry = false;

      for (let py = gy * cellSize; py < Math.min((gy + 1) * cellSize, height); py++) {
        for (let px = gx * cellSize; px < Math.min((gx + 1) * cellSize, width); px++) {
          const idx = (py * width + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
          if (a < 128) continue;
          const hsv = rgbToHsv(r, g, b);
          // Is this likely a fry pixel? (not background)
          if (hsv.s > 0.1 && hsv.v > 0.1) {
            isFry = true;
            totalH += hsv.h;
            totalS += hsv.s;
            totalV += hsv.v;
            count++;
          }
        }
      }

      if (count > 0) {
        hsvGrid[gy][gx] = { h: totalH / count, s: totalS / count, v: totalV / count };
        validGrid[gy][gx] = isFry;
      } else {
        hsvGrid[gy][gx] = { h: 0, s: 0, v: 0 };
        validGrid[gy][gx] = false;
      }
    }
  }

  // Calculate mean HSV of valid cells
  let sumH = 0, sumS = 0, sumV = 0, validCount = 0;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (validGrid[gy][gx]) {
        sumH += hsvGrid[gy][gx].h;
        sumS += hsvGrid[gy][gx].s;
        sumV += hsvGrid[gy][gx].v;
        validCount++;
      }
    }
  }
  const meanH = validCount > 0 ? sumH / validCount : 30;
  const meanV = validCount > 0 ? sumV / validCount : 0.7;

  // Detect dark/burnt regions
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (!validGrid[gy][gx]) continue;
      const cell = hsvGrid[gy][gx];
      const vDiff = meanV - cell.v;
      const hDiff = Math.abs(meanH - cell.h);

      let defectType: DefectRegion['type'] | null = null;
      let severity = 0;

      if (cell.v < 0.25 && cell.s < 0.3) {
        // Very dark/burnt
        defectType = 'burnt';
        severity = 1 - cell.v;
      } else if (vDiff > 0.25 && cell.s > 0.2) {
        // Dark but not black - dark defect
        defectType = 'dark';
        severity = vDiff;
      } else if (cell.v > 0.85 && cell.s < 0.25) {
        // Too light - light defect / sugar end
        defectType = cell.h < 20 ? 'sugar_end' : 'light';
        severity = (cell.v - 0.85) * 4;
      } else if (hDiff > 30 && vDiff > 0.1) {
        // Mottled color
        defectType = 'mottled';
        severity = hDiff / 60;
      }

      if (defectType && severity > 0.15) {
        const x = gx * cellSize;
        const y = gy * cellSize;
        const w = Math.min(cellSize, width - x);
        const h = Math.min(cellSize, height - y);
        const area = w * h;
        const areamm2 = ppm > 0 ? area / (ppm * ppm) : area;

        // Check 1/3 rule for mottling - covered in strip calculation
        defects.push({
          x, y,
          width: w,
          height: h,
          type: defectType,
          severity: Math.min(1, severity),
          area,
          areamm2,
          stripCoverage: 0,
        });
      }
    }
  }

  // Apply 1/3 rule for mottling: merge nearby defects and check strip coverage
  return mergeAndFilterDefects(defects, width);
}

function mergeAndFilterDefects(defects: DefectRegion[], imageWidth: number): DefectRegion[] {
  if (defects.length === 0) return [];
  
  // Sort by x for strip analysis
  const sorted = [...defects].sort((a, b) => a.x - b.x);
  
  // Group defects by approximate y-row (strip grouping)
  const stripGroups = new Map<number, DefectRegion[]>();
  for (const d of sorted) {
    const stripKey = Math.round(d.y / 30);
    if (!stripGroups.has(stripKey)) stripGroups.set(stripKey, []);
    stripGroups.get(stripKey)!.push(d);
  }

  const result: DefectRegion[] = [];
  
  for (const [, group] of stripGroups) {
    const stripWidth = imageWidth;
    let defectWidth = 0;
    
    for (const d of group) {
      defectWidth += d.width;
    }

    const stripCoverage = defectWidth / stripWidth;
    
    for (const d of group) {
      d.stripCoverage = stripCoverage;
      // 1/3 Rule: only include mottling if covers >= 33.3% of strip
      if (d.type === 'mottled' && stripCoverage < 0.333) continue;
      result.push(d);
    }
  }

  return result;
}

// Generate hue histogram (36 bins of 10° each)
export function generateHueHistogram(imageData: ImageData): number[] {
  const { data, width, height } = imageData;
  const bins = new Array(36).fill(0);
  let total = 0;

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;

    const hsv = rgbToHsv(r, g, b);
    if (hsv.s > 0.1 && hsv.v > 0.15) {
      const bin = Math.min(35, Math.floor(hsv.h / 10));
      bins[bin]++;
      total++;
    }
  }

  // Normalize to percentages
  if (total > 0) {
    for (let i = 0; i < bins.length; i++) {
      bins[i] = (bins[i] / total) * 100;
    }
  }

  return bins;
}

// Generate heatmap data (brightness-based)
export function generateHeatmap(imageData: ImageData, gridSize = 20): number[][] {
  const { data, width, height } = imageData;
  const gW = Math.ceil(width / gridSize);
  const gH = Math.ceil(height / gridSize);
  const heatmap: number[][] = [];

  for (let gy = 0; gy < gH; gy++) {
    heatmap[gy] = [];
    for (let gx = 0; gx < gW; gx++) {
      let sumBurn = 0, count = 0;
      for (let py = gy * gridSize; py < Math.min((gy + 1) * gridSize, height); py++) {
        for (let px = gx * gridSize; px < Math.min((gx + 1) * gridSize, width); px++) {
          const idx = (py * width + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
          if (a < 128) continue;
          const hsv = rgbToHsv(r, g, b);
          if (hsv.s > 0.05 || hsv.v < 0.5) {
            // Higher intensity = more burnt/dark
            const burnScore = 1 - hsv.v;
            sumBurn += burnScore;
            count++;
          }
        }
      }
      heatmap[gy][gx] = count > 0 ? sumBurn / count : 0;
    }
  }

  return heatmap;
}

// Main analysis function
export async function analyzeImage(imageData: ImageData, ppm: number = 1): Promise<AnalysisResult> {
  const start = Date.now();
  const { data, width, height } = imageData;

  let totalR = 0, totalG = 0, totalB = 0;
  let totalH = 0, totalS = 0, totalV = 0;
  let darkPixels = 0, burnedPixels = 0, lightPixels = 0;
  const hueValues: number[] = [];
  let validPixels = 0;

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];

    if (a < 128) continue;

    const hsv = rgbToHsv(r, g, b);
    if (hsv.s < 0.05 && hsv.v > 0.9) continue; // Skip near-white background

    totalR += r; totalG += g; totalB += b;
    totalH += hsv.h; totalS += hsv.s; totalV += hsv.v;
    validPixels++;

    if (hsv.s > 0.1) hueValues.push(hsv.h);
    if (hsv.v < 0.2 && hsv.s < 0.3) burnedPixels++;
    else if (hsv.v < 0.35) darkPixels++;
    else if (hsv.v > 0.85 && hsv.s < 0.2) lightPixels++;
  }

  if (validPixels === 0) validPixels = 1;

  const meanR = totalR / validPixels;
  const meanG = totalG / validPixels;
  const meanB = totalB / validPixels;
  const meanH = totalH / validPixels;
  const meanS = totalS / validPixels;
  const meanV = totalV / validPixels;

  // Median hue
  hueValues.sort((a, b) => a - b);
  const medianHue = hueValues.length > 0 ? hueValues[Math.floor(hueValues.length / 2)] : 30;

  const agtronScore = estimateAgtron(meanR, meanG, meanB);
  const usdaColorScore = getUsdaScore(meanH, meanS, meanV, agtronScore);
  
  const { score: processColorScore } = getProcessColorScore(usdaColorScore);
  const { score: hueScore } = getHueScore(meanH, meanS);
  
  const defects = detectDefects(imageData, ppm);
  const defectCount = defects.length;
  const burnedRatio = burnedPixels / validPixels;
  const darkRatio = darkPixels / validPixels;

  // Mottling score based on count and strip coverage
  let mottlingScore = 5;
  const mottledDefects = defects.filter(d => d.type === 'mottled' || d.type === 'dark');
  if (mottledDefects.length >= 20) mottlingScore = 9;
  else if (mottledDefects.length >= 15) mottlingScore = 8;
  else if (mottledDefects.length >= 10) mottlingScore = 7;
  else if (mottledDefects.length >= 5) mottlingScore = 6;

  // Defect score based on burnt pixels and dark defect count
  let defectScore = 5;
  if (burnedRatio > 0.3 || defectCount > 20) defectScore = 9;
  else if (burnedRatio > 0.2 || defectCount > 15) defectScore = 8;
  else if (burnedRatio > 0.1 || defectCount > 10) defectScore = 7;
  else if (burnedRatio > 0.05 || defectCount > 5) defectScore = 6;

  const overallAppearanceScore = Math.max(processColorScore, hueScore, mottlingScore, defectScore);

  const pqi = calculatePQI([processColorScore, hueScore, mottlingScore, defectScore]);
  const hueHistogram = generateHueHistogram(imageData);
  const heatmapData = generateHeatmap(imageData);

  const usdaLabel = getUsdaLabel(usdaColorScore);

  return {
    pixelStats: {
      meanR, meanG, meanB,
      meanH, meanS, meanV,
      medianHue,
      darkPixelRatio: darkRatio,
      burnedPixelRatio: burnedRatio,
      lightPixelRatio: lightPixels / validPixels,
      totalPixels: validPixels,
      agtronScore,
    },
    usdaColorScore,
    usdaScoreLabel: usdaLabel,
    processColorScore,
    hueScore,
    mottlingScore,
    defectScore,
    overallAppearanceScore,
    defects,
    pqi,
    defectCount,
    hueHistogram,
    heatmapData,
    analysisTime: Date.now() - start,
  };
}

function getUsdaLabel(score: number): string {
  if (score <= 0.1) return 'Very Dark (>1.5 USDA)';
  if (score <= 0.3) return 'Dark (1.0-1.5 USDA)';
  if (score <= 0.45) return 'Slightly Dark (0.5-1.0 USDA)';
  if (score <= 0.55) return 'Target (0.5 USDA) ✓';
  if (score <= 0.7) return 'Slightly Light (0.5-1.0 USDA)';
  if (score <= 0.9) return 'Light (1.0-1.5 USDA)';
  return 'Very Light (>1.5 USDA)';
}

// PQI Formula per McDonald's specification
export function calculatePQI(scores: number[]): number {
  if (scores.length === 0) return 100;

  // Failure/rejection checks
  if (scores.some(s => s === 1 || s === 9)) return 0;
  if (scores.some(s => s === 2 || s === 8)) return 25;

  const n = scores.length;
  const furthest = scores.reduce((a, b) => Math.abs(a - 5) >= Math.abs(b - 5) ? a : b);
  const deviation = Math.abs(furthest - 5);

  let basePct = 100;
  if (deviation === 0) basePct = 100;
  else if (deviation === 1) basePct = 85;
  else if (deviation === 2) basePct = 60;
  else if (deviation >= 3) basePct = 25;

  // Bonus points: (No. of 5s / (n-1)) × 10%
  const numFives = scores.filter(s => s === 5).length;
  const bonus = n > 1 ? (numFives / (n - 1)) * 10 : 0;

  return Math.min(100, Math.round(basePct + bonus));
}

export function getPQIStatus(pqi: number): { label: string; color: string; level: 'pass' | 'warn' | 'fail' | 'critical' } {
  if (pqi >= 90) return { label: 'EXCELLENT', color: 'hsl(142 70% 45%)', level: 'pass' };
  if (pqi >= 75) return { label: 'PASS', color: 'hsl(142 60% 40%)', level: 'pass' };
  if (pqi >= 60) return { label: 'MARGINAL', color: 'hsl(42 95% 52%)', level: 'warn' };
  if (pqi >= 25) return { label: 'FAIL', color: 'hsl(25 90% 50%)', level: 'fail' };
  if (pqi > 0) return { label: 'QUALITY FAILURE', color: 'hsl(0 75% 55%)', level: 'critical' };
  return { label: 'REJECTED', color: 'hsl(0 75% 40%)', level: 'critical' };
}

export function getMcdonaldsScoreLabel(score: number): string {
  const labels: Record<number, string> = {
    1: 'Extremely Different (Less)',
    2: 'Large Difference (Less)',
    3: 'Moderate Difference (Less)',
    4: 'Slight Difference (Less)',
    5: 'Matches Target ✓',
    6: 'Slight Difference (More)',
    7: 'Moderate Difference (More)',
    8: 'Large Difference (More)',
    9: 'Not McDonald\'s Quality',
  };
  return labels[score] || 'Unknown';
}
