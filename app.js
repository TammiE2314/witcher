const LS="bb_site_v1";
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const fmt=(iso)=>{try{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}catch{return ''}};
const $=s=>document.querySelector(s);

function load(){
  try{
    const raw=localStorage.getItem(LS);
    if(raw){
      const s=JSON.parse(raw);
      s.groups??=[];
      s.bubbles??=[];
      s.ui??={};
      return s;
    }
  }catch{}
  // default: one example group schema
  return {
    version:1,
    groups:[],
    bubbles:[],
    ui:{activeGroupId:null},
  };
}
let state=load();
let activeGroupId=state.ui.activeGroupId||null;
let editingBubbleId=null;

const groupList=$("#groupList");
const bubbleList=$("#bubbleList");
const currentGroupTitle=$("#currentGroupTitle");
const sortMode=$("#sortMode");

const backdrop=$("#backdrop");
const modalGroup=$("#modalGroup");
const modalSchema=$("#modalSchema");
const modalBubble=$("#modalBubble");

const groupName=$("#groupName");
const btnCreateGroup=$("#btnCreateGroup");

const btnNewGroup=$("#btnNewGroup");
const btnNewBubble=$("#btnNewBubble");
const btnEditSchema=$("#btnEditSchema");

const titleFieldSel=$("#titleField");
const fieldTable=$("#fieldTable");
const newFieldLabel=$("#newFieldLabel");
const newFieldKey=$("#newFieldKey");
const newFieldType=$("#newFieldType");
const btnAddField=$("#btnAddField");
const btnSaveSchema=$("#btnSaveSchema");

const bubbleModalTitle=$("#bubbleModalTitle");
const bubbleForm=$("#bubbleForm");
const btnSaveBubble=$("#btnSaveBubble");
const btnDeleteBubble=$("#btnDeleteBubble");

document.querySelectorAll("[data-close]").forEach(el=>{
  el.addEventListener("click", ()=>closeModal(el.dataset.close));
});
backdrop.addEventListener("click", closeAll);

function save(){
  state.ui.activeGroupId=activeGroupId;
  localStorage.setItem(LS, JSON.stringify(state));
}

function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function getGroup(){
  return state.groups.find(g=>g.id===activeGroupId)||null;
}
function groupBubbles(groupId){
  return state.bubbles.filter(b=>b.groupId===groupId);
}

function openModal(id){
  backdrop.hidden=false;
  $("#"+id).hidden=false;
}
function closeModal(id){
  $("#"+id).hidden=true;
  const any=[...document.querySelectorAll(".modal")].some(m=>!m.hidden);
  if(!any) backdrop.hidden=true;
}
function closeAll(){
  document.querySelectorAll(".modal").forEach(m=>m.hidden=true);
  backdrop.hidden=true;
}

function ensureDefaultSchema(g){
  // If no fields, give a sensible default
  if(!g.schema || !Array.isArray(g.schema.fields)) g.schema={fields:[]};
  if(g.schema.fields.length===0){
    g.schema.fields=[
      {key:"title",label:"标题",type:"text"},
      {key:"time",label:"时间",type:"date"},
      {key:"intro",label:"简介",type:"text"},
      {key:"content",label:"内容",type:"longtext"},
    ];
  }
  if(!g.titleField || !g.schema.fields.some(f=>f.key===g.titleField)){
    g.titleField = g.schema.fields[0]?.key || "title";
  }
}

function render(){
  renderGroups();
  renderCurrentGroup();
  renderBubbles();
  save();
}

function renderGroups(){
  groupList.innerHTML="";
  if(state.groups.length===0){
    groupList.innerHTML=`<div class="hint">还没有泡泡组，点上方「新建泡泡组」</div>`;
    return;
  }
  state.groups.forEach(g=>{
    ensureDefaultSchema(g);
    const count=groupBubbles(g.id).length;
    const div=document.createElement("div");
    div.className="item"+(g.id===activeGroupId?" active":"");
    div.innerHTML=`<div><b>${esc(g.name)}</b></div>
      <div class="hint">${count} 个泡泡 · 标题字段：${esc(g.titleField)}</div>`;
    div.onclick=()=>{
      activeGroupId=g.id;
      render();
    };
    groupList.appendChild(div);
  });
}

function renderCurrentGroup(){
  const g=getGroup();
  currentGroupTitle.textContent = g ? `当前组：${g.name}` : "当前组：—";
  btnEditSchema.disabled = !g;
  btnNewBubble.disabled = !g;
}

function bubbleTitle(g,b){
  const v=b.data?.[g.titleField];
  if(v!=null && String(v).trim()!=="") return String(v);
  // fallback
  const t=b.data?.title;
  if(t) return String(t);
  const c=b.data?.content;
  if(c) return String(c).slice(0,20)+"…";
  return "（空标题）";
}

