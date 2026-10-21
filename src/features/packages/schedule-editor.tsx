import { useQuery } from "@tanstack/react-query";
import { reservationsQuery } from "./queries";
import { EditorSection, EditorField } from "./fields";
import type { PackageSchedule } from "./schedule-model";
import { today } from "@/lib/validation";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Problem } from "@/components/feedback";
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
      description="Choose operating dates and days. Start times use Sri Lanka time. Confirmed bookings reserve places immediately."
    >
      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <EditorField
          label="First operating date"
          type="date"
          value={value.startDate}
          onChange={(startDate) => onChange({ ...value, startDate })}
        />
        <EditorField
          label="Last operating date"
          type="date"
          min={value.startDate}
          value={value.endDate}
          onChange={(endDate) => onChange({ ...value, endDate })}
        />
      </FieldGroup>
      <FieldSet>
        <FieldLegend>Operating days</FieldLegend>
        <div className="flex flex-wrap gap-4">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
            (day, index) => (
              <Field key={day} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`weekday-${index}`}
                  checked={value.weekdays.includes(index)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      weekdays: checked
                        ? [...value.weekdays, index].sort()
                        : value.weekdays.filter((v) => v !== index),
                    })
                  }
                />
                <FieldLabel htmlFor={`weekday-${index}`}>{day}</FieldLabel>
              </Field>
            ),
          )}
        </div>
      </FieldSet>
      <h3>Date-specific changes</h3>
      <p className="text-sm text-muted-foreground">
        Close a date, or set special times or capacity for every option on that
        date.
      </p>
      {value.exceptions.map((item, index) => (
        <div key={index} className="flex flex-col gap-4 rounded-lg border p-4">
          <EditorField
            label={`Exception date ${index + 1}`}
            type="date"
            min={value.startDate}
            max={value.endDate}
            value={item.date}
            onChange={(date) => exception(index, { date })}
          />
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
              <EditorField
                label={`Special start times ${index + 1}`}
                value={item.times?.join(",") ?? ""}
                description="24-hour times separated by commas; blank keeps usual times."
                onChange={(v) =>
                  exception(index, { times: v ? v.split(",") : undefined })
                }
              />
            </FieldGroup>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onChange({
                ...value,
                exceptions: value.exceptions.filter((_, i) => i !== index),
              })
            }
          >
            Remove date change {index + 1}
          </Button>
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
