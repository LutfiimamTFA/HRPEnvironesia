import {createSharedPathnamesNavigation} from 'next-intl/navigation';
 
export const locales = ['id', 'en'] as const;
 
export const {Link, redirect, usePathname, useRouter} =
  createSharedPathnamesNavigation({locales});