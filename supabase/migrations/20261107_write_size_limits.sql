begin;

alter table public.chat_sessions
  add constraint chat_sessions_size_check check (
    pg_column_size(messages) <= 2000000
    and char_length(id) <= 100
    and coalesce(char_length(title), 0) <= 300
    and coalesce(char_length(model), 0) <= 50
    and coalesce(char_length(user_name), 0) <= 120
  );

alter table public.usage_logs
  add constraint usage_logs_size_check check (
    coalesce(char_length(user_name), 0) <= 80
    and coalesce(char_length(user_nik), 0) <= 100
    and coalesce(char_length(session_id), 0) <= 100
    and coalesce(char_length(request_id), 0) <= 100
    and coalesce(char_length(model), 0) <= 50
    and coalesce(char_length(route), 0) <= 50
    and coalesce(char_length(model_ai), 0) <= 80
    and coalesce(char_length(confidence), 0) <= 20
    and coalesce(char_length(fallback_to), 0) <= 80
    and coalesce(char_length(fallback_sebab), 0) <= 40
    and coalesce(cardinality(tools_used), 0) <= 20
  ),
  add constraint usage_logs_range_check check (
    coalesce(cost_idr, 0) between 0 and 1000000
    and coalesce(cost_usd, 0) between 0 and 100
    and coalesce(input_tokens, 0) between 0 and 2000000
    and coalesce(output_tokens, 0) between 0 and 200000
    and coalesce(total_tokens, 0) between 0 and 2200000
    and coalesce(llm_calls, 0) between 0 and 100
    and coalesce(ttft_ms, 0) between 0 and 600000
    and coalesce(total_ms, 0) between 0 and 600000
  );

alter table public.bookmarks
  add constraint bookmarks_size_check check (
    char_length(message_id) <= 100
    and coalesce(char_length(model), 0) <= 50
    and coalesce(char_length(question), 0) <= 10000
    and coalesce(char_length(answer), 0) <= 100000
  );

alter table public.message_feedback
  add constraint message_feedback_size_check check (
    char_length(message_id) <= 100
    and coalesce(char_length(model), 0) <= 50
    and coalesce(char_length(question), 0) <= 10000
    and coalesce(char_length(answer), 0) <= 100000
  );

alter table public.live_sessions
  add constraint live_sessions_range_check check (
    coalesce(cost_idr, 0) between 0 and 1000000
    and coalesce(duration_ms, 0) <= 3600000
    and coalesce(tools, 0) <= 100
    and coalesce(billed_turns, 0) between 0 and 10000
    and coalesce(char_length(user_nik), 0) <= 100
  );

commit;

select conrelid::regclass as tabel, conname as batas
from pg_constraint
where connamespace = 'public'::regnamespace and conname like '%\_check' escape '\' and conname ~ '(size|range)_check$'
order by 1, 2;
