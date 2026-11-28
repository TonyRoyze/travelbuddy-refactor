import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, RefreshCw, ZoomIn } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loading, NoResults, Problem } from "@/components/custom-ui/feedback";
import {
  getApplication,
  imageLabels,
  listApplications,
  loadApplicationImage,
  requeueApplication,
  reviewApplication,
  type Decision,
  type ImageKind,
  type QueueFilter,
  type VerificationApplication,
  type VerificationRun,
} from "./verification-api";

const filters: Record<QueueFilter, string> = {
  needs_review: "Needs review",
  manual_review: "Manual review",
  pending: "Pending",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  approved: "Approved",
  all: "All applications",
};

const selectClass =
  "h-12 w-full rounded-lg border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-ring";
const queueKey = ["admin-buddy-applications"] as const;
const applicationKey = (accountId: string | null) =>
  ["admin-buddy-application", accountId] as const;
const dateLabel = (value: string) => new Date(value).toLocaleString();
const readable = (value: string) => value.replaceAll("_", " ");

const tones = {
  green:
    "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  amber:
    "border-amber-600/30 bg-amber-500/10 text-amber-900 dark:text-amber-300",
  red: "border-red-600/30 bg-red-500/10 text-red-800 dark:text-red-300",
};

export function VerificationConsole() {
  const [filter, setFilter] = useState<QueueFilter>("needs_review");
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const queue = useQuery({
    queryKey: [...queueKey, filter],
    queryFn: () => listApplications(filter),
  });
  const detail = useQuery({
    queryKey: applicationKey(accountId),
    queryFn: () => getApplication(accountId!),
    enabled: !!accountId,
    gcTime: 0,
  });
  const term = search.trim().toLowerCase();
  const matches = queue.data?.filter((row) =>
    [row.displayName, row.email, row.accountId, row.service].some((value) =>
      value?.toLowerCase().includes(term),
    ),
  );

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>Buddy verifications</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={
            queue.isFetching || (accountId !== null && detail.isFetching)
          }
          onClick={() => {
            void queue.refetch();
            if (accountId) void detail.refetch();
          }}
        >
          <RefreshCw data-icon="inline-start" /> Refresh
        </Button>
      </header>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Application queue</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label
              htmlFor="verification-queue-status"
              className="grid gap-1 text-sm font-medium"
            >
              Status
              <select
                id="verification-queue-status"
                value={filter}
                className={selectClass}
                onChange={(event) =>
                  setFilter(event.target.value as QueueFilter)
                }
              >
                {Object.entries(filters).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label
              htmlFor="verification-queue-search"
              className="grid gap-1 text-sm font-medium"
            >
              Search applications
              <Input
                id="verification-queue-search"
                type="search"
                value={search}
                placeholder="Name, email or account ID"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {queue.isPending && <Loading />}
            {queue.error && <Problem error={queue.error} />}
            {matches?.length === 0 && (
              <NoResults
                title="No applications found"
                description="Try a different filter or search."
              />
            )}
            {!!matches?.length && (
              <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border lg:max-h-[65dvh]">
                {matches.map((row) => (
                  <li key={row.accountId}>
                    <button
                      type="button"
                      aria-pressed={accountId === row.accountId}
                      onClick={() => setAccountId(row.accountId)}
                      className="grid w-full min-w-0 gap-1 px-3 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring aria-pressed:bg-secondary"
                    >
                      <span className="break-words font-semibold">
                        {row.displayName || row.email || row.accountId}
                      </span>
                      {row.email && row.displayName && (
                        <span className="break-all text-xs text-muted-foreground">
                          {row.email}
                        </span>
                      )}
                      <span className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{filters[row.status]}</Badge>
                        {row.appealRequestedAt && (
                          <Badge variant="secondary">Appeal</Badge>
                        )}
                        {row.verificationBucket && (
                          <Badge className={tones[row.verificationBucket]}>
                            {row.verificationBucket}
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dateLabel(row.submittedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {!accountId && (
          <NoResults
            title="Select an application"
            description="Choose an applicant from the queue to see their documents and verification results."
          />
        )}
        {accountId && detail.isPending && <Loading />}
        {detail.error && <Problem error={detail.error} />}
        {detail.data && (
          <ApplicationReview
            key={`${detail.data.accountId}:${detail.data.submittedAt}`}
            application={detail.data}
          />
        )}
      </div>
    </section>
  );
}

function ApplicationReview({
  application,
}: {
  application: VerificationApplication;
}) {
  const {
    accountId,
    submittedAt,
    status,
    displayName,
    email,
    reviewMessage,
    hasImages,
    runs,
  } = application;
  return (
    <div className="grid min-w-0 gap-5">
      <Card>
        <CardHeader>
          <h2 className="break-words text-xl font-semibold">
            {displayName || email || accountId}
          </h2>
          {email && displayName && (
            <p className="break-all text-muted-foreground">{email}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{filters[status]}</Badge>
            {application.service && (
              <Badge variant="secondary" className="capitalize">
                {application.service}
              </Badge>
            )}
            {application.documentType && (
              <Badge variant="secondary" className="uppercase">
                {application.documentType}
              </Badge>
            )}
            {application.jobStatus && (
              <Badge variant="outline">
                Automation {application.jobStatus}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Submitted {dateLabel(submittedAt)}
          </p>
          {application.appealRequestedAt && (
            <p>
              Human review requested {dateLabel(application.appealRequestedAt)}
            </p>
          )}
          {typeof application.details.legalName === "string" && (
            <p>Legal name: {application.details.legalName}</p>
          )}
          {reviewMessage && (
            <p className="whitespace-pre-wrap break-words">{reviewMessage}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application photos</CardTitle>
        </CardHeader>
        <CardContent>
          {hasImages ? (
            <ImageViewer application={application} />
          ) : (
            <Alert role="note">
              <AlertTitle>Application photos unavailable</AlertTitle>
              <AlertDescription>
                Photos are purged after a final decision or when the retention
                period ends.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {application.service === "transport" &&
        application.imageKinds.includes("vehicle") && (
          <VehicleLookup application={application} />
        )}

      <Card>
        <CardHeader>
          <CardTitle>Verification runs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {runs.length === 0 && (
            <p className="text-muted-foreground">No automation results yet.</p>
          )}
          {runs.map((run, index) => (
            <RunDetails key={run.id} run={run} latest={index === 0} />
          ))}
        </CardContent>
      </Card>

      <DecisionPanel application={application} />
    </div>
  );
}

function ImageViewer({
  application,
}: {
  application: VerificationApplication;
}) {
  const documents = application.imageKinds.filter((kind) => kind !== "selfie");
  const [selection, setSelection] =
    useState<Exclude<ImageKind, "selfie">>("id-front");
  const selected = documents.includes(selection) ? selection : documents[0];
  return (
    <div className="grid items-end gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm font-medium">Selfie</p>
        {application.imageKinds.includes("selfie") ? (
          <PrivateImage
            key={`${application.accountId}-${application.submittedAt}-selfie`}
            accountId={application.accountId}
            submittedAt={application.submittedAt}
            kind="selfie"
          />
        ) : (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            Selfie unavailable.
          </p>
        )}
      </div>
      <div className="space-y-2">
        {selected ? (
          <>
            <label
              htmlFor="verification-image-kind"
              className="grid gap-1 text-sm font-medium"
            >
              Document
              <select
                id="verification-image-kind"
                className={selectClass}
                value={selected}
                onChange={(event) =>
                  setSelection(
                    event.target.value as Exclude<ImageKind, "selfie">,
                  )
                }
              >
                {documents.map((kind) => (
                  <option key={kind} value={kind}>
                    {imageLabels[kind]}
                  </option>
                ))}
              </select>
            </label>
            <PrivateImage
              key={`${application.accountId}-${application.submittedAt}-${selected}`}
              accountId={application.accountId}
              submittedAt={application.submittedAt}
              kind={selected}
            />
          </>
        ) : (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            Documents unavailable.
          </p>
        )}
      </div>
    </div>
  );
}

function PrivateImage({
  accountId,
  submittedAt,
  kind,
}: {
  accountId: string;
  submittedAt: string;
  kind: ImageKind;
}) {
  const [photo, setPhoto] = useState<
    { url: string | null } | { error: unknown }
  >();
  useEffect(() => {
    let url: string | undefined;
    const controller = new AbortController();
    loadApplicationImage(accountId, kind, submittedAt, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = blob ? URL.createObjectURL(blob) : undefined;
        setPhoto({ url: url ?? null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPhoto({ error });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [accountId, kind, submittedAt]);

  if (!photo) return <Loading />;
  if ("error" in photo) return <Problem error={photo.error} />;
  if (!photo.url)
    return (
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        This photo is unavailable or has been purged.
      </p>
    );
  const label = imageLabels[kind];
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="group relative block h-auto w-full overflow-hidden p-0"
          />
        }
        aria-label={`Zoom ${label.toLowerCase()}`}
      >
        <img
          src={photo.url}
          alt={label}
          className="h-48 w-full bg-muted object-contain"
        />
        <span className="absolute right-2 bottom-2 rounded-md bg-card p-2 shadow-sm">
          <ZoomIn aria-hidden="true" />
        </span>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overscroll-contain sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Full-size application photo</DialogDescription>
        </DialogHeader>
        <img
          src={photo.url}
          alt={label}
          className="max-h-[70dvh] w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

function RunDetails({
  run,
  latest,
}: {
  run: VerificationRun;
  latest: boolean;
}) {
  const metric = (score: number | null) =>
    score === null
      ? "Unavailable"
      : score.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return (
    <details open={latest} className="rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 focus-visible:outline-2 focus-visible:outline-ring">
        <span className="ml-1 inline-flex flex-wrap items-center gap-2 align-middle">
          <strong>{dateLabel(run.createdAt)}</strong>
          <Badge className={tones[run.decisionBucket]}>
            {run.decisionBucket}
          </Badge>
          {run.shadowMode && <Badge variant="secondary">Shadow mode</Badge>}
          <Badge
            variant={run.pdf417Passed === false ? "destructive" : "outline"}
          >
            PDF417{" "}
            {run.pdf417Passed === null
              ? "unchecked"
              : run.pdf417Passed
                ? "passed"
                : "failed"}
          </Badge>
        </span>
      </summary>
      <div className="grid min-w-0 gap-4 border-t p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Liveness</dt>
            <dd>{run.livenessStatus ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pipeline</dt>
            <dd>
              {run.pipelineVersion} · {readable(run.providerMode)} ·{" "}
              {run.latencyMs} ms
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">NIC face score</dt>
            <dd>{metric(run.nicFaceScore)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Driving licence face score
            </dt>
            <dd>{metric(run.dlFaceScore)}</dd>
          </div>
        </dl>
        {run.applicantFeedback && (
          <p className="break-words text-sm">{run.applicantFeedback}</p>
        )}
        {run.ruleOutcomes.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {run.ruleOutcomes.map(({ code, status, message }, index) => (
              <li
                key={`${code}:${index}`}
                className="flex flex-wrap items-start gap-2 px-3 py-2"
              >
                <Badge className={tones[status === "pass" ? "green" : status]}>
                  {status}
                </Badge>
                <span className="min-w-0 flex-1 break-words">
                  <strong>{code}</strong> {message}
                </span>
              </li>
            ))}
          </ul>
        )}
        {Object.keys(run.extractedSummary).length > 0 && (
          <details className="rounded-lg bg-muted px-3 py-2">
            <summary className="cursor-pointer font-medium">
              Extracted summary
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(run.extractedSummary, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

function VehicleLookup({
  application,
}: {
  application: VerificationApplication;
}) {
  const [copyState, setCopyState] = useState("");
  const [enteredPlate, setEnteredPlate] = useState<string>();
  const [enteredChassis, setEnteredChassis] = useState("");
  const plate = (
    enteredPlate ??
    application.credentials?.vehiclePlateNormalized ??
    ""
  ).trim();
  const chassis = enteredChassis.trim();
  return (
    <Card>
      <CardHeader>
        <CardTitle>DMT vehicle lookup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Read the plate and chassis number from the vehicle registration photo.
          These entries stay in this panel until you leave it.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            htmlFor="verification-vehicle-plate"
            className="grid gap-1 font-medium"
          >
            Plate
            <Input
              id="verification-vehicle-plate"
              value={
                enteredPlate ??
                application.credentials?.vehiclePlateNormalized ??
                ""
              }
              onChange={(event) => {
                setEnteredPlate(event.target.value);
                setCopyState("");
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label
            htmlFor="verification-vehicle-chassis"
            className="grid gap-1 font-medium"
          >
            Chassis
            <Input
              id="verification-vehicle-chassis"
              value={enteredChassis}
              onChange={(event) => {
                setEnteredChassis(event.target.value);
                setCopyState("");
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!plate || !chassis}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `Plate: ${plate}\nChassis: ${chassis}`,
                );
                setCopyState("Plate and chassis copied.");
              } catch {
                setCopyState(
                  "Could not copy automatically. Select and copy the values above.",
                );
              }
            }}
          >
            <Copy data-icon="inline-start" /> Copy plate + chassis
          </Button>
          <a
            href="https://eservices.motortraffic.gov.lk/VehicleInfo/"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            DMT VehicleInfo <ExternalLink data-icon="inline-end" />
          </a>
        </div>
        {copyState && (
          <p role="status" className="text-sm text-muted-foreground">
            {copyState}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DecisionPanel({
  application,
}: {
  application: VerificationApplication;
}) {
  const [reason, setReason] = useState("");
  const [plate, setPlate] = useState(
    application.credentials?.vehiclePlateNormalized ?? "",
  );
  const [dlExpiresAt, setDlExpiresAt] = useState("");
  const [insuranceExpiresAt, setInsuranceExpiresAt] = useState("");
  const [erlExpiresAt, setErlExpiresAt] = useState("");
  const [sltdaExpiresAt, setSltdaExpiresAt] = useState("");
  const client = useQueryClient();
  const { accountId, submittedAt, status, hasImages, service } = application;
  const canDecide =
    status === "pending" ||
    status === "manual_review" ||
    (status === "changes_requested" &&
      application.decisionSource === "automated");
  const credentials = () => {
    const record: Record<string, string> = {};
    if (service === "transport") {
      if (plate.trim()) record.vehiclePlateNormalized = plate.trim();
      if (dlExpiresAt) record.dlExpiresAt = dlExpiresAt;
      if (insuranceExpiresAt) record.insuranceExpiresAt = insuranceExpiresAt;
      if (erlExpiresAt) record.erlExpiresAt = erlExpiresAt;
    } else if (service === "guide" && sltdaExpiresAt) {
      record.sltdaExpiresAt = sltdaExpiresAt;
    }
    return Object.keys(record).length > 0 ? record : null;
  };
  const action = useMutation({
    mutationFn: (decision: Decision | "requeue") =>
      decision === "requeue"
        ? requeueApplication(accountId, submittedAt)
        : reviewApplication(
            accountId,
            submittedAt,
            decision,
            reason,
            decision === "approved" ? credentials() : null,
          ),
    onSuccess: async (_, decision) => {
      if (decision !== "requeue") {
        client.setQueryData<VerificationApplication>(
          applicationKey(accountId),
          (previous) =>
            previous?.submittedAt === submittedAt
              ? {
                  ...previous,
                  status: decision,
                  decisionSource: "manual",
                  reviewMessage: reason.trim() || null,
                  hasImages: false,
                  imageKinds: [],
                  details: {},
                }
              : previous,
        );
      }
      setReason("");
      await Promise.all([
        client.invalidateQueries({ queryKey: queueKey }),
        client.invalidateQueries({ queryKey: applicationKey(accountId) }),
      ]);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual decision</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {canDecide ? (
          <>
            {service === "transport" && (
              <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <label
                  htmlFor="verification-approve-plate"
                  className="grid gap-1 text-sm font-medium"
                >
                  Verified plate (optional)
                  <Input
                    id="verification-approve-plate"
                    value={plate}
                    disabled={action.isPending}
                    placeholder="e.g. CAB1234"
                    onChange={(event) => setPlate(event.target.value)}
                  />
                </label>
                <label
                  htmlFor="verification-approve-dl-expiry"
                  className="grid gap-1 text-sm font-medium"
                >
                  Driving licence expiry
                  <Input
                    id="verification-approve-dl-expiry"
                    type="date"
                    value={dlExpiresAt}
                    disabled={action.isPending}
                    onChange={(event) => setDlExpiresAt(event.target.value)}
                  />
                </label>
                <label
                  htmlFor="verification-approve-ins-expiry"
                  className="grid gap-1 text-sm font-medium"
                >
                  Insurance expiry
                  <Input
                    id="verification-approve-ins-expiry"
                    type="date"
                    value={insuranceExpiresAt}
                    disabled={action.isPending}
                    onChange={(event) =>
                      setInsuranceExpiresAt(event.target.value)
                    }
                  />
                </label>
                <label
                  htmlFor="verification-approve-erl-expiry"
                  className="grid gap-1 text-sm font-medium"
                >
                  Revenue licence expiry
                  <Input
                    id="verification-approve-erl-expiry"
                    type="date"
                    value={erlExpiresAt}
                    disabled={action.isPending}
                    onChange={(event) => setErlExpiresAt(event.target.value)}
                  />
                </label>
              </div>
            )}
            {service === "guide" && (
              <label
                htmlFor="verification-approve-sltda-expiry"
                className="grid max-w-xs gap-1 text-sm font-medium"
              >
                SLTDA licence expiry (optional)
                <Input
                  id="verification-approve-sltda-expiry"
                  type="date"
                  value={sltdaExpiresAt}
                  disabled={action.isPending}
                  onChange={(event) => setSltdaExpiresAt(event.target.value)}
                />
              </label>
            )}
            <label
              htmlFor="verification-decision-reason"
              className="grid gap-1 font-medium"
            >
              Reason for the applicant
              <Textarea
                id="verification-decision-reason"
                aria-describedby="verification-reason-help"
                value={reason}
                maxLength={1000}
                disabled={action.isPending}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <p
              id="verification-reason-help"
              className="text-sm text-muted-foreground"
            >
              A reason is required to request changes or reject. Rejected
              applicants and existing Buddies can update their documents and
              reapply.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={action.isPending || !hasImages}
                onClick={() => action.mutate("approved")}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending || !reason.trim()}
                onClick={() => action.mutate("changes_requested")}
              >
                Request changes
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={action.isPending || !reason.trim()}
                onClick={() => action.mutate("rejected")}
              >
                Reject
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            This application has a final decision.
          </p>
        )}
        {hasImages && (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate("requeue")}
            >
              <RefreshCw data-icon="inline-start" /> Re-run automation
            </Button>
          </div>
        )}
        {action.isSuccess && (
          <p role="status">
            {action.variables === "requeue"
              ? "Automation queued."
              : "Decision saved."}
          </p>
        )}
        {action.error && <Problem error={action.error} />}
      </CardContent>
    </Card>
  );
}
