'use client';

import { useState } from 'react';
import { Agent, runAgent } from '@/lib/api';

type RunAgentProps = {
  agents: Agent[];
  onTriggered: () => void;
};

export function RunAgent({ agents, onTriggered }: RunAgentProps) {
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');

  async function handleRun(agentId: string) {
    setRunningAgentId(agentId);
    setMessage('');

    try {
      const response = await runAgent(agentId);
      setMessage(response.message ?? `Agent ${agentId} started successfully.`);
      onTriggered();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to run agent.');
    } finally {
      setRunningAgentId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Run Agent</h2>
      {agents.length === 0 ? (
        <p className="text-sm text-slate-500">No agents available yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleRun(agent.id)}
              disabled={runningAgentId === agent.id}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {runningAgentId === agent.id ? `Running ${agent.name}...` : `Run ${agent.name}`}
            </button>
          ))}
        </div>
      )}
      {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}
    </section>
  );
}
