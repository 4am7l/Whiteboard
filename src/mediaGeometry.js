// Match the visible media card to the actual Excalidraw selection bounds.
// Independent axis scaling keeps resize handles on the frame even after repeated drags.
export function mediaCardStyle(element, viewport) {
  const voice = Boolean(element.customData?.voiceNoteId);
  const audio = element.customData?.music?.displayMode === "audio";
  const width = voice ? 240 : audio ? 310 : 400;
  const height = voice ? 76 : audio ? 98 : 265;
  const scaleX = Math.max(0, element.width / width) * viewport.zoom;
  const scaleY = Math.max(0, element.height / height) * viewport.zoom;
  return {
    left: (element.x + element.width / 2 + viewport.x) * viewport.zoom - width / 2,
    top: (element.y + element.height / 2 + viewport.y) * viewport.zoom - height / 2,
    width,
    height,
    transform: `rotate(${element.angle || 0}rad) scale(${scaleX}, ${scaleY})`,
    transformOrigin: "center center",
    opacity: (element.opacity ?? 100) / 100,
  };
}
