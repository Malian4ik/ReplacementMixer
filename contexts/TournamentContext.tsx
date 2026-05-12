"use client";

import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Tournament {
  id: string;
  name: string;
  isActive: boolean;
  externalId: string;
  participantCount: number;
  lastSyncedAt: string | null;
  startDate: string | null;
}

interface TournamentContextValue {
  activeTournament: Tournament | null;
  tournaments: Tournament[];
  switchTournament: (id: string) => Promise<void>;
  isLoading: boolean;
}

const TournamentContext = createContext<TournamentContextValue>({
  activeTournament: null,
  tournaments: [],
  switchTournament: async () => {},
  isLoading: false,
});

export function TournamentProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: tournaments = [], isLoading } = useQuery<Tournament[]>({
    queryKey: ["tournaments-synced"],
    queryFn: () => fetch("/api/admin/tournaments/synced").then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const activeTournament = tournaments.find(t => t.isActive) ?? null;

  const switchTournament = async (id: string) => {
    await fetch("/api/admin/tournaments/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await queryClient.invalidateQueries({ queryKey: ["tournaments-synced"] });
    await queryClient.invalidateQueries({ queryKey: ["teams"] });
    await queryClient.invalidateQueries({ queryKey: ["substitution-pool"] });
    await queryClient.invalidateQueries({ queryKey: ["players"] });
    await queryClient.invalidateQueries({ queryKey: ["queue"] });
  };

  return (
    <TournamentContext.Provider value={{ activeTournament, tournaments, switchTournament, isLoading }}>
      {children}
    </TournamentContext.Provider>
  );
}

export const useTournament = () => useContext(TournamentContext);
