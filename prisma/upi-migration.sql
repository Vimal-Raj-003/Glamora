-- Reviewed additive migration. Never run upstream PostgresStore.migrate().
-- No tables, columns, functions or customer data are dropped.
ALTER TABLE "Payment" ALTER COLUMN "razorpayOrderId" DROP NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "razorpayPaymentId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN provider TEXT NOT NULL DEFAULT 'razorpay';
ALTER TABLE "Payment" ADD COLUMN "upiPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN utr TEXT;
ALTER TABLE "Payment" ADD COLUMN "payableAmount" DECIMAL(10,2);
CREATE UNIQUE INDEX "Payment_upiPaymentId_key" ON "Payment"("upiPaymentId");
CREATE UNIQUE INDEX "Payment_utr_key" ON "Payment"(utr);
CREATE TABLE glamora_upi_attempts (id TEXT PRIMARY KEY, payload JSONB NOT NULL);
CREATE TABLE glamora_upi_credits (utr TEXT PRIMARY KEY CHECK (utr ~ '^[0-9]{12}$'), payload JSONB NOT NULL, "paymentId" TEXT UNIQUE);
CREATE TABLE glamora_upi_inbox (
  id INTEGER PRIMARY KEY CHECK (id=1), "lastUid" BIGINT NOT NULL DEFAULT 0,
  "uidValidity" TEXT NOT NULL DEFAULT '', "lastRun" TIMESTAMPTZ(3), "lastOk" TIMESTAMPTZ(3),
  "lastError" TEXT, "leaseToken" TEXT, "leaseUntil" TIMESTAMPTZ(3)
);
INSERT INTO glamora_upi_inbox(id) VALUES(1);
-- This integration uses a server-only database connection. No anonymous grants.
REVOKE ALL ON glamora_upi_attempts,glamora_upi_credits,glamora_upi_inbox FROM PUBLIC;
