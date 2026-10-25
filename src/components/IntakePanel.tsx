"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { downscaleImage, sampleVideo } from "@/lib/intake/media";

/**
 * "Start from something you found" panel (plan §1, Phase 0) — three
 * doors, one hallway. Every door ends in the same place: a confirmed
 * topic draft on the intake job page, then the existing research engine.
 *
 * Upload door: the file is processed in the browser first (image
 * downscale, video frame sampling) — the full video never leaves the
 * phone, and there is no server video processing.
 */
export default function IntakePanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [door, setDoor] = useState<"upload" | "link" | "idea">("upload");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  // Upload door
  const [fileName, setFileName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  // Link door
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  // Typed door
  const [name, setName] = useState("");
  const [whatItDoes, setWhatItDoes] = useState("");
  const [audience, setAudience] = useState("");

  async function postIntake(body: Record<string, unknown>): Promise<string> {
    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
    return data.job.id as string;
  }

  async function runUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick a video or image first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (file.type.startsWith("video/")) {
        setProgress("Reading frames from your video…");
        const sampled = await sampleVideo(file, (kept) =>
          setProgress(`Reading frames from your video… ${kept} kept`)
        );
        setProgress("Understanding what it shows…");
        const id = await postIntake({
          type: "upload",
          kind: "video",
          contactSheet: sampled.contactSheet,
          images: sampled.frames,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          oneLiner: oneLiner.trim() || undefined,
        });
        router.push(`/intake/${id}`);
      } else if (file.type.startsWith("image/")) {
        setProgress("Preparing your image…");
        const image = await downscaleImage(file);
        setProgress("Understanding what it shows…");
        const id = await postIntake({
          type: "upload",
          kind: "image",
          images: [image],
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          oneLiner: oneLiner.trim() || undefined,
        });
        router.push(`/intake/${id}`);
      } else {
        throw new Error(
          "That file type isn't supported — use a JPG, PNG, or WebP image, or an MP4, WebM, or MOV video."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
      setBusy(false);
      setProgress("");
    }
  }

  async function runLink() {
    if (!url.trim()) {
      setError("Paste a link first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const id = await postIntake({
        type: "link",
        url: url.trim(),
        caption: caption.trim() || undefined,
      });
      router.push(`/intake/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link import failed. Try again.");
      setBusy(false);
    }
  }

  async function runIdea() {
    if (!name.trim()) {
      setError("Give the idea a name first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const id = await postIntake({
        type: "own-idea",
        name: name.trim(),
        whatItDoes: whatItDoes.trim() || undefined,
        audience: audience.trim() || undefined,
      });
      router.push(`/intake/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that idea. Try again.");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40";
  const doorBtn = (active: boolean) =>
    `flex-1 rounded border px-2 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-muted text-muted-foreground"
    }`;

  return (
    <section className="card-elevated flex flex-col gap-4 p-5" aria-label="Start from something you found">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="material-symbols text-[14px] text-primary">upload</span>
          Start from something you found
        </h2>
        <span className="border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
          NEW
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        A clip, a screenshot, a link, or just your own idea — the research
        engine takes it from there. Nothing is researched until you confirm
        the topic.
      </p>

      <div className="flex gap-2">
        <button type="button" className={doorBtn(door === "upload")} onClick={() => setDoor("upload")}>
          Upload media
        </button>
        <button type="button" className={doorBtn(door === "link")} onClick={() => setDoor("link")}>
          Paste a link
        </button>
        <button type="button" className={doorBtn(door === "idea")} onClick={() => setDoor("idea")}>
          Type an idea
        </button>
      </div>

      {door === "upload" && (
        <div className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            className="w-full text-sm text-muted-foreground file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-2 file:font-mono file:text-xs file:text-foreground"
          />
          {fileName && <p className="truncate text-sm text-foreground">{fileName}</p>}
          <input
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
            placeholder="One line about it (optional — helps if the clip has no title)"
            className={inputCls}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Video: max 100 MB and 10 minutes — frames are pulled out on your
            phone, the full video is never uploaded. Image: max 15 MB.
          </p>
          <button
            type="button"
            onClick={runUpload}
            disabled={busy}
            className="rounded bg-primary px-4 py-3 font-mono text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? progress || "Working…" : "Upload and understand"}
          </button>
        </div>
      )}

      {door === "link" && (
        <div className="flex flex-col gap-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube, Play Store, article, or Product Hunt link"
            inputMode="url"
            className={inputCls}
          />
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption text — needed for Facebook / Instagram links, which block automatic reads"
            rows={3}
            className={inputCls}
          />
          <button
            type="button"
            onClick={runLink}
            disabled={busy}
            className="rounded bg-primary px-4 py-3 font-mono text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Reading the link…" : "Import link"}
          </button>
        </div>
      )}

      {door === "idea" && (
        <div className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Idea name"
            className={inputCls}
          />
          <input
            value={whatItDoes}
            onChange={(e) => setWhatItDoes(e.target.value)}
            placeholder="What does it do?"
            className={inputCls}
          />
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Who is it for? (optional)"
            className={inputCls}
          />
          <button
            type="button"
            onClick={runIdea}
            disabled={busy}
            className="rounded bg-primary px-4 py-3 font-mono text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Continue to research"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded border border-score-low/30 bg-score-low/10 px-3 py-2 text-sm leading-relaxed text-score-low">
          {error}
        </p>
      )}
    </section>
  );
}
