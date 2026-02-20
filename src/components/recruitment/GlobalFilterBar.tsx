'use client';

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

export function GlobalFilterBar() {
  const [date, setDate] = React.useState<DateRange | undefined>();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-[240px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
      
      <Select><SelectTrigger className="w-[180px]"><SelectValue placeholder="All Jobs" /></SelectTrigger><SelectContent><SelectItem value="all">All Jobs</SelectItem></SelectContent></Select>
      <Select><SelectTrigger className="w-[180px]"><SelectValue placeholder="All Stages" /></SelectTrigger><SelectContent><SelectItem value="all">All Stages</SelectItem></SelectContent></Select>
      <Select><SelectTrigger className="w-[180px]"><SelectValue placeholder="All Recruiters" /></SelectTrigger><SelectContent><SelectItem value="all">All Recruiters</SelectItem></SelectContent></Select>
      
      <div className="flex items-center space-x-2 pl-2">
        <Switch id="needs-action" />
        <Label htmlFor="needs-action">Needs Action</Label>
      </div>

      <div className="flex-grow"></div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
            <RotateCcw className="mr-2" />
            Reset
        </Button>
      </div>
    </div>
  );
}
