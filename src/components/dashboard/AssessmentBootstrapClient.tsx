'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface AssessmentBootstrapClientProps {
  onBootstrapSuccess?: () => void;
}

export function AssessmentBootstrapClient({ onBootstrapSuccess }: AssessmentBootstrapClientProps) {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBootstrap = async () => {
    if (!firebaseUser) {
      setError('You must be authenticated to perform this action.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/admin/bootstrap-assessments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to bootstrap assessments.');
      }

      toast({
        title: 'Bootstrap Successful',
        description: 'Default assessment template and test have been created.',
      });

      if (typeof onBootstrapSuccess === 'function') {
        onBootstrapSuccess();
      }

    } catch (e: any) {
      setError(e.message);
      toast({
        variant: 'destructive',
        title: 'Bootstrap Failed',
        description: e.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="text-center">
      <CardHeader>
        <CardTitle>Welcome to the Assessment Builder</CardTitle>
        <CardDescription>
          It looks like there are no assessments yet. You can start by creating the default assessment template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleBootstrap} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PlusCircle className="mr-2 h-4 w-4" />
          )}
          {isLoading ? 'Creating...' : 'Create Default Assessment'}
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
