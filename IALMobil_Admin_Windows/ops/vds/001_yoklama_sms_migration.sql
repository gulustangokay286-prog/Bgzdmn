-- Safe migration for the VDS backend.
-- Existing devamsizlik/gecisler rows are intentionally not altered.

CREATE TABLE IF NOT EXISTS yoklama_uzlastirma (
  id BIGSERIAL PRIMARY KEY,
  kisi_id BIGINT NOT NULL REFERENCES kisiler(id) ON DELETE CASCADE,
  tarih DATE NOT NULL,
  oturum TEXT NOT NULL CHECK (oturum IN ('sabah', 'ogleden_sonra', 'gun')),
  durum TEXT NOT NULL CHECK (durum IN ('var', 'gec', 'yok', 'izinli', 'beklemede')),
  agirlik NUMERIC(3,1) NOT NULL DEFAULT 0,
  sebep TEXT,
  kaynak TEXT NOT NULL DEFAULT 'manuel_uzlastirma',
  kilitli BOOLEAN NOT NULL DEFAULT FALSE,
  olusturan BIGINT REFERENCES kisiler(id) ON DELETE SET NULL,
  olusturuldu TIMESTAMPTZ NOT NULL DEFAULT now(),
  guncellendi TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kisi_id, tarih, oturum)
);

CREATE INDEX IF NOT EXISTS yoklama_uzlastirma_tarih_idx
  ON yoklama_uzlastirma (tarih, durum);

CREATE TABLE IF NOT EXISTS sms_audit (
  id BIGSERIAL PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  parent_id BIGINT REFERENCES kisiler(id) ON DELETE SET NULL,
  student_id BIGINT REFERENCES kisiler(id) ON DELETE SET NULL,
  phone TEXT,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'broadcast',
  status TEXT NOT NULL CHECK (status IN ('planned', 'blocked', 'missing_phone', 'pending', 'sent', 'failed')),
  reason_code TEXT,
  provider_response JSONB,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_audit_created_idx ON sms_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS sms_audit_status_idx ON sms_audit (status, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_audit_correlation_idx ON sms_audit (correlation_id);
