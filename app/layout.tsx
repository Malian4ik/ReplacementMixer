import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { QueryProvider } from "@/components/QueryProvider";
import { UserProvider } from "@/components/UserContext";

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
          <UserProvider>
            <div className="layout">
              <Sidebar />
              <div className="layout-content">{children}</div>
            </div>
          </UserProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
