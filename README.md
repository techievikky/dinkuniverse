# Pickleball Club Frontend

This project is a React frontend with an Express API and Postgres persistence. It keeps the original user interface and routing while replacing the Base44 runtime with local application services.

## Prerequisites

1. Clone the repository.
2. Navigate to the project directory.
3. Install dependencies:

```bash
npm install
```

## Run the app locally

Copy `.env.example` to `.env`, fill in `DATABASE_URL`, and run the schema migration:

```bash
cp .env.example .env
npm run db:migrate
```

```bash
npm run dev
```

Then open the local Vite URL in your browser.

### Bootstrap an administrator

Add the administrator email address to `.env` before starting the API:

```bash
VITE_ADMIN_EMAILS=admin@example.com
```

Multiple addresses can be comma-separated. After signing in with one of these
accounts, open `/admin` to designate other users as admins or regular users.

## Build for production

```bash
npm run build
```

## Notes

- The app uses a lightweight local compatibility layer instead of the Base44 SDK.
- Google users, roles, and profile updates are stored in Postgres through the Express API.
- Run `npm run db:migrate` against the production database before deploying the API.
- The original Base44-specific backend folder and runtime hooks were removed from the active app path.