function sortBubbles(list){
  const mode=sortMode.value;
  const asc = mode.endsWith("_asc");
  const field = mode.startsWith("created") ? "createdAt" : "updatedAt";
  list.sort((a,b)=>{
    const va=new Date(a[field]||a.createdAt).getTime();
    const vb=new Date(b[field]||b.createdAt).getTime();
    return va<vb ? (asc?-1:1) : va>vb ? (asc?1:-1) : 0;
  });
}

function renderBubbles(){
  bubbleList.innerHTML="";
  const g=getGroup();
  if(!g){
    bubbleList.innerHTML=`<div class="hint">先选一个泡泡组</div>`;
    return;
  }
  ensureDefaultSchema(g);
  const list=groupBubbles(g.id).slice();
  sortBubbles(list);

  if(list.length===0){
    bubbleList.innerHTML=`<div class="hint">这个组还没有泡泡，点「新建泡泡」</div>`;
    return;
  }
  list.forEach(b=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`<div><b>${esc(bubbleTitle(g,b))}</b></div>
      <div class="hint">更新：${esc(fmt(b.updatedAt||b.createdAt))}</div>`;
    div.onclick=()=>openBubbleModal(b.id);
    bubbleList.appendChild(div);
  });
}

// ---- group create
btnNewGroup.onclick=()=>{
  groupName.value="";
  openModal("modalGroup");
  setTimeout(()=>groupName.focus(), 0);
};

btnCreateGroup.onclick=()=>{
  const name=groupName.value.trim()||"未命名泡泡组";
  const g={
    id:uid(),
    name,
    schema:{fields:[
      {key:"title",label:"标题",type:"text"},
      {key:"time",label:"时间",type:"date"},
      {key:"intro",label:"简介",type:"text"},
      {key:"content",label:"内容",type:"longtext"},
    ]},
    titleField:"title",
    createdAt:now(),
    updatedAt:now(),
  };
  state.groups.unshift(g);
  activeGroupId=g.id;
  closeModal("modalGroup");
  render();
};

// ---- schema edit
btnEditSchema.onclick=()=>{
  const g=getGroup();
  if(!g) return;
  ensureDefaultSchema(g);
  renderSchemaUI(g);
  openModal("modalSchema");
};

function renderSchemaUI(g){
  // titleField select
  titleFieldSel.innerHTML="";
  g.schema.fields.forEach(f=>{
    const opt=document.createElement("option");
    opt.value=f.key;
    opt.textContent=`${f.label}（${f.key}）`;
    titleFieldSel.appendChild(opt);
  });
  titleFieldSel.value=g.titleField;
  // table
  renderFieldTable(g);
}

function renderFieldTable(g){
  fieldTable.innerHTML="";
  g.schema.fields.forEach((f,idx)=>{
    const row=document.createElement("div");
    row.className="tableRow";
    row.innerHTML=`
      <div class="tableRowTop">
        <span class="badge">#${idx+1}</span>
        <span class="badge">${esc(f.type)}</span>
        <span class="badge">${esc(f.key)}</span>
      </div>
      <div class="row" style="margin-top:10px">
        <input class="input" data-edit="label" data-i="${idx}" value="${esc(f.label)}" />
        <input class="input" data-edit="key" data-i="${idx}" value="${esc(f.key)}" />
        <select class="select" data-edit="type" data-i="${idx}">
          ${["text","longtext","date","number"].map(t=>`<option value="${t}" ${t===f.type?"selected":""}>${t}</option>`).join("")}
        </select>
        <button class="smallBtn" data-act="up" data-i="${idx}">↑</button>
        <button class="smallBtn" data-act="down" data-i="${idx}">↓</button>
        <button class="smallBtn" data-act="del" data-i="${idx}">删除</button>
      </div>
      <div class="hint" style="margin-top:8px">修改 key 会影响已有泡泡的数据读取；尽量别改旧 key。</div>
    `;
    row.querySelectorAll("[data-edit]").forEach(inp=>{
      inp.oninput=()=>{
        const i=Number(inp.dataset.i);
        const k=inp.dataset.edit;
        g.schema.fields[i][k]=inp.value.trim();
        // refresh titleField options if key/label changed
        renderSchemaUI(g);
      };
    });
    row.querySelectorAll("[data-act]").forEach(btn=>{
      btn.onclick=()=>{
        const i=Number(btn.dataset.i);
        const act=btn.dataset.act;
        if(act==="up" && i>0){
          [g.schema.fields[i-1], g.schema.fields[i]]=[g.schema.fields[i], g.schema.fields[i-1]];
        }else if(act==="down" && i<g.schema.fields.length-1){
          [g.schema.fields[i+1], g.schema.fields[i]]=[g.schema.fields[i], g.schema.fields[i+1]];
        }else if(act==="del"){
          const delKey=g.schema.fields[i].key;
          g.schema.fields.splice(i,1);
          // if titleField deleted, reset later
          if(g.titleField===delKey) g.titleField = g.schema.fields[0]?.key || "title";
        }
        renderSchemaUI(g);
      };
    });
    fieldTable.appendChild(row);
  });
}

