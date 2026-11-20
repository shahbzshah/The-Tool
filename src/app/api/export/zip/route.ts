import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import JSZip from "jszip";
import { buildExportPack } from "@/lib/export-pack";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    const ideaId = String(body?.ideaId ?? "");
    const toolId = String(body?.tool ?? "");

    // The pack itself is built in src/lib/export-pack.ts — the GitHub
    // push reuses the same builder, so the zip and the repo never drift.
    const { files, slug } = await buildExportPack({
      ideaId,
      userId: auth.user.id,
      toolId,
    });

    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content);
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-${toolId}-pack.zip"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error("Export failed:", err);
    const message =
      err instanceof Error ? err.message : "Export failed.";
    // Known pack errors (unknown tool, idea not found, no docs) are
    // client errors — surface the message instead of a bare 500.
    const status =
      /unknown export tool|idea not found|approve this idea|no documents/i.test(
        message
      )
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
