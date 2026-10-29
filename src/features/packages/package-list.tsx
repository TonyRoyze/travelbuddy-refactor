import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { buddyPackagesQuery } from "./queries";
import { BuddyGate } from "./buddy-gate";
import { mediaUrl } from "./model";
import { Media } from "@/features/catalog/media";
import { money } from "@/lib/validation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loading, Problem, NoResults } from "@/components/custom-ui/feedback";
export function BuddyPackagesPage() {
  return (
    <BuddyGate>
      <PackageList />
    </BuddyGate>
  );
}
function PackageList() {
  const query = useQuery(buddyPackagesQuery());
  return (
    <section className="flex flex-col gap-7">
      <Link to="/account" className="text-primary">
        Buddy dashboard
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>My packages</h1>
          <p className="mt-3 text-muted-foreground">
            Create experiences, manage your listings and see reserved places.
          </p>
        </div>
        <Link to="/account/packages/new" className={buttonVariants()}>
          Create a package
        </Link>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <div>
          <Problem error={query.error} />
          <Button onClick={() => void query.refetch()}>Try again</Button>
        </div>
      ) : !query.data.length ? (
        <NoResults
          title="Start with something you love to share"
          description="A food walk, a quiet trail or a day in your hometown. Create your first package above."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {query.data.map(({ id, input }) => (
            <Card key={id} className="overflow-hidden">
              <Link to="/account/packages/$id" params={{ id }}>
                <Media
                  src={
                    input.imageIds[0]
                      ? input.imageIds[0].includes("/")
                        ? input.imageIds[0]
                        : mediaUrl(input.imageIds[0])
                      : "/brand/buddy-mark.svg"
                  }
                  alt={input.title}
                  className="aspect-video w-full object-cover"
                />
              </Link>
              <CardHeader>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={input.published ? "default" : "secondary"}>
                    {input.published ? "Published" : "Draft"}
                  </Badge>
                  <Badge variant="outline">{input.videoIds.length} clips</Badge>
                </div>
                <CardTitle>{input.title}</CardTitle>
                <CardDescription>
                  {input.destination || "Add a destination"} ·{" "}
                  {input.durationMinutes} minutes
                </CardDescription>
              </CardHeader>
              <CardContent>
                From {money(Math.min(...input.options.map((o) => o.price)))} /
                person
              </CardContent>
              <CardFooter className="flex flex-wrap gap-3">
                <Link
                  to="/account/packages/$id"
                  params={{ id }}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Edit package
                </Link>
                {input.published && (
                  <Link
                    to="/experience/$id"
                    params={{ id }}
                    search={{}}
                    className="text-sm text-primary"
                  >
                    View listing
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
