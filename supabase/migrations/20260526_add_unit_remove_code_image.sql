-- Add unit column to products
ALTER TABLE public.products ADD COLUMN unit TEXT DEFAULT 'pcs';

-- Drop image_url and code columns
ALTER TABLE public.products DROP COLUMN image_url;
ALTER TABLE public.products DROP COLUMN code;
