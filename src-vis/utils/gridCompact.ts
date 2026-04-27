import type { WidgetConfig } from '../types';

/** Pack items upward (same algorithm as react-grid-layout compactType='vertical'). */
export function verticalCompact(items: WidgetConfig[]): WidgetConfig[] {
  const sorted = [...items].sort((a, b) =>
    a.gridPos.y !== b.gridPos.y ? a.gridPos.y - b.gridPos.y : a.gridPos.x - b.gridPos.x
  );
  const placed: WidgetConfig[] = [];
  for (const item of sorted) {
    let newY = 0;
    while (placed.some((p) => {
      const { x: px, y: py, w: pw, h: ph } = p.gridPos;
      const { x: ix, w: iw, h: ih } = item.gridPos;
      return px < ix + iw && px + pw > ix && py < newY + ih && py + ph > newY;
    })) newY++;
    placed.push({ ...item, gridPos: { ...item.gridPos, y: newY } });
  }
  return placed;
}
