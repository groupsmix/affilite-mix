-- Backfill the operational fields for WristNerd's Dial watches.
-- Editorial metadata remains in the dial-homepage page JSON.

CREATE OR REPLACE FUNCTION dial_rating_to_product_score(rating NUMERIC)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT rating * 2;
$$;

DO $$
DECLARE
  watch_tools_id UUID := (SELECT id FROM sites WHERE slug = 'watch-tools');
BEGIN
  IF watch_tools_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO products (
    id, site_id, name, slug, description, affiliate_url, image_url, image_alt,
    price_amount, price_currency, featured, status, score
  )
  SELECT
    w.id, watch_tools_id, w.name, w.slug, '', w.url, w.image, w.image_alt,
    w.price, 'USD', w.featured, 'active', dial_rating_to_product_score(w.rating)
  FROM (
    VALUES
      ('9f1a1d40-7a5f-4c34-a001-000000000001'::UUID, 'navigator-automatic', 'Kamasu', 'https://www.amazon.com/dp/B07QJP9TGP', 'https://m.media-amazon.com/images/I/61SZSflqb-L._AC_SL1500_.jpg', 'Orient Kamasu automatic dive watch with blue dial', 320::NUMERIC, 4.8::NUMERIC, true),
      ('9f1a1d40-7a5f-4c34-a001-000000000002'::UUID, 'heritage-field', 'Khaki Field Mechanical', 'https://www.amazon.com/s?k=Hamilton+Khaki+Field+Mechanical+H69439931', 'https://m.media-amazon.com/images/I/41PauP84vhL._AC_SL1500_.jpg', 'Hamilton Khaki Field Mechanical watch on a canvas strap', 495::NUMERIC, 4.7::NUMERIC, false),
      ('9f1a1d40-7a5f-4c34-a001-000000000003'::UUID, 'sterling-dress', 'Fairfield 37mm', 'https://www.amazon.com/dp/B079KV9MHS', 'https://m.media-amazon.com/images/I/61iVvul3sxL._AC_SL1500_.jpg', 'Timex Fairfield 37mm dress watch with cream dial and mesh bracelet', 145::NUMERIC, 4.6::NUMERIC, false),
      ('9f1a1d40-7a5f-4c34-a001-000000000004'::UUID, 'retro-digital', 'A168WA-1', 'https://www.amazon.com/dp/B000LAKYW8', 'https://m.media-amazon.com/images/I/613BThUhjoL._AC_SL1500_.jpg', 'Casio A168WA vintage digital watch with stainless steel band', 65::NUMERIC, 4.5::NUMERIC, false),
      ('9f1a1d40-7a5f-4c34-a001-000000000005'::UUID, 'circuit-chrono', 'SSB399P1', 'https://www.amazon.com/s?k=Seiko+SSB399P1', 'https://m.media-amazon.com/images/I/41Jx6SOeeYL._AC_SL1500_.jpg', 'Seiko SSB399P1 quartz chronograph with black dial', 245::NUMERIC, 4.7::NUMERIC, false),
      ('9f1a1d40-7a5f-4c34-a001-000000000006'::UUID, 'aria-minimalist', 'Signatur Lille', 'https://www.amazon.com/s?k=Skagen+Signatur+Lille', 'https://m.media-amazon.com/images/I/31gptbCa0JL._AC_SL1500_.jpg', 'Skagen Signatur Lille two-hand watch with rose gold mesh strap', 115::NUMERIC, 4.6::NUMERIC, false),
      ('9f1a1d40-7a5f-4c34-a001-000000000007'::UUID, 'casio-duro-walmart', 'Men''s Black Dive Style Sport Watch MDV106-1AV', 'https://sovrn.co/1m9tdvu', 'https://m.media-amazon.com/images/I/61nHUVwR65L._AC_SL1500_.jpg', 'Casio MDV106-1AV black dive watch with black resin band', 66.26::NUMERIC, 4.7::NUMERIC, false)
  ) AS w(id, slug, name, url, image, image_alt, price, rating, featured)
  WHERE NOT EXISTS (
    SELECT 1
    FROM products p
    WHERE p.site_id = watch_tools_id
      AND (p.slug = w.slug OR lower(trim(p.name)) = lower(trim(w.name)))
  )
  ON CONFLICT (site_id, slug) DO NOTHING;

  INSERT INTO product_affiliate_links (id, product_id, network, geo, url, weight, is_active)
  SELECT
    l.id, p.id, l.network, '*', l.url, 100, true
  FROM (
    VALUES
      ('f1a1d140-7a5f-4c34-a001-000000000001'::UUID, 'navigator-automatic', 'amazon', 'https://www.amazon.com/dp/B07QJP9TGP'),
      ('f1a1d140-7a5f-4c34-a001-000000000002'::UUID, 'heritage-field', 'amazon', 'https://www.amazon.com/s?k=Hamilton+Khaki+Field+Mechanical+H69439931'),
      ('f1a1d140-7a5f-4c34-a001-000000000003'::UUID, 'sterling-dress', 'amazon', 'https://www.amazon.com/dp/B079KV9MHS'),
      ('f1a1d140-7a5f-4c34-a001-000000000004'::UUID, 'retro-digital', 'amazon', 'https://www.amazon.com/dp/B000LAKYW8'),
      ('f1a1d140-7a5f-4c34-a001-000000000005'::UUID, 'circuit-chrono', 'amazon', 'https://www.amazon.com/s?k=Seiko+SSB399P1'),
      ('f1a1d140-7a5f-4c34-a001-000000000006'::UUID, 'aria-minimalist', 'amazon', 'https://www.amazon.com/s?k=Skagen+Signatur+Lille'),
      ('f1a1d140-7a5f-4c34-a001-000000000007'::UUID, 'casio-duro-walmart', 'sovrn', 'https://sovrn.co/1m9tdvu')
  ) AS l(id, slug, network, url)
  JOIN products p
    ON p.site_id = watch_tools_id
   AND (p.slug = l.slug OR lower(trim(p.name)) = lower(trim(
     CASE l.slug
       WHEN 'navigator-automatic' THEN 'Kamasu'
       WHEN 'heritage-field' THEN 'Khaki Field Mechanical'
       WHEN 'sterling-dress' THEN 'Fairfield 37mm'
       WHEN 'retro-digital' THEN 'A168WA-1'
       WHEN 'circuit-chrono' THEN 'SSB399P1'
       WHEN 'aria-minimalist' THEN 'Signatur Lille'
       ELSE 'Men''s Black Dive Style Sport Watch MDV106-1AV'
     END
   )))
  WHERE NOT EXISTS (
    SELECT 1
    FROM product_affiliate_links existing
    WHERE existing.product_id = p.id
      AND existing.geo = '*'
  );
END;
$$;
