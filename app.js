const LS_KEY="bl_local_v1",LS_SYNC="bl_sync_v1";
const uid=()=>crypto.randomUUID();
const nowISO=()=>new Date().toISOString();
const fmtDate=(d)=>{try{const t=new Date(d);return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;}catch{return ""}};
const clamp=(s,n=120)=>(s??"").toString().slice(0,n);

function presetSchema(name){
  if(name==="letter")return{
    fields:[
      {key:"no",label:"第x封信",type:"number",required:false},
      {key:"title",label:"标题",type:"text",required:false},
      {key:"intro",label:"简介",type:"text",required:false},
      {key:"content",label:"内容",type:"longtext",required:true},
      {key:"time",label:"时间",type:"date",required:false},
    ],
    titleField:"no"
  };
  if(name==="memory")return{
    fields:[
      {key:"title",label:"标题",type:"text",required:true},
      {key:"time",label:"时间",type:"date",required:true},
      {key:"intro",label:"简介",type:"text",required:false},
      {key:"content",label:"内容",type:"longtext",required:true},
    ],
    titleField:"title"
  };
  return{fields:[],titleField:""};
}

let state=(()=>{
  const raw=localStorage.getItem(LS_KEY);
  if(raw) try{
    const s=JSON.parse(raw);
    s.groups??=[];
    s.entries??=[];
    s.ui??={};
    return s;
  }catch{}
  return{version:1,groups:[],entries:[],ui:{}};
})();

let activeGroupId=state.ui.activeGroupId||null;
let activeEntryId=state.ui.activeEntryId||null;
let sortAsc=true;
let selectedPreset="letter";

const $=s=>document.querySelector(s);
const groupListEl=$("#groupList");
const bubbleListEl=$("#bubbleList");
const editorEl=$("#editor");
const emptyEditorEl=$("#emptyEditor");
const centerTitleEl=$("#centerTitle");
const sortByEl=$("#sortBy");
const btnToggleSort=$("#btnToggleSort");
const backdrop=$("#backdrop");

const modalGroup=$("#modalGroup");
const groupNameEl=$("#groupName");

const modalSchema=$("#modalSchema");
const schemaGroupNameEl=$("#schemaGroupName");
const schemaTitleFieldEl=$("#schemaTitleField");
const schemaTableEl=$("#schemaTable");

const modalExport=$("#modalExport");
const exportScopeEl=$("#exportScope");
const exportMarkEl=$("#exportMark");
const exportResultEl=$("#exportResult");

const exportTopLineEl = $("#exportTopLine");
const exportBottomLineEl = $("#exportBottomLine");
const exportLineCommaEl = $("#exportLineComma");
const exportEscapeModeEl = $("#exportEscapeMode");
const jsonBuilderEl = $("#jsonBuilder");

const modalEntry = $("#modalEntry");
const entryModalTitleEl = $("#entryModalTitle");
const entryModalHintEl = $("#entryModalHint");
const entryFormEl = $("#entryForm");
const btnEntrySave = $("#btnEntrySave");

const schemaSqlEl=$("#schemaSql");
schemaSqlEl.textContent=window.BL_SCHEMA_SQL||"（schema SQL 未加载）";

function saveState(){
  state.ui.activeGroupId=activeGroupId;
  state.ui.activeEntryId=activeEntryId;
  localStorage.setItem(LS_KEY,JSON.stringify(state));
}

function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function getGroup(){return state.groups.find(g=>g.id===activeGroupId)||null}
function getEntry(){return state.entries.find(e=>e.id===activeEntryId)||null}

function bigTitle(g,e){
  const key=g.titleField||g.schema.fields[0]?.key;
  const v=e.data?.[key];
  if(v==null||v===""){
    for(const k of ["title","no","time","intro"]){
      if(e.data?.[k]) return String(e.data[k]);
    }
    return "";
  }
  return String(v);
}

function sortVal(e,key,g){
  const auto=()=>{
    const no=Number(e.data?.no);
    if(!Number.isNaN(no)&&no>0) return no;
    const time=e.data?.time;
    if(time) return new Date(time).getTime()||0;
    return new Date(e.updatedAt||e.createdAt).getTime()||0;
  };
  if(key==="auto") return auto();
  const v=e.data?.[key];
  if(v==null||v==="") return auto();
  const f=g.schema.fields.find(x=>x.key===key);
  if(f?.type==="number") return Number(v)||0;
  if(f?.type==="date") return new Date(v).getTime()||0;
  return String(v);
}

