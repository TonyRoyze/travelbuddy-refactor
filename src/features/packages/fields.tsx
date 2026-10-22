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
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{children}</CardContent>
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
