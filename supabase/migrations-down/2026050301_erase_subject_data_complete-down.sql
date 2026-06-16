-- Revert to prior signature (newsletter + membership only).
drop function if exists public.erase_subject_data(text, uuid, text);