function render(){
  renderGroups();
  renderSortFields();
  renderBubbles();
  renderEditor();
  saveState();
}

function renderGroups(){
  groupListEl.innerHTML="";
  if(state.groups.length===0){
    groupListEl.innerHTML=`<div class="hint">还没有泡泡组，点「＋新建组」</div>`;
    return;
  }
  for(const g of state.groups){
    const count=state.entries.filter(e=>e.groupId===g.id).length;
    const el=document.createElement("div");
    el.className="groupItem"+(g.id===activeGroupId?" active":"");
    el.innerHTML=`<div class="groupMeta">
      <div class="groupName">${esc(g.name)}</div>
      <div class="groupSub">${count} 个泡泡 · 大标题：${esc(g.titleField||"未设置")}</div>
    </div><div class="badge">›</div>`;
    el.onclick=()=>{activeGroupId=g.id;activeEntryId=null;render();};
    groupListEl.appendChild(el);
  }
}

function renderSortFields(){
  sortByEl.innerHTML=`<option value="auto">按：自动</option>`;
  const g=getGroup();
  if(!g) return;
  for(const f of g.schema.fields){
    if(["date","number","text"].includes(f.type)){
      const o=document.createElement("option");
      o.value=f.key;
      o.textContent=`按：${f.label}（${f.key}）`;
      sortByEl.appendChild(o);
    }
  }
}

function renderBubbles(){
  bubbleListEl.innerHTML="";
  const g=getGroup();
  if(!g){
    bubbleListEl.innerHTML=`<div class="hint">先选一个泡泡组</div>`;
    return;
  }
  const entries=state.entries.filter(e=>e.groupId===g.id).slice();
  const key=sortByEl.value;
  entries.sort((a,b)=>{
    const va=sortVal(a,key,g), vb=sortVal(b,key,g);
    return va<vb?(sortAsc?-1:1):va>vb?(sortAsc?1:-1):0;
  });

  for(const e of entries){
    const title=bigTitle(g,e);
    const exported=!!e.exportedAt;
    const el=document.createElement("div");
    el.className="bubble"+(e.id===activeEntryId?" active":"")+(exported?" exported":"");
    el.innerHTML=`<div class="row gap">
        <div class="checkbox ${e._selected?"checked":""}">${e._selected?"✓":""}</div>
        <div class="bubbleTitle" title="${esc(title)}">${esc(title||"（空）")}</div>
      </div>
      <div class="bubbleBadges">${exported?`<span class="badge exported">已导出</span>`:""}</div>`;
    el.querySelector(".checkbox").onclick=(ev)=>{
      ev.stopPropagation();
      e._selected=!e._selected;
      renderBubbles();
      saveState();
    };
    el.onclick=()=>{
      activeEntryId=e.id;
      saveState();
      openEntryModal("edit", e.id);
    };
    bubbleListEl.appendChild(el);
  }
}

function renderEditor(){
  const g=getGroup();
  if(!g){
    emptyEditorEl.hidden=false;
    centerTitleEl.textContent="编辑";
    editorEl.innerHTML="";
    editorEl.appendChild(emptyEditorEl);
    return;
  }
  emptyEditorEl.hidden=true;

  const e=activeEntryId?state.entries.find(x=>x.id===activeEntryId):null;
  centerTitleEl.textContent=e?`编辑 · ${clamp(bigTitle(g,e),24)}`:"编辑";
  editorEl.innerHTML="";
  if(!e){
    editorEl.innerHTML=`<div class="hint">点右侧泡泡进入编辑，或点「新建泡泡」。</div>`;
    return;
  }

  for(const f of g.schema.fields){
    const wrap=document.createElement("label");
    wrap.className="field";
    wrap.innerHTML=`<div class="label">${esc(f.label)} <span class="small">(${esc(f.key)} · ${esc(f.type)})</span></div>`;
    const v=(e.data?.[f.key]??"");
    let inp;
    if(f.type==="longtext"){
      inp=document.createElement("textarea");
      inp.className="textarea";
      inp.rows=8;
      inp.value=v;
    }else if(f.type==="date"){
      inp=document.createElement("input");
      inp.className="input";
      inp.type="date";
      inp.value=v?String(v).slice(0,10):"";
    }else if(f.type==="number"){
      inp=document.createElement("input");
      inp.className="input";
      inp.type="number";
      inp.value=v;
    }else{
      inp=document.createElement("input");
      inp.className="input";
      inp.type="text";
      inp.value=v;
    }
    inp.dataset.fieldKey=f.key;
    wrap.appendChild(inp);
    editorEl.appendChild(wrap);
  }
  const meta=document.createElement("div");
  meta.className="hint";
  meta.textContent=`创建：${fmtDate(e.createdAt)} · 更新：${fmtDate(e.updatedAt)}${e.exportedAt?" · 已导出":""}`;
  editorEl.appendChild(meta);
}

