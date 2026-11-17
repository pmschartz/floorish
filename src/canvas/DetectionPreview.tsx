import { Group, Line, Text } from "react-konva";
import type { Proposal } from "../detect/buildProposal";
import { bbox, doorSwing, itemCorners } from "../model/geometry";

const TEAL = "#0d9488";

/** Auto-detect results drawn over the plan while you review them. Nothing is saved yet. */
export function DetectionPreview({ proposal, keepRoom, keepDoors, keepWindows, keepOpenings, keepFixtures, ppi, stageScale }: {
  proposal: Proposal;
  keepRoom: boolean[];
  keepDoors: boolean;
  keepWindows: boolean;
  keepOpenings: boolean;
  keepFixtures: boolean;
  ppi: number;
  stageScale: number;
}) {
  const s = stageScale;
  const px = (v: number) => v * ppi;
  return (
    <Group listening={false}>
      {keepFixtures && proposal.fixtures.map((f, i) => (
        <Line key={`f${i}`} points={itemCorners(f).flatMap((p) => [px(p.x), px(p.y)])} closed
          fill="rgba(71,85,105,0.18)" stroke="#475569" strokeWidth={1.2 / s} dash={[3 / s, 2 / s]} />
      ))}
      {proposal.rooms.map((r, i) => {
        const on = keepRoom[i];
        const b = bbox(r.polygon);
        return (
          <Group key={i} opacity={on ? 1 : 0.25}>
            <Line points={r.polygon.flatMap((p) => [px(p.x), px(p.y)])} closed fill="rgba(13,148,136,0.10)"
              stroke={TEAL} strokeWidth={2 / s} />
            {/* Open-plan edges (no wall) shown dashed */}
            {r.walls?.map((t, e) =>
              t == null ? (
                <Line key={e} points={[r.polygon[e], r.polygon[(e + 1) % r.polygon.length]].flatMap((p) => [px(p.x), px(p.y)])}
                  stroke="#fff" strokeWidth={2 / s} dash={[5 / s, 4 / s]} />
              ) : null,
            )}
            <Text text={r.name} x={px(b.minX) + 4 / s} y={px(b.minY) + 4 / s} fontSize={12 / s} fontStyle="bold" fill="#065f56"
              padding={2 / s} />
          </Group>
        );
      })}
      {proposal.openings.map((o, i) => {
        const on = o.shape === "door" ? keepDoors : o.shape === "window" ? keepWindows : keepOpenings;
        if (!on) return null;
        const color = o.shape === "window" ? "#2563eb" : o.shape === "door" ? "#d97706" : "#7c3aed";
        return (
          <Group key={`o${i}`}>
            <Line points={itemCorners(o).flatMap((p) => [px(p.x), px(p.y)])} closed fill={color} opacity={0.75} />
            {o.shape === "door" && (
              <Line points={doorSwing(o, 10).flatMap((p) => [px(p.x), px(p.y)])} closed stroke={color} strokeWidth={1.5 / s}
                fill="rgba(217,119,6,0.12)" />
            )}
          </Group>
        );
      })}
    </Group>
  );
}
