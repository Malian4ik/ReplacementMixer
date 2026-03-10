"use client";
import { createContext, useContext, useEffect, useState } from "react";

interface User { id: string; email: string; name: string; role: string; }
interface UserContextValue { user: User | null; loading: boolean; refetch: () => void; }

const UserContext = createContext<UserContextValue>({ user: null, loading: true, refetch: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  function refetch() {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      setUser(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { refetch(); }, []);

  return <UserContext.Provider value={{ user, loading, refetch }}>{children}</UserContext.Provider>;
}

export function useUser() { return useContext(UserContext); }
