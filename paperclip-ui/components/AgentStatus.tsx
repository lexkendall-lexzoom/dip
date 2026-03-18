'use client';

import { useCallback, useEffect, useState } from 'react';
import { Agent, fetchAgents } from '@/lib/api';

const statusClass: Record<string, string> = {
  idle: 'bg-slate-100 text-slate-700',
  running: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700'
};

type AgentStatusProps = {
  onAgentsLoaded: (agents: Agent[]) => void;
};

export function AgentStatus({ onAgentsLoaded }: AgentStatusProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAgents();
      setAgents(data);
      onAgentsLoaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent status');
    } finally {
      setLoading(false);
    }
  }, [onAgentsLoaded]);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 10000);

    return () => clearInterval(interval);
  }, [loadAgents]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Agent Status</h2>
        <button
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          onClick={loadAgents}
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading agents…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <ul className="space-y-2">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
            >
              <span className="font-medium text-slate-900">{agent.name}</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClass[agent.status] ?? 'bg-amber-100 text-amber-700'}`}
              >
                {agent.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
