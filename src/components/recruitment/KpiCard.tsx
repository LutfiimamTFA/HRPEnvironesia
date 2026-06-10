'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type KpiVariant = 'default' | 'teal' | 'amber' | 'red' | 'green' | 'blue';

interface KpiCardProps {
    title: string;
    value: string | number;
    delta?: string;
    deltaType?: 'default' | 'inverse';
    description?: string;
    icon?: ReactNode;
    variant?: KpiVariant;
    subtitle?: string;
}

const variantStyles: Record<KpiVariant, { bg: string; border: string; text: string; icon: string }> = {
  default: {
    bg: 'bg-white dark:bg-slate-950/40',
    border: 'border-slate-200 dark:border-slate-800',
    text: 'text-slate-900 dark:text-white',
    icon: 'text-slate-600 dark:text-slate-400',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-950/20',
    border: 'border-teal-200 dark:border-teal-800',
    text: 'text-teal-700 dark:text-teal-300',
    icon: 'text-teal-600 dark:text-teal-400',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    icon: 'text-red-600 dark:text-red-400',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    icon: 'text-green-600 dark:text-green-400',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
};

export function KpiCard({
  title,
  value,
  delta,
  deltaType = 'default',
  description,
  icon,
  variant = 'default',
  subtitle,
}: KpiCardProps) {
    const isIncrease = delta ? delta.startsWith('+') : false;
    const isDecrease = delta ? delta.startsWith('-') : false;

    const isGood = (deltaType === 'default' && isIncrease) || (deltaType === 'inverse' && isDecrease);
    const isBad = (deltaType === 'default' && isDecrease) || (deltaType === 'inverse' && isIncrease);

    const style = variantStyles[variant];

    return (
        <Card className={cn(style.bg, style.border)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {icon && <div className={cn('h-4 w-4', style.icon)}>{icon}</div>}
            </CardHeader>
            <CardContent>
                <div className={cn('text-2xl font-bold', style.text)}>{value}</div>
                {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
                <div className="flex items-center text-xs text-muted-foreground mt-2">
                    {delta && (
                        <p className={cn(
                            "flex items-center gap-1",
                            isGood && "text-green-600 dark:text-green-400",
                            isBad && "text-red-600 dark:text-red-400"
                        )}>
                            {isIncrease && <ArrowUp className="h-4 w-4" />}
                            {isDecrease && <ArrowDown className="h-4 w-4" />}
                            {delta}
                        </p>
                    )}
                    {description && <p className="ml-1">{description}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
