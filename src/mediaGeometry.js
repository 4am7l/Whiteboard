// Preserve the original uniform media scaling while keeping the selection frame independent.
export function mediaCardStyle(element, viewport) {
  const voice = Boolean(element.customData?.voiceNoteId);
  const audio = element.customData?.music?.displayMode === "audio";
  const width = voice ? 240 : audio ? 310 : 400;
  const height = voice ? 76 : audio ? 98 : 265;
  const scale = Math.max(0, Math.min(element.width / width, element.height / height)) * viewport.zoom;
  return {
    left: (element.x + element.width / 2 + viewport.x) * viewport.zoom - width / 2,
    top: (element.y + element.height / 2 + viewport.y) * viewport.zoom - height / 2,
    width,
    height,
    transform: `rotate(${element.angle || 0}rad) scale(${scale})`,
    transformOrigin: "center center",
    opacity: (element.opacity ?? 100) / 100,
  };
}
