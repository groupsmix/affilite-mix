-- Scoped policies directly instead of FOR ALL USING (true)
CREATE POLICY "Select specific rows" ON table_name FOR SELECT USING (user_id = auth.uid());
