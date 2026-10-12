/**
 * Placeholder shown while a lazily-loaded recharts chart chunk is fetched.
 * Recharts is heavy, so every chart is code-split behind `next/dynamic`; this
 * keeps the layout from jumping while the chunk loads.
 */
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-lg bg-(--bg-card) animate-pulse"
      style={{ height }}
      aria-hidden
    />
  );
}

export default ChartSkeleton;
