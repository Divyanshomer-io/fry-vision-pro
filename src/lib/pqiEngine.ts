// PQI Engine - Product Quality Index calculations

export interface BatchRecord {
  id: string;
  timestamp: string;
  batchId: string;
  imageName: string;
  medianHue: number;
  pqi: number;
  defectCount: number;
  processColorScore: number;
  hueScore: number;
  mottlingScore: number;
  defectScore: number;
  agtronScore: number;
  usdaLabel: string;
  status: string;
}

export interface ScoreAttribute {
  name: string;
  score: number;
  weight: number;
  category: 'appearance' | 'texture' | 'aroma';
}

// PQI Category calculation
export function calculateCategoryScore(attributes: ScoreAttribute[]): number {
  if (attributes.length === 0) return 100;

  const scores = attributes.map(a => a.score);
  const n = attributes.length;

  // Check rejections
  if (scores.some(s => s === 1 || s === 9)) return 0;
  if (scores.some(s => s === 2 || s === 8)) return 25;

  const furthestScore = scores.reduce((a, b) =>
    Math.abs(a - 5) >= Math.abs(b - 5) ? a : b
  );
  const deviation = Math.abs(furthestScore - 5);

  let base = 100;
  if (deviation === 0) base = 100;
  else if (deviation === 1) base = 85;
  else if (deviation === 2) base = 60;
  else if (deviation >= 3) base = 25;

  const numFives = scores.filter(s => s === 5).length;
  const numFoursAndSixes = scores.filter(s => s === 4 || s === 6).length;

  let bonus = 0;
  if (deviation >= 2 && n > 1) {
    bonus = (numFives / (n - 1)) * 20 + (numFoursAndSixes / (n - 1)) * 10;
  } else if (deviation === 1 && n > 1) {
    bonus = (numFives / (n - 1)) * 10;
  }

  return Math.min(100, Math.round(base + bonus));
}

// Score color mapping
export function getScoreColor(score: number): string {
  if (score === 5) return 'hsl(142 70% 45%)';
  if (score === 4 || score === 6) return 'hsl(86 60% 45%)';
  if (score === 3 || score === 7) return 'hsl(42 95% 52%)';
  if (score === 2 || score === 8) return 'hsl(25 90% 50%)';
  return 'hsl(0 75% 55%)'; // 1 or 9
}

export function getScoreBg(score: number): string {
  if (score === 5) return 'hsl(142 70% 45% / 0.15)';
  if (score === 4 || score === 6) return 'hsl(86 60% 45% / 0.15)';
  if (score === 3 || score === 7) return 'hsl(42 95% 52% / 0.15)';
  if (score === 2 || score === 8) return 'hsl(25 90% 50% / 0.15)';
  return 'hsl(0 75% 55% / 0.15)';
}

// USDA Color Chart reference values (hue in HSV degrees)
export const USDA_COLOR_CHART = [
  { usdaValue: 0.0, label: '00', description: 'Very Dark Brown', hue: 20, saturation: 0.8, brightness: 0.2 },
  { usdaValue: 0.25, label: '0.25', description: 'Dark Golden', hue: 28, saturation: 0.75, brightness: 0.45 },
  { usdaValue: 0.5, label: '0.5 (Target)', description: 'Bright Light Golden', hue: 35, saturation: 0.65, brightness: 0.65 },
  { usdaValue: 0.75, label: '0.75', description: 'Light Golden', hue: 42, saturation: 0.5, brightness: 0.8 },
  { usdaValue: 1.0, label: '1.0', description: 'Very Light Golden', hue: 50, saturation: 0.35, brightness: 0.9 },
  { usdaValue: 1.5, label: '1.5', description: 'Pale', hue: 55, saturation: 0.2, brightness: 0.95 },
];

// Farm Frites Hue Color Chart reference
export const FARM_FRITES_HUE_CHART = [
  { score: 5, label: 'White Flesh (Target)', hsvHue: [25, 40], description: 'Bright light golden cooked fry' },
  { score: 6, label: 'Creamy', hsvHue: [40, 55], description: 'Cream to light yellow flesh' },
  { score: 7, label: 'Yellow Flesh', hsvHue: [55, 70], description: 'Noticeably yellow flesh' },
  { score: 8, label: 'Deep Yellow', hsvHue: [70, 85], description: 'Strong yellow, large difference' },
  { score: 9, label: 'Bright Yellow', hsvHue: [85, 120], description: 'Not McDonald\'s quality' },
];

// Generate batch report CSV content
export function generateCSVReport(records: BatchRecord[]): string {
  const headers = [
    'Timestamp', 'Batch ID', 'Image Name', 'Median Hue (°)', 'PQI (%)',
    'Defect Count', 'Process Color Score', 'Hue Score', 'Mottling Score',
    'Defect Score', 'Agtron Score', 'USDA Label', 'Status'
  ].join(',');

  const rows = records.map(r => [
    r.timestamp, r.batchId, r.imageName, r.medianHue.toFixed(1), r.pqi.toFixed(0),
    r.defectCount, r.processColorScore, r.hueScore, r.mottlingScore,
    r.defectScore, r.agtronScore.toFixed(0), `"${r.usdaLabel}"`, r.status
  ].join(','));

  return [headers, ...rows].join('\n');
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
