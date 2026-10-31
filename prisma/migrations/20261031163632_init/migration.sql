-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EXPORTER', 'CARRIER', 'BUYER', 'MANAGER');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('EXPORTER', 'CARRIER', 'BUYER');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'CONTRACT_PENDING', 'CONTRACTED', 'IN_TRANSIT', 'DELIVERED', 'VERIFIED', 'VERIFICATION_FAILED', 'INVOICED', 'PAID', 'DISPUTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JurisdictionPreset" AS ENUM ('IN_MSMED', 'GENERIC');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "GoodsSettlement" AS ENUM ('INVOICE', 'ORDER_CAPTURE');

-- CreateEnum
CREATE TYPE "ChargePurpose" AS ENUM ('GOODS', 'FREIGHT');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('POD', 'PHOTO');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'VERIFIED_WITH_DISCREPANCY', 'FAILED');

-- CreateEnum
CREATE TYPE "PayPalOrderIntent" AS ENUM ('AUTHORIZE', 'CAPTURE');

-- CreateEnum
CREATE TYPE "CreditClockStatus" AS ENUM ('RUNNING', 'OVERDUE', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderStage" AS ENUM ('T_MINUS_7', 'T_MINUS_1', 'T_PLUS_1', 'T_PLUS_15');

-- CreateEnum
CREATE TYPE "InsurancePolicyStatus" AS ENUM ('QUOTED', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsuranceClaimStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('OPEN', 'RECOMMENDED', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "RecommendationDecision" AS ENUM ('FULL', 'PARTIAL', 'NONE');

-- CreateEnum
CREATE TYPE "EvidencePackKind" AS ENUM ('DISPUTE_RESPONSE', 'MSME_SAMADHAAN', 'INSURANCE_CLAIM');

-- CreateEnum
CREATE TYPE "EvidencePackStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('REFUND', 'PAYOUT', 'DISPUTE_EVIDENCE', 'DISPUTE_ACCEPT_CLAIM', 'CONTRACT_FINALISE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAgent" AS ENUM ('CONTRACT_AI', 'DELIVERY_AI', 'PAYMENT_AI', 'RESOLUTION_AI', 'TRUST_AI', 'WEBHOOK', 'OPERATOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TrustSubjectRole" AS ENUM ('PAYER', 'CARRIER');

-- CreateEnum
CREATE TYPE "TrustConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isExporter" BOOLEAN NOT NULL DEFAULT false,
    "isCarrier" BOOLEAN NOT NULL DEFAULT false,
    "isBuyer" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "paypalEmail" TEXT,
    "paypalMerchantId" TEXT,
    "gstin" TEXT,
    "msmeRegistered" BOOLEAN NOT NULL DEFAULT false,
    "udyamNumber" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "exporterId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "cargoDescription" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "declaredValue" DECIMAL(14,2) NOT NULL,
    "freightAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "originCity" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "pickupWindowStart" TIMESTAMP(3),
    "pickupWindowEnd" TIMESTAMP(3),
    "deliveryWindowStart" TIMESTAMP(3),
    "deliveryWindowEnd" TIMESTAMP(3),
    "creditTermsDays" INTEGER NOT NULL,
    "jurisdictionPreset" "JurisdictionPreset" NOT NULL DEFAULT 'GENERIC',
    "insuranceRequested" BOOLEAN NOT NULL DEFAULT false,
    "carrierTrackingNumber" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "clausesJson" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "jurisdictionPreset" "JurisdictionPreset" NOT NULL,
    "creditDays" INTEGER NOT NULL,
    "goodsSettlement" "GoodsSettlement" NOT NULL DEFAULT 'INVOICE',
    "flagsJson" JSONB,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "finalisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAcceptance" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "party" "PartyRole" NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "contractId" TEXT,
    "insurerName" TEXT NOT NULL DEFAULT 'Simulated Insurer',
    "quoteReference" TEXT NOT NULL,
    "coverageAmount" DECIMAL(14,2) NOT NULL,
    "premium" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "termsJson" JSONB,
    "status" "InsurancePolicyStatus" NOT NULL DEFAULT 'QUOTED',
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "claimReference" TEXT NOT NULL,
    "amountClaimed" DECIMAL(14,2) NOT NULL,
    "amountApproved" DECIMAL(14,2),
    "reason" TEXT NOT NULL,
    "status" "InsuranceClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvidence" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT,
    "extractedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReport" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "extractedJson" JSONB NOT NULL,
    "discrepancies" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPalOrder" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "paypalOrderId" TEXT NOT NULL,
    "intent" "PayPalOrderIntent" NOT NULL,
    "purpose" "ChargePurpose" NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "approveUrl" TEXT,
    "authorizationId" TEXT,
    "authorizationStatus" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPalCapture" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paypalCaptureId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "capturedAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayPalCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPalInvoice" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "paypalInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "purpose" "ChargePurpose" NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "recipientEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPalRefund" (
    "id" TEXT NOT NULL,
    "paypalRefundId" TEXT NOT NULL,
    "captureId" TEXT,
    "invoiceId" TEXT,
    "refundRequestId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayPalRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPalPayout" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "senderBatchId" TEXT NOT NULL,
    "payoutBatchId" TEXT,
    "payoutItemId" TEXT,
    "receiverEmail" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPalPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPalDispute" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT,
    "paypalDisputeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "disputeAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "disputedTransactionId" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "outcome" TEXT,
    "openedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "raw" JSONB,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPalDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPalTracking" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "captureId" TEXT,
    "transactionId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paypalTrackerId" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayPalTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "paypalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "summary" TEXT,
    "raw" JSONB NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL,
    "replayed" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditClock" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "preset" "JurisdictionPreset" NOT NULL,
    "acceptanceDate" TIMESTAMP(3) NOT NULL,
    "agreedDays" INTEGER NOT NULL,
    "statutoryCapDays" INTEGER,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "statutoryDueDate" TIMESTAMP(3),
    "status" "CreditClockStatus" NOT NULL DEFAULT 'RUNNING',
    "paidAt" TIMESTAMP(3),
    "interestRatePct" DECIMAL(6,3),
    "interestAccrued" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditClock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "creditClockId" TEXT NOT NULL,
    "stage" "ReminderStage" NOT NULL,
    "tone" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "disputeId" TEXT,
    "requestedById" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "refundRequestId" TEXT,
    "disputeId" TEXT,
    "decision" "RecommendationDecision" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reasoning" TEXT NOT NULL,
    "evidenceRefs" TEXT[],
    "contractClausesCited" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidencePack" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "disputeId" TEXT,
    "kind" "EvidencePackKind" NOT NULL,
    "status" "EvidencePackStatus" NOT NULL DEFAULT 'DRAFT',
    "markdown" TEXT NOT NULL,
    "filesJson" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidencePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "agent" "AuditAgent" NOT NULL,
    "actionType" "ApprovalActionType" NOT NULL,
    "shipmentId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "agent" "AuditAgent" NOT NULL,
    "trigger" TEXT NOT NULL,
    "shipmentId" TEXT,
    "actorUserId" TEXT,
    "evidenceRefs" TEXT[],
    "reasoning" TEXT,
    "proposedAction" TEXT,
    "confidence" DOUBLE PRECISION,
    "outcome" TEXT,
    "approvalRequestId" TEXT,
    "model" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustScore" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subjectRole" "TrustSubjectRole" NOT NULL,
    "metricsJson" JSONB NOT NULL,
    "confidence" "TrustConfidence" NOT NULL,
    "basisTransactionCount" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_reference_key" ON "Shipment"("reference");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_buyerId_idx" ON "Shipment"("buyerId");

-- CreateIndex
CREATE INDEX "Shipment_carrierId_idx" ON "Shipment"("carrierId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_shipmentId_version_key" ON "Contract"("shipmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAcceptance_contractId_party_key" ON "ContractAcceptance"("contractId", "party");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePolicy_quoteReference_key" ON "InsurancePolicy"("quoteReference");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_claimReference_key" ON "InsuranceClaim"("claimReference");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalOrder_paypalOrderId_key" ON "PayPalOrder"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalCapture_paypalCaptureId_key" ON "PayPalCapture"("paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalInvoice_paypalInvoiceId_key" ON "PayPalInvoice"("paypalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalInvoice_invoiceNumber_key" ON "PayPalInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalRefund_paypalRefundId_key" ON "PayPalRefund"("paypalRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalPayout_senderBatchId_key" ON "PayPalPayout"("senderBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalPayout_payoutBatchId_key" ON "PayPalPayout"("payoutBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalPayout_approvalRequestId_key" ON "PayPalPayout"("approvalRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPalDispute_paypalDisputeId_key" ON "PayPalDispute"("paypalDisputeId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_paypalEventId_key" ON "WebhookEvent"("paypalEventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_receivedAt_idx" ON "WebhookEvent"("eventType", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditClock_invoiceId_key" ON "CreditClock"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_creditClockId_stage_key" ON "PaymentReminder"("creditClockId", "stage");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_shipmentId_createdAt_idx" ON "AuditEvent"("shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_agent_createdAt_idx" ON "AuditEvent"("agent", "createdAt");

-- CreateIndex
CREATE INDEX "TrustScore_businessId_subjectRole_computedAt_idx" ON "TrustScore"("businessId", "subjectRole", "computedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_exporterId_fkey" FOREIGN KEY ("exporterId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvidence" ADD CONSTRAINT "DeliveryEvidence_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvidence" ADD CONSTRAINT "DeliveryEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalOrder" ADD CONSTRAINT "PayPalOrder_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalCapture" ADD CONSTRAINT "PayPalCapture_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PayPalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalInvoice" ADD CONSTRAINT "PayPalInvoice_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalRefund" ADD CONSTRAINT "PayPalRefund_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "PayPalCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalRefund" ADD CONSTRAINT "PayPalRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PayPalInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalRefund" ADD CONSTRAINT "PayPalRefund_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalPayout" ADD CONSTRAINT "PayPalPayout_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalPayout" ADD CONSTRAINT "PayPalPayout_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalDispute" ADD CONSTRAINT "PayPalDispute_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalTracking" ADD CONSTRAINT "PayPalTracking_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPalTracking" ADD CONSTRAINT "PayPalTracking_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "PayPalCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditClock" ADD CONSTRAINT "CreditClock_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PayPalInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_creditClockId_fkey" FOREIGN KEY ("creditClockId") REFERENCES "CreditClock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "PayPalDispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "PayPalDispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePack" ADD CONSTRAINT "EvidencePack_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePack" ADD CONSTRAINT "EvidencePack_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "PayPalDispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustScore" ADD CONSTRAINT "TrustScore_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
