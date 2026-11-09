import type { Metadata } from "next";
import "@fontsource/syne/600.css";
import "@fontsource/syne/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "FlowMind — Meeting intelligence",
  description:
    "Turn every meeting into clear decisions, accountable actions, and lasting momentum.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
