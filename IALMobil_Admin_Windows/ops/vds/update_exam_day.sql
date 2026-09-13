BEGIN;

UPDATE ayarlar
SET deger = jsonb_set(
  deger,
  '{denemeGunleri}',
  COALESCE((
    SELECT jsonb_agg(item ORDER BY item->>'tarih')
    FROM jsonb_array_elements(COALESCE(deger->'denemeGunleri', '[]'::jsonb)) AS item
    WHERE item->>'tarih' <> '2026-09-09'
  ), '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'tarih', '2026-09-09',
      'ad', '12. Sınıf Deneme Sınavı',
      'sinifSeviyeleri', jsonb_build_array('12'),
      'baslangicSaati', '10:15',
      'gecMusaadeDk', 0,
      'sinavSuresiDk', 165,
      'otomatikCikisSaati', '13:15',
      'etutVar', false,
      'etutGirisSaati', '13:30',
      'etutMusaadeDk', 0,
      'etutCikisSaati', '16:00',
      'aktif', true
    )
  ),
  true
), guncellendi = now()
WHERE anahtar = 'institution';

COMMIT;

SELECT jsonb_pretty(deger->'denemeGunleri')
FROM ayarlar
WHERE anahtar = 'institution';
