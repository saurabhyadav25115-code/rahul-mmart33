# Rahul Mart — Public Deployment (Render, easiest)

Storefront = `https://YOUR-URL/`  |  Admin = `https://YOUR-URL/admin`

1. Create a free GitHub account, make a **private** repo, upload this folder's contents (not `.env`, not `node_modules`).
2. Go to render.com -> New -> **Blueprint** -> pick the repo. It reads `render.yaml`.
3. When asked, set `ADMIN_PASSWORD` (12+ characters, strong, unique). Username is `admin`.
4. Deploy. You get `https://rahul-mart.onrender.com` (HTTPS automatic).
5. Open `/admin`, log in, add products. Optional: Settings -> Custom Domain to use your own domain.

Notes
- The 1 GB disk at `/data` keeps your database (orders, customers). Without a disk (free plan) data is wiped on every deploy.
- To change the admin password: change `ADMIN_PASSWORD` in the dashboard and redeploy — it syncs on start.
- Back up `/data/rahul-mart.sqlite` regularly.
- Same Dockerfile works on Railway, Fly.io, or any VPS: `docker build -t rm . && docker run -p 80:3000 -v rmdata:/data -e JWT_SECRET=... -e ADMIN_PASSWORD=... rm` (put it behind HTTPS, e.g. Caddy/Cloudflare).
- Important: the storefront page (`index.html`) is still the original standalone page; it is not yet connected to the admin products/orders API. Admin works, but changes there do not appear on the storefront until that is wired up.
