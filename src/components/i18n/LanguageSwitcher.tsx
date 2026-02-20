'use client';

import { usePathname, useRouter } from '@/navigation';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const switchLocale = (nextLocale: string) => {
    router.replace(pathname, { locale: nextLocale, scroll: false });
  };

  return (
    <div className="flex items-center gap-1 rounded-full border bg-background p-1">
      <Button
        variant={locale === 'id' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-full h-7 px-3"
        onClick={() => switchLocale('id')}
      >
        ID
      </Button>
      <Button
        variant={locale === 'en' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-full h-7 px-3"
        onClick={() => switchLocale('en')}
      >
        EN
      </Button>
    </div>
  );
}