function openModal(id){
  backdrop.hidden=false;
  $("#"+id).hidden=false;
  if(id==="modalGroup"){
    selectedPreset="letter";
    document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
    document.querySelector('.chip[data-preset="letter"]').classList.add("active");
    groupNameEl.focus();
  }
  if(id==="modalExport"){
    exportResultEl.value="";
    buildExportBuilderUI();
  }
  if(id==="modalSync") fillSync();
}

function closeModal(id){
  $("#"+id).hidden=true;
  const all=[...document.querySelectorAll(".modal")];
  const anyOpen=all.some(m=>!m.hidden);
  if(!anyOpen) backdrop.hidden=true;
}

function closeAll(){
  document.querySelectorAll(".modal").forEach(m=>m.hidden=true);
  backdrop.hidden=true;
}


function renderEntryForm(g, e){
  entryFormEl.innerHTML="";
  for(const f of g.schema.fields){
    const wrap=document.createElement("label");
    wrap.className="field";
    wrap.innerHTML=`<div class="label">${esc(f.label)} <span class="small">(${esc(f.key)} · ${esc(f.type)})</span> ${f.required?'<span class="small">必填</span>':""}</div>`;
    const v=(e.data?.[f.key]??"");
    let inp;
    if(f.type==="longtext"){
      inp=document.createElement("textarea");
      inp.className="textarea";
      inp.rows=8;
      inp.value=v;
    }else if(f.type==="date"){
      inp=document.createElement("input");
      inp.className="input";
      inp.type="date";
      inp.value=v?String(v).slice(0,10):"";
    }else if(f.type==="number"){
      inp=document.createElement("input");
      inp.className="input";
      inp.type="number";
      inp.value=v;
    }else{
      inp=document.createElement("input");
      inp.className="input";
      inp.type="text";
      inp.value=v;
    }
    inp.dataset.fieldKey=f.key;
    wrap.appendChild(inp);
    entryFormEl.appendChild(wrap);
  }
}

function openEntryModal(mode, entryId=null){
  const g=getGroup();
  if(!g){ openModal("modalGroup"); return; }

  let e;
  if(mode==="edit"){
    e = state.entries.find(x=>x.id===entryId);
    if(!e) return;
    entryModalTitleEl.textContent="编辑泡泡";
    entryModalHintEl.textContent="修改后点保存，会更新当前泡泡。";
  }else{
    e = {id:uid(), groupId:g.id, data:{}, exportedAt:null, createdAt:nowISO(), updatedAt:nowISO(), _selected:false};
    // 预填一些值
    for(const f of g.schema.fields){
      if(f.type==="date" && !e.data[f.key]) e.data[f.key]=fmtDate(new Date());
      if(f.key==="no" && (e.data[f.key]==null||e.data[f.key]==="")){
        const maxNo=Math.max(0,...state.entries.filter(x=>x.groupId===g.id).map(x=>Number(x.data?.no)||0));
        e.data.no=String(maxNo+1);
      }
    }
    entryModalTitleEl.textContent="新建泡泡";
    entryModalHintEl.textContent="填写完成后保存，会出现在右侧泡泡列表。";
  }

  renderEntryForm(g,e);

  btnEntrySave.onclick=()=>{
    const inputs=[...entryFormEl.querySelectorAll("[data-field-key]")];
    const data={...e.data};
    inputs.forEach(inp=>data[inp.dataset.fieldKey]=inp.value??"");

    // 简单必填校验
    const missing=g.schema.fields.filter(f=>f.required && !(String(data[f.key]??"").trim()));
    if(missing.length){
      alert("还差必填： " + missing.map(x=>x.label).join("、"));
      return;
    }

    e.data=data;
    e.updatedAt=nowISO();

    if(mode==="edit"){
      const idx=state.entries.findIndex(x=>x.id===e.id);
      if(idx>=0) state.entries[idx]=e;
      activeEntryId=e.id;
    }else{
      state.entries.unshift(e);
      activeEntryId=e.id;
    }

    closeModal("modalEntry");
    render();
  };

  openModal("modalEntry");
}

