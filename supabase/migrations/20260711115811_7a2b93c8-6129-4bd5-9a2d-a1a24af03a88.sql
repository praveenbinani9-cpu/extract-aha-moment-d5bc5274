ALTER TABLE public.extractions
  ADD COLUMN IF NOT EXISTS provider_used text,
  ADD COLUMN IF NOT EXISTS meets_confidence_threshold boolean;