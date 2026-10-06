-- Run once in the Supabase SQL editor as the project owner.
create table public.cyber_event(id int primary key check(id=1), status text not null default 'waiting', registration boolean not null default true, clock double precision not null default 0, active_since timestamptz, settings jsonb not null);
insert into public.cyber_event(id,settings) values(1,'{"date":"October 7","time":"10:00 AM – 11:00 AM","venue":"Lab 9","department":"CC","type":"Individual","fee":25,"first":1000,"second":500,"durations":[60,60,60],"prompts":["Beyond the screen lies a world of possibilities. Every keystroke is a step forward, every challenge a chance to grow. Stay focused, find your rhythm, and let your fingers do the talking. The future belongs to those who dare to build it.","find /home/user -name \"*.log\" | sort && echo \"system_ready\"","a3f09c2e7b14d8650fca93e21b7d08465cfa19e28b073d54a2c86f091ebd3476"],"multipliers":[1,1.25,1.5,2,3],"points":10,"speedWeight":5,"penalties":[100,250]}');
create table public.cyber_admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.cyber_runs(id uuid primary key references auth.users(id) on delete cascade, state jsonb not null);
create table public.cyber_board(id uuid primary key references auth.users(id) on delete cascade, alias text not null, score int not null, round int not null,status text not null,wpm numeric not null,accuracy numeric not null);
create table public.cyber_audit(id bigint generated always as identity primary key,actor uuid references auth.users(id),action text not null,details jsonb,created_at timestamptz not null default now());
create function public.cyber_is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.cyber_admins where user_id=auth.uid())$$;
alter table public.cyber_event enable row level security;
alter table public.cyber_admins enable row level security;
alter table public.cyber_runs enable row level security;
alter table public.cyber_board enable row level security;
alter table public.cyber_audit enable row level security;
create policy event_read on public.cyber_event for select using(true);
create policy board_read on public.cyber_board for select using(true);
create policy run_read on public.cyber_runs for select to authenticated using(id=auth.uid() or public.cyber_is_admin());
create policy admin_read on public.cyber_admins for select to authenticated using(user_id=auth.uid());
create policy audit_read on public.cyber_audit for select to authenticated using(public.cyber_is_admin());
revoke all on public.cyber_event,public.cyber_admins,public.cyber_runs,public.cyber_board,public.cyber_audit from anon,authenticated;
grant select on public.cyber_event,public.cyber_board to anon,authenticated;
grant select on public.cyber_runs,public.cyber_admins,public.cyber_audit to authenticated;

