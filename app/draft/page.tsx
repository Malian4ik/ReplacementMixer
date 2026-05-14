"use client";

import { useEffect, useState, useCallback } from "react";

interface Player {
  nick: string;
  rating: number | null;
  isCaptain: boolean;
}

interface Team {
  name: string;
  captain: { nick: string; queuePosition: number | null } | null;
  players: Player[];
}

interface PoolPlayer {
  nick: string;
  rating: number | null;
  queuePosition: number | null;
}

interface DraftState {
  tournamentName: string;
  pickChoiceCount: number;
  teams: Team[];
  pool: PoolPlayer[];
  currentTeamName: string | null;
  totalPicked: number;
  totalPool: number;
}

function mmrLabel(r: number | null) {
  if (r === null) return "";
  return `${r.toLocaleString("ru-RU")} MMR`;
}

export default function DraftPage() {
  const [tid, setTid] = useState<string>("23");
  const [state, setState] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [teamSearch, setTeamSearch] = useState("");
  const [poolSearch, setPoolSearch] = useState("");

  const fetchState = useCallback(async (tournamentId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/draft/state?tournamentId=${tournamentId}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Ошибка ${res.status}`);
        return;
      }
      const data: DraftState = await res.json();
      setState(data);
      setLastUpdate(new Date());
      setError(null);
      // Auto-expand current team
      if (data.currentTeamName) {
        setExpanded(prev => new Set([...prev, data.currentTeamName!]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tid") ?? localStorage.getItem("draft_tid") ?? "23";
    setTid(t);
    fetchState(t);
  }, [fetchState]);

  useEffect(() => {
    if (!tid) return;
    localStorage.setItem("draft_tid", tid);
    const interval = setInterval(() => fetchState(tid), 3000);
    return () => clearInterval(interval);
  }, [tid, fetchState]);

  const toggleTeam = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalPicks = state ? state.pickChoiceCount * state.teams.length : 0;
  const secondsAgo = lastUpdate
    ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    : null;

  const filteredTeams = state?.teams.filter(t =>
    t.name.toLowerCase().includes(teamSearch.toLowerCase())
  ) ?? [];

  const filteredPool = state?.pool.filter(p =>
    p.nick.toLowerCase().includes(poolSearch.toLowerCase())
  ) ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">
            {state ? `🏆 ${state.tournamentName}` : "⏳ Загрузка..."}
          </span>
          {loading && (
            <span className="text-xs text-blue-400 animate-pulse">обновляется...</span>
          )}
          {secondsAgo !== null && !loading && (
            <span className="text-xs text-gray-500">⟳ {secondsAgo}с назад</span>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {state?.currentTeamName && (
            <div className="bg-yellow-500/10 border border-yellow-500/40 rounded px-3 py-1 text-sm">
              <span className="text-yellow-400 font-semibold">⚡ Пикует:</span>{" "}
              <span className="font-bold">{state.currentTeamName}</span>
              {state.teams.find(t => t.name === state.currentTeamName)?.captain && (
                <span className="text-gray-400 text-xs ml-1">
                  ({state.teams.find(t => t.name === state.currentTeamName)?.captain?.nick})
                </span>
              )}
            </div>
          )}
          {state && (
            <div className="text-sm text-gray-400">
              Пиков:{" "}
              <span className="text-white font-semibold">
                {state.totalPicked}/{totalPicks}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">tid:</label>
            <input
              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs w-16 text-center"
              value={tid}
              onChange={e => setTid(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchState(tid)}
            />
            <button
              onClick={() => fetchState(tid)}
              className="text-xs bg-blue-700 hover:bg-blue-600 px-2 py-0.5 rounded"
            >
              ОК
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/40 border-b border-red-800 text-red-300 px-4 py-2 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Teams panel */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-800">
          <div className="p-3 border-b border-gray-800 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-300">
              Команды ({state?.teams.length ?? 0})
            </span>
            <input
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
              placeholder="Поиск команды..."
              value={teamSearch}
              onChange={e => setTeamSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredTeams.map(team => {
              const isCurrent = team.name === state?.currentTeamName;
              const isFull = state ? team.players.length >= state.pickChoiceCount : false;
              const isOpen = expanded.has(team.name) || isCurrent;
              return (
                <div
                  key={team.name}
                  className={`border-b border-gray-800/60 ${isCurrent ? "bg-yellow-500/5 border-l-2 border-l-yellow-500" : ""}`}
                >
                  <button
                    onClick={() => toggleTeam(team.name)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-400 text-xs w-3">{isOpen ? "▾" : "▸"}</span>
                      <span className={`font-medium truncate text-sm ${isCurrent ? "text-yellow-300" : ""}`}>
                        {isCurrent && "⚡ "}{team.name}
                      </span>
                      {team.captain && (
                        <span className="text-xs text-gray-500 hidden sm:inline">
                          ({team.captain.nick})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {isFull && (
                        <span className="text-xs text-green-400 font-semibold">✓ полная</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${isFull ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-400"}`}>
                        {team.players.length}/{state?.pickChoiceCount ?? 8}
                      </span>
                    </div>
                  </button>
                  {isOpen && team.players.length > 0 && (
                    <div className="px-4 pb-2 space-y-0.5">
                      {team.players.map(p => (
                        <div key={p.nick} className="flex items-center gap-2 py-0.5">
                          <span className={`text-xs w-3 text-center ${p.isCaptain ? "text-yellow-400" : "text-gray-600"}`}>
                            {p.isCaptain ? "★" : "·"}
                          </span>
                          <span className={`text-sm ${p.isCaptain ? "font-semibold text-yellow-200" : "text-gray-300"}`}>
                            {p.nick}
                          </span>
                          {p.rating !== null && (
                            <span className="text-xs text-gray-500 ml-auto">{mmrLabel(p.rating)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && team.players.length === 0 && (
                    <div className="px-4 pb-2 text-xs text-gray-600 italic">нет игроков</div>
                  )}
                </div>
              );
            })}
            {!state && !error && (
              <div className="text-center py-12 text-gray-600">Загрузка...</div>
            )}
          </div>
        </div>

        {/* Pool panel */}
        <div className="w-full md:w-72 lg:w-80 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-300">
              Пул ({state?.totalPool ?? 0})
            </span>
            <input
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
              placeholder="Поиск..."
              value={poolSearch}
              onChange={e => setPoolSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredPool.map((p, i) => (
              <div
                key={p.nick}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/40 hover:bg-gray-800/20"
              >
                <span className="text-xs text-gray-600 w-5 text-right">{i + 1}</span>
                <span className="text-sm text-gray-200 flex-1 truncate">{p.nick}</span>
                {p.rating !== null && (
                  <span className="text-xs text-gray-500 shrink-0">{mmrLabel(p.rating)}</span>
                )}
              </div>
            ))}
            {state && filteredPool.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-sm">
                {poolSearch ? "Не найдено" : "Пул пуст"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
