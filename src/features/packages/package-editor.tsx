import { Fragment, useEffect, useState } from "react";
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
import { TimeListField } from "./time-list-field";
import { DurationPicker } from "@/components/custom-ui/duration-picker";
import { TagsInput } from "@/components/custom-ui/tags-input";
import { Stepper } from "@/components/custom-ui/stepper";
import { Button, buttonVariants } from "@/components/ui/button";
import { DeleteButton } from "@/components/custom-ui/delete-button";
import { LocationAutocomplete } from "@/components/custom-ui/location-autocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { Loading, Problem } from "@/components/custom-ui/feedback";
export function BuddyPackageEditor({ id }: { id?: string }) {
  return (
    <BuddyGate>{id ? <LoadEditor id={id} /> : <Editor key="new" />}</BuddyGate>
  );
}

const packageCategories = [
  "Tours & sightseeing",
  "Food & drink",
  "Tickets & passes",
  "Day trips",
  "Wildlife",
  "Cruises & sailing",
  "Cultural experiences",
  "Outdoor activities",
];

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
  const [step, setStep] = useState(0);
  const steps = [
    "The experience",
    "Photos and clips",
    "Price and availability",
    "Operating schedule",
    "Practical details",
    "Itinerary",
  ];
  function goToStep(next: number) {
    setStep(next);
    document
      .getElementById("package-editor-progress")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{saved ? "Edit your experience" : "Create your experience"}</h1>
          <p className="mt-3 hidden text-muted-foreground md:block">
            Give travellers a clear picture, from the first hello to the last
            stop.
          </p>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <form
          noValidate
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            save.mutate(published);
          }}
        >
          <div
            id="package-editor-progress"
            className="mb-4 flex scroll-mt-24 flex-col gap-3 md:hidden"
          >
            <Stepper
              steps={steps}
              value={step}
              onValueChange={goToStep}
              disabled={blocked}
            />
          </div>
          <fieldset
            data-package-editor-step={step}
            disabled={blocked}
            className="flex min-w-0 flex-col gap-6"
          >
            <EditorSection
              id="package-story"
              title="The experience"
              description="Start with the place, the people and what you’ll do together."
              status={
                <Badge variant={published ? "default" : "secondary"}>
                  {published ? "Published" : "Draft"}
                  {dirty ? " · Unsaved changes" : ""}
                </Badge>
              }
            >
              <EditorField
                label="Package title"
                value={input.title}
                onChange={(v) => change("title", v)}
                maxLength={200}
                required
              />
              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="package-destination">
                    Destination
                  </FieldLabel>
                  <LocationAutocomplete
                    id="package-destination"
                    value={input.destination}
                    onValueChange={(value) => change("destination", value)}
                  />
                </Field>
                <EditorField
                  label="Country"
                  value={input.country}
                  onChange={(v) => change("country", v)}
                  maxLength={120}
                />
                <Field>
                  <FieldLabel htmlFor="package-category">Category</FieldLabel>
                  <Combobox
                    items={[
                      ...new Set([
                        ...packageCategories,
                        ...(input.category ? [input.category] : []),
                      ]),
                    ]}
                    value={input.category}
                    onValueChange={(value) => {
                      if (typeof value === "string") change("category", value);
                    }}
                  >
                    <ComboboxInput
                      id="package-category"
                      aria-label="Category"
                      placeholder="Choose a category"
                      className="w-full"
                    />
                    <ComboboxContent>
                      <ComboboxList>
                        {(item) => (
                          <ComboboxItem key={item} value={item}>
                            {item}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </Field>
                <Field className="min-w-0">
                  <FieldTitle>Duration</FieldTitle>
                  <DurationPicker
                    aria-label="Package duration"
                    role="group"
                    value={{
                      hours: Math.floor(input.durationMinutes / 60),
                      minutes: input.durationMinutes % 60,
                    }}
                    maxHours={168}
                    maxMinutes={59}
                    className="justify-start"
                    onChange={({ hours, minutes }) =>
                      change(
                        "durationMinutes",
                        Math.min(10080, hours * 60 + minutes),
                      )
                    }
                  />
                </Field>
              </FieldGroup>
              <EditorField
                label="Tell the story"
                multiline
                value={input.description}
                onChange={(v) => change("description", v)}
                maxLength={5000}
              />
              <Field>
                <FieldLabel htmlFor="package-highlights-input">
                  Highlights
                </FieldLabel>
                <TagsInput
                  id="package-highlights-input"
                  value={input.highlights}
                  onChange={(highlights) => change("highlights", highlights)}
                  maxTags={12}
                  maxTagLength={240}
                  describedBy="package-highlights-hint"
                />
                <p
                  id="package-highlights-hint"
                  className="text-xs text-muted-foreground"
                >
                  Press Enter or comma after each highlight. Up to 12.
                </p>
              </Field>
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
              description="Prices are LKR per person. Start times use Sri Lanka time."
            >
              {input.options.map((option, index) => (
                <Fragment key={index}>
                  {index > 0 && <Separator className="my-2" />}
                  <div className="flex flex-col gap-4">
                    <div className="flex min-h-12 items-center justify-between gap-3">
                      <h3>Option {index + 1}</h3>
                      {input.options.length > 1 && (
                        <DeleteButton
                          onConfirm={() =>
                            change(
                              "options",
                              input.options.filter((_, i) => i !== index),
                            )
                          }
                        />
                      )}
                    </div>
                    <EditorField
                      label={`Option ${index + 1} name`}
                      value={option.name}
                      maxLength={120}
                      onChange={(v) => updateOption(index, { name: v })}
                    />
                    <FieldGroup className="grid gap-5 sm:grid-cols-2">
                      <EditorField
                        label={`Option ${index + 1} price (LKR)`}
                        type="number"
                        min={0}
                        max={10000000}
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
                    <TimeListField
                      label={`Option ${index + 1} start times`}
                      times={option.times}
                      onChange={(times) => updateOption(index, { times })}
                    />
                  </div>
                </Fragment>
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
                  id="package-pay-later"
                  checked={input.payLater}
                  onCheckedChange={(v) => change("payLater", v)}
                />
                <FieldLabel htmlFor="package-pay-later">
                  Allow payment on arrival: full balance paid directly to you at
                  the meeting point
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
                  className="relative flex flex-col gap-4 rounded-lg border p-4"
                >
                  <DeleteButton
                    className="absolute right-4 top-4 z-10"
                    onConfirm={() =>
                      change(
                        "itinerary",
                        input.itinerary.filter((_, i) => i !== index),
                      )
                    }
                  />
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
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={blocked || !dirty}
                >
                  {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
                </Button>
                {step < steps.length - 1 && (
                  <Button
                    type="button"
                    className="md:hidden"
                    disabled={blocked}
                    onClick={() => goToStep(step + 1)}
                  >
                    Continue
                  </Button>
                )}
              </div>
              <div
                className={
                  step === steps.length - 1
                    ? "flex justify-end"
                    : "hidden md:flex md:justify-end"
                }
              >
                <Button
                  type="button"
                  variant={published ? "outline" : "default"}
                  disabled={blocked}
                  onClick={() => {
                    setError(undefined);
                    save.mutate(!published);
                  }}
                >
                  {published ? "Unpublish" : "Publish experience"}
                </Button>
              </div>
            </div>
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
          </div>
        </form>
        <aside className="hidden flex-col gap-5 rounded-xl bg-secondary p-5 md:flex lg:sticky lg:top-24">
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
