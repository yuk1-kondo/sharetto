# AGENTS.md

## Cursor Cloud specific instructions

This is **シェアっと (Sharetto)** — a static frontend (Firebase Hosting) that talks to
Firebase Realtime Database, plus one optional Cloud Function for scheduled cleanup.
There is no build step and no bundler; `public/` is served as-is.

### Services

- **Hosting emulator** (serves `public/`): `http://127.0.0.1:5000`
- **Realtime Database emulator**: `127.0.0.1:9000` (namespace `sharetto-app-default-rtdb`)
- **Emulator UI**: `http://127.0.0.1:4000`
- **Functions emulator** (optional cleanup, port 5001): not needed for the core flow.

### Running locally

Start the emulators from the repo root (dependencies are already installed by the update script):

```bash
firebase emulators:start --only hosting,database --project sharetto-app
```

The RTDB emulator requires Java (Java 21 is preinstalled on the VM). Security rules from
`database.rules.json` are enforced by the emulator.

### Important, non-obvious caveats

- **Always open the app via `http://127.0.0.1:5000` (or `localhost`).** `public/js/firebase.js`
  only calls `connectDatabaseEmulator(...)` when `location.hostname` is `localhost` / `127.0.0.1`.
  If you open the app through the LAN IP or the deployed URL, it writes to the **production**
  Firebase RTDB instead of the emulator.
- **Session IDs must match `^[a-z0-9]{13}$`** (exactly 13 lowercase alphanumeric chars) or DB
  writes are denied by the rules. In production these are produced by `generateSessionId()`.
  For manual testing of the mobile upload page use e.g. `upload.html?session=demohello1234`.
- **PC page (`index.html`) is gated behind a Google sign-in popup** using real Firebase Auth
  (auth is NOT emulated), so it cannot be completed headlessly. The **mobile upload page**
  (`upload.html?session=<13-char-id>`) needs no login and is the core testable flow: it writes
  shared files/URLs to `files/<sessionId>` in the RTDB.
- Verify writes via the DB emulator REST API, e.g.:
  `curl "http://127.0.0.1:9000/files/<sessionId>.json?ns=sharetto-app-default-rtdb"`
- **Functions**: `functions/package.json` declares Node `^18` but runs fine under the VM's
  Node 22 (with a warning). The function is a scheduled cleanup (`onSchedule`) and is not
  required for local development. Run all emulators from a single `firebase emulators:start`
  invocation — starting a second emulator process conflicts on the hub port (4400).

### Lint / test

There is no configured linter or test suite (no root `package.json`, no ESLint/test scripts).
Frontend files are native ES modules; a quick syntax check is:
`node --input-type=module --check < public/js/pages/mobile-upload.js`.
