import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const alt = "Knockout — Penguin Battle Royale";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const logoData = await readFile(
    join(process.cwd(), "public", "logo.png"),
  );
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F0D0A",
          position: "relative",
        }}
      >
        {/* Radial gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(255, 107, 44, 0.12) 0%, transparent 70%)",
          }}
        />

        {/* Logo */}
        <img
          src={logoSrc}
          width={600}
          height={120}
          style={{ objectFit: "contain" }}
        />

        {/* Tagline */}
        <p
          style={{
            marginTop: 32,
            fontSize: 36,
            color: "rgba(255, 235, 200, 0.7)",
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          Penguin Battle Royale
        </p>

        {/* Subtitle */}
        <p
          style={{
            marginTop: 12,
            fontSize: 22,
            color: "rgba(255, 235, 200, 0.4)",
          }}
        >
          Knock your opponents off the platform. Last penguin standing wins.
        </p>
      </div>
    ),
    { ...size },
  );
}
