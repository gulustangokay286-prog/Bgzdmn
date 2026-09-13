BEGIN;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='yoklama_uzlastirma_yayin') THEN
        CREATE TRIGGER yoklama_uzlastirma_yayin
        AFTER INSERT OR UPDATE OR DELETE ON yoklama_uzlastirma
        FOR EACH ROW EXECUTE FUNCTION yayinla();
    END IF;
END $$;
COMMIT;
