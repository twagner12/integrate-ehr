# Integrate EHR

Custom practice management system for Integrate Language & Literacy Clinic.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Tailwind CSS (Vite) |
| Backend | Node.js v22 + Express |
| Database | PostgreSQL |
| Auth | Clerk |
| Hosting | Railway |
| Payments | Stripe |

---

## First-time setup

### 1. Create a GitHub repo

```bash
git init
git remote add origin https://github.com/YOUR_USERNAME/integrate-ehr.git
```

### 2. Install dependencies

From the project root:

```bash
npm install
```

### 3. Set up Clerk

1. Go to [clerk.com](https://clerk.com) and create a free account
2. Create a new application — name it "Integrate EHR"
3. On the API Keys page, copy:
   - **Publishable key** → goes in `client/.env`
   - **Secret key** → goes in `server/.env`
4. In Clerk dashboard → Configure → Session → add `metadata.role` to session claims

### 4. Set up PostgreSQL locally

On Arch Linux:
```bash
sudo pacman -S postgresql
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE DATABASE integrate;"
sudo -u postgres psql -c "CREATE USER integrate_user WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE integrate TO integrate_user;"
```

### 5. Configure environment variables

```bash
# Server
cp server/.env.example server/.env
# Fill in DATABASE_URL and CLERK_SECRET_KEY

# Client
cp client/.env.example client/.env
# Fill in VITE_CLERK_PUBLISHABLE_KEY
```

### 6. Run the app

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/health

---

## Project structure

```
integrate/
├── client/               # React frontend (Vite)
│   └── src/
│       ├── components/   # Shared UI components
│       ├── pages/        # One file per route
│       └── hooks/        # Custom React hooks
└── server/               # Express backend
    └── src/
        ├── db/           # PostgreSQL connection pool
        ├── middleware/   # Auth, error handling
        └── routes/       # API route handlers
```

---

## Deploying to Railway

1. Go to [railway.app](https://railway.app) and create a new project
2. Add a **PostgreSQL** service — Railway gives you a connection string
3. Add a **Web Service** pointing to this repo
4. Set environment variables in Railway dashboard (same as your `.env` files)
5. Railway auto-deploys on every push to `main`

---

## Phase 1 build order

- [ ] PostgreSQL schema (all Phase 1 tables)
- [ ] Client records API + UI
- [ ] Scheduling / calendar API + UI
- [ ] SOAP notes API + UI
- [ ] Basic invoicing API + UI
