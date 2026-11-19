import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  FileImage,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Problem } from "@/components/custom-ui/feedback";
import {
  submitBuddyApplication,
  type BuddyApplicationStatus,
} from "./buddy-application";
import { cn } from "@/lib/utils";

const steps = [
  "Your details",
  "Identity document",
  "Your selfie",
  "Your experiences",
  "Review",
];
const mobileQuery = "(max-width: 767px)";
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function mobileSnapshot() {
  return Capacitor.isNativePlatform() || window.matchMedia(mobileQuery).matches;
}
const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring";

export function BuddySignup({
  displayName,
  email,
  onBack,
  onSubmitted,
  reviewMessage,
  existingBuddy,
  previouslyApproved,
}: {
  displayName: string;
  email: string;
  onBack: () => void;
  onSubmitted: (status: BuddyApplicationStatus) => void;
  reviewMessage?: string | null;
  existingBuddy?: boolean;
  previouslyApproved?: boolean;
}) {
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    () => false,
  );
  const [step, setStep] = useState(0);
  const [name, setName] = useState(
    displayName === "Traveler" ? "" : displayName,
  );
  const [phone, setPhone] = useState("");
  const [documentType, setDocumentType] = useState("nic");
  const [service, setService] = useState("local");
  const [home, setHome] = useState("");
  const [languages, setLanguages] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>();
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  function goTo(next: number) {
    setStep(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  function validate(section?: number) {
    const selector =
      section === undefined
        ? "input, select, textarea"
        : `[data-signup-step="${section}"] input, [data-signup-step="${section}"] select, [data-signup-step="${section}"] textarea`;
    const invalid = Array.from(
      form.current!.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(selector),
    ).find((input) => !input.checkValidity());
    if (!invalid) return true;
    const invalidStep = Number(
      invalid.closest("[data-signup-step]")?.getAttribute("data-signup-step"),
    );
    if (mobile) setStep(invalidStep);
    requestAnimationFrame(() => {
      invalid.scrollIntoView({ block: "center" });
      invalid.reportValidity();
    });
    return false;
  }
  function section(
    index: number,
    title: string,
    description: string,
    children: ReactNode,
  ) {
    return (
      <section
        data-signup-step={index}
        hidden={mobile && step !== index}
        className={cn(
          "scroll-mt-24 border-b border-border pb-9 last:border-0",
          mobile && step !== index && "hidden",
        )}
      >
        <div className="mb-6 flex items-start gap-4">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {children}
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-6xl">
      <Button
        variant="ghost"
        onClick={onBack}
        disabled={submitting}
        className="mb-6"
      >
        <ArrowLeft data-icon="inline-start" />
        {existingBuddy ? "Back to account" : "Account type"}
      </Button>
      <div className="grid items-start gap-8 md:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <aside className="md:sticky md:top-24">
          <img
            src="/brand/buddy-mark.svg"
            alt=""
            className={cn("mb-5 size-12", mobile && "hidden")}
          />
          <h1
            ref={heading}
            tabIndex={-1}
            className="editorial-title scroll-mt-24 text-4xl leading-tight outline-none"
          >
            Share your side
            <br />
            of Sri Lanka.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Introduce yourself, prepare your identity details and tell us what
            you’d love to share.
          </p>
          <ol
            aria-label="Buddy signup progress"
            className={cn("mt-8 flex flex-col gap-4", mobile && "hidden")}
          >
            {steps.map((label, index) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="flex size-7 items-center justify-center rounded-full border text-xs">
                  {index + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
          {mobile && (
            <div className="mt-6" aria-live="polite">
              <p className="text-sm font-medium">
                Step {step + 1} of {steps.length}: {steps[step]}
              </p>
              <div className="mt-3 flex gap-1.5" aria-hidden="true">
                {steps.map((label, index) => (
                  <span
                    key={label}
                    className={cn(
                      "h-1 flex-1 rounded-full bg-muted",
                      index <= step && "bg-primary",
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>
        <div className="min-w-0">
          <Alert className="mb-8" role="note">
            <ShieldCheck />
            <AlertTitle>Private application</AlertTitle>
            <AlertDescription>
              TravelBuddy uses your documents and selfie to review your identity
              and eligibility to host. Reviewers can access these images while
              your application is under review.
            </AlertDescription>
          </Alert>
          {previouslyApproved && (
            <Alert className="mb-6" role="status">
              <AlertTitle>Your previous application was approved</AlertTitle>
              <AlertDescription>
                You can submit another application to go through the review
                again.
              </AlertDescription>
            </Alert>
          )}
          {reviewMessage && (
            <Alert className="mb-6">
              <AlertTitle>Changes requested</AlertTitle>
              <AlertDescription>{reviewMessage}</AlertDescription>
            </Alert>
          )}
          <form
            ref={form}
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (submitting) return;
              if (mobile && step < steps.length - 1) {
                if (validate(step)) goTo(step + 1);
                return;
              }
              if (!validate()) return;
              const data = new FormData(event.currentTarget);
              setSubmitting(true);
              setSubmitError(undefined);
              try {
                onSubmitted(await submitBuddyApplication(data));
              } catch (error) {
                setSubmitError(error);
              } finally {
                setSubmitting(false);
              }
            }}
            className="flex flex-col gap-9"
          >
            {section(
              0,
              "Let’s get to know you",
              "Use the name on your identity document. Your display name is what travellers will see.",
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="buddy-legal-name">
                    Full legal name
                  </FieldLabel>
                  <Input
                    id="buddy-legal-name"
                    name="legalName"
                    autoComplete="name"
                    required
                    maxLength={120}
                    placeholder="As shown on your NIC or passport"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="buddy-display-name">
                    Display name
                  </FieldLabel>
                  <Input
                    id="buddy-display-name"
                    name="displayName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="buddy-email">Email address</FieldLabel>
                  <Input id="buddy-email" type="email" value={email} readOnly />
                  <p className="text-xs text-muted-foreground">
                    The email used for your TravelBuddy account.
                  </p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="buddy-phone">
                    Sri Lankan mobile number
                  </FieldLabel>
                  <Input
                    id="buddy-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="077 123 4567 or +94 77 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    pattern="(\+94|0)[0-9\s\-]{9,14}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a number where the reviewer can reach you.
                  </p>
                </Field>
              </FieldGroup>,
            )}
            {section(
              1,
              "Prepare your identity document",
              "Use an old or new Sri Lankan NIC, or the photo page of your Sri Lankan passport.",
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="buddy-document">
                    Document type
                  </FieldLabel>
                  <select
                    id="buddy-document"
                    name="documentType"
                    className={selectClass}
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                  >
                    <option value="nic">
                      Sri Lankan National Identity Card
                    </option>
                    <option value="passport">Sri Lankan passport</option>
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="buddy-birth-date">
                    Date of birth
                  </FieldLabel>
                  <Input
                    id="buddy-birth-date"
                    name="birthDate"
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Buddies must be 18 or older.
                  </p>
                </Field>
                <LocalFile
                  key={documentType + "front"}
                  id="buddy-id-front"
                  label={
                    documentType === "nic" ? "NIC front" : "Passport photo page"
                  }
                />
                {documentType === "nic" && (
                  <LocalFile id="buddy-id-back" label="NIC back" />
                )}
                <p className="text-sm text-muted-foreground">
                  Show all four corners, keep the text readable and avoid glare.
                </p>
              </FieldGroup>,
            )}
            {section(
              2,
              "Put a face to your name",
              "Take a recent selfie so a reviewer can compare it with your identity document.",
              <FieldGroup>
                <div className="flex flex-col items-center gap-4 rounded-xl bg-muted px-6 py-8 text-center">
                  <div className="flex h-36 w-28 items-center justify-center rounded-[50%] border-2 border-dashed border-input">
                    <Camera className="size-9 text-muted-foreground" />
                  </div>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Face the camera in good light. Keep your face visible and
                    remove sunglasses or anything covering your features.
                  </p>
                </div>
                <LocalFile id="buddy-selfie" label="Selfie" selfie />
                <Field orientation="horizontal">
                  <input
                    type="checkbox"
                    id="buddy-face-consent"
                    name="faceComparisonConsent"
                    value="yes"
                  />
                  <FieldLabel htmlFor="buddy-face-consent">
                    Allow Microsoft Azure Face to compare my selfie with the
                    photo on my ID. A reviewer will make the final decision.
                    This option is voluntary.
                  </FieldLabel>
                </Field>
              </FieldGroup>,
            )}
            {section(
              3,
              "What will you share?",
              "Help travellers get to know your local knowledge. Additional documents depend on the services you offer.",
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="buddy-service">Main service</FieldLabel>
                  <select
                    id="buddy-service"
                    name="service"
                    className={selectClass}
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                  >
                    <option value="local">Local experiences</option>
                    <option value="guide">Professional tour guiding</option>
                    <option value="transport">
                      Experiences with transport
                    </option>
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="buddy-home">Home base</FieldLabel>
                  <Input
                    id="buddy-home"
                    name="homeBase"
                    placeholder="e.g. Galle"
                    value={home}
                    onChange={(e) => setHome(e.target.value)}
                    required
                    maxLength={120}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="buddy-languages">
                    Languages you speak
                  </FieldLabel>
                  <Input
                    id="buddy-languages"
                    name="languages"
                    placeholder="e.g. Sinhala, Tamil, English"
                    value={languages}
                    onChange={(e) => setLanguages(e.target.value)}
                    required
                    maxLength={200}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="buddy-intro">
                    A little about your experiences
                  </FieldLabel>
                  <Textarea
                    id="buddy-intro"
                    name="intro"
                    placeholder="Tell us about the places, people or activities you know best…"
                    rows={4}
                    maxLength={2000}
                  />
                </Field>
                {service === "guide" && (
                  <FieldSet>
                    <FieldLegend>Guide credentials</FieldLegend>
                    <Field>
                      <FieldLabel htmlFor="buddy-guide-number">
                        SLTDA licence number
                      </FieldLabel>
                      <Input
                        id="buddy-guide-number"
                        name="guideLicence"
                        required
                        maxLength={100}
                      />
                    </Field>
                    <LocalFile id="buddy-guide-licence" label="Guide licence" />
                    <p className="text-sm text-muted-foreground">
                      Licence holder, category and validity will need to be
                      checked before approval.
                    </p>
                  </FieldSet>
                )}
                {service === "transport" && (
                  <FieldSet>
                    <FieldLegend>Transport documents</FieldLegend>
                    <LocalFile
                      id="buddy-driving-licence"
                      label="Driving licence"
                    />
                    <LocalFile
                      id="buddy-vehicle"
                      label="Vehicle registration"
                    />
                    <LocalFile id="buddy-insurance" label="Vehicle insurance" />
                    <p className="text-sm text-muted-foreground">
                      Vehicle permissions and insurance must cover the service
                      offered.
                    </p>
                  </FieldSet>
                )}
              </FieldGroup>,
            )}
            {section(
              4,
              "Review your buddy application",
              "Check your details before sending your application for manual review.",
              <FieldGroup>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-4 rounded-xl bg-muted p-5 text-sm">
                  <dt className="text-muted-foreground">Display name</dt>
                  <dd className="break-words">{name || "Not entered"}</dd>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{phone || "Not entered"}</dd>
                  <dt className="text-muted-foreground">Home base</dt>
                  <dd className="break-words">{home || "Not entered"}</dd>
                  <dt className="text-muted-foreground">Languages</dt>
                  <dd className="break-words">{languages || "Not entered"}</dd>
                  <dt className="text-muted-foreground">Document</dt>
                  <dd>
                    {documentType === "nic"
                      ? "Sri Lankan NIC"
                      : "Sri Lankan passport"}
                  </dd>
                  <dt className="text-muted-foreground">Service</dt>
                  <dd>
                    {service === "guide"
                      ? "Tour guiding"
                      : service === "transport"
                        ? "Experiences with transport"
                        : "Local experiences"}
                  </dd>
                  <dt className="text-muted-foreground">Verification</dt>
                  <dd>Not started</dd>
                </dl>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {existingBuddy
                    ? "You can keep hosting while we review this application."
                    : "You can start hosting after your application is approved."}
                </p>
              </FieldGroup>,
            )}
            {submitError !== undefined && <Problem error={submitError} />}
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {mobile && step > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goTo(step - 1)}
                  disabled={submitting}
                >
                  <ArrowLeft data-icon="inline-start" />
                  Back
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Manual review
                </span>
              )}
              <Button type="submit" disabled={submitting}>
                {mobile && step < steps.length - 1
                  ? "Continue"
                  : submitting
                    ? "Submitting…"
                    : "Submit for review"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function LocalFile({
  id,
  label,
  selfie = false,
}: {
  id: string;
  label: string;
  selfie?: boolean;
}) {
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-input p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileImage className="size-4" />
          <span>JPG, PNG or WebP · up to 2 MB</span>
        </div>
        <Input
          id={id}
          name={id.slice("buddy-".length)}
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          capture={selfie ? "user" : undefined}
          aria-invalid={!!error}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            const next = e.target.files?.[0];
            if (
              next &&
              (!["image/jpeg", "image/png", "image/webp"].includes(next.type) ||
                next.size > 2 * 1024 * 1024)
            ) {
              setError("Choose a JPG, PNG or WebP image of 2 MB or smaller.");
              e.target.value = "";
              setFile(undefined);
              setUrl("");
              return;
            }
            setError("");
            setFile(next);
            setUrl("");
          }}
        />
        {file && (
          <div className="flex items-center gap-3">
            <img
              src={url || undefined}
              alt={`Selected ${label.toLowerCase()} preview`}
              className="size-16 rounded-md object-contain"
            />
            <p className="min-w-0 flex-1 break-all text-sm">
              {file.name}
              <span className="block text-xs text-muted-foreground">
                Ready to submit
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(undefined);
                setUrl("");
                const input = document.getElementById(id) as HTMLInputElement;
                input.value = "";
              }}
            >
              Remove
            </Button>
          </div>
        )}
      </div>
      <p
        id={`${id}-help`}
        className={cn(
          "text-xs text-muted-foreground",
          error && "text-destructive",
        )}
      >
        {error || "Shared with the reviewer when you submit."}
      </p>
    </Field>
  );
}
