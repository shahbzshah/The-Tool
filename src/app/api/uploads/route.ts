import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_ZIP_BYTES = 25 * 1024 * 1024; // 25 MB per zip
const MAX_CONTENT_CHARS = 60000;

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
 * Unpack a Stitch export zip: one Upload record per screen file, with the
 * folder structure preserved in the filename (e.g. "home/index.html").
 */
async function extractZip(
  projectId: string,
  file: File
): Promise<{ id: string; type: string; filename: string; createdAt: Date }[]> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const created: { id: string; type: string; filename: string; createdAt: Date }[] = [];

  // Strip a single top-level wrapper folder if everything sits inside one.
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir && !isJunk(p));

  for (const path of paths) {
    // Normalize: "export/home/index.html" -> "home/index.html"
    const parts = path.split("/").filter(Boolean);
    const filename = parts.length > 2 ? parts.slice(1).join("/") : parts.join("/");
    const type = classify(filename, "");
    if (!type) continue; // skip non-design files

    let content: string | null = null;
    if (type === "design_md" || type === "html") {
      const text = await zip.files[path].async("string");
      content = text.slice(0, MAX_CONTENT_CHARS);
    }

    const upload = await prisma.upload.create({
      data: {
        projectId,
        type,
        filename,
        path: `uploads/${projectId}/${filename}`,
        content,
      },
      select: { id: true, type: true, filename: true, createdAt: true },
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
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required." }, { status: 400 });
  }
  const uploads = await prisma.upload.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, filename: true, createdAt: true },
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
  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "").trim();

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file attached." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large (max 5 MB)." }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    // Zip of a Stitch export folder: unpack it screen by screen.
    const isZip =
      file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
    if (isZip) {
      if (file.size > MAX_ZIP_BYTES) {
        return NextResponse.json({ error: "Zip is too large (max 25 MB)." }, { status: 400 });
      }
      const created = await extractZip(projectId, file);
      if (created.length === 0) {
        return NextResponse.json(
          { error: "No design files found in the zip." },
          { status: 400 }
        );
      }
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

    const upload = await prisma.upload.create({
      data: {
        projectId,
        type,
        filename: file.name,
        path: `uploads/${projectId}/${file.name}`,
        content,
      },
      select: { id: true, type: true, filename: true, createdAt: true },
    });

    return NextResponse.json({ upload });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}

/**
 * DELETE /api/uploads?id= — delete one uploaded export.
 */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required." }, { status: 400 });
  }
  try {
    await prisma.upload.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
