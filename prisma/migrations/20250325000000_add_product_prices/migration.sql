-- Migration: Add product pricing structure and inactive users API support
-- Date: 2025-03-25

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add new enum for price type
CREATE TYPE "PriceType" AS ENUM ('company_to_distributor', 'distributor_to_pharmacist', 'pharmacist_to_consumer');

-- Create product_prices table to store multiple prices per product
CREATE TABLE "product_prices" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "product_id" UUID NOT NULL,
  "price_type" "PriceType" NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- Add constraint to ensure one active price per product per type at a time
CREATE UNIQUE INDEX "product_prices_product_id_price_type_active_idx" ON "product_prices" 
WHERE effective_to IS NULL;

-- Add indexes for better query performance
CREATE INDEX "product_prices_product_id_idx" ON "product_prices"("product_id");
CREATE INDEX "product_prices_price_type_idx" ON "product_prices"("price_type");

-- Add foreign key constraints
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" 
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;

ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_created_by_fkey" 
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- Add a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_prices_updated_at BEFORE UPDATE ON product_prices 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing product prices to the new structure
-- First, mark all existing prices as company_to_distributor type
INSERT INTO "product_prices" (product_id, price_type, price, created_at)
SELECT 
  id, 
  'company_to_distributor'::"PriceType", 
  price, 
  created_at
FROM "products";

-- Then, insert default prices for distributor_to_pharmacist (add 10% markup)
INSERT INTO "product_prices" (product_id, price_type, price, created_at)
SELECT 
  id, 
  'distributor_to_pharmacist'::"PriceType", 
  ROUND(price * 1.1, 2),
  created_at
FROM "products";

-- Then, insert default prices for pharmacist_to_consumer (add 20% markup)
INSERT INTO "product_prices" (product_id, price_type, price, created_at)
SELECT 
  id, 
  'pharmacist_to_consumer'::"PriceType", 
  ROUND(price * 1.2, 2),
  created_at
FROM "products";

-- Note: We keep the original price column in products table for backward compatibility
-- In future, we can consider removing it once all code is migrated to use the new pricing structure