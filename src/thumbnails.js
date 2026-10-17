export async function thumbnail(file) {
  if (!file.type.startsWith('image/')) return null;
  let image;
  try {
    image = await createImageBitmap(file);
    const scale = Math.min(1, 320 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .75));
  } catch { return null; } finally { image?.close(); }
}
