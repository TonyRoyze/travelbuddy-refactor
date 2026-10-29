"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getDateByType,
  getValidArrowNumber,
  setDateByType,
  type Period,
  type TimePickerType,
} from "./time-picker-utils";

export interface TimePickerInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  picker: TimePickerType;
  date: Date;
  setDate: (date: Date) => void;
  period?: Period;
  onRightFocus?: () => void;
  onLeftFocus?: () => void;
}

export const TimePickerInput = React.forwardRef<
  HTMLInputElement,
  TimePickerInputProps
>(
  (
    {
      className,
      picker,
      date,
      setDate,
      period,
      onRightFocus,
      onLeftFocus,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const [enteringSecondDigit, setEnteringSecondDigit] = React.useState(false);
    const [firstDigit, setFirstDigit] = React.useState("");
    const value = React.useMemo(
      () => getDateByType(date, picker),
      [date, picker],
    );

    React.useEffect(() => {
      if (!enteringSecondDigit) return;
      const timeout = window.setTimeout(
        () => setEnteringSecondDigit(false),
        1500,
      );
      return () => window.clearTimeout(timeout);
    }, [enteringSecondDigit]);

    const changeValue = (nextValue: string) => {
      setDate(setDateByType(new Date(date), nextValue, picker, period));
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="tel"
        inputMode="numeric"
        value={value}
        className={cn(
          "h-10 w-12 text-center font-mono tabular-nums caret-transparent",
          className,
        )}
        onChange={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key === "Tab") return;
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onRightFocus?.();
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onLeftFocus?.();
            return;
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const min = picker === "12hours" ? 1 : 0;
            const max = picker === "12hours" ? 12 : 59;
            changeValue(
              getValidArrowNumber(value, min, max, event.key === "ArrowUp" ? 1 : -1),
            );
            setEnteringSecondDigit(false);
            return;
          }
          if (/^\d$/.test(event.key)) {
            event.preventDefault();
            const nextValue = enteringSecondDigit
              ? `${firstDigit}${event.key}`
              : `0${event.key}`;
            setFirstDigit(enteringSecondDigit ? "" : event.key);
            setEnteringSecondDigit((entering) => !entering);
            changeValue(nextValue);
            if (enteringSecondDigit) onRightFocus?.();
            return;
          }
          event.preventDefault();
        }}
      />
    );
  },
);

TimePickerInput.displayName = "TimePickerInput";
