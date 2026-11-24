import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { StackIcon } from "@/components/StackIcon";
import { socialImageSize } from "@/lib/social-metadata";

type Preview =
  | { kind: "home" }
  | { kind: "section"; section: "ai" | "stock" }
  | { kind: "essay"; title: string };

export async function createSocialImage(preview: Preview) {
  const photo = await readFile(join(process.cwd(), "public/profile.png"));
  const portraitSize = preview.kind === "home" ? 192 : 96;
  const portrait = (
    // ImageResponse embeds the local portrait directly into the generated PNG.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/png;base64,${photo.toString("base64")}`}
      alt=""
      width={portraitSize}
      height={portraitSize}
      style={{ borderRadius: "50%", objectFit: "cover" }}
    />
  );
  const fonts = preview.kind === "essay" ? [{
    name: "Inter",
    data: await readFile(join(process.cwd(), "fonts/Inter-Medium.ttf")),
    weight: 500 as const,
    style: "normal" as const,
  }] : [];

  return new ImageResponse(
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#fdfdfc",
      color: "#111",
    }}>
      {preview.kind !== "home" && (
        <div style={{ position: "absolute", top: 48, left: 48, display: "flex" }}>
          {portrait}
        </div>
      )}
      {preview.kind === "home" && portrait}
      {preview.kind === "section" && (
        <StackIcon section={preview.section} size={160} stroke="#111" strokeWidth={2.2} />
      )}
      {preview.kind === "essay" && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          width: 960,
          fontFamily: "Inter",
          fontSize: 84,
          fontWeight: 500,
          lineHeight: 20 / 14,
          letterSpacing: "-0.00643em",
          textAlign: "center",
          whiteSpace: "normal",
          textWrap: "balance",
        }}>
          {preview.title}
        </div>
      )}
    </div>,
    { ...socialImageSize, fonts },
  );
}
