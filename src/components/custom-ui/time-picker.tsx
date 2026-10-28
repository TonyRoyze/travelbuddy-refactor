"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TimePickerInput } from "@/components/custom-ui/time-picker-input";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { Period } from "./time-picker-utils";

const periods: Period[] = ["AM", "PM"];

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hours || 0, minutes || 0, 0, 0);
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function TimePicker12({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [date, setDate] = useState(() => parseTime(value));
  const [period, setPeriod] = useState<Period>(
    () => (parseTime(value).getHours() >= 12 ? "PM" : "AM"),
  );
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nextDate = parseTime(value);
    setDate(nextDate);
    setPeriod(nextDate.getHours() >= 12 ? "PM" : "AM");
  }, [value]);

  const updateDate = (nextDate: Date) => {
    setDate(nextDate);
    setPeriod(nextDate.getHours() >= 12 ? "PM" : "AM");
    onChange(formatTime(nextDate));
  };

  const updatePeriod = (nextPeriod: Period) => {
    setPeriod(nextPeriod);
    const nextDate = new Date(date);
    const hour12 = date.getHours() % 12;
    nextDate.setHours(hour12 + (nextPeriod === "PM" ? 12 : 0));
    updateDate(nextDate);
  };

  return (
    <div className="flex items-end gap-2">
      <div className="grid gap-1 text-center">
        <TimePickerInput
          id={`${id}-hours`}
          picker="12hours"
          period={period}
          date={date}
          setDate={updateDate}
          ref={hourRef}
          onRightFocus={() => minuteRef.current?.focus()}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-1 text-center">
        <TimePickerInput
          id={`${id}-minutes`}
          picker="minutes"
          date={date}
          setDate={updateDate}
          ref={minuteRef}
          onLeftFocus={() => hourRef.current?.focus()}
          onRightFocus={() =>
            document.getElementById(`${id}-period`)?.focus()
          }
          disabled={disabled}
        />
      </div>
      <div className="grid gap-1 text-center">
        <Combobox
          items={periods}
          value={period}
          onValueChange={(value) => {
            if (value === "AM" || value === "PM") updatePeriod(value);
          }}
        >
          <ComboboxInput
            id={`${id}-period`}
            aria-label="AM or PM"
            className="h-10 w-[5.5rem]"
            disabled={disabled}
          />
          <ComboboxContent>
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </div>
  );
}

