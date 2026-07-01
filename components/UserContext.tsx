"use client";
import { createContext, useContext, useEffect, useState } from "react";

interface User { id: string; email: string; name: string; role: string; }
interface UserContextValue { user: User | null; loading: boolean; refetch: () => void; }

const UserContext = createContext<UserContextValue>({ user: null, loading: true, refetch: () => {} });

export function UserProvider({ children, initialUser = null }: { children: React.ReactNode; initialUser?: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);

  function refetch() {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      setUser(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!initialUser) refetch();
  }, []);

  return <UserContext.Provider value={{ user, loading, refetch }}>{children}</UserContext.Provider>;
}

export function useUser() { return useContext(UserContext); }
