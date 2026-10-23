import { currencies, type DisplayCurrency } from "@/features/currency/model";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { accountQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { useTheme, type Theme } from "@/app/theme";
import {
  profileSchema,
  profileSignature,
  type ProfileDetails,
} from "./profile-model";
import type { Account } from "./types";
import { ProfileMedia } from "./profile-media";
import { ProfileAvatar } from "./profile-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loading, Problem } from "@/components/feedback";
export function ProfileSettingsPage() {
  const account = useQuery(accountQuery());
  if (account.isPending) return <Loading />;
  if (account.error) return <Problem error={account.error} />;
  return <Settings key={account.data.id} account={account.data} />;
}
function Settings({ account }: { account: Account }) {
  const buddy = account.roles.some(
    (role) => role === "provider" || role === "guide",
  );
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-7">
      <Link to="/account" className="text-primary">
        Back to your account
      </Link>
      <div>
        <h1>{buddy ? "Your Buddy profile" : "Make it easier to meet."}</h1>
        <p className="mt-3 text-muted-foreground">
          {buddy
            ? "Show travelers what you know and the places you love."
            : "Share what you enjoy so the right buddy can find you."}
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5 rounded-xl bg-secondary p-6 lg:sticky lg:top-24">
          <ProfileAvatar
            name={account.displayName}
            mediaId={account.avatarMediaId}
            className="size-24"
          />
          <div>
            <h2 className="text-xl">{account.displayName}</h2>
            <p>{buddy ? "Local buddy" : "Traveller"}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Your profile helps people understand who they’ll be exploring with.
            Only share what you’re comfortable sharing.
          </p>
          {buddy && (
            <Link
              to="/buddy/$id"
              params={{ id: account.id }}
              className="text-primary"
            >
              View public profile
            </Link>
          )}
        </aside>
        <div className="flex flex-col gap-6">
          {buddy && (
            <Link to="/account/packages" className="text-primary">
              Manage your packages →
            </Link>
          )}
          <ProfileMedia account={account} kind="photo" />
          <ProfileForm account={account} buddy={buddy} />
          {buddy && <ProfileMedia account={account} kind="video" />}
          <DisplaySettings />
        </div>
      </div>
    </section>
  );
}
function ProfileForm({ account, buddy }: { account: Account; buddy: boolean }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => ({
    displayName: account.displayName,
    profileDetails: account.profileDetails,
  }));
  const [base, setBase] = useState(() => ({
    signature: profileSignature(account),
    revision: account.revision,
  }));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>();
  const save = useMutation({
    mutationFn: async () => {
      const input = profileSchema.parse(draft);
      const revision =
        profileSignature(account) === base.signature
          ? account.revision
          : base.revision;
      return (await rpc("save_profile", {
        input,
        expected_revision: revision,
      })) as unknown as Account;
    },
    onSuccess: (updated) => {
      client.setQueryData(["account"], updated);
      setDraft({
        displayName: updated.displayName,
        profileDetails: updated.profileDetails,
      });
      setBase({
        signature: profileSignature(updated),
        revision: updated.revision,
      });
      void client.invalidateQueries({
        queryKey: ["buddy-profile", account.id],
      });
      setNotice("Your profile is saved.");
    },
  });
  const detail = <K extends keyof ProfileDetails>(
    key: K,
    value: ProfileDetails[K],
  ) =>
    setDraft((previous) => ({
      ...previous,
      profileDetails: { ...previous.profileDetails, [key]: value },
    }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setError(undefined);
    const parsed = profileSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        new Error(
          "Check the field lengths and enter whole years of experience between 0 and 80.",
        ),
      );
      return;
    }
    save.mutate();
  };
  const reload = async () => {
    const latest = await client.fetchQuery({ ...accountQuery(), staleTime: 0 });
    setDraft({
      displayName: latest.displayName,
      profileDetails: latest.profileDetails,
    });
    setBase({ signature: profileSignature(latest), revision: latest.revision });
    setNotice("Saved profile reloaded.");
    save.reset();
    setError(undefined);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>About you</CardTitle>
        <CardDescription>
          These details help people put a face to your plans.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-7">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-name">Your name</FieldLabel>
              <Input
                id="profile-name"
                autoComplete="name"
                value={draft.displayName}
                onChange={(event) =>
                  setDraft({ ...draft, displayName: event.target.value })
                }
                minLength={1}
                maxLength={120}
                required
                disabled={save.isPending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">Email address</FieldLabel>
              <Input
                id="profile-email"
                value={account.email}
                type="email"
                readOnly
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-bio">A little about you</FieldLabel>
              <Textarea
                id="profile-bio"
                value={draft.profileDetails.bio}
                onChange={(event) => detail("bio", event.target.value)}
                maxLength={500}
                rows={4}
                disabled={save.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Up to 500 characters
              </p>
            </Field>
          </FieldGroup>
          <div>
            <h2 className="text-xl">
              {buddy ? "Your local knowledge" : "Your way of travelling"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {buddy
                ? "Help travelers discover what makes your area special."
                : "Give a local buddy a sense of what you enjoy."}
            </p>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-base">
                {buddy ? "Your local area" : "Where are you based?"}
              </FieldLabel>
              <Input
                id="profile-base"
                value={draft.profileDetails.homeBase}
                onChange={(event) => detail("homeBase", event.target.value)}
                maxLength={120}
                placeholder="City or region"
                disabled={save.isPending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-languages">Languages</FieldLabel>
              <Input
                id="profile-languages"
                value={draft.profileDetails.languages}
                onChange={(event) => detail("languages", event.target.value)}
                maxLength={160}
                placeholder="For example, English, Sinhala"
                disabled={save.isPending}
              />
            </Field>
            {buddy ? (
              <>
                <Field>
                  <FieldLabel htmlFor="profile-specialties">
                    Specialties
                  </FieldLabel>
                  <Input
                    id="profile-specialties"
                    value={draft.profileDetails.specialties}
                    onChange={(event) =>
                      detail("specialties", event.target.value)
                    }
                    maxLength={240}
                    placeholder="Food, hiking, culture…"
                    disabled={save.isPending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-years">
                    Years of experience
                  </FieldLabel>
                  <Input
                    id="profile-years"
                    type="number"
                    min={0}
                    max={80}
                    step={1}
                    value={draft.profileDetails.yearsExperience ?? ""}
                    onChange={(event) =>
                      detail(
                        "yearsExperience",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                    disabled={save.isPending}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="profile-currency">
                    Display currency
                  </FieldLabel>
                  <NativeSelect
                    id="profile-currency"
                    value={draft.profileDetails.displayCurrency}
                    onChange={(event) =>
                      detail(
                        "displayCurrency",
                        event.target.value as DisplayCurrency,
                      )
                    }
                    disabled={save.isPending}
                  >
                    {currencies.map((currency) => (
                      <NativeSelectOption key={currency} value={currency}>
                        {currency}
                        {currency === "LKR" ? " — Sri Lankan rupee" : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">
                    Conversions are approximate and use the latest available
                    daily rate. Payments are always charged in LKR; your bank’s
                    rate and fees may differ.
                  </p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-interests">Interests</FieldLabel>
                  <Input
                    id="profile-interests"
                    value={draft.profileDetails.interests}
                    onChange={(event) =>
                      detail("interests", event.target.value)
                    }
                    maxLength={240}
                    placeholder="Nature, food, history…"
                    disabled={save.isPending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-style">Travel style</FieldLabel>
                  <Input
                    id="profile-style"
                    value={draft.profileDetails.travelStyle}
                    onChange={(event) =>
                      detail("travelStyle", event.target.value)
                    }
                    maxLength={120}
                    placeholder="Slow travel, adventure…"
                    disabled={save.isPending}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
          {(error || save.error) && (
            <div className="flex flex-col gap-3">
              <Problem error={error ?? save.error} />
              <Button
                type="button"
                variant="outline"
                onClick={() => void reload().catch(setError)}
              >
                Reload saved profile
              </Button>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving profile…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
function DisplaySettings() {
  const { theme, setTheme, storageError } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Display</CardTitle>
        <CardDescription>
          Choose a comfortable view for browsing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          value={[theme]}
          onValueChange={(values) => {
            if (["light", "dark", "system"].includes(values[0]))
              setTheme(values[0] as Theme);
          }}
          aria-label="Display preference"
          variant="outline"
        >
          {(["light", "dark", "system"] as const).map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={`${value} theme`}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {storageError && (
          <p role="status">
            Your display preference will last only while this tab is open.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