-- Pure scoring engine. Clients cannot write any table or call this helper.
create function public.cyber_advance(r jsonb,s jsonb,t double precision,chars jsonb default '[]',batch int default 0) returns jsonb language plpgsql set search_path='' as $$
declare n int:=(r->>'round')::int; c jsonb; cards jsonb:=r->'cards'; p int; attempts int; errors int; combo int; best int; earned numeric; penalty numeric; elapsed numeric; mult numeric; accuracy numeric; wpm numeric; score int; st text; ch text; prompt text; duration numeric; idx int;
begin
 if r->>'status' in ('complete','ended') or coalesce((r->>'blocked')::boolean,false) then return r; end if;
 if r->>'status'='ready' then
  if t<(r->>'ready')::double precision then return r;end if;
  c:=jsonb_build_object('round',n,'pos',0,'attempts',0,'errors',0,'combo',0,'best',0,'earned',0,'penalty',0,'score',0,'wpm',0,'accuracy',100,'elapsed',0,'status','active','started',(r->>'ready')::double precision,'seq',0,'multiplier',1);
  cards:=cards||jsonb_build_array(c);r:=r||'{"status":"active"}';
 end if;
 c:=cards->(n-1);p:=(c->>'pos')::int;attempts:=(c->>'attempts')::int;errors:=(c->>'errors')::int;combo:=(c->>'combo')::int;best:=(c->>'best')::int;earned:=(c->>'earned')::numeric;penalty:=(c->>'penalty')::numeric;mult:=(c->>'multiplier')::numeric;st:=c->>'status';
 duration:=(s->'durations'->>(n-1))::numeric;prompt:=s->'prompts'->>(n-1);elapsed:=least(duration,greatest(0,t-(c->>'started')::double precision));
 if elapsed<duration and batch=(c->>'seq')::int+1 and jsonb_array_length(chars)>0 then
  for ch in select jsonb_array_elements_text(chars) loop
   exit when st<>'active';
   if length(ch)<>1 then raise exception 'Each keystroke must contain one character';end if;
   attempts:=attempts+1;
   if ch=substr(prompt,p+1,1) then
    p:=p+1;combo:=combo+1;best:=greatest(best,combo);idx:=case when combo>=100 then 4 when combo>=50 then 3 when combo>=25 then 2 when combo>=10 then 1 else 0 end;
    mult:=case when n=1 then 1 else (s->'multipliers'->>idx)::numeric end;earned:=earned+(s->>'points')::numeric*mult;
   else
    errors:=errors+1;combo:=0;mult:=1;
    if n=3 then penalty:=penalty+coalesce((s->'penalties'->>(errors-1))::numeric,0);if errors>=3 then st:='eliminated';end if;end if;
   end if;
   if p=length(prompt) then st:='completed';end if;
  end loop;
  c:=c||jsonb_build_object('seq',batch);
 end if;
 accuracy:=case when attempts=0 then 100 else round(p::numeric/attempts*100,2) end;
 wpm:=round(p::numeric/5/greatest(elapsed,1)*60,2);score:=greatest(0,round((earned+(s->>'speedWeight')::numeric*wpm)*accuracy/100-penalty));
 if elapsed>=duration and st='active' then st:='timeout';end if;
 c:=c||jsonb_build_object('pos',p,'attempts',attempts,'errors',errors,'combo',combo,'best',best,'earned',earned,'penalty',penalty,'score',score,'wpm',wpm,'accuracy',accuracy,'elapsed',elapsed,'status',st,'multiplier',mult);
 cards:=jsonb_set(cards,array[(n-1)::text],c);r:=r||jsonb_build_object('cards',cards);
 if st<>'active' then if n=3 then r:=r||'{"status":"complete"}';else r:=r||jsonb_build_object('round',n+1,'status','ready','ready',t+4);end if;end if;
 return r;
end$$;
revoke all on function public.cyber_advance(jsonb,jsonb,double precision,jsonb,int) from public;

