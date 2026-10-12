
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
