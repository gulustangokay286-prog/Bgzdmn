BEGIN;

-- Öğretmen ve personel birbirinden bağımsız kadro türleridir. Eski şema
-- personel rolünü reddettiği için ekran tarafındaki seçim kalıcılaşmıyordu.
ALTER TABLE kisi_rolleri DROP CONSTRAINT IF EXISTS kisi_rolleri_rol_check;
ALTER TABLE kisi_rolleri
  ADD CONSTRAINT kisi_rolleri_rol_check
  CHECK (rol IN ('ogrenci', 'veli', 'ogretmen', 'idare', 'personel'));

-- Bir velinin ana telefonunu bozmadan ek numara tutar. Tekilleştirme aynı
-- numaraya yanlışlıkla iki SMS planlanmasını engeller.
CREATE TABLE IF NOT EXISTS kisi_telefonlari (
  id bigserial PRIMARY KEY,
  kisi_id bigint NOT NULL REFERENCES kisiler(id) ON DELETE CASCADE,
  telefon char(10) NOT NULL CHECK (telefon ~ '^[0-9]{10}$'),
  etiket text NOT NULL DEFAULT 'ek',
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kisi_id, telefon)
);
CREATE INDEX IF NOT EXISTS kisi_telefonlari_kisi_idx ON kisi_telefonlari(kisi_id);

-- Kadro ekranındaki mevcut alanlar artık VDS'te de kalıcıdır.
ALTER TABLE personel ADD COLUMN IF NOT EXISTS atanan_siniflar text;
ALTER TABLE personel ADD COLUMN IF NOT EXISTS notlar text;

-- Mevcut veride "Eğitim Kadrosu" olarak işaretlenmiş iki kayıt gerçekte
-- öğretmen değil personeldir. İlişkili kişi/kimlik kayıtlarına dokunulmaz.
INSERT INTO kisi_rolleri (kisi_id, rol)
SELECT p.kisi_id, 'personel'
  FROM personel p
 WHERE lower(trim(COALESCE(p.brans, ''))) = lower('Eğitim Kadrosu')
ON CONFLICT DO NOTHING;

DELETE FROM kisi_rolleri r
 USING personel p
 WHERE r.kisi_id = p.kisi_id
   AND r.rol = 'ogretmen'
   AND lower(trim(COALESCE(p.brans, ''))) = lower('Eğitim Kadrosu');

-- Kullanıcı, rol ve telefon değişikliklerini bağlı tüm panellere anında yay.
CREATE OR REPLACE FUNCTION yayinla_kullanici_degisti()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'veri_degisti',
    json_build_object(
      'tablo', TG_TABLE_NAME,
      'islem', lower(TG_OP),
      'kisi_id', COALESCE(
        to_jsonb(NEW)->>'kisi_id', to_jsonb(OLD)->>'kisi_id',
        to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id'
      )
    )::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS kisiler_kullanici_yayinla ON kisiler;
CREATE TRIGGER kisiler_kullanici_yayinla
AFTER INSERT OR UPDATE OR DELETE ON kisiler
FOR EACH ROW EXECUTE FUNCTION yayinla_kullanici_degisti();

DROP TRIGGER IF EXISTS kisi_rolleri_kullanici_yayinla ON kisi_rolleri;
CREATE TRIGGER kisi_rolleri_kullanici_yayinla
AFTER INSERT OR UPDATE OR DELETE ON kisi_rolleri
FOR EACH ROW EXECUTE FUNCTION yayinla_kullanici_degisti();

DROP TRIGGER IF EXISTS personel_kullanici_yayinla ON personel;
CREATE TRIGGER personel_kullanici_yayinla
AFTER INSERT OR UPDATE OR DELETE ON personel
FOR EACH ROW EXECUTE FUNCTION yayinla_kullanici_degisti();

DROP TRIGGER IF EXISTS kisi_telefonlari_kullanici_yayinla ON kisi_telefonlari;
CREATE TRIGGER kisi_telefonlari_kullanici_yayinla
AFTER INSERT OR UPDATE OR DELETE ON kisi_telefonlari
FOR EACH ROW EXECUTE FUNCTION yayinla_kullanici_degisti();

COMMIT;
