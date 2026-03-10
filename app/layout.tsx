import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { QueryProvider } from "@/components/QueryProvider";

export const metadata: Metadata = {
  title: "MixerCup — Replacement Manager",
  description: "Tournament replacement management tool",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <QueryProvider>
          <div className="layout">
            <Sidebar />
            <div className="layout-content">{children}</div>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
