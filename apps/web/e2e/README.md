# Browser tests (Playwright)

These tests drive a real browser through the site while the real API and
database run behind it. CI runs them automatically (`.github/workflows/web.yml`).

## Running them yourself

1. Start the API with a database, and create a **test** admin. The CLI prints
   its MFA key ("Key: ..."), which the tests need:

   ```bash
   cd apps/api
   alembic upgrade head
   python -m app.cli create-admin --username e2e-admin --email e2e@example.com --display-name "E2E"
   uvicorn app.main:app --port 8000
   ```

2. Start the website (in another terminal):

   ```bash
   cd apps/web
   npm run build && npm start      # or: npm run dev
   ```

3. Run the tests (in a third terminal):

   ```bash
   cd apps/web
   npx playwright install chromium   # first time only: downloads the browser
   E2E_USERNAME=e2e-admin E2E_PASSWORD='the password you chose' \
   E2E_TOTP_SECRET='the Key: value' npm run test:e2e
   ```

The tests add a few gins and purchases each run. Use a test database, never
the real collection.
