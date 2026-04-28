CREATE TYPE "PromotionType" AS ENUM ('percentage', 'buyXgetY');
CREATE TYPE "PromotionLevel" AS ENUM ('distributor', 'pharmacist');

ALTER TABLE "promotions"
  ADD COLUMN "distributor_id"     UUID,
  ADD COLUMN "parent_promotion_id" UUID,
  ADD COLUMN "type"               "PromotionType"  NOT NULL DEFAULT 'percentage',
  ADD COLUMN "level"              "PromotionLevel" NOT NULL DEFAULT 'pharmacist';

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_distributor_id_fkey"
    FOREIGN KEY ("distributor_id") REFERENCES "distributor_profiles"("id"),
  ADD CONSTRAINT "promotions_parent_promotion_id_fkey"
    FOREIGN KEY ("parent_promotion_id") REFERENCES "promotions"("id");

CREATE TABLE "promotion_buyxgety" (
  "id"             UUID NOT NULL DEFAULT uuid_generate_v4(),
  "promotion_id"   UUID NOT NULL,
  "buy_product_id" UUID NOT NULL,
  "buy_quantity"   INTEGER NOT NULL,
  "free_product_id" UUID NOT NULL,
  "free_quantity"  INTEGER NOT NULL,

  CONSTRAINT "promotion_buyxgety_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_buyxgety_promotion_id_key" UNIQUE ("promotion_id"),
  CONSTRAINT "promotion_buyxgety_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id"),
  CONSTRAINT "promotion_buyxgety_buy_product_id_fkey"
    FOREIGN KEY ("buy_product_id") REFERENCES "products"("id"),
  CONSTRAINT "promotion_buyxgety_free_product_id_fkey"
    FOREIGN KEY ("free_product_id") REFERENCES "products"("id")
);
