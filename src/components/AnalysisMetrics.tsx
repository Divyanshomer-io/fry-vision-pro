import React from 'react';
import type { AnalysisResult } from '@/lib/colorAnalysis';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  status?: 'pass' | 'warn' | 'fail' | 'neutral';
  sublabel?: string;
  large?: boolean;
}

const STATUS_COLORS = {
  pass: 'hsl(142 70% 45%)',
  warn: 'hsl(42 95% 52%)',
  fail: 'hsl(0 75% 55%)',
  neutral: 'hsl(210 80% 60%)',
};

function MetricCard({ label, value, unit, status = 'neutral', sublabel, large }: MetricCardProps) {
  const color = STATUS_COLORS[status];
  return (
    <div
      className="industrial-card px-3 py-2.5 flex flex-col gap-0.5"
      style={{ borderColor: color + '33' }}
    >
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-display">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className="font-mono-custom font-medium"
          style={{ color, fontSize: large ? '1.5rem' : '1.1rem' }}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
    </div>
  );
}

interface AnalysisMetricsProps {
  result: AnalysisResult;
}

function getRgbHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function AnalysisMetrics({ result }: AnalysisMetricsProps) {
  const { pixelStats } = result;
  const avgColor = getRgbHex(pixelStats.meanR, pixelStats.meanG, pixelStats.meanB);

  const agtronStatus = pixelStats.agtronScore >= 58 && pixelStats.agtronScore <= 68 ? 'pass'
    : pixelStats.agtronScore >= 50 && pixelStats.agtronScore <= 76 ? 'warn' : 'fail';

  const usdaStatus = result.usdaColorScore >= 0.4 && result.usdaColorScore <= 0.6 ? 'pass'
    : result.usdaColorScore >= 0.3 && result.usdaColorScore <= 0.7 ? 'warn' : 'fail';

  return (
    <div className="flex flex-col gap-4">
      {/* Color swatch + USDA */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div
            className="w-14 h-14 rounded-lg border-2"
            style={{
              backgroundColor: avgColor,
              borderColor: 'hsl(220 15% 25%)',
              boxShadow: `0 0 12px ${avgColor}66`,
            }}
          />
          <span className="text-xs font-mono-custom text-muted-foreground">{avgColor}</span>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">Mean Sample Color</div>
          <div className="flex gap-2 text-xs">
            <span className="font-mono-custom text-muted-foreground">R:<span className="text-foreground ml-1">{Math.round(pixelStats.meanR)}</span></span>
            <span className="font-mono-custom text-muted-foreground">G:<span className="text-foreground ml-1">{Math.round(pixelStats.meanG)}</span></span>
            <span className="font-mono-custom text-muted-foreground">B:<span className="text-foreground ml-1">{Math.round(pixelStats.meanB)}</span></span>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="font-mono-custom text-muted-foreground">H:<span className="text-gold ml-1">{Math.round(pixelStats.meanH)}°</span></span>
            <span className="font-mono-custom text-muted-foreground">S:<span className="text-foreground ml-1">{(pixelStats.meanS * 100).toFixed(0)}%</span></span>
            <span className="font-mono-custom text-muted-foreground">V:<span className="text-foreground ml-1">{(pixelStats.meanV * 100).toFixed(0)}%</span></span>
          </div>
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Agtron Score"
          value={pixelStats.agtronScore.toFixed(0)}
          sublabel="Target: 63 (58–68)"
          status={agtronStatus}
        />
        <MetricCard
          label="USDA Color"
          value={result.usdaColorScore.toFixed(2)}
          sublabel={result.usdaScoreLabel}
          status={usdaStatus}
        />
        <MetricCard
          label="Median Hue"
          value={pixelStats.medianHue.toFixed(0)}
          unit="°"
          sublabel="Target: 30°–40°"
          status={pixelStats.medianHue >= 25 && pixelStats.medianHue <= 45 ? 'pass' : 'warn'}
        />
        <MetricCard
          label="Defect Count"
          value={result.defectCount}
          sublabel="Total detected regions"
          status={result.defectCount === 0 ? 'pass' : result.defectCount < 5 ? 'warn' : 'fail'}
        />
        <MetricCard
          label="Burnt Area"
          value={(pixelStats.burnedPixelRatio * 100).toFixed(1)}
          unit="%"
          sublabel="Pixels below V<0.2"
          status={pixelStats.burnedPixelRatio < 0.05 ? 'pass' : pixelStats.burnedPixelRatio < 0.1 ? 'warn' : 'fail'}
        />
        <MetricCard
          label="Dark Area"
          value={(pixelStats.darkPixelRatio * 100).toFixed(1)}
          unit="%"
          sublabel="Darker than mean"
          status={pixelStats.darkPixelRatio < 0.1 ? 'pass' : pixelStats.darkPixelRatio < 0.2 ? 'warn' : 'fail'}
        />
      </div>

      {/* V2: Shadow + White Balance info */}
      <div className="rounded-lg px-3 py-2 text-xs space-y-1.5"
        style={{ background: 'hsl(220 15% 9%)', border: '1px solid hsl(220 15% 16%)' }}>
        <div className="text-muted-foreground font-display tracking-wider text-xs mb-1">V2 SPATIAL NORMALIZATION</div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shadow Filtered</span>
          <span className="font-mono-custom text-gold">{(pixelStats.shadowMaskRatio * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">WB Gain R/G/B</span>
          <span className="font-mono-custom text-xs" style={{ color: 'hsl(210 80% 65%)' }}>
            {pixelStats.whiteBalanceGain.map(g => g.toFixed(2)).join(' / ')}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Crunch Score (FFT)</span>
          <span className="font-mono-custom" style={{
            color: pixelStats.crunchScore > 60 ? 'hsl(142 70% 45%)' : pixelStats.crunchScore > 35 ? 'hsl(42 95% 52%)' : 'hsl(0 75% 55%)'
          }}>
            {pixelStats.crunchScore}/100
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">MRI Acrylamide</span>
          <span className="font-mono-custom" style={{
            color: pixelStats.maillardRisk === 'Low' ? 'hsl(142 70% 45%)' : pixelStats.maillardRisk === 'Moderate' ? 'hsl(42 95% 52%)' : 'hsl(0 75% 55%)'
          }}>
            {pixelStats.maillardRisk} ({result.acrylamideIndex}%)
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">ΔE2000 vs Target</span>
          <span className="font-mono-custom" style={{
            color: pixelStats.deltaE2000 < 5 ? 'hsl(142 70% 45%)' : pixelStats.deltaE2000 < 15 ? 'hsl(42 95% 52%)' : 'hsl(0 75% 55%)'
          }}>
            {pixelStats.deltaE2000.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Analysis time */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Analysis time: <span className="font-mono-custom text-gold">{result.analysisTime}ms</span></span>
        <span>Pixels analyzed: <span className="font-mono-custom">{pixelStats.totalPixels.toLocaleString()}</span></span>
      </div>
    </div>
  );
}