document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
backdrop.onclick=closeAll;

$("#btnNewGroup").onclick=()=>openModal("modalGroup");
document.querySelectorAll(".chip").forEach(ch=>ch.onclick=()=>{
  selectedPreset=ch.dataset.preset;
  document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
  ch.classList.add("active");
});

$("#btnCreateGroup").onclick=()=>{
  const name=groupNameEl.value.trim()||"未命名泡泡组";
  const preset=presetSchema(selectedPreset);
  const g={
    id:uid(),
    name,
    schema:{fields:preset.fields},
    titleField:preset.titleField||preset.fields[0]?.key||"",
    createdAt:nowISO(),
    updatedAt:nowISO()
  };
  state.groups.unshift(g);
  activeGroupId=g.id;
  activeEntryId=null;
  groupNameEl.value="";
  closeModal("modalGroup");
  render();
};

$("#btnNewEntry").onclick=()=>{
  openEntryModal("new");
};

$("#btnSaveEntry").onclick=()=>{
  const e=getEntry();
  if(!e) return;
  const inputs=editorEl.querySelectorAll("[data-field-key]");
  const data={...e.data};
  inputs.forEach(inp=>data[inp.dataset.fieldKey]=inp.value??"");
  e.data=data;
  e.updatedAt=nowISO();
  render();
};

$("#btnDeleteEntry").onclick=()=>{
  const e=getEntry();
  if(!e) return;
  if(!confirm("确定要删除这个泡泡吗？")) return;
  state.entries=state.entries.filter(x=>x.id!==e.id);
  activeEntryId=null;
  render();
};

$("#btnEditSchema").onclick=()=>{
  const g=getGroup();
  if(!g) return;

  schemaGroupNameEl.value=g.name;
  schemaTitleFieldEl.innerHTML="";
  g.schema.fields.forEach(f=>{
    const o=document.createElement("option");
    o.value=f.key;
    o.textContent=`${f.label}（${f.key}）`;
    schemaTitleFieldEl.appendChild(o);
  });
  schemaTitleFieldEl.value=g.titleField||"";
  renderSchemaTable(g);
  openModal("modalSchema");
};

$("#btnAddField").onclick=()=>{
  const g=getGroup();
  if(!g) return;
  g.schema.fields.push({key:`field_${g.schema.fields.length+1}`,label:"新字段",type:"text",required:false});
  renderSchemaTable(g);
};

$("#btnSaveSchema").onclick=()=>{
  const g=getGroup();
  if(!g) return;
  g.name=schemaGroupNameEl.value.trim()||g.name;
  g.titleField=schemaTitleFieldEl.value||g.titleField;
  g.updatedAt=nowISO();
  closeModal("modalSchema");
  render();
};

