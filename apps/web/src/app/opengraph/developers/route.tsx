import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Social image for the /developers landing (ported from the docs app's
 * /opengraph/developers route, landing only). Docs pages use Mintlify's own
 * generated images, so this route no longer takes a slug.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

const SIZE = { width: 1200, height: 630 };
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

type Assets = {
  background: string;
  logo: string;
  medium: Buffer;
  bold: Buffer;
};

let assetsPromise: Promise<Assets> | undefined;

function loadAssets(): Promise<Assets> {
  const root = process.cwd();
  assetsPromise ??= Promise.all([
    readFile(path.join(root, "public/img/og-backgrounds/shape-1.jpg")),
    readFile(path.join(root, "public/img/logomark-color.svg")),
    readFile(path.join(root, "src/fonts/diatype/ABCDiatype-Medium.woff")),
    readFile(path.join(root, "src/fonts/diatype/ABCDiatype-Bold.woff")),
  ]).then(([background, logo, medium, bold]) => ({
    background: `data:image/jpeg;base64,${background.toString("base64")}`,
    logo: `data:image/svg+xml;base64,${logo.toString("base64")}`,
    medium,
    bold,
  }));
  return assetsPromise;
}

export async function GET() {
  const { background, logo, medium, bold } = await loadAssets();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        backgroundColor: "#000",
        color: "#fff",
        padding: "56px 64px",
        fontFamily: "Diatype",
      }}
    >
      <img
        src={background}
        width={SIZE.width}
        height={SIZE.height}
        alt=""
        style={{ position: "absolute", top: 0, left: 0 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <img src={logo} width={64} height={56} alt="" />
        <span style={{ fontSize: 48, fontWeight: 500, color: "#bbb" }}>
          Solana Developers
        </span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 96,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          maxWidth: 1000,
        }}
      >
        Build on internet capital markets.
      </div>
    </div>,
    {
      ...SIZE,
      fonts: [
        { name: "Diatype", data: medium, style: "normal", weight: 500 },
        { name: "Diatype", data: bold, style: "normal", weight: 700 },
      ],
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}
