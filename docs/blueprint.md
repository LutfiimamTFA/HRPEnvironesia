# **App Name**: HRP Starter Kit

## Core Features:

- User Seeder Endpoint: An API endpoint (/api/seed) to seed initial user accounts into Firebase Auth and Firestore. It is protected by a secret key and environment variable.
- Seeder UI: A page (/seed) with a button to trigger the seeder API endpoint, accessible only when seeding is enabled.
- Login Page: A login page (/login) allowing users to authenticate with email and password using Firebase Authentication.
- Dashboard Redirect: After successful login, users are redirected to the /dashboard which then automatically redirects them to their role-specific dashboard.
- Role-Based Dashboards: Dedicated dashboard routes (/dashboard/super-admin, /dashboard/hrd, etc.) displaying user-specific information and role-based menus.
- Firestore User Profile Creation: On the /dashboard route, when a user logs in, if a user document is not present in Firestore, it will create a document, with the role defaulted to 'kandidat'.
- Role-Based Access Control (Frontend): Frontend guards that redirect users to the appropriate dashboard based on their role, preventing access to unauthorized areas.

## Style Guidelines:

- Primary color: Deep blue (#3F51B5) to convey professionalism and trustworthiness.
- Background color: Very light gray (#F5F5F5) for a clean and modern feel.
- Accent color: A slightly purple hue (#7951B5) analogous to the primary, but distinct enough to draw attention to interactive elements.
- Body and headline font: 'Inter', a sans-serif font, provides a modern, neutral, and easily readable look suitable for both headlines and body text.
- Use a consistent set of minimalist icons to represent different functions and roles within the application.
- Maintain a clean and structured layout with clear sections for navigation, user information, and role-specific content.
- Subtle animations for page transitions and interactive elements to enhance user experience without being distracting.