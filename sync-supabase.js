window.BL_SCHEMA_SQL = `-- Bubble Letters sync tables (Supabase / Postgres)
create table if not exists bl_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  auth_hash text not null,
  name text not null,
  schema jsonb not null,
  title_field text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bl_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  auth_hash text not null,
  group_id uuid not null references bl_groups(id) on delete cascade,
  data jsonb not null,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bl_groups enable row level security;
alter table bl_entries enable row level security;

drop policy if exists "bl_groups_all" on bl_groups;
create policy "bl_groups_all" on bl_groups for all using (true) with check (true);

drop policy if exists "bl_entries_all" on bl_entries;
create policy "bl_entries_all" on bl_entries for all using (true) with check (true);
`;

window.BLSync = (()=> {
  let client=null;

  function loadScript(src){
    return new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src=src;
      s.onload=res;
      s.onerror=()=>rej(new Error("加载脚本失败："+src));
      document.head.appendChild(s);
    });
  }

  async function ensure(cfg){
    if(!cfg?.url || !cfg?.anon) throw new Error("缺少 Supabase URL 或 anon key");
    if(!window.supabase) await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    client=window.supabase.createClient(cfg.url,cfg.anon);
    return client;
  }

  function authHash(cfg){
    let h=2166136261;
    const s=(cfg.workspaceId||"")+"::"+(cfg.secret||"");
    for(let i=0;i<s.length;i++){
      h^=s.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return (h>>>0).toString(16);
  }

  async function test(cfg){
    const sb=await ensure(cfg);
    const {error}=await sb.from("bl_groups").select("id").limit(1);
    if(error) throw error;
    return true;
  }

  async function pushAll(cfg,state){
    const sb=await ensure(cfg);
    const ws=cfg.workspaceId||"";
    const ah=authHash(cfg);
    if(!ws) throw new Error("请填写工作区 ID");

    for(const g of state.groups){
      const payload={
        id:g.id,
        workspace_id:ws,
        auth_hash:ah,
        name:g.name,
        schema:g.schema,
        title_field:g.titleField||"",
        updated_at:new Date(g.updatedAt||g.createdAt||Date.now()).toISOString()
      };
      const {error}=await sb.from("bl_groups").upsert(payload,{onConflict:"id"});
      if(error) throw error;
    }

    for(const e of state.entries){
      const payload={
        id:e.id,
        workspace_id:ws,
        auth_hash:ah,
        group_id:e.groupId,
        data:e.data||{},
        exported_at:e.exportedAt||null,
        updated_at:new Date(e.updatedAt||e.createdAt||Date.now()).toISOString()
      };
      const {error}=await sb.from("bl_entries").upsert(payload,{onConflict:"id"});
      if(error) throw error;
    }
    return true;
  }

  async function pullAll(cfg){
    const sb=await ensure(cfg);
    const ws=cfg.workspaceId||"";
    const ah=authHash(cfg);
    if(!ws) throw new Error("请填写工作区 ID");

    const gr=await sb
      .from("bl_groups")
      .select("id,name,schema,title_field,created_at,updated_at")
      .eq("workspace_id",ws)
      .eq("auth_hash",ah)
      .order("updated_at",{ascending:false});
    if(gr.error) throw gr.error;

    const er=await sb
      .from("bl_entries")
      .select("id,group_id,data,exported_at,created_at,updated_at")
      .eq("workspace_id",ws)
      .eq("auth_hash",ah)
      .order("updated_at",{ascending:false});
    if(er.error) throw er.error;

    return {
      groups:(gr.data||[]).map(g=>({
        id:g.id,
        name:g.name,
        schema:g.schema,
        titleField:g.title_field,
        createdAt:g.created_at,
        updatedAt:g.updated_at
      })),
      entries:(er.data||[]).map(e=>({
        id:e.id,
        groupId:e.group_id,
        data:e.data,
        exportedAt:e.exported_at,
        createdAt:e.created_at,
        updatedAt:e.updated_at
      }))
    };
  }

  return {test,pushAll,pullAll};
})();
