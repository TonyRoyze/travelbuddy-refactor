import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accountQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { safeReturn } from "@/lib/validation";
import { AccountOverview, SignOutButton } from "./account-overview";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectCombobox } from "@/components/custom-ui/select-combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Problem, Loading } from "@/components/custom-ui/feedback";
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  if (a.onboarding === "completed") return <AccountOverview account={a} />;
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
              defaultValue="traveler"
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
