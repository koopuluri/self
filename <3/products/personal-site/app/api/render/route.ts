import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { getSceneMeta } from "@/remotion/scenes.meta";

// Local exporter. Bundles the Remotion entry once (cached across requests),
// renders either an MP4 or a 5:2 final-frame banner in headless Chrome, and
// streams the file back as a download. Runs only on your machine — no cloud.
export const runtime = "nodejs";
// This exporter is a local-only tool (headless Chrome render); maxDuration only
// governs Vercel serverless, where the hobby plan caps at 300s. Kept at the
// ceiling so deploys pass — it's a no-op during local `next dev` / `next start`.
export const maxDuration = 300;

let bundlePromise: Promise<string> | null = null;
function getServeUrl() {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
      // Same assets the site serves, so "/avatars/..." resolves during render.
      publicDir: path.join(process.cwd(), "public"),
    });
  }
  return bundlePromise;
}

export async function POST(req: Request) {
  let body: {
    id?: string;
    inputProps?: Record<string, unknown>;
    format?: "mp4" | "banner";
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { id, inputProps = {}, format = "mp4" } = body;
  if (!id) return new Response("Missing scene id", { status: 400 });
  if (format !== "mp4" && format !== "banner") {
    return new Response(`Unknown export format: ${format}`, { status: 400 });
  }
  const meta = getSceneMeta(id);
  if (!meta) return new Response(`Unknown scene: ${id}`, { status: 404 });

  const extension = format === "banner" ? "png" : "mp4";
  const outPath = path.join(os.tmpdir(), `${id}-${Date.now()}.${extension}`);

  try {
    const serveUrl = await getServeUrl();
    const composition = await selectComposition({ serveUrl, id, inputProps });

    if (format === "banner") {
      // Preserve the composition's height and scale. Only widen the canvas to
      // 5:2; each scene's full-canvas background fills the new side space while
      // its flex/50%-positioned visual remains centered exactly as before.
      const bannerComposition = {
        ...composition,
        width: Math.round((composition.height * 5) / 2),
      };
      await renderStill({
        composition: bannerComposition,
        serveUrl,
        output: outPath,
        frame: composition.durationInFrames - 1,
        imageFormat: "png",
        inputProps,
      });
    } else {
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        // yuv420p + even dimensions keep the MP4 playable everywhere (incl. X).
        pixelFormat: "yuv420p",
        outputLocation: outPath,
        inputProps,
      });
    }

    const file = await fs.readFile(outPath);
    const contentType = format === "banner" ? "image/png" : "video/mp4";
    const filename = format === "banner" ? `${id}-banner.png` : `${id}.mp4`;
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(file.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    return new Response(message, { status: 500 });
  } finally {
    await fs.rm(outPath, { force: true }).catch(() => {});
  }
}
