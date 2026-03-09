# DigitalOcean Deployment

Recommended target: DigitalOcean Droplet.

Reason:

- this project stores runtime state in `data/event-store.json`
- this project has both a frontend build output and a Node backend
- the smallest Droplets can run the app, but they are often too small to build the frontend on the server

## What is already prepared

- frontend build output is now served by `server.js`
- frontend API requests default to the same origin in production
- local Vite dev server proxies `/api` to `http://localhost:3001`
- `deploy/nginx/themist.conf` is ready for reverse proxying your Droplet IP to the app

## Deployment model

Recommended workflow:

1. Build the frontend locally with `npm run build`
2. Commit the generated `dist/` to git
3. Push the repo
4. On the Droplet, pull the repo
5. Install production dependencies only
6. Run `server.js`
7. Put Nginx in front of it

This avoids running the heavy frontend build on a small Droplet.

## 1. Build and push from your local machine

Build locally first:

```bash
wsl bash -lc "source /home/wsy3699/.nvm/nvm.sh && nvm use 24.14.0 >/dev/null && npm run build"
```

Then commit both source code and the generated `dist/` folder:

```bash
git add .
git commit -m "feat: prepare droplet deployment"
git push
```

## 2. Prepare the Droplet

Use Ubuntu 24.04 on DigitalOcean.

Install Node.js and Nginx:

```bash
sudo apt update
sudo apt install -y software-properties-common
sudo add-apt-repository -y universe
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx
sudo systemctl enable --now nginx
```

Check versions:

```bash
node -v
npm -v
```

## 3. Pull the project on the Droplet

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

Install production dependencies only:

```bash
npm ci --omit=dev
mkdir -p data
```

## 4. Start the app

Run the app directly:

```bash
PORT=3001 npm run start
```

Check that the API is healthy:

```bash
curl http://127.0.0.1:3001/api/health
```

For a long-running process, use `pm2` or `systemd`.

Recommended `pm2` setup:

```bash
sudo npm install -g pm2
pm2 start npm --name themist -- run start
pm2 save
pm2 startup systemd
```

## 5. Configure Nginx

Copy the provided config. It is already set up for the no-domain case and will accept requests sent directly to your Droplet IP:

```bash
sudo cp deploy/nginx/themist.conf /etc/nginx/sites-available/themist
sudo ln -s /etc/nginx/sites-available/themist /etc/nginx/sites-enabled/themist
sudo nginx -t
sudo systemctl reload nginx
```

If the default Nginx site is enabled, remove it first:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

After that, open the site in your browser with:

```text
http://<your-droplet-public-ip>
```

## 6. Network check

If the site does not open from your own computer, make sure inbound port `80` is allowed:

```bash
sudo ufw allow 80/tcp
sudo ufw status
```

Also verify that the app is reachable locally on the Droplet:

```bash
curl http://127.0.0.1:3001/api/health
```

## 7. Deploy updates

For later updates:

```bash
git pull
npm ci --omit=dev
```

If the frontend changed, rebuild it locally first and push the updated `dist/`.

After pulling new code, restart the app:

```bash
pm2 restart themist
```

## Optional: add a domain later

If you later buy a domain, update `deploy/nginx/themist.conf` like this:

```nginx
server_name your-domain.com;
```

Then point the domain's `A` record to the Droplet IP and optionally add HTTPS with Certbot.
