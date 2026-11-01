import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "@/components/custom-ui/trash-icon";
import { Field, FieldLabel } from "@/components/ui/field";
import { TimePicker12 } from "@/components/custom-ui/time-picker";

function nextTime(times: string[]) {
  const used = new Set(times);
  for (let minute = 9 * 60; minute < 22 * 60; minute += 30) {
    const value = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    if (!used.has(value)) return value;
  }
  return "09:00";
}

export function TimeListField({
  label,
  times,
  onChange,
  optional = false,
  disabled,
}: {
  label: string;
  times: string[];
  onChange: (times: string[]) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {times.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {times.map((time, index) => (
            <div key={index} className="flex items-end gap-2">
              <TimePicker12
                value={time}
                disabled={disabled}
                onChange={(next) =>
                  onChange(
                    times.map((current, i) => (i === index ? next : current)),
                  )
                }
              />
              {(times.length > 1 || optional) && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label={`Remove ${time} start time from ${label}`}
                  disabled={disabled}
                  onClick={() => onChange(times.filter((_, i) => i !== index))}
                >
                  <TrashIcon aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Using the usual start times.
        </p>
      )}
      {times.length < 24 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-11 self-start p-0 md:w-auto md:px-3"
          aria-label={`Add start time to ${label}`}
          disabled={disabled}
          onClick={() => onChange([...times, nextTime(times)])}
        >
          <Plus aria-hidden="true" className="md:hidden" />
          <span className="hidden md:inline">Add</span>
        </Button>
      )}
    </Field>
  );
}
