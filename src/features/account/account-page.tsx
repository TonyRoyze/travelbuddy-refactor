import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { safeReturn } from "@/lib/validation";
import { BuddySignup } from "./buddy-signup";
import {
  buddyApplicationQuery,
  requestBuddyManualReview,
} from "./buddy-application";
import { AccountOverview, SignOutButton } from "./account-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoaderCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectCombobox } from "@/components/custom-ui/select-combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Problem, Loading } from "@/components/custom-ui/feedback";
const documentLabels = {
  driving_licence: "Driving licence",
  insurance: "Insurance",
  revenue_licence: "Revenue licence",
  sltda: "SLTDA licence",
};

export function AccountPage({
  onboarding = false,
  returnTo = "/",
}: {
  onboarding?: boolean;
  returnTo?: string;
}) {
  const query = useQuery(accountQuery()),
    client = useQueryClient();
  const [error, setError] = useState<unknown>(),
    [pending, setPending] = useState(false);
  const [accountType, setAccountType] = useState("traveler");
  const existingBuddy =
    query.data?.onboarding === "completed" &&
    query.data.roles.some((role) => role === "provider" || role === "guide");
  const [continueAsTraveller, setContinueAsTraveller] = useState(false);
  const [polling, setPolling] = useState(false);
  const accountId = query.data?.id;
  const application = useQuery({
    ...buddyApplicationQuery(accountId),
    enabled: !!accountId,
  });
  const status = application.data?.status;
  const refetchApplication = application.refetch;
  const refetchAccount = query.refetch;
  useEffect(() => {
    setPolling(status === "pending");
    if (status !== "pending") return;
    const interval = window.setInterval(() => {
      void refetchApplication({ cancelRefetch: false });
    }, 2500);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setPolling(false);
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [accountId, status, application.data?.submittedAt, refetchApplication]);
  useEffect(() => {
    if (status === "approved" && !existingBuddy) void refetchAccount();
  }, [status, existingBuddy, refetchAccount]);

  const appeal = useMutation({
    mutationFn: requestBuddyManualReview,
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: buddyApplicationQuery(accountId).queryKey,
      }),
  });

  function checkStatus() {
    void refetchApplication({ cancelRefetch: false });
    void refetchAccount({ cancelRefetch: false });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountType === "buddy") return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      await rpc("onboard", {
        display_name: String(form.get("name")),
        account_type: String(form.get("type")),
        expected_revision: query.data!.revision,
      });
      await client.invalidateQueries({ queryKey: ["account"] });
      window.location.assign(safeReturn(returnTo));
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;
  const a = query.data;
  const completed = a.onboarding === "completed";
  const openSignup = () => setAccountType("buddy");
  const closeSignup = () => setAccountType("traveler");
  const details = application.data;
  const underReview = status === "pending" || status === "manual_review";
  const needsReapplication =
    status === "rejected" || status === "changes_requested";

  if (accountType === "buddy") {
    if (application.isPending) return <Loading />;
    if (application.isError && !details) {
      return (
        <section className="mx-auto flex max-w-xl flex-col items-start gap-4">
          <Problem error={application.error} />
          <Button onClick={checkStatus}>Retry</Button>
          <Button variant="ghost" onClick={closeSignup}>
            {completed ? "Back to account" : "Account type"}
          </Button>
        </section>
      );
    }
    return (
      <BuddySignup
        displayName={a.displayName}
        existingBuddy={existingBuddy}
        backToAccount={completed}
        previousStatus={status}
        previouslyApproved={status === "approved"}
        reviewMessage={details?.message}
        onSubmitted={(submitted) => {
          setPolling(false);
          client.setQueryData(buddyApplicationQuery(a.id).queryKey, submitted);
          closeSignup();
          setContinueAsTraveller(false);
        }}
        email={a.email}
        onBack={closeSignup}
      />
    );
  }

  const heading =
    status === "rejected"
      ? "Your buddy application was rejected"
      : status === "changes_requested"
        ? "Changes requested on your application"
        : status === "manual_review"
          ? "Your buddy application is under manual review"
          : "Checking your buddy application…";
  const statusMessage = underReview
    ? status === "pending"
      ? "We’re checking your identity and any credentials you submitted."
      : "An administrator is reviewing your documents. Check back for a decision."
    : details?.message;
  const statusActions = (
    <>
      {underReview && (
        <Button
          variant="outline"
          size="sm"
          onClick={checkStatus}
          disabled={application.isFetching}
        >
          Check status
        </Button>
      )}
      {needsReapplication && (
        <Button size="sm" onClick={openSignup}>
          {status === "rejected"
            ? existingBuddy
              ? "Reapply for verification"
              : "Reapply as a Buddy"
            : existingBuddy
              ? "Fix & reapply"
              : "Update & reapply"}
        </Button>
      )}
      {needsReapplication && details?.canAppeal && (
        <Button
          variant="outline"
          size="sm"
          disabled={appeal.isPending}
          onClick={() => appeal.mutate()}
        >
          {appeal.isPending ? "Requesting review…" : "Request human review"}
        </Button>
      )}
      {!completed && status === "rejected" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            closeSignup();
            setContinueAsTraveller(true);
          }}
        >
          Continue as Traveller instead
        </Button>
      )}
    </>
  );

  if (completed) {
    return (
      <>
        <div className="mx-auto mb-6 flex max-w-6xl flex-col gap-4">
          {(existingBuddy || (!underReview && !needsReapplication)) && (
            <div className="flex justify-end">
              <Button variant="outline" onClick={openSignup}>
                {existingBuddy
                  ? "Buddy verification"
                  : "Apply to become a Buddy"}
              </Button>
            </div>
          )}
          {(underReview || needsReapplication) && (
            <Alert variant={status === "rejected" ? "destructive" : "default"}>
              <AlertTitle>{heading}</AlertTitle>
              <AlertDescription>{statusMessage}</AlertDescription>
              <div className="mt-2 flex flex-wrap gap-2">{statusActions}</div>
            </Alert>
          )}
          {existingBuddy && details && details.expiringDocs.length > 0 && (
            <Alert className="border-amber-500/40">
              <AlertTitle>Documents need renewal</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {details.expiringDocs.map(
                    ({ kind, expiresAt, daysRemaining, stage }) => (
                      <li key={kind}>
                        {documentLabels[kind]}{" "}
                        {stage === "expired"
                          ? `expired on ${expiresAt}`
                          : `expires on ${expiresAt} (${daysRemaining} days left)`}
                      </li>
                    ),
                  )}
                </ul>
                {details.transportEligible === false && (
                  <p>
                    Verified transport status is paused until your renewed
                    vehicle documents are verified.
                  </p>
                )}
              </AlertDescription>
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={openSignup}>
                  Renew documents
                </Button>
              </div>
            </Alert>
          )}
          {application.error && <Problem error={application.error} />}
          {appeal.error && <Problem error={appeal.error} />}
        </div>
        <AccountOverview account={a} />
      </>
    );
  }

  if (!details && application.isPending) return <Loading />;
  if (!details && application.error) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-start gap-4">
        <Problem error={application.error} />
        <Button variant="outline" onClick={checkStatus}>
          Retry
        </Button>
        <SignOutButton />
      </section>
    );
  }
  if (
    underReview ||
    (needsReapplication && !continueAsTraveller) ||
    status === "approved"
  ) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-start gap-4 rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-semibold">
          {status === "approved"
            ? "Your buddy application was approved"
            : heading}
        </h1>
        {statusMessage && (
          <p className="text-muted-foreground">{statusMessage}</p>
        )}
        {status === "pending" && (polling || application.isFetching) && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircle
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
            Checking for updates
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {statusActions}
          {status === "approved" && (
            <Button variant="outline" onClick={checkStatus}>
              Check status
            </Button>
          )}
        </div>
        {application.error && <Problem error={application.error} />}
        {appeal.error && <Problem error={appeal.error} />}
        <SignOutButton />
      </section>
    );
  }
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 rounded-xl border bg-card p-6 md:p-10">
      <h1>{onboarding ? "Make yourself at home" : "Your account"}</h1>
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <p>Tell us your name and how you’d like to use TravelBuddy.</p>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Display name</FieldLabel>
            <Input
              id="name"
              name="name"
              defaultValue={a.displayName === "Traveler" ? "" : a.displayName}
              required
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="type">I’m joining as a</FieldLabel>
            <SelectCombobox
              id="type"
              name="type"
              value={accountType}
              onValueChange={setAccountType}
              options={[
                { value: "traveler", label: "Traveller — explore and book" },
                { value: "buddy", label: "Buddy — host local experiences" },
              ]}
            />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="accept" required />
            <FieldLabel htmlFor="accept">
              I agree to create my TravelBuddy account.
            </FieldLabel>
          </Field>
        </FieldGroup>
        {error !== undefined && <Problem error={error} />}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Complete registration"}
        </Button>
      </form>
      <SignOutButton />
    </section>
  );
}
