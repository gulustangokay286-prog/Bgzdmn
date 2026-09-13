BEGIN;

ALTER TABLE randevular
  DROP CONSTRAINT IF EXISTS randevular_muhatap_turu_check;

ALTER TABLE randevular
  ADD CONSTRAINT randevular_muhatap_turu_check
  CHECK (muhatap_turu IS NULL OR muhatap_turu IN ('ogrenci', 'veli', 'ogretmen', 'personel', 'idare'));

COMMIT;
