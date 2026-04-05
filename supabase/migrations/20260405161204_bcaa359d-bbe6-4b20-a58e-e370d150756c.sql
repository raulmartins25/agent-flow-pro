INSERT INTO storage.buckets (id, name, public) VALUES ('agent-media', 'agent-media', true);

CREATE POLICY "Public read agent-media" ON storage.objects FOR SELECT USING (bucket_id = 'agent-media');
CREATE POLICY "Authenticated upload agent-media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'agent-media');
CREATE POLICY "Authenticated delete agent-media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'agent-media');