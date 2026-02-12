// This file is deprecated. Please use the new route at /admin/super-admin/menu-settings
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
          <p>This page is no longer in use. Please access the new dashboard at <Link href="/admin" className="text-primary underline">/admin</Link>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
