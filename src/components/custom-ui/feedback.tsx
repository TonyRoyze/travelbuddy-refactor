import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
export function Problem({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>Something needs attention</AlertTitle>
      <AlertDescription>
        {error instanceof Error ? error.message : "Please try again."}
      </AlertDescription>
    </Alert>
  );
}
export function Loading() {
  return (
    <div aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
export function NoResults({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
