'use client';

import { useCallback, useEffect, useState } from 'react';
import { LogItem, fetchLogs } from '@/lib/api';

export function LogsViewer() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchLogs();
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 10000);

    return () => clearInterval(interval);
  }, [loadLogs]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Logs</h2>
        <button
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          onClick={loadLogs}
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading logs…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="max-h-72 overflow-y-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-emerald-200">
          {logs.length === 0 ? (
            <p>No logs yet.</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((log, index) => (
                <li key={log.id ?? `${log.timestamp ?? 'ts'}-${index}`}>
                  <span className="text-slate-400">[{log.timestamp ?? 'now'}]</span>{' '}
                  <span className="text-sky-300">{log.agent_id ?? 'agent'}</span>{' '}
                  {log.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
