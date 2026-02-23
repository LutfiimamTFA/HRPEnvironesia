import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { add, addDays } from "date-fns";
import type { JobApplication } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string = ''): string {
    return name
        .split(' ')
        .map(n => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
}


export interface ScheduleConfig {
    startDate: Date;
    startTime: string; // "HH:mm"
    slotDuration: number;
    buffer: number;
    workdayEndTime: string; // "HH:mm"
}

export interface GeneratedSlot {
    candidate: JobApplication;
    startAt: Date;
    endAt: Date;
}

export function generateTimeSlots(candidates: JobApplication[], config: ScheduleConfig): GeneratedSlot[] {
    const { startDate, startTime, slotDuration, buffer, workdayEndTime } = config;

    let currentDay = new Date(startDate);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    currentDay.setHours(startHour, startMinute, 0, 0);

    const [endHour, endMinute] = workdayEndTime.split(':').map(Number);
    
    let currentTime = new Date(currentDay);

    const slots: GeneratedSlot[] = [];

    for (const candidate of candidates) {
        const slotEndTime = add(currentTime, { minutes: slotDuration });
        
        // Check if the slot exceeds the workday end time
        if (slotEndTime.getHours() > endHour || (slotEndTime.getHours() === endHour && slotEndTime.getMinutes() > endMinute)) {
            // Move to the next day and reset the time
            currentDay = addDays(currentDay, 1);
            currentDay.setHours(startHour, startMinute, 0, 0);
            currentTime = new Date(currentDay);
        }
        
        slots.push({
            candidate,
            startAt: new Date(currentTime),
            endAt: add(currentTime, { minutes: slotDuration })
        });

        // Move to the start of the next slot
        currentTime = add(currentTime, { minutes: slotDuration + buffer });
    }

    return slots;
}