create function public.cyber_publish(uid uuid,r jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c jsonb:=r->'cards'->-1;total int;
begin
 select coalesce(sum((x->>'score')::int),0) into total from jsonb_array_elements(r->'cards') x;
 insert into public.cyber_board values(uid,r->>'alias',total,(r->>'round')::int,case when coalesce((r->>'blocked')::boolean,false) then 'blocked' else r->>'status' end,coalesce((c->>'wpm')::numeric,0),coalesce((c->>'accuracy')::numeric,100))
 on conflict(id) do update set score=excluded.score,round=excluded.round,status=excluded.status,wpm=excluded.wpm,accuracy=excluded.accuracy,alias=excluded.alias;
end$$;
revoke all on function public.cyber_publish(uuid,jsonb) from public;

create function public.cyber_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.cyber_event%rowtype;uid uuid:=auth.uid();adm boolean:=public.cyber_is_admin();t double precision;r jsonb;rec record;cmd text;cfg jsonb;k text;v numeric;boards jsonb;participants jsonb;logs jsonb;
begin
 select * into e from public.cyber_event where id=1 for update;
 t:=e.clock+case when e.status='running' then extract(epoch from clock_timestamp()-e.active_since) else 0 end;
 if action not in ('snapshot','join','tick','admin') then raise exception 'Invalid action';end if;
 if action<>'snapshot' and uid is null then raise exception 'Authentication required';end if;
 -- Settle running timers even when a participant disconnects. Calls are serialized.
 if e.status='running' then
  for rec in select * from public.cyber_runs where state->>'status' not in ('complete','ended') loop
   r:=public.cyber_advance(rec.state,e.settings,t);
   if r<>rec.state then update public.cyber_runs set state=r where id=rec.id;perform public.cyber_publish(rec.id,r);end if;
  end loop;
 end if;
 if action='join' then
  if not e.registration or e.status='ended' then raise exception 'Registration is closed';end if;
  if coalesce(length(trim(payload->>'alias')),0) not between 2 and 30 then raise exception 'Choose a public alias of 2–30 characters';end if;
  r:=jsonb_build_object('id',uid,'alias',trim(payload->>'alias'),'round',1,'cards','[]'::jsonb,'status','ready','ready',t+4,'last_seen',now(),'blocked',false);
  insert into public.cyber_runs values(uid,r) on conflict(id) do nothing;
  select state into r from public.cyber_runs where id=uid;perform public.cyber_publish(uid,r);
 elsif action='tick' then
  select state into r from public.cyber_runs where id=uid;
  if r is null then raise exception 'Join the event first';end if;
  if jsonb_typeof(coalesce(payload->'chars','[]'))<>'array' or jsonb_array_length(coalesce(payload->'chars','[]'))>50 then raise exception 'Invalid input batch';end if;
  if e.status='running' and (payload->>'round')::int=(r->>'round')::int then r:=public.cyber_advance(r,e.settings,t,coalesce(payload->'chars','[]'),coalesce((payload->>'seq')::int,0));end if;
  r:=r||jsonb_build_object('last_seen',now());update public.cyber_runs set state=r where id=uid;perform public.cyber_publish(uid,r);
 elsif action='admin' then
  if not adm then raise exception 'Admin access required';end if;
  cmd:=payload->>'command';
  if cmd in ('end','reset') and (payload->>'confirm') is distinct from 'CONFIRM' then raise exception 'Confirmation required';end if;
  if cmd='registration' then update public.cyber_event set registration=(payload->>'open')::boolean where id=1;
  elsif cmd='start' then
   if e.status not in ('waiting','paused') then raise exception 'Event cannot be started';end if;
   update public.cyber_event set status='running',active_since=clock_timestamp() where id=1;
  elsif cmd='pause' then
   if e.status<>'running' then raise exception 'Event is not running';end if;
   update public.cyber_event set status='paused',clock=t,active_since=null where id=1;
  elsif cmd='end' then
   update public.cyber_event set status='ended',clock=t,active_since=null,registration=false where id=1;
   for rec in select * from public.cyber_runs where state->>'status'<>'complete' loop
    r:=rec.state||'{"status":"ended"}';
    if r->>'status'='ended' and jsonb_array_length(r->'cards')>0 then
     r:=jsonb_set(r,array['cards',(jsonb_array_length(r->'cards')-1)::text,'status'],to_jsonb(case when rec.state->>'status'='active' then 'ended' else rec.state->'cards'->-1->>'status' end));
    end if;
    update public.cyber_runs set state=r where id=rec.id;perform public.cyber_publish(rec.id,r);
   end loop;
  elsif cmd='reset' then
   delete from public.cyber_runs;delete from public.cyber_board;update public.cyber_event set status='waiting',clock=0,active_since=null,registration=true where id=1;
  elsif cmd='block' then
   update public.cyber_runs set state=state||jsonb_build_object('blocked',(payload->>'blocked')::boolean) where id=(payload->>'id')::uuid returning state into r;
   if r is null then raise exception 'Participant not found';end if;perform public.cyber_publish((payload->>'id')::uuid,r);
  elsif cmd='configure' then
   if e.status<>'waiting' or exists(select 1 from public.cyber_runs where jsonb_array_length(state->'cards')>0) then raise exception 'Settings lock after the event starts. Reset to reconfigure.';end if;
   cfg:=payload->'settings';
   if cfg is null or jsonb_typeof(cfg)<>'object' then raise exception 'Settings required';end if;
   foreach k in array array['durations','prompts','multipliers','penalties'] loop if jsonb_typeof(cfg->k) is distinct from 'array' then raise exception 'Missing array: %',k;end if;end loop;
   foreach k in array array['date','time','venue','department','type'] loop if coalesce(length(trim(cfg->>k)),0) not between 1 and 100 then raise exception 'Invalid event detail: %',k;end if;end loop;
   foreach k in array array['fee','first','second','points','speedWeight'] loop v:=(cfg->>k)::numeric;if v is null or v<0 or v>100000 then raise exception 'Invalid setting: %',k;end if;end loop;
   if jsonb_array_length(cfg->'durations')<>3 or jsonb_array_length(cfg->'prompts')<>3 or jsonb_array_length(cfg->'multipliers')<>5 or jsonb_array_length(cfg->'penalties')<>2 then raise exception 'Invalid round configuration';end if;
   for rec in select value from jsonb_array_elements_text(cfg->'durations') loop if rec.value is null or rec.value::numeric not between 5 and 600 then raise exception 'Durations must be 5–600 seconds';end if;end loop;
   for rec in select value from jsonb_array_elements_text(cfg->'prompts') loop if rec.value is null or length(rec.value) not between 10 and 2000 or rec.value ~ '[^ -~]' then raise exception 'Prompts must be 10–2000 printable ASCII characters';end if;end loop;
   if cfg->'prompts'->>2 !~ '^[a-fA-F0-9]+$' then raise exception 'Hash prompt must be hexadecimal';end if;
   for rec in select value from jsonb_array_elements_text(cfg->'multipliers') loop if rec.value is null or rec.value::numeric not between 1 and 10 then raise exception 'Multipliers must be 1–10';end if;end loop;
   if cfg->'penalties'->>0 is null or cfg->'penalties'->>1 is null or (cfg->'penalties'->>0)::numeric<0 or (cfg->'penalties'->>1)::numeric<=(cfg->'penalties'->>0)::numeric or (cfg->'penalties'->>1)::numeric>100000 then raise exception 'Second penalty must exceed first';end if;
   if (cfg->'multipliers'->>0)::numeric<>1 or (cfg->'multipliers'->>1)::numeric<=(cfg->'multipliers'->>0)::numeric or (cfg->'multipliers'->>2)::numeric<=(cfg->'multipliers'->>1)::numeric or (cfg->'multipliers'->>3)::numeric<=(cfg->'multipliers'->>2)::numeric or (cfg->'multipliers'->>4)::numeric<=(cfg->'multipliers'->>3)::numeric then raise exception 'Multipliers must start at 1 and increase at each milestone';end if;
   update public.cyber_event set settings=cfg where id=1;
  else raise exception 'Unknown admin command';end if;
  insert into public.cyber_audit(actor,action,details) values(uid,cmd,payload);
 end if;
 select * into e from public.cyber_event where id=1;
 select state into r from public.cyber_runs where id=uid;
 select coalesce(jsonb_agg(to_jsonb(b) order by b.score desc,b.id),'[]') into boards from public.cyber_board b;
 if adm then
  select coalesce(jsonb_agg(state),'[]') into participants from public.cyber_runs;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into logs from(select log.action,log.created_at from public.cyber_audit log order by log.id desc limit 30)a;
 end if;
 return jsonb_build_object('event',jsonb_build_object('status',e.status,'registration',e.registration,'clock',e.clock+case when e.status='running' then extract(epoch from clock_timestamp()-e.active_since) else 0 end,'settings',e.settings),'run',r,'leaderboard',boards,'admin',adm,'participants',participants,'audit',logs);
end$$;
revoke all on function public.cyber_api(text,jsonb) from public;
grant execute on function public.cyber_api(text,jsonb) to anon,authenticated;
revoke all on function public.cyber_is_admin() from public;
grant execute on function public.cyber_is_admin() to anon,authenticated;
alter publication supabase_realtime add table public.cyber_board,public.cyber_event;
