BEGIN;

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounts_envelope" CHECK ("schema_version" = 1 AND "revision" > 0),
    CONSTRAINT "accounts_document" CHECK ((
      jsonb_typeof("data") = 'object'
      AND "data" ?& ARRAY['displayName', 'roles', 'status', 'onboarding']
      AND jsonb_typeof("data"->'displayName') = 'string'
      AND length(trim("data"->>'displayName')) BETWEEN 1 AND 120
      AND jsonb_typeof("data"->'roles') = 'array'
      AND "data"->'roles' <@ '["traveler","provider","guide","admin"]'::jsonb
      AND "data"->'roles' <> '[]'::jsonb
      AND "data"->>'status' IN ('active', 'suspended', 'closed')
      AND "data"->>'onboarding' IN ('pending', 'completed')
    ) IS TRUE)
);

CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_identities_envelope" CHECK ("schema_version" = 1 AND "revision" > 0),
    CONSTRAINT "auth_identities_document" CHECK ((
      jsonb_typeof("data") = 'object'
      AND "data" ?& ARRAY['accountId', 'provider', 'providerSubject', 'email', 'emailVerified']
      AND jsonb_typeof("data"->'accountId') = 'string'
      AND "data"->>'accountId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND "data"->>'provider' = 'google'
      AND jsonb_typeof("data"->'providerSubject') = 'string'
      AND length(trim("data"->>'providerSubject')) BETWEEN 1 AND 255
      AND jsonb_typeof("data"->'email') = 'string'
      AND length("data"->>'email') BETWEEN 3 AND 320
      AND jsonb_typeof("data"->'emailVerified') = 'boolean'
    ) IS TRUE)
);

-- Expression indexes keep identity keys in JSON while enforcing uniqueness.
CREATE UNIQUE INDEX "auth_identities_provider_subject_key"
    ON "auth_identities" (("data"->>'provider'), ("data"->>'providerSubject'));
CREATE INDEX "auth_identities_account_idx" ON "auth_identities" (("data"->>'accountId'));
CREATE INDEX "auth_identities_email_idx" ON "auth_identities" (lower("data"->>'email'));
CREATE INDEX "accounts_status_idx" ON "accounts" (("data"->>'status'));

COMMIT;
