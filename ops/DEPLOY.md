# Going live — Contabo VPS (Ubuntu 24.04), one server, one site

Everything below was written from the project's real configuration, but **has not been run on a live server** —
do it once on a scratch VPS (or follow along carefully the first time) before relying on it.

You will end up with: the website at `https://growthcapitalservices.in`, the CRM at `/crm`, the API at `/crm/api`,
Postgres on the same machine, documents in Backblaze B2, nightly backups, and an uptime alert.

## 0. What you need first
- A Contabo VPS (Mumbai) with a non-root sudo user and your SSH key on it.
- The domain pointing at the server's IP (an A record).
- Backblaze B2: a **private** bucket + an application key limited to that bucket. Turn on **file versioning** so a
  deleted document can be recovered.
- Cloudflare Turnstile: a site key (for the website form) and the secret (for the CRM).

## 1. Install the basics
```bash
sudo apt update && sudo apt install -y nginx postgresql certbot python3-certbot-nginx ufw git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
sudo useradd --system --create-home --shell /usr/sbin/nologin gcs
```

## 2. Database
```bash
sudo -u postgres psql <<'SQL'
CREATE USER gcs_crm WITH PASSWORD 'CHOOSE-A-LONG-PASSWORD';
CREATE DATABASE gcs_crm OWNER gcs_crm;
SQL
```
Postgres listens on localhost only by default — leave it that way.

## 3. The app
```bash
sudo git clone https://github.com/sarvinit25/gcs-crm.git /opt/gcs-crm && sudo chown -R gcs:gcs /opt/gcs-crm
cd /opt/gcs-crm/backend
sudo -u gcs cp ../ops/backend.env.production.example .env && sudo -u gcs nano .env     # fill every blank

> `SECRETS_ENCRYPTION_KEY` encrypts two-step login secrets. Store a copy with your backups (but apart from the database dump) — without it, every two-step login has to be reset by a Super Admin.sudo -u gcs npm ci && sudo -u gcs npx prisma migrate deploy && sudo -u gcs npm run build
sudo -u gcs npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed.ts       # loads products, lenders, first admin
```
The seed prints the first admin login. **That password must be changed on first sign-in** (the app forces it). Turn on
two-step login for that account straight away (My account → Two-step login).

The app refuses to start if a secret is weak or a required key is missing, and tells you which.

## 4. Run it as a service
```bash
sudo cp /opt/gcs-crm/ops/gcs-crm.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now gcs-crm
curl -s http://127.0.0.1:4000/crm/api/health      # -> {"status":"ok","database":true,...}
```

## 5. The front end and Nginx
```bash
cd /opt/gcs-crm/frontend && npm ci && npm run build
sudo mkdir -p /var/www/gcs-crm && sudo rsync -a --delete dist/ /var/www/gcs-crm/
sudo cp /opt/gcs-crm/ops/nginx.conf.example /etc/nginx/sites-available/growthcapitalservices.in
sudo ln -s /etc/nginx/sites-available/growthcapitalservices.in /etc/nginx/sites-enabled/
sudo nginx -t && sudo certbot --nginx -d growthcapitalservices.in -d www.growthcapitalservices.in && sudo systemctl reload nginx
```
Then deploy the public website build into `/var/www/gcs-website` and point its lead form at
`/crm/api/public/leads` (see the website's `src/lib/leads.ts`).

## 6. Backups (do not skip)
```bash
sudo apt install -y postgresql-client
sudo mkdir -p /var/backups/gcs-crm && sudo chown gcs:gcs /var/backups/gcs-crm
sudo -u gcs crontab -e
```
```cron
# 02:30 every night: dump the database, verify it, keep 30 days
30 2 * * * BACKUP_DIR=/var/backups/gcs-crm /opt/gcs-crm/ops/backup.sh >> /var/log/gcs-crm-backup.log 2>&1
```
A backup on the same machine does not survive that machine. Copy it **off the server** too — set
`BACKUP_UPLOAD_CMD` (for example `rclone copy --config /home/gcs/.config/rclone/rclone.conf` with a second B2 bucket
or another provider as the destination; the file path is appended automatically).

**Once a month**, prove a backup restores:
```bash
BACKUP_DIR=/var/backups/gcs-crm /opt/gcs-crm/ops/restore-check.sh
```
It restores the newest dump into a throwaway database, compares row counts with the live one and deletes it.
Documents are not in the database dump — they live in B2 (versioning on), which is their backup.

## 7. Know when it breaks
Create a free monitor (UptimeRobot, Better Stack, …) that requests `https://growthcapitalservices.in/crm/api/health`
every 5 minutes and emails/WhatsApps you on failure. It answers 200 only when the app can reach its database.

## 8. Updating later
```bash
cd /opt/gcs-crm && sudo -u gcs git pull
cd backend  && sudo -u gcs npm ci && sudo -u gcs npx prisma migrate deploy && sudo -u gcs npm run build && sudo systemctl restart gcs-crm
cd ../frontend && npm ci && npm run build && sudo rsync -a --delete dist/ /var/www/gcs-crm/
```
Take a backup first (`ops/backup.sh`). Run `npm test` and `npm run test:e2e` in `backend` on your own machine before deploying a change.

## 9. Yearly
- Settings → **Archive**: hide finished files older than a year (nothing is deleted).
- Renew anything that expires (domain, B2/Turnstile keys), and apply server updates: `sudo apt update && sudo apt upgrade`.
- Restore-check a backup, and confirm the off-server copies are arriving.
