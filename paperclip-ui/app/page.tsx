'use client';

import { useState } from 'react';
import { Agent } from '@/lib/api';
import { AgentStatus } from '@/components/AgentStatus';
import { RunAgent } from '@/components/RunAgent';
import { LogsViewer } from '@/components/LogsViewer';

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
        <header className="rounded-xl bg-slate-900 p-6 text-white shadow-sm">
          <h1 className="text-2xl font-bold">Paperclip Control Plane</h1>
          <p className="mt-2 text-sm text-slate-200">Trigger and monitor OpenClaw agents in real time.</p>
        </header>

        <AgentStatus onAgentsLoaded={setAgents} key={`status-${refreshToken}`} />
        <RunAgent agents={agents} onTriggered={() => setRefreshToken((prev) => prev + 1)} />
        <LogsViewer key={`logs-${refreshToken}`} />
      </div>
    </main>
  );
}
