# paperclip-ui

Lightweight Next.js dashboard for managing OpenClaw agents.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Required environment variable

```bash
NEXT_PUBLIC_OPENCLAW_API=http://87.99.139.137:3000
```

## Expected OpenClaw endpoints

- `GET /agents`
- `POST /run` with JSON body `{ "agent_id": "..." }`
- `GET /logs`

## Netlify deployment

1. Create a new Netlify site from this repository.
2. Set **Base directory** to `paperclip-ui`.
3. Build command: `npm run build`.
4. Publish directory: `.next`.
5. Set env var `NEXT_PUBLIC_OPENCLAW_API` in Netlify dashboard.
6. Deploy.

## Domain configuration

Attach custom domain in Netlify:

- `paperclip.seekerventures.co`

Then add DNS CNAME/A records as instructed by Netlify and wait for SSL provisioning.

## OpenClaw CORS + stub (if needed)

If your OpenClaw server does not already expose the required routes and CORS headers, this minimal Express server can be used as a stub:

```ts
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/agents', (_req, res) => {
  res.json([
    { id: 'review-evidence', name: 'Review Evidence', status: 'idle' },
    { id: 'enrich-venues', name: 'Enrich Venues', status: 'running' }
  ]);
});

app.post('/run', (req, res) => {
  const { agent_id } = req.body;
  res.json({ message: `Run triggered for ${agent_id}`, run_id: `run_${Date.now()}` });
});

app.get('/logs', (_req, res) => {
  res.json([
    {
      id: '1',
      timestamp: new Date().toISOString(),
      agent_id: 'review-evidence',
      message: 'Completed scan in 4.2s',
      level: 'info'
    }
  ]);
});

app.listen(3000, '0.0.0.0', () => {
  console.log('OpenClaw stub listening on port 3000');
});
```