function renderSchemaTable(g){
  schemaTableEl.innerHTML="";
  g.schema.fields.forEach((f,idx)=>{
    const row=document.createElement("div");
    row.className="tableRow";
    row.innerHTML=`<div class="tableRowTop">
        <span class="badge">#${idx+1}</span>
        <span class="badge">${esc(f.type)}</span>
        <span class="badge">${f.required?"必填":"可选"}</span>
      </div>
      <div class="tableRowBottom">
        <label class="field"><div class="label">key</div><input class="input" value="${esc(f.key)}" data-k="key" data-i="${idx}"/></label>
        <label class="field"><div class="label">label</div><input class="input" value="${esc(f.label)}" data-k="label" data-i="${idx}"/></label>
        <label class="field"><div class="label">type</div>
          <select class="select" data-k="type" data-i="${idx}">
            ${["text","longtext","date","number"].map(t=>`<option value="${t}" ${t===f.type?"selected":""}>${t}</option>`).join("")}
          </select>
        </label>
        <div class="row gap">
          <button class="smallBtn" data-act="toggle" data-i="${idx}">${f.required?"设为可选":"设为必填"}</button>
          <button class="smallBtn" data-act="up" data-i="${idx}">上移</button>
          <button class="smallBtn" data-act="down" data-i="${idx}">下移</button>
          <button class="smallBtn" data-act="del" data-i="${idx}">删除</button>
        </div>
      </div>`;
    row.querySelectorAll("[data-k]").forEach(inp=>inp.oninput=()=>{
      const i=Number(inp.dataset.i);
      const k=inp.dataset.k;
      g.schema.fields[i][k]=inp.value;

      schemaTitleFieldEl.innerHTML="";
      g.schema.fields.forEach(ff=>{
        const o=document.createElement("option");
        o.value=ff.key;
        o.textContent=`${ff.label}（${ff.key}）`;
        schemaTitleFieldEl.appendChild(o);
      });
      if(!g.schema.fields.some(x=>x.key===g.titleField)) g.titleField=g.schema.fields[0]?.key||"";
      schemaTitleFieldEl.value=g.titleField||"";
    });

    row.querySelectorAll("[data-act]").forEach(btn=>btn.onclick=()=>{
      const i=Number(btn.dataset.i);
      const act=btn.dataset.act;
      if(act==="toggle"){g.schema.fields[i].required=!g.schema.fields[i].required;renderSchemaTable(g);}
      if(act==="up" && i>0){[g.schema.fields[i-1],g.schema.fields[i]]=[g.schema.fields[i],g.schema.fields[i-1]];renderSchemaTable(g);}
      if(act==="down" && i<g.schema.fields.length-1){[g.schema.fields[i+1],g.schema.fields[i]]=[g.schema.fields[i],g.schema.fields[i+1]];renderSchemaTable(g);}
      if(act==="del"){g.schema.fields.splice(i,1);renderSchemaTable(g);}
    });

    schemaTableEl.appendChild(row);
  });
}

// ===== Export visual builder + order arrows =====
function exportCfgKey(groupId){ return `bl_export_builder_${groupId}`; }
function loadExportCfg(groupId){ try{ return JSON.parse(localStorage.getItem(exportCfgKey(groupId))||"{}"); }catch{ return {}; } }
function saveExportCfg(groupId,cfg){ localStorage.setItem(exportCfgKey(groupId), JSON.stringify(cfg)); }

function jsonEscapeValue(v){
  const s = JSON.stringify(String(v ?? ""));
  return s.slice(1,-1);
}

function normalizeOrder(cfg, g){
  cfg.fields ||= {};
  cfg.order ||= [];
  const keys = g.schema.fields.map(f=>f.key);

  // remove unknown
  cfg.order = cfg.order.filter(k=>keys.includes(k));
  // append missing
  keys.forEach(k=>{ if(!cfg.order.includes(k)) cfg.order.push(k); });

  // ensure per-field default config
  keys.forEach(k=>{
    cfg.fields[k] ||= {};
    if(cfg.fields[k].on === undefined) cfg.fields[k].on = true;
    if(cfg.fields[k].left === undefined) cfg.fields[k].left = `"${k}":"`;
    if(cfg.fields[k].right === undefined) cfg.fields[k].right = `"`;
  });
  return cfg;
}

