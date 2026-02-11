import { notFound } from 'next/navigation';
import { SeedClientPage } from './SeedClientPage';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function SeedPage() {
  if (process.env.ENABLE_SEED !== 'true') {
    notFound();
  }

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
          <SeedClientPage secret={process.env.SEED_SECRET || ''} />
        </CardContent>
      </Card>
    </main>
  );
}
