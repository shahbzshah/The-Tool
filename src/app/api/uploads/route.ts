import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { randomUUID } from "crypto";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per non-zip file
const MAX_ZIP_BYTES = 25 * 1024 * 1024; // 25 MB per zip
const MAX_CONTENT_CHARS = 60000;

// Zip-bomb hardening (M1)
const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB total decompressed
const MAX_ZIP_RATIO = 100; // per-entry compression ratio > 100:1 aborts

class ZipRejectedError extends Error {}

/** Zip metadata JSZip doesn't expose in its public types. */
interface ZipEntryData {
  _data?: { uncompressedSize?: number; compressedSize?: number };
}
function entrySizes(entry: JSZip.JSZipObject): {
  uncompressed?: number;
  compressed?: number;
} {
  const d = (entry as unknown as ZipEntryData)._data;
  return { uncompressed: d?.uncompressedSize, compressed: d?.compressedSize };
}

function classify(filename: string, mime: string): "design_md" | "html" | "screenshot" | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
    return "design_md";
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "html";
  }
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    mime.startsWith("image/")
  ) {
    return "screenshot";
  }
  return null;
}

function isJunk(path: string): boolean {
  return (
    path.includes("__MACOSX") ||
    path.endsWith(".DS_Store") ||
    path.endsWith("Thumbs.db")
  );
}

/**
 * S1: reject absolute paths and ".." segments so a malicious zip entry or
 * relativePath can't escape the project folder. Returns null when rejected.
 */
function sanitizeZipPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized)) return null; // absolute
  const segments = normalized.split("/").filter((p) => p && p !== ".");
  if (segments.some((s) => s === "..")) return null; // path traversal
  if (segments.length === 0) return null;
  return segments.join("/");
}

/**
 * Unpack a Stitch export zip: one Upload record per screen file, with the
 * folder structure preserved in the filename (e.g. "home/index.html").
 * All records share one batchId so the Design page can version them together.
 *
 * M1: the zip is fully validated (entry count, nested zips, compressed-size
 * metadata pre-pass + live decompressed-byte counter, per-entry compression
 * ratio) BEFORE any DB insert happens, so a rejected zip never leaves a
 * partial batch behind.
 */
async function extractZip(
  projectId: string,
  file: File,
  batchId: string
): Promise<{ id: string; type: string; filename: string; batchId: string | null; createdAt: Date }[]> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // Strip a single top-level wrapper folder if everything sits inside one.
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir && !isJunk(p));
  if (paths.length > MAX_ZIP_ENTRIES) {
    throw new ZipRejectedError(`Zip has too many entries (max ${MAX_ZIP_ENTRIES}).`);
  }

  // Per-entry pre-pass on metadata: nested zips, decompressed budget, ratio.
  let declaredTotal = 0;
  for (const path of paths) {
    const { uncompressed, compressed } = entrySizes(zip.files[path]);
    if (typeof uncompressed === "number") {
      if (uncompressed > 0 && (!compressed || compressed <= 0 || uncompressed / compressed > MAX_ZIP_RATIO)) {
        throw new ZipRejectedError(`Zip entry "${path}" has a suspicious compression ratio.`);
      }
      declaredTotal += uncompressed;
      if (declaredTotal > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new ZipRejectedError("Zip decompresses to more than 50 MB.");
      }
    }
  }

  // Validate + extract in memory; live byte counter runs during extraction.
  type Prepared = { filename: string; type: "design_md" | "html" | "screenshot"; content: string | null; bytes: number };
  const prepared: Prepared[] = [];
  let extractedTotal = 0;
  for (const path of paths) {
    const safe = sanitizeZipPath(path);
    if (!safe) continue; // skip absolute or traversal entries
    if (safe.toLowerCase().endsWith(".zip")) {
      throw new ZipRejectedError("Nested zips are not allowed.");
    }
    // Normalize: "export/home/index.html" -> "home/index.html"
    const parts = safe.split("/").filter(Boolean);
    const filename = parts.length > 2 ? parts.slice(1).join("/") : parts.join("/");
    const type = classify(filename, "");
    if (!type) continue; // skip non-design files

    let content: string | null = null;
    let bytes = 0;
    if (type === "design_md" || type === "html") {
      const buf = await zip.files[path].async("nodebuffer");
      bytes = buf.byteLength;
      extractedTotal += bytes;
      if (extractedTotal > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new ZipRejectedError("Zip decompresses to more than 50 MB.");
      }
      content = buf.toString("utf8").slice(0, MAX_CONTENT_CHARS);
    } else {
      // Don't hold screenshots in memory; count declared size against the budget.
      const { uncompressed } = entrySizes(zip.files[path]);
      bytes = typeof uncompressed === "number" ? uncompressed : 0;
      extractedTotal += bytes;
      if (extractedTotal > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new ZipRejectedError("Zip decompresses to more than 50 MB.");
      }
    }
    prepared.push({ filename, type, content, bytes });
  }

  if (prepared.length === 0) {
    throw new ZipRejectedError("No design files found in the zip.");
  }

  // Only now, after full validation, write to the DB.
  const created: { id: string; type: string; filename: string; batchId: string | null; createdAt: Date }[] = [];
  for (const item of prepared) {
    const upload = await prisma.upload.create({
      data: {
        projectId,
        type: item.type,
        filename: item.filename,
        path: `uploads/${projectId}/${item.filename}`,
        content: item.content,
        batchId,
      },
      select: { id: true, type: true, filename: true, batchId: true, createdAt: true },
    });
    created.push(upload);
  }
  return created;
}

