BEGIN;

ALTER TABLE randevular
  ADD COLUMN IF NOT EXISTS muhatap_id BIGINT REFERENCES kisiler(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS muhatap_turu TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'randevular_muhatap_turu_check'
  ) THEN
    ALTER TABLE randevular
      ADD CONSTRAINT randevular_muhatap_turu_check
      CHECK (muhatap_turu IS NULL OR muhatap_turu IN ('ogrenci', 'veli', 'ogretmen', 'personel', 'idare'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS randevular_muhatap_id_idx ON randevular(muhatap_id);

COMMIT;