function buildExportBuilderUI(){
  const g=getGroup();
  if(!g) return;

  let cfg=loadExportCfg(g.id);
  cfg=normalizeOrder(cfg,g);

  exportTopLineEl.value = cfg.topLine ?? (exportTopLineEl.value || "xxxx：{");
  exportBottomLineEl.value = cfg.bottomLine ?? (exportBottomLineEl.value || "},");
  exportLineCommaEl.value = cfg.lineComma ?? (exportLineCommaEl.value || "");
  exportEscapeModeEl.value = cfg.escapeMode ?? (exportEscapeModeEl.value || "json");

  jsonBuilderEl.innerHTML = "";

  const keyToField = Object.fromEntries(g.schema.fields.map(f=>[f.key,f]));

  cfg.order.forEach((k, idx)=>{
    const f = keyToField[k];
    if(!f) return;

    const on = (cfg.fields[k]?.on ?? true);
    const left = (cfg.fields[k]?.left ?? `"${k}":"`);
    const right = (cfg.fields[k]?.right ?? `"`);

    const row=document.createElement("div");
    row.className="jsonRow";
    row.innerHTML = `
      <div class="arrowBox">
        <button class="arrowBtn" data-up="${esc(k)}">↑</button>
        <button class="arrowBtn" data-down="${esc(k)}">↓</button>
      </div>
      <div class="tick ${on?"on":""}" data-tick="${esc(k)}">${on?"✓":""}</div>
      <input class="mini" data-left="${esc(k)}" value="${esc(left)}" />
      <div class="midPreview">
        <div><b>${esc(f.label)}</b>（key: ${esc(k)}）</div>
        <div>这里仅示意，不显示泡泡真实文本</div>
      </div>
      <input class="mini" data-right="${esc(k)}" value="${esc(right)}" />
    `;

    // arrows
    row.querySelector(`[data-up="${k}"]`).onclick=()=>{
      const cur=normalizeOrder(loadExportCfg(g.id), g);
      const i=cur.order.indexOf(k);
      if(i>0){ [cur.order[i-1],cur.order[i]]=[cur.order[i],cur.order[i-1]]; }
      saveExportCfg(g.id,cur);
      buildExportBuilderUI();
    };
    row.querySelector(`[data-down="${k}"]`).onclick=()=>{
      const cur=normalizeOrder(loadExportCfg(g.id), g);
      const i=cur.order.indexOf(k);
      if(i>=0 && i<cur.order.length-1){ [cur.order[i+1],cur.order[i]]=[cur.order[i],cur.order[i+1]]; }
      saveExportCfg(g.id,cur);
      buildExportBuilderUI();
    };

    // tick
    row.querySelector("[data-tick]").onclick=()=>{
      const cur=normalizeOrder(loadExportCfg(g.id), g);
      cur.fields[k] ||= {};
      cur.fields[k].on = !(cur.fields[k].on ?? true);
      saveExportCfg(g.id,cur);
      buildExportBuilderUI();
    };

    // left/right input
    row.querySelectorAll("input").forEach(inp=>{
      inp.oninput=()=>{
        const cur=normalizeOrder(loadExportCfg(g.id), g);
        cur.fields[k] ||= {};
        if(inp.dataset.left) cur.fields[k].left = inp.value;
        if(inp.dataset.right) cur.fields[k].right = inp.value;
        cur.topLine = exportTopLineEl.value;
        cur.bottomLine = exportBottomLineEl.value;
        cur.lineComma = exportLineCommaEl.value;
        cur.escapeMode = exportEscapeModeEl.value;
        saveExportCfg(g.id,cur);
      };
    });

    jsonBuilderEl.appendChild(row);
  });

  const saveHeaderFooter=()=>{
    const cur=normalizeOrder(loadExportCfg(g.id), g);
    cur.topLine = exportTopLineEl.value;
    cur.bottomLine = exportBottomLineEl.value;
    cur.lineComma = exportLineCommaEl.value;
    cur.escapeMode = exportEscapeModeEl.value;
    saveExportCfg(g.id,cur);
  };
  exportTopLineEl.oninput=saveHeaderFooter;
  exportBottomLineEl.oninput=saveHeaderFooter;
  exportLineCommaEl.oninput=saveHeaderFooter;
  exportEscapeModeEl.onchange=saveHeaderFooter;
}

function generateExport(){
  const g=getGroup();
  if(!g){alert("请先选择一个泡泡组");return;}

  let entries=state.entries.filter(e=>e.groupId===g.id);
  if(exportScopeEl.value==="selected") entries=entries.filter(e=>e._selected);

  let cfg=normalizeOrder(loadExportCfg(g.id), g);
  const topLine=(exportTopLineEl.value ?? cfg.topLine ?? "").trim();
  const bottomLine=(exportBottomLineEl.value ?? cfg.bottomLine ?? "").trim();
  const lineCommaRaw = (exportLineCommaEl.value ?? cfg.lineComma ?? "");
  const escapeMode = (exportEscapeModeEl.value ?? cfg.escapeMode ?? "json");

  const keyToField = Object.fromEntries(g.schema.fields.map(f=>[f.key,f]));
  const enabledKeys = cfg.order.filter(k => (cfg.fields[k]?.on ?? true) && keyToField[k]);

  const blocks = entries.map((e)=>{
    const lines=[];
    if(topLine) lines.push(topLine);

    enabledKeys.forEach((k,idx)=>{
      const left = cfg.fields[k]?.left ?? `"${k}":"`;
      const right = cfg.fields[k]?.right ?? `"`;
      const rawVal = e.data?.[k] ?? "";

      const valueText = (escapeMode==="raw") ? String(rawVal ?? "") : jsonEscapeValue(rawVal);

      let comma;
      if(lineCommaRaw !== "") comma = lineCommaRaw;
      else comma = (idx === enabledKeys.length-1) ? "" : ",";

      lines.push(`${left}${valueText}${right}${comma}`);
    });

    if(bottomLine) lines.push(bottomLine);
    return lines.join("\n");
  });

  const out = blocks.join("\n\n");
  exportResultEl.value = out;

  if(exportMarkEl.value==="mark"){
    const t=nowISO();
    entries.forEach(e=>e.exportedAt=e.exportedAt||t);
    renderBubbles();
    saveState();
  }
}

