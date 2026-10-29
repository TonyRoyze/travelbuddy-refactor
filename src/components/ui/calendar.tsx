import { DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";

export function Calendar(props: DayPickerProps) {
  return (
    <DayPicker
      className="p-3"
      classNames={{
        root: "relative w-max",
        months: "flex w-max flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex h-8 items-center justify-center px-8",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-3 top-3 flex items-center justify-between",
        button_previous:
          "inline-flex size-8 items-center justify-center rounded-md border bg-transparent hover:bg-muted",
        button_next:
          "inline-flex size-8 items-center justify-center rounded-md border bg-transparent hover:bg-muted",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-center text-xs font-normal text-muted-foreground",
        week: "mt-2 flex w-full",
        day: "size-9 p-0 text-center text-sm",
        day_button:
          "size-9 rounded-md p-0 font-normal hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        today: "font-semibold text-primary",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-40",
        selected: "bg-secondary text-secondary-foreground",
        range_start: "rounded-l-md !bg-primary !text-primary-foreground",
        range_end: "rounded-r-md !bg-primary !text-primary-foreground",
        range_middle: "rounded-none bg-accent text-accent-foreground",
      }}
      {...props}
    />
  );
}
