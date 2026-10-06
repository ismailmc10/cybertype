import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CyberType / Tantra 26",
  description: "Three rounds. One keyboard. Make every keystroke count.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
