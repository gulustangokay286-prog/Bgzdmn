BEGIN;

CREATE TABLE IF NOT EXISTS gecis_duzeltmeleri (
  id BIGSERIAL PRIMARY KEY,
  gecis_id BIGINT NOT NULL UNIQUE,
  kayit JSONB NOT NULL,
  sebep TEXT NOT NULL,
  duzeltilme_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gecis_duzeltmeleri (gecis_id, kayit, sebep)
SELECT id, to_jsonb(g),
       'Eski QR bağlantısının tanınan cihazda kendiliğinden işlenmesi nedeniyle geçersiz kayıt'
  FROM gecisler g
 WHERE id IN (1092, 1093, 1094, 1095)
ON CONFLICT (gecis_id) DO NOTHING;

DELETE FROM gecisler WHERE id IN (1092, 1093, 1094, 1095);

COMMIT;
