# DigitalOcean Deployment

Recommended target: DigitalOcean Droplet.

Reason:

- this project stores runtime state in `data/event-store.json`
- App Platform uses ephemeral filesystem, so JSON persistence will be lost on restart or redeploy

## What is already prepared

- frontend build output is now served by `server.js`
- frontend API requests default to the same origin in production
- local Vite dev server proxies `/api` to `http://localhost:3001`
- `Dockerfile` builds the React app and runs the Node server in one container
- `docker-compose.yml` mounts `./data` into the container so event history persists
- `deploy/nginx/themist.conf` is ready for reverse proxying a domain to the app

## 1. Prepare the Droplet

Use Ubuntu 24.04 on DigitalOcean.

Install Docker, Compose plugin, and Nginx:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin nginx
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Reconnect to the server after changing the Docker group.

## 2. Upload the project

Clone the repository on the Droplet:

```bash
git clone <your-repo-url> themist
cd themist
```

Create the runtime env file:

```bash
cp .env.example .env
```

Then edit `.env` and set the real MQTT values if you do not want to rely on the defaults.

## 3. Start the app

Build and run the container:

```bash
docker compose up -d --build
```

Check that the API is healthy:

```bash
curl http://127.0.0.1:3001/api/health
```

## 4. Configure Nginx

Copy the provided config and replace `your-domain.com` with your real domain:

```bash
sudo cp deploy/nginx/themist.conf /etc/nginx/sites-available/themist
sudo nano /etc/nginx/sites-available/themist
sudo ln -s /etc/nginx/sites-available/themist /etc/nginx/sites-enabled/themist
sudo nginx -t
sudo systemctl reload nginx
```

Point your domain's `A` record to the Droplet IP before enabling HTTPS.

## 5. Enable HTTPS

Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Issue the certificate:

```bash
sudo certbot --nginx -d your-domain.com
```

## 6. Deploy updates

For later updates:

```bash
git pull
docker compose up -d --build
```

## App Platform note

If you still want App Platform, this repo can run there with the included `Dockerfile`, but `data/event-store.json` will not be durable. Use that only if losing historical local state is acceptable or if you first move persistence to a managed database or external storage.
