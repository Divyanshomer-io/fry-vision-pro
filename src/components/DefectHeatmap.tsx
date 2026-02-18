import React, { useMemo } from 'react';
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
  return `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
}

export function DefectHeatmap({ result }: DefectHeatmapProps) {
  const { heatmapData } = result;

  const maxVal = useMemo(() => {
    let max = 0;
    for (const row of heatmapData) {
      for (const v of row) if (v > max) max = v;
    }
    return max || 1;
  }, [heatmapData]);

  const rows = heatmapData.length;
  const cols = heatmapData[0]?.length || 0;
  const cellW = cols > 0 ? 100 / cols : 0;
  const cellH = rows > 0 ? 100 / rows : 0;

  // Count high-burn cells
  const criticalCells = heatmapData.flat().filter(v => v / maxVal > 0.7).length;
  const warnCells = heatmapData.flat().filter(v => v / maxVal > 0.4 && v / maxVal <= 0.7).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground tracking-wider">DEFECT HEATMAP</h3>
        <div className="text-xs text-muted-foreground">
          <span className="text-destructive font-mono-custom">{criticalCells}</span> critical /{' '}
          <span style={{ color: 'hsl(42 95% 52%)' }} className="font-mono-custom">{warnCells}</span> warn zones
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="relative rounded overflow-hidden" style={{ paddingBottom: `${rows > 0 ? (rows / cols) * 100 : 60}%`, background: '#0a0a0a' }}>
        <div className="absolute inset-0 grid" style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}>
          {heatmapData.map((row, gy) =>
            row.map((val, gx) => {
              const norm = val / maxVal;
              return (
                <div
                  key={`${gy}-${gx}`}
                  style={{
                    backgroundColor: jetColor(norm),
                    opacity: 0.7 + norm * 0.3,
                  }}
                  title={`Zone (${gx},${gy}): ${(norm * 100).toFixed(0)}% intensity`}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Colormap legend */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Low</span>
        <div className="flex-1 h-3 rounded-sm overflow-hidden flex">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ flex: 1, backgroundColor: jetColor(i / 19) }} />
          ))}
        </div>
        <span>High</span>
      </div>

      {/* Defect type breakdown */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { type: 'burnt', color: '#ff2222', label: 'Burnt' },
          { type: 'dark', color: '#ff6600', label: 'Dark' },
          { type: 'light', color: '#22aaff', label: 'Light' },
          { type: 'mottled', color: '#ffcc00', label: 'Mottled' },
          { type: 'sugar_end', color: '#ff88ff', label: 'Sugar End' },
          { type: 'disease', color: '#cc44ff', label: 'Disease' },
        ].map(({ type, color, label }) => {
          const count = result.defects.filter(d => d.type === type).length;
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
    </div>
  );
}
