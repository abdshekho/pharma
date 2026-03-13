-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('company', 'doctor', 'pharmacist', 'distributor', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "CompanyDistributorStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "DosageForm" AS ENUM ('tablet', 'capsule', 'syrup', 'injection', 'cream', 'ointment', 'drop', 'inhaler');

-- CreateEnum
CREATE TYPE "PackUnit" AS ENUM ('tablet', 'capsule', 'ml', 'syringe', 'vial', 'ampoule');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('box', 'bottle', 'strip', 'tube', 'vial_pack');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "PromotionTargetType" AS ENUM ('all', 'doctors', 'pharmacists');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'approved', 'in_delivery', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cod', 'bank_transfer');

-- CreateEnum
CREATE TYPE "SampleRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'delivered');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('in', 'out', 'adjustment');

-- CreateEnum
CREATE TYPE "NotificationRelatedType" AS ENUM ('order', 'product', 'sample_request', 'promotion', 'user');

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "country_code" CHAR(3) NOT NULL DEFAULT 'DAM',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "parent_id" UUID,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "icon" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "full_name" VARCHAR(150),
    "avatar_url" VARCHAR(500),
    "city_id" UUID,
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "commercial_reg_no" VARCHAR(50) NOT NULL,
    "health_ministry_license" VARCHAR(50) NOT NULL,
    "logo_url" VARCHAR(500),
    "website" VARCHAR(500),
    "description" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "license_number" VARCHAR(50) NOT NULL,
    "specialization_id" UUID,
    "hospital_name" VARCHAR(200),
    "license_doc_url" VARCHAR(500) NOT NULL,
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacist_profiles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "pharmacy_license_no" VARCHAR(50) NOT NULL,
    "pharmacy_name" VARCHAR(200) NOT NULL,
    "commercial_reg_no" VARCHAR(50),
    "address" TEXT NOT NULL,
    "license_doc_url" VARCHAR(500),
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacist_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_profiles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "license_doc_url" VARCHAR(500),
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_distributors" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "status" "CompanyDistributorStatus" NOT NULL DEFAULT 'active',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_distributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_groups" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "category_id" UUID,
    "name_ar" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "description" TEXT,
    "ingredients" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "drug_group_id" UUID NOT NULL,
    "dosage_form" "DosageForm",
    "pack_size" INTEGER,
    "pack_unit" "PackUnit",
    "package_type" "PackageType",
    "barcode" VARCHAR(100),
    "strength" VARCHAR(50),
    "usage_instructions" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "image_url" VARCHAR(500),
    "brochure_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_target_specializations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "drug_group_id" UUID NOT NULL,
    "specialization_id" UUID NOT NULL,

    CONSTRAINT "product_target_specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "target_type" "PromotionTargetType" NOT NULL DEFAULT 'all',
    "image_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_products" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "promotion_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_quotas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "max_per_doctor" INTEGER NOT NULL DEFAULT 1,
    "cooldown_days" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "order_number" VARCHAR(20) NOT NULL,
    "pharmacist_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "distributor_id" UUID,
    "city_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cod',
    "delivery_address" TEXT NOT NULL,
    "notes" TEXT,
    "approved_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" VARCHAR(200),
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "promotion_product_id" UUID,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "doctor_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "distributor_id" UUID,
    "status" "SampleRequestStatus" NOT NULL DEFAULT 'pending',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "delivery_address" TEXT NOT NULL,
    "rejection_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_inventory" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "distributor_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_available" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "distributor_id" UUID,
    "product_id" UUID,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER,
    "reference_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "conversation_id" UUID,
    "parent_message_id" UUID,
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "related_product_id" UUID,
    "body" TEXT NOT NULL,
    "attachment_url" VARCHAR(500),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "related_id" UUID,
    "related_type" "NotificationRelatedType",
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_user_id_key" ON "company_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_user_id_key" ON "doctor_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_license_number_key" ON "doctor_profiles"("license_number");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacist_profiles_user_id_key" ON "pharmacist_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacist_profiles_pharmacy_license_no_key" ON "pharmacist_profiles"("pharmacy_license_no");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_profiles_user_id_key" ON "distributor_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_distributors_company_id_distributor_id_city_id_key" ON "company_distributors"("company_id", "distributor_id", "city_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_drug_group_id_dosage_form_strength_pack_size_key" ON "products"("drug_group_id", "dosage_form", "strength", "pack_size");

-- CreateIndex
CREATE UNIQUE INDEX "product_target_specializations_drug_group_id_specialization_key" ON "product_target_specializations"("drug_group_id", "specialization_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_products_promotion_id_product_id_key" ON "promotion_products"("promotion_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sample_quotas_company_id_product_id_key" ON "sample_quotas"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_inventory_distributor_id_product_id_key" ON "distributor_inventory"("distributor_id", "product_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_receiver_id_idx" ON "messages"("receiver_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacist_profiles" ADD CONSTRAINT "pharmacist_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacist_profiles" ADD CONSTRAINT "pharmacist_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_profiles" ADD CONSTRAINT "distributor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_profiles" ADD CONSTRAINT "distributor_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_distributors" ADD CONSTRAINT "company_distributors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_distributors" ADD CONSTRAINT "company_distributors_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_distributors" ADD CONSTRAINT "company_distributors_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_groups" ADD CONSTRAINT "drug_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_groups" ADD CONSTRAINT "drug_groups_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_drug_group_id_fkey" FOREIGN KEY ("drug_group_id") REFERENCES "drug_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_target_specializations" ADD CONSTRAINT "product_target_specializations_drug_group_id_fkey" FOREIGN KEY ("drug_group_id") REFERENCES "drug_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_target_specializations" ADD CONSTRAINT "product_target_specializations_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_quotas" ADD CONSTRAINT "sample_quotas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_quotas" ADD CONSTRAINT "sample_quotas_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pharmacist_id_fkey" FOREIGN KEY ("pharmacist_id") REFERENCES "pharmacist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_promotion_product_id_fkey" FOREIGN KEY ("promotion_product_id") REFERENCES "promotion_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_requests" ADD CONSTRAINT "sample_requests_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_requests" ADD CONSTRAINT "sample_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_requests" ADD CONSTRAINT "sample_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_requests" ADD CONSTRAINT "sample_requests_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_inventory" ADD CONSTRAINT "distributor_inventory_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_inventory" ADD CONSTRAINT "distributor_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_related_product_id_fkey" FOREIGN KEY ("related_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
