'use client';

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { GoogleDatePicker } from "../ui/google-date-picker";
import type { Job, UserProfile } from "@/lib/types";
import type { FilterState } from "./RecruitmentDashboardClient";

interface GlobalFilterBarProps {
    jobs: Job[];
    recruiters: UserProfile[];
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}

export function GlobalFilterBar({ jobs, recruiters, filters, setFilters }: GlobalFilterBarProps) {
  
  const handleDateChange = (dateRange: DateRange | undefined) => {
    setFilters(prev => ({ ...prev, dateRange: { from: dateRange?.from, to: dateRange?.to } }));
  };

  const handleJobChange = (jobId: string) => {
    setFilters(prev => ({ ...prev, jobIds: jobId === 'all' ? [] : [jobId] }));
  };

  const handleReset = () => {
    setFilters({ dateRange: {}, jobIds: [], recruiterIds: [], stages: [] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
       <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-[240px] justify-start text-left font-normal",
              !filters.dateRange.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {filters.dateRange.from ? (
              filters.dateRange.to ? (
                <>
                  {format(filters.dateRange.from, "LLL dd, y")} -{" "}
                  {format(filters.dateRange.to, "LLL dd, y")}
                </>
              ) : (
                format(filters.dateRange.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
            {/* The shadcn calendar is bugged in this context, replacing with google one */}
             <GoogleDatePicker
                mode="general"
                value={filters.dateRange.from || null}
                onChange={(date) => handleDateChange({ from: date || undefined, to: filters.dateRange.to })}
            />
        </PopoverContent>
      </Popover>
      
      <Select value={filters.jobIds.length === 1 ? filters.jobIds[0] : 'all'} onValueChange={handleJobChange}>
        <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Jobs" />
        </SelectTrigger>
        <SelectContent>
            <SelectItem value="all">All Jobs</SelectItem>
            {jobs.map(job => (
                <SelectItem key={job.id} value={job.id!}>{job.position}</SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Select disabled>
        <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Stages" />
        </SelectTrigger>
        <SelectContent><SelectItem value="all">All Stages</SelectItem></SelectContent>
      </Select>
       <Select value={filters.recruiterIds.length === 1 ? filters.recruiterIds[0] : 'all'} disabled>
        <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Recruiters" />
        </SelectTrigger>
        <SelectContent>
            <SelectItem value="all">All Recruiters</SelectItem>
             {recruiters.map(recruiter => (
                <SelectItem key={recruiter.id} value={recruiter.id!}>{recruiter.fullName}</SelectItem>
            ))}
        </SelectContent>
      </Select>
      
      <div className="flex items-center space-x-2 pl-2">
        <Switch id="needs-action" disabled />
        <Label htmlFor="needs-action" className="text-muted-foreground">Needs Action</Label>
      </div>

      <div className="flex-grow"></div>

      <div className="flex items-center gap-2">
        <Button onClick={handleReset} variant="ghost" size="sm" className="text-muted-foreground">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
        </Button>
      </div>
    </div>
  );
}
