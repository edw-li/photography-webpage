# Photography Club Website

A photography club website built with React + TypeScript (Vite), FastAPI (Python), PostgreSQL, and Nginx, deployed via Docker Compose.

## Prerequisites

- Ubuntu 24.04 (tested on OCI Ampere A1 instance)
- Docker Engine + Docker Compose plugin
- Git
- PostgreSQL 16

> You will need to set up an Oracle Cloud instance (eg. Always Free) to host this site. You can learn more [here](docs/deploy_oracle_cloud.txt). 

> You'll also need to create an Oracle Object Store bucket for storing uploaded images. 

## Step 1: Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow your user to run Docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

## Step 2: Install and Configure PostgreSQL

```bash
sudo apt-get install -y postgresql postgresql-contrib
```

Create the database user and database:

```bash
sudo -u postgres psql <<SQL
CREATE USER photography WITH PASSWORD '<your-db-password>';
CREATE DATABASE photography OWNER photography;
SQL
```

### Configure PostgreSQL for Docker networking

Docker containers connect to the host via the Docker bridge gateway (`172.17.0.1` for the default bridge, `172.18.0.1` for Docker Compose networks). PostgreSQL must listen on these addresses and allow connections from them.

Edit `/etc/postgresql/16/main/postgresql.conf`:

```
listen_addresses = 'localhost,172.17.0.1'
```

Edit `/etc/postgresql/16/main/pg_hba.conf` — add these lines before any restrictive rules:

```
# Docker default bridge
host    photography    photography    172.17.0.0/16    scram-sha-256
# Docker Compose bridge (uses a separate network)
host    photography    photography    172.18.0.0/16    scram-sha-256
```

Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

### Firewall: block external access to port 5432

OCI security lists already block 5432 by default, but for defense-in-depth add iptables rules:

```bash
sudo iptables -A INPUT -p tcp --dport 5432 -s 172.16.0.0/12 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5432 -s 127.0.0.1 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5432 -j DROP
```

To persist across reboots:

```bash
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

## Step 3: Clone the Repository

```bash
git clone <repo-url> ~/photography-webpage
cd ~/photography-webpage
```

## Step 4: Configure `.env`

Create a `.env` file in the project root:

```bash
cp .env.example .env
nano .env
```

Fill it in with your values. Here is a fully annotated example:

```env
# ── Database ──────────────────────────────────────────────
POSTGRES_USER=photography
POSTGRES_PASSWORD=<your-db-password>
POSTGRES_DB=photography

# ── Backend ───────────────────────────────────────────────
# Random secret for JWT signing (generate with: openssl rand -hex 32)
SECRET_KEY=<your-secret-key>
# Comma-separated allowed origins
CORS_ORIGINS=http://localhost,https://yourdomain.com
# Initial admin account (created on first startup via seed)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<your-admin-password>
FRONTEND_URL=https://yourdomain.com

# ── SMTP (optional) ──────────────────────────────────────
# Leave blank to log password-reset links to the console instead of sending email.
# Example uses Gmail; generate an App Password at https://myaccount.google.com/apppasswords
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=<your-app-password>
SMTP_FROM_EMAIL=you@gmail.com
SMTP_USE_TLS=true

# ── Password Reset ────────────────────────────────────────
RESET_TOKEN_EXPIRE_MINUTES=30

# ── OCI Object Storage (for backups + file uploads) ──────
OCI_ACCESS_KEY=<your-oci-access-key>
OCI_SECRET_KEY=<your-oci-secret-key>
OCI_BUCKET_NAME=<your-bucket-name>
OCI_NAMESPACE=<your-tenancy-namespace>
OCI_REGION=<your-region>
```

## Step 5: Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds and starts two containers:
- **backend** — FastAPI app on an internal network (not exposed to host)
- **frontend** — Nginx serving the React SPA on port 80, reverse-proxying `/api` to the backend

## Step 6: Verify

Check that the backend connected to PostgreSQL:

```bash
docker compose -f docker-compose.prod.yml logs backend
```

Look for a line like `Application startup complete`. If you see connection errors, see [Troubleshooting](#troubleshooting).

Test the API:

```bash
curl http://localhost/api/v1/gallery/
```

Then open `http://<your-server-ip>` in a browser.

## Seed the Site Admin User

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.seed
```

## Updating Site with New Changes

```bash
cd ~/photography-webpage
docker compose -f docker-compose.prod.yml down --remove-orphans
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Docker Compose rebuilds only the layers that changed, so subsequent builds are fast.

## Daily Backups

The backup script at `backend/scripts/backup_db.sh` dumps PostgreSQL and uploads the compressed backup to OCI Object Storage. It uses `boto3` (not the AWS CLI) because OCI's S3-compatible API has a `Content-Length` issue with the AWS CLI.

### Setup

Install the boto3 dependency on the host:

```bash
sudo apt-get install -y python3-pip
pip3 install boto3
```

Make the script executable:

```bash
chmod +x backend/scripts/backup_db.sh
```

Test it manually:

```bash
./backend/scripts/backup_db.sh
```

### Schedule with cron

```bash
crontab -e
```

Add a line to run daily at 3 AM:

```
0 3 * * * /home/ubuntu/photography-webpage/backend/scripts/backup_db.sh >> /var/log/photography-backup.log 2>&1
```

## Troubleshooting

### Backend can't connect to PostgreSQL

The most common cause is PostgreSQL not listening on the Docker bridge or `pg_hba.conf` not allowing the container subnet.

1. Check which address Docker Compose assigned:
   ```bash
   docker network inspect photography-webpage_default | grep Gateway
   ```
2. Make sure that gateway IP is covered by `listen_addresses` in `postgresql.conf` and an entry in `pg_hba.conf`.
3. Restart PostgreSQL after any changes:
   ```bash
   sudo systemctl restart postgresql
   ```

### `host.docker.internal` doesn't resolve

The `docker-compose.prod.yml` includes `extra_hosts: ["host.docker.internal:host-gateway"]`, which maps `host.docker.internal` to the host's gateway IP. If you're running Docker directly (not via Compose), add `--add-host=host.docker.internal:host-gateway` to your `docker run` command.

### pg_hba.conf for Docker bridge subnets

Docker may use different subnets depending on how many networks exist. If you see `no pg_hba.conf entry for host "172.19.0.X"`, add the corresponding `/16` range to `pg_hba.conf`:

```
host    photography    photography    172.19.0.0/16    scram-sha-256
```

Alternatively, cover all Docker bridge subnets at once:

```
host    photography    photography    172.16.0.0/12    scram-sha-256
```
