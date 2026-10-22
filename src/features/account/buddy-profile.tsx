import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { MapPin, MessageCircle } from "lucide-react";
import { useSession } from "@/features/auth/session";
import { accountQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import type { BuddyProfile } from "./types";
import { ProfileAvatar } from "./profile-avatar";
import { VideoMedia } from "@/features/catalog/media";
import { ExperienceCard } from "@/features/catalog/experience-card";
import { Loading, NoResults, Problem } from "@/components/feedback";
import { Button } from "@/components/ui/button";
export function BuddyProfilePage({ id }: { id: string }) {
  const { session } = useSession();
  const own = useQuery({ ...accountQuery(), enabled: !!session });
  const valid = z.uuid().safeParse(id).success;
  const query = useQuery({
    queryKey: ["buddy-profile", id],
    enabled: valid,
    queryFn: async () =>
      (await rpc("buddy_profile", {
        profile_id: id,
      })) as unknown as BuddyProfile,
    staleTime: 0,
    retry: false,
  });
  if (!valid)
    return (
      <NoResults
        title="Buddy profile not found"
        description="Choose another local host to explore with."
      />
    );
  if (query.isPending) return <Loading />;
  if (query.error)
    return query.error.message.includes("Buddy profile not found") ? (
      <NoResults
        title="Buddy profile not found"
        description="This profile is not available. Explore other local hosts."
      />
    ) : (
      <div className="flex flex-col gap-3">
        <Problem error={query.error} />
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry profile
        </Button>
      </div>
    );
  const p = query.data,
    d = p.profileDetails;
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-9">
      {own.data?.id === id && (
        <div className="flex flex-wrap gap-4">
          <Link to="/account/packages" className="text-primary">
            Manage my packages
          </Link>
          <Link to="/account/profile" className="text-primary">
            Edit Buddy profile
          </Link>
        </div>
      )}
      <Link to="/nearby" search={{}} className="text-primary">
        Explore local hosts
      </Link>
      <div className="flex flex-wrap items-center gap-6">
        <ProfileAvatar
          name={p.displayName}
          mediaId={p.avatarMediaId}
          className="size-28 md:size-36"
        />
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Your local buddy</p>
          <h1>{p.displayName}</h1>
          <div className="flex flex-wrap gap-5 text-sm">
            {d.homeBase && (
              <p className="inline-flex items-center gap-2">
                <MapPin className="size-4" />
                {d.homeBase}
              </p>
            )}
            {d.languages && (
              <p className="inline-flex items-center gap-2">
                <MessageCircle className="size-4" />
                {d.languages}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="flex max-w-3xl flex-col gap-4">
        {d.bio && (
          <p className="whitespace-pre-line leading-relaxed">{d.bio}</p>
        )}
        {d.specialties && (
          <p>
            <strong>Local specialties:</strong> {d.specialties}
          </p>
        )}
        {d.yearsExperience !== null && (
          <p>{d.yearsExperience} years of local experience</p>
        )}
      </div>
      {p.profileVideoIds.length > 0 && (
        <section className="flex flex-col gap-5">
          <h2>Meet {p.displayName}, on video.</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {p.profileVideoIds.map((id, index) => (
              <VideoMedia
                key={id}
                id={id}
                title={`${p.displayName} introduction video ${index + 1}`}
              />
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-col gap-5">
        <h2>Explore with {p.displayName}</h2>
        {p.packages.length ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {p.packages.map((p) => (
              <ExperienceCard key={p.id} experience={p} />
            ))}
          </div>
        ) : (
          <NoResults
            title="New experiences are on the way"
            description="Check back soon to explore with this host."
          />
        )}
      </section>
    </section>
  );
}
