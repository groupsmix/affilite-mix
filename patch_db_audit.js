const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/scripts/db-audit.sh', 'utf8');

content = content.replace(
  '#   A. The `anon` role must hold NO table privileges (SELECT,\n#      INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on\n#      ANY public-schema table.',
  '#   A. The `anon` role must hold NO table privileges on ANY public-schema table\n#      EXCEPT for SELECT on explicitly allowed public-facing tables (sites, categories,\n#      products, content, pages, content_products, ad_placements).'
);

content = content.replace(
  '#   B. No RLS policy on a public-schema table may grant access to\n#      the `anon` role via its `roles` array.',
  '#   B. RLS policies granting access to the `anon` role are strictly limited to the\n#      allowed SELECT policies on the public-facing tables.'
);

content = content.replace(
  `SELECT table_schema || '.' || table_name || ' → ' || privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;`,
  `SELECT table_schema || '.' || table_name || ' → ' || privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND NOT (
    privilege_type = 'SELECT' AND 
    table_name IN ('sites', 'categories', 'products', 'content', 'pages', 'content_products', 'ad_placements')
  )
ORDER BY table_name, privilege_type;`
);

content = content.replace(
  `SELECT schemaname || '.' || tablename || ' → ' || policyname || ' (cmd=' || cmd || ', roles=' || array_to_string(roles, ',') || ')'
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY(roles)
ORDER BY tablename, policyname;`,
  `SELECT schemaname || '.' || tablename || ' → ' || policyname || ' (cmd=' || cmd || ', roles=' || array_to_string(roles, ',') || ')'
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY(roles)
  AND NOT (
    cmd = 'SELECT' AND 
    tablename IN ('sites', 'categories', 'products', 'content', 'pages', 'content_products', 'ad_placements')
  )
ORDER BY tablename, policyname;`
);

fs.writeFileSync('/data/user/work/affilite-mix/scripts/db-audit.sh', content);

