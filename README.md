# Receipt Tracker v2

Mobile-first Next.js app for parsing grocery receipts into editable food purchase records, surfacing history and spend stats, and maintaining a Firestore-backed receipt item mapping table.

## What is implemented

- Firebase email/password sign-in with the existing local session cookie flow and a server-side single-email allowlist
- Firestore-backed persistence for:
  - `users`
  - `sessions`
  - `receipts`
  - `receipt_items`
  - `item_mappings`
- Receipt parsing with Claude into the v2 schema
- Mapping-first canonicalization for item name, type, and category
- Receipt detail mismatch review and suggestion acceptance
- Mapping table batch edit mode with staged deletes
- Stats endpoint and history/detail pages
- One-time scripts for mock DB migration and metadata backfill

## Runtime model

- Receipt photos are parsed in-flight and are not stored.
- Structured receipt data is stored in Firestore via the Firebase Admin SDK.
- Firebase Auth verifies email/password credentials, then the app issues its local session cookie for server-side API authorization.

## Environment

Required for the app server:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Required for browser sign-in:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` optional
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` optional

Enable the Email/Password sign-in provider in Firebase Authentication for the project.
Create the approved Firebase Auth user for `curtismhsu@gmail.com` before signing in.

Required for live parsing and metadata backfill:

- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`
- `CLAUDE_MODEL` optional

## Run

```bash
npm install
npm run dev
```

## Migration commands

```bash
npm run migrate:firestore
npm run backfill:item-metadata
```
