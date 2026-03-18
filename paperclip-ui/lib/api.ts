export const API_BASE_URL =
  process.env.NEXT_PUBLIC_OPENCLAW_API ?? 'https://87.99.139.137';

export type Agent = {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'error' | string;
};

export type LogItem = {
  id?: string;
  timestamp?: string;
  agent_id?: string;
  message: string;
  level?: string;
};

export async function fetchAgents(): Promise<Agent[]> {
  const response = await fetch(`${API_BASE_URL}/agents`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to fetch agents (${response.status})`);
  }

  return response.json();
}

export async function runAgent(agentId: string): Promise<{ message?: string; run_id?: string }> {
  const response = await fetch(`${API_BASE_URL}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ agent_id: agentId })
  });

  if (!response.ok) {
    throw new Error(`Unable to run agent (${response.status})`);
  }

  return response.json();
}

export async function fetchLogs(): Promise<LogItem[]> {
  const response = await fetch(`${API_BASE_URL}/logs`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to fetch logs (${response.status})`);
  }

  return response.json();
}
