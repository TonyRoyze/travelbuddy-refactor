import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid, List, Plus, Pencil, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { buddyPackagesQuery } from "./queries";
import { BuddyGate } from "./buddy-gate";
import { mediaUrl } from "./model";
import { Media } from "@/features/catalog/media";
import { money } from "@/lib/validation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
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
  const [view, setView] = useState<"grid" | "list">("grid");
  return (
    <section className="flex flex-col gap-8">
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
      </div>
      <div className="flex items-center justify-end gap-3">
        <div className="hidden md:block">
          <Link to="/account/packages/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" />
            Add
          </Link>
        </div>
        <ToggleGroup
          aria-label="Package view"
          value={[view]}
          onValueChange={(values) => {
            const next = values[0];
            if (next === "grid" || next === "list") setView(next);
          }}
          className="self-end rounded-xl bg-card p-1.5 shadow-sm"
        >
          <ToggleGroupItem
            value="grid"
            aria-label="Grid view"
            className="size-11"
          >
            <LayoutGrid />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            aria-label="List view"
            className="size-11"
          >
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
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
      ) : view === "list" ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="px-3 sm:px-4">
            {query.data.map(({ id, input }, index) => (
              <Fragment key={id}>
                {index > 0 && <Separator />}
                <article className="grid grid-cols-[64px_minmax(0,1fr)_44px] items-center gap-3 py-3 sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:gap-4">
                  <Link
                    to="/account/packages/$id"
                    params={{ id }}
                    className="overflow-hidden rounded-lg bg-muted"
                  >
                    <Media
                      src={
                        input.imageIds[0]
                          ? input.imageIds[0].includes("/")
                            ? input.imageIds[0]
                            : mediaUrl(input.imageIds[0])
                          : "/brand/buddy-mark.svg"
                      }
                      alt={input.title}
                      className="size-16 object-cover sm:size-20"
                    />
                  </Link>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      to="/account/packages/$id"
                      params={{ id }}
                      className="font-semibold leading-snug"
                    >
                      {input.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {input.destination || "Add a destination"} ·{" "}
                      {input.durationMinutes} min
                    </p>
                    <p className="text-sm">
                      From{" "}
                      {money(Math.min(...input.options.map((o) => o.price)))} /
                      person
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={input.published ? "default" : "secondary"}
                      >
                        {input.published ? "Published" : "Draft"}
                      </Badge>
                      <Badge variant="outline">
                        {input.videoIds.length} clips
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row">
                    <Link
                      to="/account/packages/$id"
                      params={{ id }}
                      aria-label={`Edit ${input.title}`}
                      title="Edit package"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon",
                      })}
                    >
                      <Pencil aria-hidden="true" />
                    </Link>
                    {input.published && (
                      <Link
                        to="/experience/$id"
                        params={{ id }}
                        search={{}}
                        aria-label={`View ${input.title}`}
                        title="View listing"
                        className={buttonVariants({
                          variant: "ghost",
                          size: "icon",
                        })}
                      >
                        <ExternalLink aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </article>
              </Fragment>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {query.data.map(({ id, input }) => (
            <Card key={id} className="relative isolate overflow-hidden pt-0">
              <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-xl bg-card p-1 shadow-sm">
                <Link
                  to="/account/packages/$id"
                  params={{ id }}
                  aria-label={`Edit ${input.title}`}
                  title="Edit package"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <Pencil aria-hidden="true" />
                </Link>
                {input.published && (
                  <Link
                    to="/experience/$id"
                    params={{ id }}
                    search={{}}
                    aria-label={`View ${input.title}`}
                    title="View listing"
                    className={buttonVariants({
                      variant: "ghost",
                      size: "icon",
                    })}
                  >
                    <ExternalLink aria-hidden="true" />
                  </Link>
                )}
              </div>
              <Link
                to="/account/packages/$id"
                params={{ id }}
                className="block w-full bg-muted"
              >
                <Media
                  src={
                    input.imageIds[0]
                      ? input.imageIds[0].includes("/")
                        ? input.imageIds[0]
                        : mediaUrl(input.imageIds[0])
                      : "/brand/buddy-mark.svg"
                  }
                  alt={input.title}
                  className="aspect-[4/3] w-full object-cover"
                />
              </Link>
              <div className="contents">
                <CardHeader>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={input.published ? "default" : "secondary"}>
                      {input.published ? "Published" : "Draft"}
                    </Badge>
                    <Badge variant="outline">
                      {input.videoIds.length} clips
                    </Badge>
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
              </div>
            </Card>
          ))}
        </div>
      )}
      <Link
        to="/account/packages/new"
        aria-label="Create a package"
        title="Create a package"
        className={buttonVariants({
          size: "icon",
          className:
            "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-40 size-14 rounded-full! shadow-lg md:hidden",
        })}
      >
        <Plus aria-hidden="true" className="size-6" />
      </Link>
    </section>
  );
}
