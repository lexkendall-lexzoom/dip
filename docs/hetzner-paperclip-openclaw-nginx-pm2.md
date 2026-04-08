# Hetzner Deployment Runbook: Paperclip + OpenClaw with PM2, Nginx, and TLS

This runbook keeps both apps on the Hetzner server, with **Paperclip** exposed at:

- `https://paperclip.seekerventures.co`

It assumes DNS already points:

- `paperclip.seekerventures.co -> 87.99.139.137`

---

## 0) Prerequisites and assumptions

- Ubuntu/Debian-based server with sudo access.
- Node.js and npm installed.
- Paperclip app directory contains a valid `package.json` with a `start` script.
- OpenClaw app is already deployed on disk.

Set shell variables for convenience:

```bash
export PAPERCLIP_DIR=/opt/paperclip
export OPENCLAW_DIR=/opt/openclaw
export PAPERCLIP_DOMAIN=paperclip.seekerventures.co
```

---

## 1) Verify Paperclip runs on `0.0.0.0:3100`

### Locate app and inspect current start behavior

```bash
sudo test -d "$PAPERCLIP_DIR" && echo "Paperclip dir exists"
cd "$PAPERCLIP_DIR"
cat package.json
```

If the app binds to localhost only, set host/port env vars before launch:

```bash
export HOST=0.0.0.0
export PORT=3100
```

### Manual start check

```bash
cd "$PAPERCLIP_DIR"
HOST=0.0.0.0 PORT=3100 npm start
```

In a second shell:

```bash
curl -I http://localhost:3100
curl http://localhost:3100 | head -n 20
ss -ltnp | rg ':3100'
```

Expected: app responds and listens on `0.0.0.0:3100` (or `*:3100`).

---

## 2) Install and configure PM2 for persistence

### Install PM2 globally

```bash
sudo npm install -g pm2
pm2 -v
```

### Start Paperclip with PM2

```bash
cd "$PAPERCLIP_DIR"
HOST=0.0.0.0 PORT=3100 pm2 start npm --name paperclip -- start
```

### Start OpenClaw with PM2

Use the command OpenClaw already uses in your deployment (examples shown):

```bash
cd "$OPENCLAW_DIR"
# Example if OpenClaw is started with npm:
pm2 start npm --name openclaw -- start

# OR, if it is a direct Node entrypoint:
# pm2 start server.js --name openclaw
```

### Enable auto-start on reboot + save process list

```bash
pm2 startup systemd -u "$USER" --hp "$HOME"
pm2 save
pm2 status
pm2 logs --lines 100
```

> After `pm2 startup`, run the printed `sudo` command exactly once if prompted.

---

## 3) Install and configure nginx reverse proxy

### Install nginx

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Nginx site config

Create `/etc/nginx/sites-available/paperclip.seekerventures.co` with:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name paperclip.seekerventures.co;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable and validate:

```bash
sudo ln -s /etc/nginx/sites-available/paperclip.seekerventures.co /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Quick HTTP check:

```bash
curl -I http://paperclip.seekerventures.co
```

---

## 4) Firewall (ports 80/443)

If using UFW:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

If using Hetzner Cloud Firewall, also confirm inbound rules allow TCP 80 and 443 to this server.

---

## 5) SSL with certbot (critical)

Install certbot nginx plugin:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Request and install certificate:

```bash
sudo certbot --nginx -d paperclip.seekerventures.co
```

Validate renewal timer:

```bash
systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run
```

---

## 6) Validation checklist

### HTTPS endpoint works

```bash
curl -I https://paperclip.seekerventures.co
```

Expected: `HTTP/2 200` (or app-specific non-error response).

### PM2 process health

```bash
pm2 status
pm2 describe paperclip
pm2 describe openclaw
pm2 logs paperclip --lines 50
pm2 logs openclaw --lines 50
```

Expected: both processes `online`, restarting if they crash.

### Reboot persistence test

```bash
sudo reboot
# reconnect after reboot
pm2 status
systemctl status nginx --no-pager
curl -I https://paperclip.seekerventures.co
```

Expected: both apps return as `online`; nginx active; HTTPS reachable.

### Confirm no SSH tunnel dependency

From your local machine (not logged into server):

```bash
curl -I https://paperclip.seekerventures.co
```

If this works publicly, no SSH tunnel is required.

---

## 7) Useful troubleshooting commands

```bash
# Port listeners
ss -ltnp | rg '(:80|:443|:3100)'

# nginx diagnostics
sudo nginx -t
sudo journalctl -u nginx -n 200 --no-pager

# PM2 diagnostics
pm2 status
pm2 logs --lines 200
pm2 resurrect

# App reachability from server
curl -v http://127.0.0.1:3100
curl -vk https://paperclip.seekerventures.co
```

---

## 8) What success looks like

- Paperclip runs continuously via PM2 and listens on `0.0.0.0:3100`.
- OpenClaw runs continuously via PM2.
- Nginx proxies `paperclip.seekerventures.co` to `127.0.0.1:3100`.
- Certbot manages TLS certs for `https://paperclip.seekerventures.co`.
- Both services survive reboot (`pm2 save` + startup configured).
- No static hosting, no Netlify, no SSH tunnel.
