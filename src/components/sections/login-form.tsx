import type { ReactNode } from "react";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";

type LoginFormProps = {
  className?: string;
  children: ReactNode;
  aside: ReactNode;
};

export function LoginForm({ className, children, aside }: LoginFormProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1440px] flex-col gap-6", className)}>
      <Card className="overflow-hidden rounded-[1.5rem] p-0 shadow-sm">
        <CardContent className="grid p-0 md:grid-cols-[1.2fr_1fr]">
          {aside}
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
