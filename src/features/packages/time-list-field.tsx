import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/custom-ui/delete-button";
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
                  onChange(times.map((current, i) => (i === index ? next : current)))
                }
              />
              {(times.length > 1 || optional) && (
                <DeleteButton
                  className="mb-1"
                  disabled={disabled}
                  onConfirm={() => onChange(times.filter((_, i) => i !== index))}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Using the usual start times.</p>
      )}
      {times.length < 24 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...times, nextTime(times)])}
        >
          Add start time
        </Button>
      )}
    </Field>
  );
}
