import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export function Stepper({
  steps,
  value,
  onValueChange,
  disabled,
}: {
  steps: string[];
  value: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <nav aria-label="Experience editor steps" className="flex flex-col gap-3">
      <ol className="flex items-center">
        {steps.map((label, index) => (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <Button
              type="button"
              size="icon-sm"
              variant={index <= value ? "default" : "outline"}
              className="rounded-full"
              disabled={disabled}
              aria-label={`Step ${index + 1}: ${label}`}
              aria-current={index === value ? "step" : undefined}
              onClick={() => onValueChange(index)}
            >
              {index < value ? <Check aria-hidden="true" /> : index + 1}
            </Button>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-1 h-px flex-1 bg-border",
                  index < value && "bg-primary",
                )}
              />
            )}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {value + 1} of {steps.length} · {steps[value]}
      </p>
    </nav>
  );
}
