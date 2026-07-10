-- Rollback: 2026071001_link_wristnerd_content_products
--
-- Removes the product links that were backfilled for the four published
-- WristNerd articles. Safe to run only when these links were created by the
-- up-migration and no other code has started depending on them.
DELETE FROM content_products
WHERE (content_id, product_id) IN (
  ('f7f154dc-98a3-4909-9a90-e53065992acb'::UUID, 'aca50da8-f54c-47d6-8831-607c3fe29090'::UUID),
  ('f7f154dc-98a3-4909-9a90-e53065992acb'::UUID, '3c365690-3d7d-45bb-b9f0-e1001ecf9d21'::UUID),
  ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '786978c3-199b-44a8-8f01-6448d40fcf0a'::UUID),
  ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '532a190e-eaec-4d1b-be98-bbf3281e6283'::UUID),
  ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '745689c5-7fff-4c46-a4c3-97b7215bc6c2'::UUID),
  ('b6784c04-06f4-4e4b-b43e-753866672d3a'::UUID, '21629106-7f9f-4465-b9e6-babd610d505a'::UUID),
  ('fc5bcd6c-3103-4e01-b9a2-e7157b4fcb99'::UUID, '3c365690-3d7d-45bb-b9f0-e1001ecf9d21'::UUID),
  ('ce09c810-4608-43c5-a718-df196e0026d6'::UUID, '9ff31b51-17d5-4bd2-8e2e-89fc68e73d76'::UUID),
  ('ce09c810-4608-43c5-a718-df196e0026d6'::UUID, 'aca50da8-f54c-47d6-8831-607c3fe29090'::UUID),
  ('ce09c810-4608-43c5-a718-df196e0026d6'::UUID, '2cb61940-955f-433f-a994-53bab260c585'::UUID)
);
