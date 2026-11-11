-- v2 scope (Nov 11): domestic invoices as manually verified records, operator-approved invoice sending,
-- simulated insurance claims behind approval, and the PayPal payer link on invoices.

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('PAYPAL', 'MANUAL_RECORD');

-- AlterEnum
ALTER TYPE "ApprovalActionType" ADD VALUE 'INVOICE_SEND';
ALTER TYPE "ApprovalActionType" ADD VALUE 'INSURANCE_CLAIM';
ALTER TYPE "ReminderStage" ADD VALUE 'FINAL_NOTICE';
ALTER TYPE "RecommendationDecision" ADD VALUE 'INVESTIGATE';

-- AlterTable
ALTER TABLE "PayPalInvoice" ADD COLUMN "channel" "PaymentChannel" NOT NULL DEFAULT 'PAYPAL',
ADD COLUMN "payerViewUrl" TEXT;
