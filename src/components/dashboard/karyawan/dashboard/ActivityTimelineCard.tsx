import { History, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./EmptyState";

export type ActivityItem = {
  id: string;
  title: string;
  message: string;
  createdAt: Date | null;
};

export function ActivityTimelineCard({
  items,
  isLoading,
}: {
  items: ActivityItem[];
  isLoading: boolean;
}) {
  return (
    <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b pb-4 flex flex-row items-center gap-2.5">
        <History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Aktivitas Terbaru
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat aktivitas...
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={History}
            title="Belum ada aktivitas"
            description="Aktivitas seputar pengajuan dan pembaruan data Anda akan tercatat di sini."
            compact
          />
        ) : (
          <ol className="relative space-y-5 border-l border-slate-100 pl-5 dark:border-slate-800">
            {items.map((item) => (
              <li key={item.id} className="relative">
                <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500 dark:border-slate-900" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{item.message}</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  {item.createdAt
                    ? formatDistanceToNow(item.createdAt, { addSuffix: true, locale: idLocale })
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
