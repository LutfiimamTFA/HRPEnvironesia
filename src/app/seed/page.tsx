import { notFound } from 'next/navigation';
import { SeedClientPage } from './SeedClientPage';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

export default function SeedPage() {
  if (process.env.ENABLE_SEED !== 'true') {
    notFound();
  }

  const isAdminConfigured = 
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Database Seeder</CardTitle>
          <CardDescription>
            Click the button to populate the database with initial user accounts for each role. This should only be done in a development environment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isAdminConfigured ? (
             <Alert variant="destructive">
               <AlertTitle>Admin Configuration Missing</AlertTitle>
               <AlertDescription>
                <p>The Firebase Admin environment variables are not set.</p>
                <p className="mt-2 text-sm">Please create or update your <code>.env.local</code> file with the <code>FIREBASE_PROJECT_ID</code>, <code>FIREBASE_CLIENT_EMAIL</code>, and <code>FIREBASE_PRIVATE_KEY</code> values.</p>
                <p className="mt-2 text-sm">Refer to the <code>README.md</code> for detailed instructions.</p>
               </AlertDescription>
             </Alert>
          ) : (
            <SeedClientPage secret={process.env.SEED_SECRET || ''} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
