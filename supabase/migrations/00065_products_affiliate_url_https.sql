ALTER TABLE products
  ADD CONSTRAINT products_affiliate_url_https
  CHECK (affiliate_url IS NULL OR affiliate_url ~* '^https://');
