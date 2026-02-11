# HRP Starter Kit

This is a Next.js starter kit for Human Resource Platform applications, built with Firebase and Tailwind CSS.

## Features

- Next.js App Router
- TypeScript
- Tailwind CSS & shadcn/ui
- Firebase Authentication
- Firebase Firestore
- Role-Based Access Control (RBAC)
- User Seeding for Development

## Getting Started

### 1. Environment Variables

Create a `.env.local` file in the root of your project and add the following environment variables. You can get these values from your Firebase project settings.

```
# Firebase Client SDK Config
# These are exposed to the client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK Config (for server-side operations)
# Keep these secret
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Seeder Configuration
# Set to "true" to enable the /seed page
ENABLE_SEED=true
# A secret key to protect the seeder endpoint
SEED_SECRET=your-very-secret-key-please-change-me
```

**Important:** The `FIREBASE_PRIVATE_KEY` needs to be formatted correctly. When you copy it from the Firebase service account JSON file, it will contain `\n` characters. You must replace these with actual newlines in your `.env.local` file, for example, by wrapping the key in double quotes:

`FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`

### 2. Install Dependencies

```bash
npm install
```

### 3. Firestore Security Rules

Deploy the provided `firestore.rules` file to your Firebase project to secure your database. You can do this through the Firebase Console or using the Firebase CLI.

### 4. Run the User Seeder

Once your environment is set up and the app is running, you can seed the initial user accounts.

1.  Make sure `ENABLE_SEED=true` is set in your `.env.local`.
2.  Start the development server: `npm run dev`.
3.  Navigate to `http://localhost:3000/seed` (or your app's URL).
4.  Click the "Run Seeder" button.

This will create 5 user accounts (one for each role) in Firebase Authentication and Firestore.

### 5. Login

After seeding, you can log in with any of the following credentials:

| Email                   | Password   | Role          |
| ----------------------- | ---------- | ------------- |
| `super_admin@gmail.com` | `12345678` | `super_admin` |
| `hrd@gmail.com`         | `12345678` | `hrd`         |
| `manager@gmail.com`     | `12345678` | `manager`     |
| `kandidat@gmail.com`    | `12345678` | `kandidat`    |
| `karyawan@gmail.com`    | `12345678` | `karyawan`    |

After logging in, you will be redirected to the appropriate dashboard for your user's role.
