import React, { useMemo, useState } from 'react';
import type { AnalysisResult } from '@/lib/colorAnalysis';

interface DefectHeatmapProps {
  result: AnalysisResult;
}

// Jet colormap: blue → cyan → green → yellow → red
function jetColor(v: number): string {
  v = Math.max(0, Math.min(1, v));
  let r = 0, g = 0, b = 0;
  if (v < 0.125) { r = 0; g = 0; b = 0.5 + v * 4; }
  else if (v < 0.375) { r = 0; g = (v - 0.125) * 4; b = 1; }
  else if (v < 0.625) { r = (v - 0.375) * 4; g = 1; b = 1 - (v - 0.375) * 4; }
  else if (v < 0.875) { r = 1; g = 1 - (v - 0.625) * 4; b = 0; }
  else { r = 1 - (v - 0.875) * 4; g = 0; b = 0; }
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

// Hot colormap for GradCAM: black → red → yellow → white
function hotColor(v: number): string {
  v = Math.max(0, Math.min(1, v));
  const r = Math.min(1, v * 3);
  const g = Math.min(1, Math.max(0, v * 3 - 1));
  const b = Math.min(1, Math.max(0, v * 3 - 2));
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${0.5 + v * 0.5})`;
}

export function DefectHeatmap({ result }: DefectHeatmapProps) {
  const [mode, setMode] = useState<'heatmap' | 'gradcam'>('heatmap');
  const { heatmapData, gradCamData } = result;

  const activeData = mode === 'heatmap' ? heatmapData : (gradCamData ?? heatmapData);
  const colorFn = mode === 'heatmap' ? jetColor : hotColor;

  const maxVal = useMemo(() => {
    let max = 0;
    for (const row of activeData) for (const v of row) if (v > max) max = v;
    return max || 1;
  }, [activeData]);

  const rows = activeData.length;
  const cols = activeData[0]?.length || 0;

  const criticalCells = heatmapData.flat().filter(v => v / (heatmapData.flat().reduce((a, b) => Math.max(a, b), 1)) > 0.7).length;
  const warnCells = heatmapData.flat().filter(v => {
    const max = heatmapData.flat().reduce((a, b) => Math.max(a, b), 1);
    return v / max > 0.4 && v / max <= 0.7;
  }).length;

  const shadowCount = result.defects.filter(d => d.type === 'shadow').length;
  const realDefects = result.defects.filter(d => !d.isArtifact);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground tracking-wider">
          {mode === 'heatmap' ? 'DEFECT HEATMAP' : 'GRAD-CAM EXPLAINABILITY'}
        </h3>
        <div className="flex gap-1">
          {(['heatmap', 'gradcam'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{
                background: mode === m ? 'hsl(42 95% 52% / 0.2)' : 'transparent',
                border: `1px solid ${mode === m ? 'hsl(42 95% 52% / 0.6)' : 'hsl(220 15% 20%)'}`,
                color: mode === m ? 'hsl(42 95% 65%)' : 'hsl(215 12% 50%)',
              }}
            >
              {m === 'heatmap' ? 'HEAT' : 'CAM'}
            </button>
          ))}
        </div>
      </div>

      {/* Shadow suppression notice */}
      {shadowCount > 0 && (
        <div className="flex items-center gap-2 text-xs rounded px-2 py-1"
          style={{ background: 'hsl(210 80% 60% / 0.1)', border: '1px solid hsl(210 80% 60% / 0.3)' }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'hsl(210 80% 60%)' }} />
          <span style={{ color: 'hsl(210 80% 70%)' }}>
            {shadowCount} shadow zones suppressed — excluded from PQI scoring
          </span>
        </div>
      )}

      <div className="text-xs text-muted-foreground flex gap-3">
        <span><span className="text-destructive font-mono-custom">{criticalCells}</span> critical</span>
        <span><span style={{ color: 'hsl(42 95% 52%)' }} className="font-mono-custom">{warnCells}</span> warn</span>
        <span><span style={{ color: 'hsl(210 80% 65%)' }} className="font-mono-custom">{shadowCount}</span> shadows</span>
      </div>

      {/* Map grid */}
      <div className="relative rounded overflow-hidden"
        style={{ paddingBottom: `${rows > 0 ? (rows / cols) * 100 : 60}%`, background: '#0a0a0a' }}>
        <div className="absolute inset-0 grid" style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}>
          {activeData.map((row, gy) =>
            row.map((val, gx) => {
              const norm = val / maxVal;
              return (
                <div
                  key={`${gy}-${gx}`}
                  style={{ backgroundColor: colorFn(norm), opacity: 0.6 + norm * 0.4 }}
                  title={`Zone (${gx},${gy}): ${(norm * 100).toFixed(0)}% intensity`}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Colormap legend */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{mode === 'heatmap' ? 'Cool' : 'Low'}</span>
        <div className="flex-1 h-3 rounded-sm overflow-hidden flex">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ flex: 1, backgroundColor: colorFn(i / 19) }} />
          ))}
        </div>
        <span>{mode === 'heatmap' ? 'Hot' : 'High'}</span>
      </div>

      {/* Defect type breakdown — real defects only */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { type: 'burnt', color: '#ff2222', label: 'Burnt' },
          { type: 'dark', color: '#ff6600', label: 'Dark' },
          { type: 'light', color: '#22aaff', label: 'Light' },
          { type: 'mottled', color: '#ffcc00', label: 'Mottled' },
          { type: 'sugar_end', color: '#ff88ff', label: 'Sugar End' },
          { type: 'disease', color: '#cc44ff', label: 'Disease' },
        ].map(({ type, color, label }) => {
          const count = realDefects.filter(d => d.type === type).length;
          return (
            <div key={type} className="flex items-center gap-1.5 rounded px-2 py-1"
              style={{ background: color + '15', border: `1px solid ${color}44` }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <div className="min-w-0">
                <div className="text-xs font-mono-custom" style={{ color }}>{count}</div>
                <div className="text-xs text-muted-foreground truncate">{label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {mode === 'gradcam' && (
        <div className="text-xs text-muted-foreground rounded px-2 py-1"
          style={{ background: 'hsl(220 15% 9%)', border: '1px solid hsl(220 15% 16%)' }}>
          Grad-CAM: intensity shows which regions triggered quality penalties.
          Position-weighted — tip defects glow brighter.
        </div>
      )}
    </div>
  );
}
