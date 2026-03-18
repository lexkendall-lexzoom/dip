const DEFAULT_API_BASE_URL = 'http://87.99.139.137:3000';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_OPENCLAW_API?.trim() || DEFAULT_API_BASE_URL;

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

const mockAgents: Agent[] = [
  { id: 'agent-discovery', name: 'Discovery Agent', status: 'idle' },
  { id: 'agent-classifier', name: 'Classifier Agent', status: 'idle' },
  { id: 'agent-review', name: 'Review Agent', status: 'idle' }
];

const mockLogs: LogItem[] = [
  {
    id: 'mock-1',
    timestamp: new Date().toISOString(),
    agent_id: 'system',
    level: 'warn',
    message:
      'OpenClaw API is currently unreachable. Showing fallback mock data so the UI remains usable.'
  }
];

async function safeFetch<T>(
  endpoint: string,
  options: RequestInit,
  fallback: T,
  allowFallbackForStatuses: number[] = [0]
): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      if (allowFallbackForStatuses.includes(response.status)) {
        return fallback;
      }

      if (response.status >= 500 || response.status === 403 || response.status === 404) {
        return fallback;
      }

      throw new Error(`API request failed (${response.status})`);
    }

    return response.json() as Promise<T>;
  } catch {
    return fallback;
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  return safeFetch('/agents', { cache: 'no-store' }, mockAgents);
}

export async function runAgent(agentId: string): Promise<{ message?: string; run_id?: string }> {
  return safeFetch(
    '/run',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_id: agentId })
    },
    {
      message: `OpenClaw API unavailable. Mock run accepted for ${agentId}.`
    }
  );
}

export async function fetchLogs(): Promise<LogItem[]> {
  return safeFetch('/logs', { cache: 'no-store' }, mockLogs);
}
