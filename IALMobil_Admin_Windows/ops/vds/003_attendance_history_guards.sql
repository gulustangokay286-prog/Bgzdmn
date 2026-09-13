BEGIN;
-- Existing rows are untouched. Even an old desktop client cannot rewrite Sep 7.
CREATE OR REPLACE FUNCTION attendance_protect_september_seven() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.tarih = DATE '2026-09-07' THEN
    RAISE EXCEPTION '7 Eylül ham kayıtları kilitli; uzlaştırma katmanını kullanın.';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.tarih = DATE '2026-09-07' THEN
    RAISE EXCEPTION '7 Eylül ham kayıtları kilitli; uzlaştırma katmanını kullanın.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION attendance_protect_locked_result() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kilitli THEN RAISE EXCEPTION 'Kilitli manuel uzlaştırma değiştirilemez.'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='devamsizlik_september_seven_guard') THEN
    CREATE TRIGGER devamsizlik_september_seven_guard BEFORE INSERT OR UPDATE OR DELETE ON devamsizlik
    FOR EACH ROW EXECUTE FUNCTION attendance_protect_september_seven();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='gecisler_september_seven_guard') THEN
    CREATE TRIGGER gecisler_september_seven_guard BEFORE INSERT OR UPDATE OR DELETE ON gecisler
    FOR EACH ROW EXECUTE FUNCTION attendance_protect_september_seven();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='yoklama_locked_guard') THEN
    CREATE TRIGGER yoklama_locked_guard BEFORE UPDATE OR DELETE ON yoklama_uzlastirma
    FOR EACH ROW EXECUTE FUNCTION attendance_protect_locked_result();
  END IF;
END $$;
COMMIT;
