'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type SeedResult = {
  email: string;
  status: 'created' | 'already_exists' | 'error';
  message?: string;
  uid?: string;
};

export function SeedClientPage({ secret }: { secret: string }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SeedResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSeed = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-seed-secret': secret,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to run seeder');
      }

      setResults(data.results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleSeed} disabled={loading} className="w-full">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Seeding...' : 'Run Seeder'}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <Alert>
          <AlertTitle>Seeding Complete</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {results.map((result) => (
                <li key={result.email}>
                  <strong>{result.email}:</strong>{' '}
                  <span
                    className={
                      result.status === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }
                  >
                    {result.status.replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
