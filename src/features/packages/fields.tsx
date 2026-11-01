import { useId, type ReactNode } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
export function EditorSection({
  title,
  description,
  children,
  id,
  action,
  status,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
  action?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <Card
      id={id}
      aria-label={title}
      className={status ? "relative" : undefined}
    >
      {status && (
        <div className="mx-4 md:absolute md:left-4 md:top-4 md:z-10 md:mx-0">
          {status}
        </div>
      )}
      <CardHeader
        className={`hidden flex-col items-start justify-between gap-3 pb-3 md:flex ${status ? "md:pt-8" : ""} sm:flex-row sm:gap-4`}
      >
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action &&
          (status ? (
            <div className="absolute right-4 top-2 z-10">{action}</div>
          ) : (
            action
          ))}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
export function EditorField({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
  min,
  max,
  step,
  multiline = false,
  description,
  required = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number;
  multiline?: boolean;
  description?: string;
  required?: boolean;
}) {
  const id = useId();
  const props = {
    id,
    value,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
    maxLength,
    required,
    "aria-describedby": description ? id + "-hint" : undefined,
  };
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea {...props} rows={4} />
      ) : (
        <Input {...props} type={type} min={min} max={max} step={step} />
      )}{" "}
      {description && (
        <p id={id + "-hint"} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </Field>
  );
}
