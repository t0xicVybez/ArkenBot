/**
 * Placeholder shown while a lazily-loaded (code-split) recharts chart fetches
 * its chunk, so the layout doesn't jump before the chart appears.
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
