// Shrinks one news picture per message, off the page's main thread. Encoding
// the result (convertToBlob) is the slow part: on the main thread it froze
// Tech Spotlight's first open for ~180 ms. Replies with a WebP blob, or null.
self.onmessage = async (e: MessageEvent<{ id: number; url: string; px: number }>) => {
  const { id, url, px } = e.data;
  let blob: Blob | null = null;
  let full: ImageBitmap | null = null;
  let small: ImageBitmap | null = null;
  try {
    const res = await fetch(`anchor-img://fetch?u=${encodeURIComponent(url)}`);
    if (res.ok) {
      // never scaled up: a picture already narrower than px keeps its size
      full = await createImageBitmap(await res.blob());
      small = full.width > px ? await createImageBitmap(full, { resizeWidth: px, resizeQuality: "medium" }) : null;
      if (small) full.close(); // done with the original before encoding
      const out = small ?? full;
      const canvas = new OffscreenCanvas(out.width, out.height);
      canvas.getContext("2d")?.drawImage(out, 0, 0);
      blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
    }
  } catch {
    blob = null;
  } finally {
    // decoded originals can be 60+ MB; free them even when a step failed
    full?.close();
    small?.close();
  }
  self.postMessage({ id, blob });
};
