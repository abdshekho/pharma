ALTER TYPE "UserRole" ADD VALUE 'representative';

CREATE TABLE "representative_profiles" (
  "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "user_id"     UUID        NOT NULL,
  "company_id"  UUID        NOT NULL,
  "city_id"     UUID        NOT NULL,
  "verified_at" TIMESTAMP,
  "verified_by" UUID,
  "created_at"  TIMESTAMP   NOT NULL DEFAULT now(),

  CONSTRAINT "representative_profiles_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "representative_profiles_user_id_key"     UNIQUE ("user_id"),
  CONSTRAINT "representative_profiles_user_id_fkey"    FOREIGN KEY ("user_id")    REFERENCES "users"("id"),
  CONSTRAINT "representative_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id"),
  CONSTRAINT "representative_profiles_city_id_fkey"    FOREIGN KEY ("city_id")    REFERENCES "cities"("id"),
  CONSTRAINT "representative_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id")
);

ALTER TABLE "sample_requests"
  DROP COLUMN IF EXISTS "distributor_id",
  ADD COLUMN "representative_id" UUID,
  ADD CONSTRAINT "sample_requests_representative_id_fkey"
    FOREIGN KEY ("representative_id") REFERENCES "representative_profiles"("id");
