ALTER TYPE "OrderStatus" ADD VALUE 'rejected';

ALTER TABLE "orders" ADD COLUMN "rejection_reason" TEXT;
