-- Rollback: remove the four seeded WristNerd blog posts.
DELETE FROM content
WHERE site_id = (SELECT id FROM sites WHERE slug = 'watch-tools')
  AND slug IN (
    'how-to-size-a-watch-for-your-wrist',
    'quartz-vs-automatic-which-movement',
    'vintage-watch-buying-checklist',
    'how-we-test-and-rank-watches'
  );
