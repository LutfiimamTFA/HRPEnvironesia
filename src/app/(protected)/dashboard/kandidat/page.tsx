// This file is deprecated. Please use the new route at /careers/me
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function DeprecatedPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Card>
        <CardHeader>
          <CardTitle>Page Moved</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This page is no longer in use. Please access your candidate dashboard at <Link href="/careers/me" className="text-primary underline">/careers/me</Link>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
