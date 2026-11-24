/**
 * Hand-cut tally marks: groups of four strokes crossed by a fifth. The small
 * tilts are fixed per stroke so the marks look cut by hand but never change.
 */
export function Tally({ count, label }: { count: number; label: string }) {
  const groups = Math.ceil(count / 5);
  const tilt = (i: number) => [-2, 1.5, -1, 2, -1.5][i % 5]!;
  const width = Math.max(1, groups) * 34;
  return (
    <svg
      class="tally"
      viewBox={`0 0 ${width} 28`}
      width={width}
      height={28}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, i) => {
        const g = Math.floor(i / 5);
        const k = i % 5;
        const x0 = g * 34 + 4;
        if (k === 4)
          return <line key={i} class="tally__cut" x1={x0 - 3} y1={22} x2={x0 + 24} y2={6} />;
        const x = x0 + k * 7;
        return (
          <line key={i} class="tally__mark" x1={x + tilt(i)} y1={4} x2={x - tilt(i)} y2={24} />
        );
      })}
    </svg>
  );
}
