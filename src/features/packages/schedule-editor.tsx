import { format, parseISO } from "date-fns";
import { CalendarIcon, Check } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { reservationsQuery } from "./queries";
import { EditorSection, EditorField } from "./fields";
import type { PackageSchedule } from "./schedule-model";
import { TimeListField } from "./time-list-field";
import { today } from "@/lib/validation";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DeleteButton } from "@/components/custom-ui/delete-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Problem } from "@/components/custom-ui/feedback";

function dateFromISO(value: string) {
  return value ? parseISO(value) : undefined;
}

function OperatingDateRange({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const from = dateFromISO(startDate);
  const to = dateFromISO(endDate);
  const selected: DateRange | undefined = from ? { from, to } : undefined;
  return (
    <Field className="min-w-0">
      <div className="max-w-full overflow-x-auto rounded-md border">
        <Calendar
          className="p-2"
          mode="range"
          defaultMonth={from}
          selected={selected}
          onSelect={(range) =>
            onChange(
              range?.from ? format(range.from, "yyyy-MM-dd") : "",
              range?.to ? format(range.to, "yyyy-MM-dd") : "",
            )
          }
          numberOfMonths={2}
        />
      </div>
    </Field>
  );
}

export function ScheduleEditor({
  value,
  onChange,
  packageId,
}: {
  value: PackageSchedule;
  onChange: (value: PackageSchedule) => void;
  packageId?: string;
}) {
  const reserved = useQuery(reservationsQuery(packageId));
  const exception = (
    index: number,
    patch: Partial<PackageSchedule["exceptions"][number]>,
  ) =>
    onChange({
      ...value,
      exceptions: value.exceptions.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <EditorSection
      id="package-schedule"
      title="Operating schedule"
      description="Choose operating dates and days."
    >
      <div className="grid justify-start gap-5 xl:grid-cols-[max-content_max-content]">
        <OperatingDateRange
          startDate={value.startDate}
          endDate={value.endDate}
          onChange={(startDate, endDate) =>
            onChange({ ...value, startDate, endDate })
          }
        />
        <FieldSet className="w-fit self-start p-0">
          <FieldLegend>Operating days</FieldLegend>
          <div className="grid w-fit grid-cols-2 content-start gap-x-3 gap-y-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, index) => (
                <Button
                  key={day}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={value.weekdays.includes(index)}
                  className="w-full justify-between"
                  onClick={() =>
                    onChange({
                      ...value,
                      weekdays: value.weekdays.includes(index)
                        ? value.weekdays.filter((v) => v !== index)
                        : [...value.weekdays, index].sort(),
                    })
                  }
                >
                  {day}
                  <Check
                    aria-hidden="true"
                    className={
                      value.weekdays.includes(index) ? "" : "invisible"
                    }
                  />
                </Button>
              ),
            )}
          </div>
        </FieldSet>
      </div>
      <h3>Date-specific changes</h3>
      <p className="text-sm text-muted-foreground">
        Close a date, or set special times or capacity for every option on that
        date.
      </p>
      {value.exceptions.map((item, index) => (
        <div
          key={index}
          className="relative flex flex-col gap-4 rounded-lg border p-4"
        >
          <DeleteButton
            className="absolute right-4 top-4 z-10"
            onConfirm={() =>
              onChange({
                ...value,
                exceptions: value.exceptions.filter((_, i) => i !== index),
              })
            }
          />
          <Field>
            <FieldLabel htmlFor={`exception-date-${index}`}>
              Exception date {index + 1}
            </FieldLabel>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    id={`exception-date-${index}`}
                    type="button"
                    variant="outline"
                    className="justify-start px-3 font-normal"
                  >
                    <CalendarIcon data-icon="inline-start" />
                    {format(parseISO(item.date), "yyyy-MM-dd")}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  defaultMonth={parseISO(item.date)}
                  selected={parseISO(item.date)}
                  disabled={[
                    { before: parseISO(value.startDate) },
                    { after: parseISO(value.endDate) },
                  ]}
                  onSelect={(date) =>
                    date && exception(index, { date: format(date, "yyyy-MM-dd") })
                  }
                />
              </PopoverContent>
            </Popover>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`closed-${index}`}
              checked={item.closed}
              onCheckedChange={(closed) => exception(index, { closed })}
            />
            <FieldLabel htmlFor={`closed-${index}`}>
              Closed on this date
            </FieldLabel>
          </Field>
          {!item.closed && (
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <EditorField
                label={`Special capacity ${index + 1}`}
                type="number"
                min={1}
                max={12}
                value={item.capacity ?? ""}
                description="Leave blank for usual capacity."
                onChange={(v) =>
                  exception(index, { capacity: v ? Number(v) : undefined })
                }
              />
              <TimeListField
                label={`Special start times ${index + 1}`}
                times={item.times ?? []}
                optional
                onChange={(times) =>
                  exception(index, { times: times.length ? times : undefined })
                }
              />
            </FieldGroup>
          )}
        </div>
      ))}
      {value.exceptions.length < 366 && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              exceptions: [
                ...value.exceptions,
                {
                  date: today() < value.startDate ? value.startDate : today(),
                  closed: true,
                },
              ],
            })
          }
        >
          Add a date change
        </Button>
      )}
      {packageId && (
        <div className="flex flex-col gap-3 border-t pt-5">
          <h3>Reserved places</h3>
          {reserved.error ? (
            <div>
              <Problem error={reserved.error} />
              <Button
                type="button"
                variant="outline"
                onClick={() => void reserved.refetch()}
              >
                Retry reservations
              </Button>
            </div>
          ) : reserved.isPending ? (
            <p role="status">Loading reserved places…</p>
          ) : reserved.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {["Date", "Start", "Option", "Places reserved"].map(
                      (label) => (
                        <th key={label} className="p-2">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reserved.data.map((row) => (
                    <tr
                      key={`${row.date}-${row.time}-${row.option}`}
                      className="border-t"
                    >
                      <td className="p-2">{row.date}</td>
                      <td className="p-2">{row.time}</td>
                      <td className="p-2">{row.option + 1}</td>
                      <td className="p-2">{row.travelers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No upcoming reservations yet.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Refreshes every 30 seconds. Schedule edits cannot remove booked
            slots or reduce capacity below reserved places.
          </p>
        </div>
      )}
    </EditorSection>
  );
}
