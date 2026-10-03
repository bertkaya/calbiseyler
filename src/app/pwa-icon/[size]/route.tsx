import { ImageResponse } from "next/og";

export const runtime = "edge";

/** PNG app icons (192/512) for the PWA manifest, drawn on demand. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = (await params).size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#120e0d", color: "#e0866f", fontSize: n * 0.6 }}>
        ♪
      </div>
    ),
    { width: n, height: n, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
