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
import type { Job, UserProfile, Brand } from "@/lib/types";
import type { FilterState } from "./RecruitmentDashboardClient";
import { APPLICATION_STATUSES, statusDisplayLabels } from './ApplicationStatusBadge';
import { Calendar } from "@/components/ui/calendar";

interface GlobalFilterBarProps {
    jobs: Job[];
    recruiters: UserProfile[];
    brands: Brand[];
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}

export function GlobalFilterBar({ jobs, recruiters, brands, filters, setFilters }: GlobalFilterBarProps) {
  
  const handleDateChange = (dateRange: DateRange | undefined) => {
    setFilters(prev => ({ ...prev, dateRange: { from: dateRange?.from, to: dateRange?.to } }));
  };

  const handleJobChange = (jobId: string) => {
    setFilters(prev => ({ ...prev, jobIds: jobId === 'all' ? [] : [jobId] }));
  };

  const handleBrandChange = (brandId: string) => {
    setFilters(prev => ({ ...prev, brandId: brandId === 'all' ? undefined : brandId }));
  };
  
  const handleStageChange = (stage: string) => {
    setFilters(prev => ({ ...prev, stages: stage === 'all' ? [] : [stage] }));
  };

  const handleReset = () => {
    setFilters({ dateRange: {}, jobIds: [], recruiterIds: [], stages: [], brandId: undefined });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
       <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
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
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={filters.dateRange?.from}
            selected={filters.dateRange}
            onSelect={handleDateChange}
            numberOfMonths={2}
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
      
       <Select value={filters.brandId || 'all'} onValueChange={handleBrandChange}>
        <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Brands" />
        </SelectTrigger>
        <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {brands.map(brand => (
                <SelectItem key={brand.id} value={brand.id!}>{brand.name}</SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Select value={filters.stages.length === 1 ? filters.stages[0] : 'all'} onValueChange={handleStageChange}>
        <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Stages" />
        </SelectTrigger>
        <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {APPLICATION_STATUSES.map(stage => (
                <SelectItem key={stage} value={stage}>{statusDisplayLabels[stage]}</SelectItem>
            ))}
        </SelectContent>
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