btnAddField.onclick=()=>{
  const g=getGroup();
  if(!g) return;
  ensureDefaultSchema(g);

  const label=newFieldLabel.value.trim();
  const key=newFieldKey.value.trim();
  const type=newFieldType.value;

  if(!label || !key){
    alert("显示名和 key 都要填");
    return;
  }
  if(g.schema.fields.some(f=>f.key===key)){
    alert("这个 key 已经存在了，换一个");
    return;
  }
  g.schema.fields.push({key,label,type});
  newFieldLabel.value="";
  newFieldKey.value="";
  renderSchemaUI(g);
};

btnSaveSchema.onclick=()=>{
  const g=getGroup();
  if(!g) return;
  // validate keys non-empty, unique
  const keys=g.schema.fields.map(f=>f.key.trim());
  if(keys.some(k=>!k)){
    alert("有模块的 key 是空的");
    return;
  }
  const dup=keys.find((k,i)=>keys.indexOf(k)!==i);
  if(dup){
    alert("有重复 key："+dup);
    return;
  }
  g.schema.fields.forEach(f=>{
    f.key=f.key.trim();
    f.label=(f.label||f.key).trim();
  });
  g.titleField=titleFieldSel.value || g.schema.fields[0]?.key || "title";
  g.updatedAt=now();
  closeModal("modalSchema");
  render();
};

titleFieldSel.onchange=()=>{
  const g=getGroup();
  if(!g) return;
  g.titleField=titleFieldSel.value;
};

// ---- bubble create/edit modal
btnNewBubble.onclick=()=>openBubbleModal(null);

function openBubbleModal(bubbleId){
  const g=getGroup();
  if(!g) return;
  ensureDefaultSchema(g);

  editingBubbleId=bubbleId;
  const b=bubbleId ? state.bubbles.find(x=>x.id===bubbleId) : null;

  bubbleModalTitle.textContent = b ? "编辑泡泡" : "新建泡泡";
  btnDeleteBubble.hidden = !b;

  const data = b ? {...(b.data||{})} : {};

  // build form by schema
  bubbleForm.innerHTML="";
  g.schema.fields.forEach(f=>{
    const wrap=document.createElement("label");
    wrap.className="field";
    wrap.innerHTML=`<div class="label">${esc(f.label)} <span class="hint">(${esc(f.key)})</span></div>`;
    let input;
    const v=data[f.key] ?? "";
    if(f.type==="longtext"){
      input=document.createElement("textarea");
      input.className="textarea";
      input.rows=8;
      input.value=v;
    }else if(f.type==="date"){
      input=document.createElement("input");
      input.className="input";
      input.type="date";
      input.value = v ? String(v).slice(0,10) : fmt(now());
    }else if(f.type==="number"){
      input=document.createElement("input");
      input.className="input";
      input.type="number";
      input.value=v;
    }else{
      input=document.createElement("input");
      input.className="input";
      input.type="text";
      input.value=v;
    }
    input.dataset.key=f.key;
    wrap.appendChild(input);
    bubbleForm.appendChild(wrap);
  });

  openModal("modalBubble");
}

btnSaveBubble.onclick=()=>{
  const g=getGroup();
  if(!g) return;
  ensureDefaultSchema(g);

  const inputs=bubbleForm.querySelectorAll("[data-key]");
  const data={};
  inputs.forEach(inp=>data[inp.dataset.key]=inp.value ?? "");
  const t=now();

  if(editingBubbleId){
    const b=state.bubbles.find(x=>x.id===editingBubbleId);
    if(!b) return;
    b.data=data;
    b.updatedAt=t;
  }else{
    const b={id:uid(), groupId:g.id, data, createdAt:t, updatedAt:t};
    state.bubbles.unshift(b);
  }
  closeModal("modalBubble");
  render();
};

btnDeleteBubble.onclick=()=>{
  if(!editingBubbleId) return;
  if(!confirm("确定删除这个泡泡吗？")) return;
  state.bubbles = state.bubbles.filter(x=>x.id!==editingBubbleId);
  editingBubbleId=null;
  closeModal("modalBubble");
  render();
};

sortMode.onchange=renderBubbles;

// initial render
render();
