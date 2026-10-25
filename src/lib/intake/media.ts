/**
 * Browser-side media preparation for the upload front door (plan §3).
 *
 * Everything runs on the phone, in the browser — no server video
 * processing, and the full video file never leaves the device:
 * - Images are downscaled to a max 1568px long edge before upload.
 * - Video is reduced to 8 sampled frames (first and last always
 *   included), near-duplicates skipped by pixel difference, plus one
 *   labelled contact sheet and the 3 sharpest frames for detail.
 *
 * Hard limits, enforced before anything is sent (plan §3): video
 * ≤ 100 MB and ≤ 10 minutes, image ≤ 15 MB. Over the limit the UI says
 * so plainly — it never uploads and then fails silently.
 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 600;
export const MAX_FRAME_WIDTH = 640;
export const MAX_IMAGE_EDGE = 1568;

export interface SampledVideo {
  contactSheet: string;
  /** The 3 sharpest frames, as JPEG data URLs. */
  frames: string[];
  frameCount: number;
  durationSec: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this file as an image."));
    img.src = src;
  });
}

function drawToDataUrl(
  img: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  maxEdge: number,
  maxWidth?: number
): string {
  const w = (img as HTMLImageElement).naturalWidth ?? (img as HTMLVideoElement).videoWidth ?? (img as HTMLCanvasElement).width;
  const h = (img as HTMLImageElement).naturalHeight ?? (img as HTMLVideoElement).videoHeight ?? (img as HTMLCanvasElement).height;
  let tw = w;
  let th = h;
  const cap = maxWidth ?? maxEdge;
  if (Math.max(tw, th) > cap) {
    const s = cap / Math.max(tw, th);
    tw = Math.round(tw * s);
    th = Math.round(th * s);
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, tw);
  c.height = Math.max(1, th);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img as CanvasImageSource, 0, 0, tw, th);
  return c.toDataURL("image/jpeg", 0.85);
}

/** Downscale an image file to a max 1568px long edge (plan §3). */
export async function downscaleImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `That image is ${(file.size / 1024 / 1024).toFixed(0)} MB — the limit is 15 MB. Try a smaller photo or a screenshot.`
    );
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return drawToDataUrl(img, MAX_IMAGE_EDGE);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function frameSignature(video: HTMLVideoElement): number[] {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(video, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  const sig: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    sig.push(Math.round((data[i] + data[i + 1] + data[i + 2]) / 3));
  }
  return sig;
}

function signatureDiff(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Sharpness proxy: variance of grayscale pixels (higher = sharper). */
function sharpness(video: HTMLVideoElement): number {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(video, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  let mean = 0;
  const vals: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const g = (data[i] + data[i + 1] + data[i + 2]) / 3;
    vals.push(g);
    mean += g;
  }
  mean /= vals.length;
  let variance = 0;
  for (const v of vals) variance += (v - mean) * (v - mean);
  return variance / vals.length;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Could not read frames from this video."));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = t;
  });
}

/**
 * Sample a video file in the browser: 8 frames evenly across the clip
 * (first and last always included), near-duplicates skipped, one labelled
 * contact sheet, and the 3 sharpest frames kept individually.
 * Throws a plain-language error when the browser cannot decode the file
 * (e.g. some .mov files) — there is no server ffmpeg fallback: the user
 * is told to try MP4/WebM or a screenshot instead.
 */
export async function sampleVideo(
  file: File,
  onProgress?: (kept: number, total: number) => void
): Promise<SampledVideo> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `That video is ${(file.size / 1024 / 1024).toFixed(0)} MB — the limit is 100 MB. Trim it first, then upload.`
    );
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  // Attach to the DOM (1px, invisible — never display:none, which suspends
  // loading in some browsers). Detached video elements fail to load metadata
  // in stricter browser builds, which surfaced as a decode error.
  video.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(
          new Error(
            "This video format can't be read in your browser. Try an MP4 or WebM clip, or upload a screenshot from the video instead."
          )
        );
      video.src = url;
      video.load();
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Could not read this video's length. Try an MP4 or WebM clip.");
    }
    if (duration > MAX_VIDEO_SECONDS) {
      throw new Error(
        `That video is ${Math.round(duration / 60)} minutes — the limit is 10 minutes. Trim it first, then upload.`
      );
    }
    const times: number[] = [];
    for (let i = 0; i < 8; i++) {
      times.push(Math.min((i / 7) * duration, Math.max(0, duration - 0.1)));
    }
    const kept: { dataUrl: string; sig: number[]; sharp: number }[] = [];
    let lastSig: number[] | null = null;
    for (let i = 0; i < times.length; i++) {
      await seekTo(video, times[i]);
      const sig = frameSignature(video);
      const isFirst = i === 0;
      const isLast = i === times.length - 1;
      const different = lastSig == null || signatureDiff(sig, lastSig) >= 6;
      if (isFirst || isLast || different) {
        kept.push({
          dataUrl: drawToDataUrl(video, MAX_FRAME_WIDTH),
          sig,
          sharp: sharpness(video),
        });
        lastSig = sig;
      }
      onProgress?.(kept.length, 8);
    }
    if (kept.length === 0) {
      throw new Error("No frames could be read from this video. Try an MP4 or WebM clip.");
    }
    // Contact sheet: 4×2 labelled grid of the kept frames.
    const sheet = document.createElement("canvas");
    const cellW = 320;
    const cellH = 180;
    const labelH = 22;
    sheet.width = cellW * 4;
    sheet.height = (cellH + labelH) * 2;
    const sctx = sheet.getContext("2d")!;
    sctx.fillStyle = "#fdf9f2";
    sctx.fillRect(0, 0, sheet.width, sheet.height);
    for (let i = 0; i < kept.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = col * cellW;
      const y = row * (cellH + labelH);
      const img = await loadImage(kept[i].dataUrl);
      sctx.drawImage(img, x, y, cellW, cellH);
      sctx.fillStyle = "#1a1712";
      sctx.font = "14px monospace";
      sctx.fillText(`Frame ${i + 1}`, x + 6, y + cellH + 16);
    }
    const contactSheet = sheet.toDataURL("image/jpeg", 0.85);
    const sharpest = [...kept].sort((a, b) => b.sharp - a.sharp).slice(0, 3);
    return {
      contactSheet,
      frames: sharpest.map((f) => f.dataUrl),
      frameCount: kept.length,
      durationSec: Math.round(duration),
    };
  } finally {
    video.remove();
    URL.revokeObjectURL(url);
  }
}