/**
 * GET /api/uploads?projectId= — list a project's Stitch design exports.
 */
export async function GET(req: Request) {
  if (IS_BUILD) return NextResponse.json({ uploads: [], building: true });
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required." }, { status: 400 });
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const uploads = await prisma.upload.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, filename: true, batchId: true, createdAt: true },
  });
  return NextResponse.json({ uploads });
}

/**
 * POST /api/uploads — upload a Stitch design export.
 * Multipart form: file, projectId. Text files (md/html) have their content
 * extracted into the DB so the review and docs generators can read them;
 * screenshots are stored as visual references.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "").trim();
    // relativePath preserves the Stitch export folder structure
    // (e.g. "SETTINGS_SYNC/screen.png") when uploading via folder picker.
    const rawRelativePath = String(form.get("relativePath") ?? "").trim();

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file attached." }, { status: 400 });
    }

    // S2: check isZip FIRST so zips get the 25 MB limit and non-zips 5 MB.
    const isZip =
      file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
    const sizeLimit = isZip ? MAX_ZIP_BYTES : MAX_BYTES;
    if (file.size > sizeLimit) {
      return NextResponse.json(
        { error: isZip ? "Zip is too large (max 25 MB)." : "File is too large (max 5 MB)." },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    // Zip of a Stitch export folder: unpack it screen by screen.
    if (isZip) {
      // One batchId for the whole zip: the Design page treats these as a
      // single design version.
      const created = await extractZip(projectId, file, randomUUID());
      return NextResponse.json({ uploads: created, count: created.length });
    }

    const type = classify(file.name, file.type || "");
    if (!type) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload .md, .html, an image, or a .zip of your Stitch export." },
        { status: 400 }
      );
    }

    let content: string | null = null;
    if (type === "design_md" || type === "html") {
      const text = await file.text();
      content = text.slice(0, MAX_CONTENT_CHARS);
    }

    // Prefer the folder-relative path so screens stay grouped. S1: sanitize
    // both the relative path and the file name against traversal/absolute paths.
    const filename = sanitizeZipPath(rawRelativePath) ?? sanitizeZipPath(file.name) ?? file.name;

    const upload = await prisma.upload.create({
      data: {
        projectId,
        type,
        filename,
        path: `uploads/${projectId}/${filename}`,
        content,
      },
      select: { id: true, type: true, filename: true, batchId: true, createdAt: true },
    });

    return NextResponse.json({ upload });
  } catch (err) {
    if (err instanceof ZipRejectedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Upload failed:", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}

/**
 * DELETE /api/uploads?id= — delete one uploaded export.
 */
export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required." }, { status: 400 });
  }
  const upload = await prisma.upload.findFirst({
    where: { id, project: { userId: user.id } },
  });
  if (!upload) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  await prisma.upload.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
