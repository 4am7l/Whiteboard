export const WORLD_VIEW = Object.freeze({ x: 0, y: 0, zoom: 1 });
export function isVisible(element, viewport, width, height, margin = 350) {
  // A rotation-independent bounding circle avoids clipping rotated corners.
  const radius = Math.hypot(element.width, element.height) / 2;
  const x = (element.x + element.width / 2 + viewport.x) * viewport.zoom;
  const y = (element.y + element.height / 2 + viewport.y) * viewport.zoom;
  const r = radius * viewport.zoom;
  return x + r >= -margin && y + r >= -margin && x - r <= width + margin && y - r <= height + margin;
}
