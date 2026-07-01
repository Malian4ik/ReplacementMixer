import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { QueryProvider } from "@/components/QueryProvider";
import { UserProvider } from "@/components/UserContext";
import { TournamentProvider } from "@/contexts/TournamentContext";
import { getSessionFromCookies } from "@/lib/auth";
import { findUserByEmail, findUserById } from "@/lib/db-user";

export const metadata: Metadata = {
  title: "MixerCup Series — Dota 2 Tournament",
  description: "MixerCup Series — Dota 2 tournament management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

async function getInitialUser() {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const user = (await findUserById(session.userId)) ?? (await findUserByEmail(session.email.toLowerCase().trim()));
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialUser = await getInitialUser();

  return (
    <html lang="ru">
      <body>
        <QueryProvider>
          <UserProvider initialUser={initialUser}>
            <TournamentProvider>
              <div className="layout">
                <Sidebar />
                <div className="layout-content">{children}</div>
              </div>
            </TournamentProvider>
          </UserProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
