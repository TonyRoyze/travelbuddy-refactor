import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DatePicker({
  id,
  name,
  defaultValue = "",
  value,
  onValueChange,
  min,
  max,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const [localDate, setDate] = useState<Date | undefined>(() =>
    defaultValue ? parseISO(defaultValue) : undefined,
  );
  const date =
    value === undefined ? localDate : value ? parseISO(value) : undefined;
  const allowed = (day: Date) => {
    const iso = format(day, "yyyy-MM-dd");
    return (!min || iso >= min) && (!max || iso <= max);
  };
  const [open, setOpen] = useState(false);

  function selectDate(nextDate: Date | undefined) {
    if (nextDate && !allowed(nextDate)) return;
    setDate(nextDate);
    onValueChange?.(nextDate ? format(nextDate, "yyyy-MM-dd") : "");
    setOpen(false);
  }

  return (
    <>
      <input
        type="hidden"
        name={name}
        value={date ? format(date, "yyyy-MM-dd") : ""}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full min-w-0 justify-between border-0 bg-muted px-2.5 font-normal"
            />
          }
        >
          {date ? format(date, "PPP") : "Pick a date"}
          <CalendarIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            disabled={(day) => !allowed(day)}
            selected={date}
            defaultMonth={date}
            onSelect={selectDate}
            autoFocus
          />
          <div className="flex justify-between gap-2 border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => selectDate(undefined)}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!allowed(new Date())}
              onClick={() => selectDate(new Date())}
            >
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
