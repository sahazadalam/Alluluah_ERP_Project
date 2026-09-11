/*
# Storage policies for quotation-documents bucket
Allows authenticated users to read, upload, and delete files in the quotation-documents bucket.
*/

-- Storage object policies for quotation-documents bucket
-- Allow authenticated users to read objects
CREATE POLICY "quotation_docs_read_objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quotation-documents');

-- Allow authenticated users to upload objects
CREATE POLICY "quotation_docs_upload_objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quotation-documents');

-- Allow authenticated users to update objects
CREATE POLICY "quotation_docs_update_objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'quotation-documents')
  WITH CHECK (bucket_id = 'quotation-documents');

-- Allow authenticated users to delete objects
CREATE POLICY "quotation_docs_delete_objects" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'quotation-documents');
