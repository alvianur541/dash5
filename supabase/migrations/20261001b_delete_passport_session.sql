-- Permanently removes the 20 Sep 2026 session in which a passport photo was sent and the answer transcribed
-- its personal data. The technician had already deleted it in the app (soft delete), so the row still held
-- the photo thumbnail and the transcription. Only that session contained such data (bookmarks, feedback and
-- other sessions checked: none). The guard on content keeps this from touching anything else.
begin;

delete from public.chat_sessions
where id = 'edbe9e22-1964-42e6-8406-a5441105fc09'
  and messages::text ~* '(passport|paspor|pasport)';

commit;
