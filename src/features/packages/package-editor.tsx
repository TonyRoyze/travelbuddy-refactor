import { useEffect, useState } from "react";
import { Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/lib/supabase";
import { money } from "@/lib/validation";
import {
  emptyPackage,
  packageEditorSchema,
  type PackageEditorData,
  type EditorPackage,
} from "./model";
import { defaultSchedule } from "./schedule-model";
import { buddyPackageQuery } from "./queries";
import { BuddyGate } from "./buddy-gate";
import { EditorField, EditorSection } from "./fields";
import { PackageMediaPicker } from "./media-picker";
import { ScheduleEditor } from "./schedule-editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Loading, Problem } from "@/components/feedback";
export function BuddyPackageEditor({ id }: { id?: string }) {
  return (
    <BuddyGate>{id ? <LoadEditor id={id} /> : <Editor key="new" />}</BuddyGate>
  );
}
function LoadEditor({ id }: { id: string }) {
  const query = useQuery(buddyPackageQuery(id));
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <div className="flex flex-col gap-4">
        <Link to="/account/packages">My packages</Link>
        <Problem error={query.error} />
        <Button onClick={() => void query.refetch()}>Retry package</Button>
      </div>
    );
  return <Editor key={id} saved={query.data} />;
}
function Editor({ saved }: { saved?: EditorPackage }) {
  const [input, setInput] = useState<PackageEditorData>(
      () => saved?.input ?? emptyPackage(),
    ),
    [base, setBase] = useState(() =>
      JSON.stringify(saved?.input ?? emptyPackage()),
    ),
    [dirty, setDirty] = useState(false),
    [imageBusy, setImageBusy] = useState(false),
    [videoBusy, setVideoBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const client = useQueryClient(),
    navigate = useNavigate();
  const [published, setPublished] = useState(saved?.input.published ?? false);
  function change<K extends keyof PackageEditorData>(
    key: K,
    value: PackageEditorData[K],
  ) {
    setInput((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setNotice("");
  }
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const candidate = {
        ...input,
        published: publish,
        highlights: input.highlights.filter((v) => v.trim()),
        included: input.included.filter((v) => v.trim()),
        notIncluded: input.notIncluded.filter((v) => v.trim()),
      };
      const parsed = packageEditorSchema.safeParse(candidate);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" "),
        );
      return (await rpc("save_buddy_package", {
        input: parsed.data,
        package_id: saved?.id,
      })) as unknown as EditorPackage;
    },
    onSuccess: async (updated) => {
      setInput(updated.input);
      setBase(JSON.stringify(updated.input));
      setDirty(false);
      setPublished(updated.input.published);
      setNotice(
        updated.input.published
          ? "Your package is published."
          : "Your draft is saved.",
      );
      client.setQueryData(["buddy-package", updated.id], updated);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["buddy-packages"] }),
        client.invalidateQueries({ queryKey: ["catalog"] }),
        client.invalidateQueries({ queryKey: ["package", updated.id] }),
        client.invalidateQueries({ queryKey: ["buddy-profile"] }),
        client.invalidateQueries({ queryKey: ["provider-discovery"] }),
        client.invalidateQueries({ queryKey: ["nearby-live"] }),
      ]);
      if (!saved)
        await navigate({
          to: "/account/packages/$id",
          params: { id: updated.id },
          replace: true,
          ignoreBlocker: true,
        });
    },
  });
  const blocked = save.isPending || imageBusy || videoBusy;
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      next.pathname !== current.pathname &&
      dirty &&
      !save.isPending &&
      !window.confirm("Leave this package and discard unsaved changes?"),
    enableBeforeUnload: dirty,
  });
  useEffect(() => {
    if (JSON.stringify(input) === base) setDirty(false);
  }, [input, base]);
  const updateOption = (
    index: number,
    patch: Partial<PackageEditorData["options"][number]>,
  ) =>
    change(
      "options",
      input.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  const reload = async () => {
    if (!saved) return;
    try {
      const updated = await client.fetchQuery({
        ...buddyPackageQuery(saved.id),
        staleTime: 0,
      });
      setInput(updated.input);
      setBase(JSON.stringify(updated.input));
      setPublished(updated.input.published);
      setDirty(false);
      save.reset();
      setError(undefined);
      setNotice("Saved package reloaded.");
    } catch (error) {
      setError(error);
    }
  };
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <Link to="/account/packages" className="text-primary">
        My packages
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{saved ? "Edit your experience" : "Create your experience"}</h1>
          <p className="mt-3 text-muted-foreground">
            Give travellers a clear picture, from the first hello to the last
            stop.
          </p>
        </div>
        <Badge variant={published ? "default" : "secondary"}>
          {published ? "Published" : "Draft"}
          {dirty ? " · Unsaved changes" : ""}
        </Badge>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <form
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            save.mutate(published);
          }}
        >
          <fieldset disabled={blocked} className="flex min-w-0 flex-col gap-6">
            <EditorSection
              id="package-story"
              title="The experience"
              description="Start with the place, the people and what you’ll do together."
            >
              <EditorField
                label="Package title"
                value={input.title}
                onChange={(v) => change("title", v)}
                maxLength={200}
                required
              />
              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <EditorField
                  label="Destination"
                  value={input.destination}
                  onChange={(v) => change("destination", v)}
                  maxLength={120}
                />
                <EditorField
                  label="Country"
                  value={input.country}
                  onChange={(v) => change("country", v)}
                  maxLength={120}
                />
                <Field>
                  <FieldLabel htmlFor="package-category">Category</FieldLabel>
                  <NativeSelect
                    id="package-category"
                    value={input.category}
                    onChange={(event) => change("category", event.target.value)}
                  >
                    {![
                      "Tours & sightseeing",
                      "Food & drink",
                      "Tickets & passes",
                      "Day trips",
                      "Wildlife",
                      "Cruises & sailing",
                      "Cultural experiences",
                      "Outdoor activities",
                    ].includes(input.category) && (
                      <NativeSelectOption value={input.category}>
                        {input.category || "Choose a category"}
                      </NativeSelectOption>
                    )}
                    {[
                      "Tours & sightseeing",
                      "Food & drink",
                      "Tickets & passes",
                      "Day trips",
                      "Wildlife",
                      "Cruises & sailing",
                      "Cultural experiences",
                      "Outdoor activities",
                    ].map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        {value}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <EditorField
                  label="Duration in minutes"
                  type="number"
                  min={15}
                  max={10080}
                  step={1}
                  value={input.durationMinutes}
                  onChange={(v) => change("durationMinutes", Number(v))}
                />
              </FieldGroup>
              <EditorField
                label="Tell the story"
                multiline
                value={input.description}
                onChange={(v) => change("description", v)}
                maxLength={5000}
              />
              <EditorField
                label="Highlights"
                multiline
                value={input.highlights.join("\n")}
                onChange={(v) => change("highlights", v.split("\n"))}
                description="One highlight per line, up to 12."
              />
            </EditorSection>
            <EditorSection
              id="package-media"
              title="Photos and video clips"
              description="Your first photo is the cover. Save the package to attach your uploads."
            >
              <h3>Photos</h3>
              <PackageMediaPicker
                kind="photo"
                ids={input.imageIds}
                onChange={(v) => change("imageIds", v)}
                onBusyChange={setImageBusy}
                disabled={blocked}
              />
              <h3>Video clips</h3>
              <PackageMediaPicker
                kind="video"
                ids={input.videoIds}
                onChange={(v) => change("videoIds", v)}
                onBusyChange={setVideoBusy}
                disabled={blocked}
              />
            </EditorSection>
            <EditorSection
              id="package-pricing"
              title="Price and availability"
              description="Prices are USD per person. Start times use Sri Lanka time."
            >
              {input.options.map((option, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-4 rounded-lg border p-4"
                >
                  <h3>Option {index + 1}</h3>
                  <EditorField
                    label={`Option ${index + 1} name`}
                    value={option.name}
                    maxLength={120}
                    onChange={(v) => updateOption(index, { name: v })}
                  />
                  <FieldGroup className="grid gap-5 sm:grid-cols-2">
                    <EditorField
                      label={`Option ${index + 1} price (USD)`}
                      type="number"
                      min={0}
                      max={100000}
                      step={0.01}
                      value={option.price}
                      onChange={(v) =>
                        updateOption(index, { price: Number(v) })
                      }
                    />
                    <EditorField
                      label={`Option ${index + 1} maximum travellers`}
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      value={option.capacity}
                      onChange={(v) =>
                        updateOption(index, { capacity: Number(v) })
                      }
                    />
                  </FieldGroup>
                  <EditorField
                    label={`Option ${index + 1} start times`}
                    value={option.times.join(",")}
                    description="24-hour clock, separated by commas. Example: 09:00,14:00"
                    onChange={(v) =>
                      updateOption(index, { times: v.split(",") })
                    }
                  />
                  {input.options.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        change(
                          "options",
                          input.options.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove option {index + 1}
                    </Button>
                  )}
                </div>
              ))}
              {input.options.length < 8 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    change("options", [
                      ...input.options,
                      {
                        name: "Private experience",
                        price: 50,
                        capacity: 4,
                        times: ["09:00"],
                      },
                    ])
                  }
                >
                  Add a pricing option
                </Button>
              )}
            </EditorSection>
            <ScheduleEditor
              packageId={saved?.id}
              value={input.schedule ?? defaultSchedule()}
              onChange={(v) => change("schedule", v)}
            />
            <EditorSection id="package-details" title="Practical details">
              <EditorField
                label="Languages"
                value={input.languages.join(",")}
                onChange={(v) => change("languages", v.split(","))}
                description="Separated by commas."
              />
              <EditorField
                label="Meeting point"
                value={input.meetingPoint}
                multiline
                maxLength={500}
                onChange={(v) => change("meetingPoint", v)}
              />
              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <EditorField
                  label="What’s included"
                  multiline
                  value={input.included.join("\n")}
                  onChange={(v) => change("included", v.split("\n"))}
                  description="One item per line."
                />
                <EditorField
                  label="Not included"
                  multiline
                  value={input.notIncluded.join("\n")}
                  onChange={(v) => change("notIncluded", v.split("\n"))}
                  description="One item per line."
                />
              </FieldGroup>
              <Field orientation="horizontal">
                <Checkbox
                  id="package-cancel"
                  checked={input.freeCancellation}
                  onCheckedChange={(v) => change("freeCancellation", v)}
                />
                <FieldLabel htmlFor="package-cancel">
                  Free cancellation until 24 hours before the start
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="package-pickup"
                  checked={input.pickup}
                  onCheckedChange={(v) => change("pickup", v)}
                />
                <FieldLabel htmlFor="package-pickup">
                  Pickup is included
                </FieldLabel>
              </Field>
            </EditorSection>
            <EditorSection
              id="package-itinerary"
              title="Your itinerary"
              description="Optional stops to help travellers picture their day."
            >
              {input.itinerary.map((stop, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-4 rounded-lg border p-4"
                >
                  <h3>Stop {index + 1}</h3>
                  <EditorField
                    label={`Stop ${index + 1} time or duration`}
                    value={stop.time}
                    maxLength={60}
                    onChange={(v) =>
                      change(
                        "itinerary",
                        input.itinerary.map((s, i) =>
                          i === index ? { ...s, time: v } : s,
                        ),
                      )
                    }
                  />
                  <EditorField
                    label={`Stop ${index + 1} name`}
                    value={stop.title}
                    maxLength={160}
                    onChange={(v) =>
                      change(
                        "itinerary",
                        input.itinerary.map((s, i) =>
                          i === index ? { ...s, title: v } : s,
                        ),
                      )
                    }
                  />
                  <EditorField
                    label={`Stop ${index + 1} details`}
                    multiline
                    value={stop.detail}
                    maxLength={1000}
                    onChange={(v) =>
                      change(
                        "itinerary",
                        input.itinerary.map((s, i) =>
                          i === index ? { ...s, detail: v } : s,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      change(
                        "itinerary",
                        input.itinerary.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove stop {index + 1}
                  </Button>
                </div>
              ))}
              {input.itinerary.length < 20 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    change("itinerary", [
                      ...input.itinerary,
                      { time: "", title: "", detail: "" },
                    ])
                  }
                >
                  Add a stop
                </Button>
              )}
            </EditorSection>
          </fieldset>
          <div className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-4">
            <p className="text-sm" role="status">
              {blocked
                ? "Wait for saving and uploads to finish…"
                : dirty
                  ? "You have unsaved changes."
                  : "Your package is up to date."}
            </p>
            {(save.error || !!error) && (
              <div className="flex flex-col gap-3">
                <Problem error={error ?? save.error} />
                {saved && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={blocked}
                    onClick={() => void reload()}
                  >
                    Reload saved package
                  </Button>
                )}
              </div>
            )}
            {notice && <p role="status">{notice}</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="outline" disabled={blocked}>
                {save.isPending
                  ? "Saving…"
                  : published
                    ? "Save changes"
                    : "Save draft"}
              </Button>
              <Button
                type="button"
                disabled={blocked}
                onClick={() => {
                  setError(undefined);
                  save.mutate(!published);
                }}
              >
                {published ? "Unpublish package" : "Publish package"}
              </Button>
            </div>
          </div>
        </form>
        <aside className="flex flex-col gap-5 rounded-xl bg-secondary p-5 lg:sticky lg:top-24">
          <h2 className="text-xl">{input.title || "Your next experience"}</h2>
          <p>
            {input.destination || "Add a destination"} · {input.durationMinutes}{" "}
            minutes
          </p>
          <strong>
            From {money(Math.min(...input.options.map((o) => o.price)))}/person
          </strong>
          <nav
            aria-label="Package editor sections"
            className="flex flex-col gap-3"
          >
            {[
              ["package-story", "The experience"],
              ["package-media", "Photos and clips"],
              ["package-pricing", "Price and availability"],
              ["package-schedule", "Operating schedule"],
              ["package-details", "Practical details"],
              ["package-itinerary", "Itinerary"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-sm text-primary">
                {label}
              </a>
            ))}
          </nav>
          {saved && published && (
            <Link
              to="/experience/$id"
              params={{ id: saved.id }}
              search={{}}
              className={buttonVariants({ variant: "outline" })}
            >
              View published listing
            </Link>
          )}
          <Link to="/account" className="text-primary">
            Live discovery and meeting pin
          </Link>
        </aside>
      </div>
    </section>
  );
}
