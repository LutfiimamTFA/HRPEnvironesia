'use client';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface HRDModeSwitchProps {
    mode: 'recruitment' | 'employees';
    onModeChange: (mode: 'recruitment' | 'employees') => void;
}

export function HRDModeSwitch({ mode, onModeChange }: HRDModeSwitchProps) {
  return (
    <Tabs value={mode} onValueChange={(value) => onModeChange(value as 'recruitment' | 'employees')}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="recruitment">Recruitment</TabsTrigger>
        <TabsTrigger value="employees">Employees</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
