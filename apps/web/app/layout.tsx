import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Fredoka, Bungee } from "next/font/google";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  weight: ["400", "500", "600", "700"],
});

const bungee = Bungee({
  subsets: ["latin"],
  variable: "--font-bungee",
  weight: "400",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: "Knockout — Penguin Battle Royale",
    template: "%s | Knockout",
  },
  description:
    "Real-time multiplayer 3D game where penguins battle on a shrinking platform. Choose your direction, launch, and knock opponents off the edge. Last penguin standing wins.",
  keywords: [
    "knockout",
    "penguin",
    "battle royale",
    "multiplayer",
    "3d game",
    "browser game",
    "real-time",
    "party game",
  ],
  authors: [{ name: "Knockout" }],
  openGraph: {
    type: "website",
    siteName: "Knockout",
    title: "Knockout — Penguin Battle Royale",
    description:
      "Knock your opponents off the platform. Last penguin standing wins.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Knockout — Penguin Battle Royale",
    description:
      "Knock your opponents off the platform. Last penguin standing wins.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} ${bungee.variable} font-[family-name:var(--font-geist-sans)] bg-[var(--bg-primary)] text-[var(--text-warm)] min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
