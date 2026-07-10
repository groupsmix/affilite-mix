-- 2026071001: Backfill product links for the 4 published WristNerd articles
-- that currently trigger the "published content with no linked products" alert.
--
-- These rows only insert when the referenced content and product rows exist
-- and belong to the same site, so the migration is safe to run in any
-- environment (including CI throwaway databases that lack seed content).
-- ON CONFLICT DO NOTHING makes it idempotent.

INSERT INTO content_products (content_id, product_id, role)
SELECT l.content_id, l.product_id, l.role
FROM (
  VALUES
    -- Tissot PRX vs Seiko Presage (comparison)
    ('f7f154dc-98a3-4909-9a90-e53065992acb'::UUID, 'aca50da8-f54c-47d6-8831-607c3fe29090'::UUID, 'vs-left'),   -- Tissot PRX
    ('f7f154dc-98a3-4909-9a90-e53065992acb'::UUID, '3c365690-3d7d-45bb-b9f0-e1001ecf9d21'::UUID, 'vs-right'),  -- Seiko Presage SRPD37

    -- Best Watches Under $500 (guide)
    ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '786978c3-199b-44a8-8f01-6448d40fcf0a'::UUID, 'hero'),       -- Citizen Eco-Drive Promaster
    ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '532a190e-eaec-4d1b-be98-bbf3281e6283'::UUID, 'featured'),    -- Seiko SKX007
    ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '745689c5-7fff-4c46-a4c3-97b7215bc6c2'::UUID, 'featured'),    -- Hamilton Khaki Field Mechanical
    ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '21629106-7f9f-4465-b9e6-babd610d505a'::UUID, 'featured'),    -- Timex Weekender

    -- Seiko Presage SRPD37 Review (review)
    ('fc5bcd6c-3103-4e01-b9a2-e7157b4fcb99'::UUID, '3c365690-3d7d-45bb-b9f0-e1001ecf9d21'::UUID, 'hero'),       -- Seiko Presage SRPD37

    -- Best Father's Day Watch Gifts (guide)
    ('ce09c810-4608-43c5-a718-df196e0026d6'::UUID, '9ff31b51-17d5-4bd2-8e2e-89fc68e73d76'::UUID, 'hero'),        -- Orient Bambino V2
    ('ce09c810-4608-43c5-a718-df196e0026d6'::UUID, 'aca50da8-f54c-47d6-8831-607c3fe29090'::UUID, 'featured'),    -- Tissot PRX
    ('ce09c810-4608-43c5-a718-df196e0026d6'::UUID, '2cb61940-955f-433f-a994-53bab260c585'::UUID, 'featured')     -- Casio G-Shock GA-2100
) AS l(content_id, product_id, role)
JOIN content c ON c.id = l.content_id
JOIN products p ON p.id = l.product_id AND p.site_id = c.site_id
ON CONFLICT (content_id, product_id) DO NOTHING;
