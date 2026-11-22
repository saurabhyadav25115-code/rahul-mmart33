# Rahul Mart CRM — Admin Login Reset (Windows)

This package is intended to resolve previous login/password mismatches and the `EADDRINUSE` error on port 3000.

## Start from a clean reset
1. Extract this ZIP to a new folder (do not run older ZIPs alongside it).
2. Double-click `RESET_ADMIN_AND_START.bat`.
3. The script attempts to stop the existing process listening on local port 3000, installs JavaScript dependencies if needed, generates a new admin password, and writes the credentials to `.env`.
4. It starts the backend. Keep the black terminal window open.
5. The browser should open `http://localhost:3000/admin`. If it does not, open that address manually.
6. Sign in with username `admin` and the password displayed in the terminal.

The backend reads `.env` before initializing the database and upserts the configured admin hash, so the freshly generated password is synced to the database at startup.


## Requirements
- Node.js 22.13 or newer (uses the built-in `node:sqlite`).

## Notes
- If another unrelated application is using port 3000, the reset script will stop its listener to free that port. Use this ZIP only for the Rahul Mart local environment.
- Online payments are not enabled in this project; COD is the intended payment mode.
- This is local development, not a production deployment. Do not expose it to the public internet without a proper production hardening review.
- The storefront is `public/index.html`. It loads products, contact details and landing text from the backend and sends COD orders to it, so admin changes show on the site.
- The `db/` folder is created automatically on first start.