async function copyExport(){
  const txt=exportResultEl.value;
  if(!txt) return;
  await navigator.clipboard.writeText(txt);
  alert("已复制到剪贴板");
}

function downloadExport(){
  const txt=exportResultEl.value;
  if(!txt) return;
  const g=getGroup();
  const blob=new Blob([txt],{type:"application/json;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${(g?.name||"export").replace(/[^\w\u4e00-\u9fa5]+/g,"_")}_${fmtDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("#btnExport").onclick=()=>openModal("modalExport");
$("#btnDoExport").onclick=generateExport;
$("#btnCopyExport").onclick=copyExport;
$("#btnDownloadExport").onclick=downloadExport;

// Sort
btnToggleSort.textContent="升序";
btnToggleSort.onclick=()=>{
  sortAsc=!sortAsc;
  btnToggleSort.textContent=sortAsc?"升序":"倒序";
  renderBubbles();
};
sortByEl.onchange=()=>renderBubbles();

// Sync
function loadSync(){try{return JSON.parse(localStorage.getItem(LS_SYNC)||"{}")}catch{return {}}}
function saveSync(cfg){localStorage.setItem(LS_SYNC,JSON.stringify(cfg));}
function fillSync(){
  const cfg=loadSync();
  $("#sbUrl").value=cfg.url||"";
  $("#sbAnon").value=cfg.anon||"";
  $("#workspaceId").value=cfg.workspaceId||"";
  $("#workspaceSecret").value=cfg.secret||"";
  $("#syncStatus").textContent=cfg.url?"已保存配置，可测试连接":"未配置同步，本机存储模式";
}
function readSyncInputs(){
  const cfg={
    url:$("#sbUrl").value.trim(),
    anon:$("#sbAnon").value.trim(),
    workspaceId:$("#workspaceId").value.trim(),
    secret:$("#workspaceSecret").value.trim()
  };
  saveSync(cfg);
  return cfg;
}
$("#btnSync").onclick=()=>openModal("modalSync");
$("#btnSaveSync").onclick=()=>{saveSync(readSyncInputs()); closeModal("modalSync"); alert("已保存同步设置");};
$("#btnTestSync").onclick=async()=>{
  const cfg=readSyncInputs();
  const s=$("#syncStatus");
  s.textContent="测试中…";
  try{await window.BLSync.test(cfg); s.textContent="连接成功 ✅";}
  catch(e){s.textContent="连接失败："+(e?.message||e);}
};
$("#btnPushLocal").onclick=async()=>{
  const cfg=readSyncInputs();
  const s=$("#syncStatus");
  s.textContent="上传中…";
  try{await window.BLSync.pushAll(cfg,state); s.textContent="上传完成 ✅";}
  catch(e){s.textContent="上传失败："+(e?.message||e);}
};
$("#btnPullCloud").onclick=async()=>{
  const cfg=readSyncInputs();
  const s=$("#syncStatus");
  s.textContent="拉取中…";
  try{
    const cloud=await window.BLSync.pullAll(cfg);
    if(cloud?.groups && cloud?.entries){
      state={version:1,groups:cloud.groups,entries:cloud.entries,ui:state.ui||{}};
      saveState();
      render();
      s.textContent="拉取完成 ✅（覆盖本机）";
    }else{
      s.textContent="云端无数据或结构异常";
    }
  }catch(e){
    s.textContent="拉取失败："+(e?.message||e);
  }
};

render();
