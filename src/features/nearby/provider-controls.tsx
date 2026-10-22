import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { rpc } from "@/lib/supabase";
import { useSession } from "@/features/auth/session";
import { providerDiscoveryQuery, areasQuery } from "./queries";
import { heartbeatKey, useProviderHeartbeat } from "./provider-heartbeat";
import { MeetingMap } from "./meeting-map";
import { meetingPointSchema } from "./model";
import type {
  ProviderListing,
  ProviderDiscovery,
  ProviderPresence,
} from "./types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Problem, Loading, NoResults } from "@/components/feedback";
export function ProviderControls() {
  const { session } = useSession();
  const discovery = useQuery(providerDiscoveryQuery());
  const heartbeat = useProviderHeartbeat();
  const client = useQueryClient();
  const [selected, setSelected] = useState("");
  const toggle = useMutation({
    onMutate: async () => {
      await client.cancelQueries({ queryKey: heartbeatKey(session!.user.id) });
    },
    mutationFn: async (accepting: boolean) =>
      (await rpc("set_provider_accepting", {
        accepting_requests: accepting,
      })) as unknown as ProviderPresence,
    onSuccess: (status) => {
      client.setQueryData(heartbeatKey(session!.user.id), status);
      void client.invalidateQueries({ queryKey: ["provider-discovery"] });
      void client.invalidateQueries({ queryKey: ["nearby-live"] });
    },
  });
  if (discovery.isPending) return <Loading />;
  if (discovery.error)
    return (
      <div className="flex flex-col gap-3">
        <Problem error={discovery.error} />
        <Button variant="outline" onClick={() => void discovery.refetch()}>
          Retry provider settings
        </Button>
      </div>
    );
  const presence = heartbeat.data ?? discovery.data.presence;
  const pack =
    discovery.data.packages.find((pack) => pack.id === selected) ??
    discovery.data.packages[0];
  return (
    <section className="flex flex-col gap-5 border-t pt-6">
      <div>
        <h2>Be here when travelers need you.</h2>
        <p className="mt-2 text-muted-foreground">
          Go online to receive requests for your local experiences.
        </p>
      </div>
      <FieldGroup>
        <Field orientation="horizontal">
          <Switch
            id="accepting-requests"
            checked={presence.accepting}
            disabled={toggle.isPending}
            onCheckedChange={(accepting) => toggle.mutate(accepting)}
          />
          <FieldLabel htmlFor="accepting-requests">
            Accepting requests
          </FieldLabel>
        </Field>
      </FieldGroup>
      <Badge
        variant={presence.online && !heartbeat.error ? "default" : "secondary"}
      >
        {presence.online && !heartbeat.error
          ? "Online and accepting requests"
          : presence.accepting
            ? "Reconnecting…"
            : "Not accepting requests"}
      </Badge>
      <p className="text-sm text-muted-foreground">
        Keep the app open while you’re available. Your status expires within two
        minutes after the app closes or loses its connection. Switch off
        whenever you stop accepting requests.
      </p>
      {toggle.error && <Problem error={toggle.error} />}
      {!pack ? (
        <NoResults
          title="No experiences yet"
          description="Your experiences will appear here once they are assigned to your account. Only published experiences with a saved meeting point appear in live discovery."
        />
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor="provider-package">
              Experience meeting point
            </FieldLabel>
            <NativeSelect
              id="provider-package"
              value={pack.id}
              onChange={(event) => setSelected(event.target.value)}
            >
              {discovery.data.packages.map((pack) => (
                <NativeSelectOption key={pack.id} value={pack.id}>
                  {pack.title}
                  {pack.published ? "" : " (unpublished)"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <LocationEditor key={pack.id} pack={pack} />
        </>
      )}
      <Link to="/nearby" search={{}} className="text-primary">
        View live discovery
      </Link>
    </section>
  );
}
function LocationEditor({ pack }: { pack: ProviderListing }) {
  const client = useQueryClient();
  const areas = useQuery(areasQuery());
  const [area, setArea] = useState(pack.location?.area ?? "");
  const [label, setLabel] = useState(pack.location?.label ?? pack.meetingPoint);
  const [latitude, setLatitude] = useState(
    pack.location ? String(pack.location.latitude) : "",
  );
  const [longitude, setLongitude] = useState(
    pack.location ? String(pack.location.longitude) : "",
  );
  const [validationError, setValidationError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const input = meetingPointSchema.parse({
        packageId: pack.id,
        area,
        label,
        latitude: latitude.trim() ? Number(latitude) : NaN,
        longitude: longitude.trim() ? Number(longitude) : NaN,
      });
      return (await rpc("save_meeting_point", {
        input,
      })) as unknown as ProviderDiscovery;
    },
    onSuccess: (data) => {
      setSaved(true);
      client.setQueryData(["provider-discovery"], data);
      void client.invalidateQueries({ queryKey: ["nearby-areas"] });
      void client.invalidateQueries({ queryKey: ["nearby-live"] });
      void client.invalidateQueries({ queryKey: ["package", pack.id] });
    },
  });
  const lat = Number(latitude),
    lng = Number(longitude);
  const hasPoint =
    latitude !== "" &&
    longitude !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  function submit(event: FormEvent) {
    event.preventDefault();
    setValidationError(undefined);
    setSaved(false);
    const parsed = meetingPointSchema.safeParse({
      packageId: pack.id,
      area,
      label,
      latitude: latitude.trim() ? lat : NaN,
      longitude: longitude.trim() ? lng : NaN,
    });
    if (!parsed.success) {
      setValidationError(
        new Error(
          "Enter the town, meeting-point description and valid latitude/longitude, or choose a point on the map.",
        ),
      );
      return;
    }
    save.mutate();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {!pack.published && (
        <p className="text-sm text-muted-foreground">
          This experience is unpublished. Saving its point will not make it
          public.
        </p>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="meeting-area">Town or area</FieldLabel>
          <Input
            id="meeting-area"
            value={area}
            onChange={(event) => setArea(event.target.value)}
            list="meeting-areas"
            required
            minLength={2}
            maxLength={120}
            placeholder="Ella"
            disabled={save.isPending}
          />
          <datalist id="meeting-areas">
            {areas.data?.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="meeting-label">
            Meeting or pickup point
          </FieldLabel>
          <Input
            id="meeting-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            required
            minLength={2}
            maxLength={300}
            placeholder="Main entrance, Ella railway station"
            disabled={save.isPending}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="meeting-lat">Latitude</FieldLabel>
            <Input
              id="meeting-lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              required
              disabled={save.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="meeting-lng">Longitude</FieldLabel>
            <Input
              id="meeting-lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              required
              disabled={save.isPending}
            />
          </Field>
        </div>
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        Click the map to place the meeting or pickup point, or enter its
        coordinates above. Travelers will see this public location.
      </p>
      <MeetingMap
        className="h-80"
        points={
          hasPoint
            ? [
                {
                  id: pack.id,
                  latitude: lat,
                  longitude: lng,
                  label: label || pack.title,
                },
              ]
            : []
        }
        onPick={
          save.isPending
            ? undefined
            : (lat, lng) => {
                setLatitude(String(lat));
                setLongitude(String(lng));
                setSaved(false);
              }
        }
      />
      {(validationError || save.error) && (
        <Problem error={validationError ?? save.error} />
      )}
      {saved && <p role="status">Meeting point saved.</p>}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving meeting point…" : "Save meeting point"}
      </Button>
    </form>
  );
}
