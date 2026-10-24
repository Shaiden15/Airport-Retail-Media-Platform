import { useMemo } from 'react';
import { encode } from 'uqr';

// QR drawn as one SVG path from the module matrix, so no markup is ever injected
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const { path, modules } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path: d, modules: qr.size };
  }, [value]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`} role="img" aria-label={label} shapeRendering="crispEdges" className="rounded-md bg-white">
      <path d={path} fill="#0b1220" />
    </svg>
  );
}
