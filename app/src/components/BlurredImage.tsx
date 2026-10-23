// A picture blurred once, into a canvas, instead of with a CSS `filter: blur()`.
// A CSS blur on a full-window layer is re-run by the GPU on every frame anything
// over it changes (scrolling, a fade, a card springing open); a canvas drawn once
// is just a texture. It's drawn at a quarter of its on-screen size (a blurred
// picture has no detail to lose) and stretched back up with object-fit: cover,
// so a window resize needs no redraw. Recent results are kept, so hovering the
// same Home card again only copies pixels.
import { useEffect, useRef } from "react";

const SCALE = 0.25;
const KEEP = 24;
const cache = new Map<string, HTMLCanvasElement>();

export function BlurredImage({
  src, blur, saturate = 1, className, style,
}: {
  src: string;
  /** Blur radius in CSS px, or a CSS custom property holding one (e.g. "--bg-blur-page"). */
  blur: number | `--${string}`;
  saturate?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const r = radius(blur);
    const key = `${src}|${r}|${saturate}`;
    const kept = cache.get(key);
    if (kept) {
      show(canvas, kept);
      return;
    }
    let live = true;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    img.decode().then(
      () => {
        const out = render(canvas, img, r, saturate);
        if (!out) return;
        cache.delete(key);
        cache.set(key, out);
        if (cache.size > KEEP) cache.delete(cache.keys().next().value!);
        if (live) show(canvas, out);
      },
      () => {} // unreadable picture: the canvas stays empty, the layer under it shows
    );
    return () => { live = false; };
  }, [src, blur, saturate]);

  return <canvas ref={ref} aria-hidden className={className} style={{ objectFit: "cover", ...style }} />;
}

function radius(blur: number | string): number {
  if (typeof blur === "number") return blur;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(blur)) || 0;
}

function show(canvas: HTMLCanvasElement, from: HTMLCanvasElement) {
  canvas.width = from.width;
  canvas.height = from.height;
  canvas.getContext("2d")?.drawImage(from, 0, 0);
}

/** The blurred picture, sized to `target` at SCALE, on a canvas of its own. */
function render(target: HTMLCanvasElement, img: HTMLImageElement, blurPx: number, saturate: number) {
  const box = target.getBoundingClientRect();
  const out = document.createElement("canvas");
  const w = (out.width = Math.max(1, Math.round((box.width || window.innerWidth) * SCALE)));
  const h = (out.height = Math.max(1, Math.round((box.height || window.innerHeight) * SCALE)));
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  // cover-crop the picture, then overdraw past every edge so the blur samples
  // picture there instead of fading to transparent
  const r = blurPx * SCALE;
  const pad = r * 2;
  const cover = Math.max((w + pad * 2) / img.naturalWidth, (h + pad * 2) / img.naturalHeight);
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;
  ctx.filter = `blur(${r}px)${saturate !== 1 ? ` saturate(${saturate})` : ""}`;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return out;
}
