-- Add RefreshToken and AuditLog tables
CREATE TABLE "refresh_tokens" (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (token)
);

CREATE TABLE "audit_logs" (
  id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"(user_id);
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expiresAt");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"(user_id);
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entityType", entity_id);
CREATE INDEX "audit_logs_created_idx" ON "audit_logs"("createdAt");