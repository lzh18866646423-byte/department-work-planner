'use strict';
const KEY='monthly-work-planner-v1', colors={'创新大赛':'#477260','挑战杯':'#656e9a','职规赛':'#bd7849','大创与日常':'#708b93','活动承办':'#b05b54','统筹与复盘':'#7b8271','成果管理':'#7c7488'};
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isKey=plannerIsKeyMilestone, taskTitle=plannerTaskTitle, workLabel=c=>PLANNER_LABELS[c]||c;
const isConditionalMilestone=plannerIsConditional;
const activeKey=t=>isKey(t) && t.status!=='未晋级';
function matchesWork(t,cat){return t.category===cat||cat==='成果管理'&&t.process==='成果管理';}
function taskDate(t){return t.month?t.year+'.'+String(t.month).padStart(2,'0'):t.year+' · 按通知';}
const uid=()=>crypto.randomUUID();
let state, year=2027, month=1, editing=null, editorBase=null, view='calendar', activeWork='创新大赛';
let lastRaw=null, storageBlocked=false, importPreview=null;
const allowedCategory=Object.keys(colors), statuses=['未开始','推进中','待协调','已完成','未晋级'];
function validate(s,migrate=true){return plannerValidateState(s,allowedCategory,statuses,migrate);}
function readPlanner(raw) {
  const saved = raw === null
    ? validate({schema:1,revision:0,ownerBlankRevision:1,tasks:structuredClone(PLANNER_SEED)})
    : validate(JSON.parse(raw));
  const tasks = new Map(saved.tasks.map(task => [task.id, task]));
  for (const seed of PLANNER_SEED) {
    const t=tasks.get(seed.id);
    if (!t) {saved.tasks.push(structuredClone(seed)); continue;}
    if (t.stage === undefined && seed.stage) {
      t.stage=seed.stage;
      if (t.category==='创新大赛' && seed.stage==='全国总决赛' && t.month===9) t.month=10;
    }
  }
  return saved;
}
try {
  lastRaw=localStorage.getItem(KEY);
  state=readPlanner(lastRaw);
} catch {
  storageBlocked=true;
  state={schema:1,revision:0,tasks:[]};
  setTimeout(()=>toast('本机数据无法读取。可先备份原始记录，再导入有效备份恢复。'),100);
}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500);}
function showProblem(message) {
  if ($('#editor').open) {
    $('#editorAlert').textContent=message;
    $('#editorAlert').hidden=false;
  } else if ($('#importDialog').open) {
    $('#importSummary').textContent=message;
  } else toast(message);
}
function loadLatest() {
  const raw=localStorage.getItem(KEY);
  if (raw===lastRaw) return;
  state=readPlanner(raw);
  lastRaw=raw;
}
async function mutate(change) {
  const commit=()=>{
    if (storageBlocked) throw Error('当前记录无法读取，请先备份并恢复。');
    loadLatest();
    const next=structuredClone(state);
    change(next.tasks);
    next.revision++;
    validate(next,false);
    const raw=JSON.stringify(next);
    localStorage.setItem(KEY,raw);
    lastRaw=raw;
    state=next;
    $('#saveState').textContent='已保存到本机';
    return true;
  };
  try {
    return navigator.locks ? await navigator.locks.request(KEY,commit) : commit();
  } catch (err) {
    render();
    showProblem(err.message);
    return false;
  }
}
function editedTask(tasks) {
  const current=tasks.find(t=>t.id===editing);
  if (!current || !editorBase || plannerChangedFields(editorBase,current).length) {
    throw Error('这项工作已在另一页变更。当前输入仍在，请复制要保留的文字，关闭后重新打开最新事项。');
  }
  return current;
}
window.addEventListener('storage', e=>{
  if ((e.key!==KEY && e.key!==null) || storageBlocked) return;
  try {
    loadLatest();
    render();
    if ($('#editor').open && editing) editedTask(state.tasks);
    if ($('#importDialog').open && importPreview) previewImport(importPreview.tasks);
  } catch (err) {showProblem(err.message);}
});
function filtered() {
  const q=$('#search').value.trim().toLowerCase(), cat=$('#category').value;
  return state.tasks.filter(t=>!t.deleted && t.year===year && (!cat || matchesWork(t,cat)) &&
    (!q || [taskTitle(t),t.stage,t.category,WORKS.find(w=>w.category===t.category)?.name,
      t.process,t.owner,t.action,t.output].some(value=>String(value||'').toLowerCase().includes(q))));
}
const sortTasks=plannerMonthOrder;
function monthSummary(tasks) {
  const contests=tasks.filter(activeKey);
  if (contests.length) return contests.map(t=>{
    const stage=(t.stage||'').split(' / ')[0];
    const short={'校级选拔':'校赛','省赛现场决赛':'省赛','全国总决赛':'国赛'}[stage]||stage;
    return short ? workLabel(t.category)+' · '+short+(isConditionalMilestone(t)?'（晋级后）':'') : taskTitle(t);
  }).join('、');
  const topics=new Map();
  for (const t of tasks.filter(t=>t.status!=='未晋级')) {
    const label=workLabel(t.category),stage=(t.stage||'').split(' / ')[0];
    const topic=stage.startsWith(label+' · ')?stage.slice(label.length+3):stage;
    if (!topics.has(topic)) topics.set(topic,new Set());
    topics.get(topic).add(label);
  }
  return [...topics].slice(0,2).map(([stage,labels])=>[...labels].join('、')+(stage?' · '+stage:'')).join(' / ');
}
function progressText(tasks) {
  const skipped=tasks.filter(t=>t.status==='未晋级').length, total=tasks.length-skipped;
  const completed=tasks.filter(t=>t.status==='已完成').length;
  return [total||!skipped?completed+'/'+total+' 已完成':'',skipped?skipped+' 项未晋级':''].filter(Boolean).join(' · ');
}
function statusOptions(t) {
  return statuses.filter(s=>s!=='未晋级'||isConditionalMilestone(t)||t.status===s)
    .map(s=>'<option'+(s===t.status?' selected':'')+'>'+s+'</option>').join('');
}
function render(forPrint=false){const rows=filtered();const hasFilter=Boolean($('#category').value||$('#search').value.trim());$('#csvBtn').textContent=hasFilter?'导出全年筛选结果':'导出全年 CSV';$('#monthExport').textContent=hasFilter?'导出本月筛选结果':'导出本月';$('#printYear').textContent=' · '+year+' 年';$('#printBtn').textContent=view==='work'?'打印本项':hasFilter?'打印筛选结果':'打印全年';$('#yearLabel').textContent=year+' 年';$('#detailYear').textContent=year+' / MONTHLY FOCUS';$('#monthTitle').textContent=String(month).padStart(2,'0')+' 月';$('#monthTheme').textContent=monthSummary(rows.filter(t=>t.month===month).sort(sortTasks));const now=new Date();$('#calendar').innerHTML=Array.from({length:12},(_,i)=>{const m=i+1,ts=rows.filter(t=>t.month===m).sort(sortTasks),important=ts.filter(activeKey),show=forPrint?ts:ts.slice(0,Math.max(3,important.length));return `<button class="month ${m===month?'selected':''}" data-month="${m}" aria-pressed="${m===month}" aria-label="${m}月，${ts.length}项，${important.length}项关键节点"><div class="month-top"><div class="month-number">${String(m).padStart(2,'0')}<small>月</small></div><span class="${important.length?(important.every(isConditionalMilestone)?'conditional-count':''):'no-milestone'}">${[year===now.getFullYear()&&m===now.getMonth()+1?'本月':'',important.length?'★ '+important.length+' 项关键节点':''].filter(Boolean).join(' · ')}</span></div><div class="month-theme">${esc(monthSummary(ts))}</div>${show.map(t=>`<div class="mini-task ${activeKey(t)?'important':''} ${isConditionalMilestone(t)?'is-conditional':''} ${t.status==='已完成'?'done':t.status==='未晋级'?'not-qualified':''}" style="--task-color:${colors[t.category]}"><i></i><span>${esc(taskTitle(t))}</span></div>`).join('')}${ts.length===0?'<div class="empty">'+(hasFilter?'无匹配事项':'尚无事项 · 点击安排')+'</div>':''}<div class="month-more">${ts.length>show.length?'另有 '+(ts.length-show.length)+' 项 · ':''}${ts.length?progressText(ts):(hasFilter?'':'添加月度计划 →')}</div></button>`}).join('');
const ts=rows.filter(t=>t.month===month).sort(sortTasks),done=ts.filter(t=>t.status==='已完成').length;$('#monthCount').textContent=ts.length+' 项安排';$('#progressText').textContent=progressText(ts);const applicable=ts.filter(t=>t.status!=='未晋级').length;$('#progressBar').style.width=(applicable?100*done/applicable:0)+'%';$('#tasks').innerHTML=ts.length?ts.map(t=>`<article class="task ${activeKey(t)?'task-important':''} ${isConditionalMilestone(t)?'is-conditional':''} ${t.status==='已完成'?'task-complete':t.status==='未晋级'?'not-qualified':''}" style="--task-color:${colors[t.category]}"><div class="task-tags"><span class="category">${esc(workLabel(t.category))}</span>${activeKey(t)?'<span class="star">关键节点</span>':''}</div><h3>${esc(taskTitle(t))}</h3><p>${esc(t.action)}</p>${t.output?`<p><b>应形成：</b>${esc(t.output)}</p>`:''}${t.owner?`<p><b>负责人：</b>${esc(t.owner)}</p>`:''}<div class="task-bottom"><select data-status="${esc(t.id)}" aria-label="${esc(taskTitle(t))}的状态">${statusOptions(t)}</select><button data-edit="${esc(t.id)}">编辑 / 调整月份 ↗</button></div></article>`).join(''):'<p class="empty-month">本月暂无匹配事项，可清空筛选或按实际需要添加。</p>';
const pending=rows.filter(t=>t.month===0).sort(sortTasks);
$('#noticePanel').hidden=!pending.length;
$('#noticeTasks').innerHTML=pending.map(t=>
  '<article class="notice-task"><div><span class="small-label">'+esc(workLabel(t.category))+' · 按通知办理</span><h3>'+esc(taskTitle(t))+
  '</h3><p>'+esc(t.action)+'</p>'+(t.output?'<p>应形成：'+esc(t.output)+'</p>':'')+(t.owner?'<p>负责人：'+esc(t.owner)+'</p>':'')+
  '<div class="task-bottom"><select data-status="'+esc(t.id)+'" aria-label="'+esc(taskTitle(t))+'的状态">'+statusOptions(t)+
  '</select><button data-edit="'+esc(t.id)+'">编辑 / 安排月份 ↗</button></div></div></article>').join('');
renderWork();
}
function openEditor(id) {
  if (storageBlocked) {toast('本机记录无法读取，请先备份并恢复。');return;}
  const existing=state.tasks.find(t=>t.id===id && !t.deleted);
  if (id && !existing) {toast('这项工作已移入回收站。');return;}
  editing=id||null;
  editorBase=existing?structuredClone(existing):null;
  const t=existing||{title:'',year,month,category:view==='work'?activeWork:$('#category').value||'统筹与复盘',
    status:'未开始',owner:'',action:'',output:'',important:true};
  const form=$('#taskForm');
  form.reset();
  form.elements.namedItem('status').innerHTML=statusOptions(t);
  $('#editorAlert').hidden=true;
  form.elements.namedItem('keyMilestone').checked=isKey(t);
  for (const name of ['title','year','month','category','stage','status','owner','action','output']) {
    form.elements.namedItem(name).value=t[name]??'';
  }
  $('#editorTitle').textContent=id?'编辑月度事项':'新增月度事项';
  $('#deleteBtn').hidden=!id;
  $('#editor').showModal();
}
$('#taskForm').addEventListener('input',e=>{
  if (!['title','action','keyMilestone'].includes(e.target.name)) return;
  const f=e.currentTarget.elements;
  f.namedItem('status').innerHTML=statusOptions({title:f.namedItem('title').value,action:f.namedItem('action').value,
    keyMilestone:f.namedItem('keyMilestone').checked,status:f.namedItem('status').value});
});
$('#taskForm [name=month]').innerHTML='<option value="0">按通知办理（月份待定）</option>'+Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}月</option>`).join('');
$('#taskForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.target, submit=form.querySelector('[type=submit]');
  if (submit.disabled) return;
  const fd=new FormData(form);
  const savedId=editing||uid();
  const values={year:Number(fd.get('year')),month:Number(fd.get('month')),keyMilestone:fd.has('keyMilestone')};
  for (const k of ['title','category','status','owner','action','output','stage']) values[k]=String(fd.get(k)||'').trim();
  if (!values.title) {showProblem('请填写事项名称。');return;}
  submit.disabled=true;
  try {
    if (!await mutate(tasks=>{
      const task=editing?editedTask(tasks):{id:savedId,deleted:false,important:true};
      Object.assign(task,values);
      if (!editing) tasks.push(task);
    })) return;
    year=values.year;
    if (values.month) month=values.month;
    const saved=state.tasks.find(t=>t.id===savedId);
    if (view==='calendar' && $('#category').value && !matchesWork(saved,$('#category').value)) $('#category').value='';
    if (view==='calendar' && !filtered().some(t=>t.id===savedId)) $('#search').value='';
    if (!(view==='work' && matchesWork(saved,activeWork))) activeWork=values.category;
    $('#editor').close();
    render();
    toast('已保存，月历与单项排期已更新');
  } finally {submit.disabled=false;}
});
$('#calendar').addEventListener('click',e=>{const b=e.target.closest('[data-month]');if(b){month=Number(b.dataset.month);render();if(innerWidth<801)$('#monthTitle').scrollIntoView({behavior:'smooth',block:'start'});}});
$('#tasks').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)openEditor(b.dataset.edit);});
$('#noticeTasks').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)openEditor(b.dataset.edit);});
async function updateStatus(e) {
  const {status:id}=e.target.dataset;
  if (!id) return;
  const before=state.tasks.find(t=>t.id===id), value=e.target.value;
  await mutate(tasks=>{
    const t=tasks.find(row=>row.id===id);
    if (!t || t.deleted || t.status!==before?.status) throw Error('事项状态已变更，请在最新内容上操作。');
    t.status=value;
  });
  render();
}
$('#tasks').addEventListener('change',updateStatus);
$('#noticeTasks').addEventListener('change',updateStatus);
$('#deleteBtn').onclick=async ()=>{
  if (editing && await mutate(tasks=>{editedTask(tasks).deleted=true;})) {
    $('#editor').close();render();toast('已移入回收站，可随时恢复');
  }
};
function showTrash(){$('#trashList').innerHTML=state.tasks.filter(t=>t.deleted).map(t=>`<div class="trash-row"><span><small>${t.year}年${t.month?t.month+'月':' · 按通知'}</small><br>${esc(taskTitle(t))}</span><button data-restore="${esc(t.id)}">恢复</button></div>`).join('')||'<p class="empty">暂无删除事项</p>';}
$('#trashBtn').onclick=()=>{showTrash();$('#trashDialog').showModal();};
$('#trashList').onclick=async e=>{
  const b=e.target.closest('[data-restore]');
  if (!b) return;
  if (await mutate(tasks=>{
    const t=tasks.find(t=>t.id===b.dataset.restore);
    if (!t || !t.deleted) throw Error('事项已变更，请重新打开回收站。');
    t.deleted=false;
  })) {showTrash();render();toast('事项已恢复');}
};
function download(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#backupBtn').onclick=()=>{
  const now=new Date(), date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  if (storageBlocked) {
    if (lastRaw===null) {toast('本机存储不可访问，无法导出原记录。');return;}
    download(lastRaw,'text/plain;charset=utf-8','创院排期-原始存储-'+date+'.txt');
    toast('已导出无法读取的原始记录');
    return;
  }
  download(JSON.stringify({...state,exportedAt:now.toISOString()},null,2),'application/json','创院重点工作排期工作台-完整备份-'+date+'.json');
  toast('已导出含回收站的完整备份');
};
function csv(onlyMonth) {
  const rows=filtered().filter(t=>!onlyMonth || t.month===month);
  const qualifier=$('#category').value?'-'+workLabel($('#category').value):'';
  const search=$('#search').value.trim()?'-筛选结果':'';
  download(plannerCalendarCsv(rows),'text/csv;charset=utf-8',year+'年'+(onlyMonth?month+'月':'全年')+qualifier+search+'工作排期.csv');
}
$('#csvBtn').onclick=()=>csv(false);$('#monthExport').onclick=()=>csv(true);
function importValue(t,key) {
  const value=plannerFieldValue(t,key);
  if (key==='month') return value?value+'月':'按通知办理';
  if (key==='deleted') return value?'回收站':'正常';
  if (key==='keyMilestone') return value?'是':'否';
  if (key==='category') return workLabel(value);
  return String(value)||'（空）';
}
function previewImport(tasks) {
  const {added,conflicts,same}=plannerCompareBackup(state.tasks,tasks);
  const dialog=$('#importDialog');
  if (!added.length && !conflicts.length) {
    if (dialog.open) dialog.close();
    importPreview=null;
    toast('内容一致，无需导入（'+same+' 项）');
    return;
  }
  importPreview={tasks,raw:lastRaw};
  $('#importSummary').textContent='新增 '+added.length+' 项，相同 '+same+' 项，内容不同 '+conflicts.length+' 项。'+
    (conflicts.length?'勾选要采用备份版本的事项，其余保留本机版本。':'');
  $('#importConflicts').innerHTML=conflicts.map(({current,task,fields})=>
    '<article class="import-row"><label><input type="checkbox" data-import-id="'+esc(task.id)+'"> '+esc(taskTitle(task))+'</label>'+
    fields.map(k=>'<div><b>'+esc(plannerFields[k])+'</b><p>本机　'+esc(importValue(current,k))+'</p><p>备份　'+esc(importValue(task,k))+'</p></div>').join('')+'</article>').join('');
  if (!dialog.open) dialog.showModal();
}
$('#applyImport').onclick=async ()=>{
  if (!importPreview) return;
  const preview=importPreview;
  const choices=new Set([...$('#importConflicts').querySelectorAll('input:checked')].map(el=>el.dataset.importId));
  const btn=$('#applyImport');
  if (btn.disabled) return;
  btn.disabled=true;
  try {
    const ok=await mutate(tasks=>{
      if (preview.raw!==lastRaw) throw Error('另一页已更新，请重新核对导入差异。');
      const {added,conflicts}=plannerCompareBackup(tasks,preview.tasks);
      tasks.push(...added);
      const accepted=new Map(conflicts.filter(({task})=>choices.has(task.id)).map(({task})=>[task.id,task]));
      tasks.forEach((item,index)=>{if (accepted.has(item.id)) tasks[index]=accepted.get(item.id);});
    });
    if (ok) {$('#importDialog').close();render();toast('导入核对完成');}
    else if (preview.raw!==lastRaw) previewImport(preview.tasks);
  } finally {btn.disabled=false;}
};
$('#importDialog').addEventListener('close',()=>{importPreview=null;});
async function recover(raw,data) {
  if (!confirm('将使用这份备份恢复工作台，并保留当前无法读取的原始记录。继续恢复？')) return;
  const restore=()=>{
    if (localStorage.getItem(KEY)!==raw) throw Error('本机记录已变化，请刷新后重新核对。');
    const next=readPlanner(JSON.stringify(data));
    next.revision++;
    const encoded=JSON.stringify(next);
    if (raw!==null) localStorage.setItem(KEY+'-recovery-'+Date.now(),raw);
    localStorage.setItem(KEY,encoded);
    lastRaw=encoded;state=next;storageBlocked=false;
  };
  if (navigator.locks) await navigator.locks.request(KEY,restore); else restore();
  $('#saveState').textContent='已保存到本机';render();toast('已从备份恢复');
}
$('#importBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=async e=>{
  const file=e.target.files[0];
  if (!file) return;
  try {
    if (file.size>8000000) throw Error('备份过大');
    const data=validate(JSON.parse(await file.text()));
    if (storageBlocked) await recover(lastRaw,data);
    else {loadLatest();previewImport(data.tasks);}
  } catch (err) {toast('未导入：'+err.message);}
  finally {e.target.value='';}
};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());$('#addBtn').onclick=$('#addMonth').onclick=()=>openEditor();$('#prevYear').onclick=()=>{if(year>2020){year--;render();}};$('#nextYear').onclick=()=>{if(year<2100){year++;render();}};$('#nowBtn').onclick=()=>{const d=new Date();year=d.getFullYear();month=d.getMonth()+1;render();};$('#category').onchange=render;$('#search').oninput=render;
window.addEventListener('beforeprint',()=>render(true));
window.addEventListener('afterprint',()=>render());
$('#printBtn').onclick=()=>window.print();
function setView(v) {
  view=v;
  document.body.dataset.view=v;
  $('#workPanel').hidden=v!=='work';
  $('.workspace').hidden=v==='work';
  $('.toolbar').hidden=v==='work';
  $('#csvBtn').hidden=v==='work';
  for (const [selector,selected] of [['#calendarView',v==='calendar'],['#workView',v==='work']]) {
    $(selector).classList.toggle('active',selected);
    $(selector).setAttribute('aria-pressed',String(selected));
  }
  render();
}
function workRows(){return state.tasks.filter(t=>!t.deleted&&matchesWork(t,activeWork));}
function stageSort(a,b){const rank=t=>{const s=String(t.stage||'');if(/发动|^报名|^发布/.test(s))return 10;if(/院级审核|院级选拔/.test(s))return 20;if(s==='校赛'||s==='校级选拔'||/校级评审/.test(s))return 30;if(/国赛推荐/.test(s))return 70;if(s==='省赛'||s==='省赛现场决赛')return 60;if(/省赛备赛|省赛推荐/.test(s))return 50;if(/公示|资格复核|推荐报送|校赛后复核/.test(s))return 40;if(/国赛|全国总决赛/.test(s))return 80;return 99;};return a.year-b.year||(a.month||13)-(b.month||13)||rank(a)-rank(b);}
function renderWork(){if(!$('#workCards'))return;$('#workCards').innerHTML=WORKS.map(w=>{const rows=state.tasks.filter(t=>!t.deleted&&matchesWork(t,w.category)),n=rows.filter(t=>t.stage).length;return `<button aria-pressed="${activeWork===w.category}" class="work-card ${activeWork===w.category?'active':''}" data-work="${esc(w.category)}" style="--task-color:${colors[w.category]}"><span>${esc(w.cycle)}</span><h3>${esc(w.name)}</h3><p>${n?n+' 个阶段':rows.length?rows.length+' 项配套工作':'暂无已排事项'} · 查看排期 →</p></button>`;}).join('');const w=WORKS.find(w=>w.category===activeWork),rows=workRows(),stages=rows.filter(t=>t.stage).sort(stageSort),other=rows.filter(t=>!t.stage).sort(stageSort);$('#workTimeline').innerHTML=`<div class="work-title"><div><span class="small-label">单项工作 · 全周期排期</span><h2>${esc(w.name)}</h2></div><div><button id="exportWork">导出本项排期</button> <button id="addStage" class="primary">＋ 新增阶段</button></div></div><div class="stage-overview">${stages.map(t=>`<button class="${activeKey(t)?'is-important':''} ${isConditionalMilestone(t)?'is-conditional':''} ${t.status==='已完成'?'is-complete':t.status==='未晋级'?'not-qualified':''}" data-work-edit="${esc(t.id)}"><strong>${taskDate(t)}</strong><span>${esc(t.stage)}</span></button>`).join('')}</div><div class="stage-list">${stages.map((t,i)=>`<article class="stage-row ${activeKey(t)?'is-important':''} ${isConditionalMilestone(t)?'is-conditional':''} ${t.status==='已完成'?'is-complete':t.status==='未晋级'?'not-qualified':''}"><div class="stage-date"><span>阶段 ${String(i+1).padStart(2,'0')}</span><strong>${taskDate(t)}</strong><button data-calendar="${esc(t.id)}">${t.month?'在月历中查看 ↗':'安排月份 ↗'}</button></div><div class="stage-body"><div class="stage-top"><span class="stage-label">${esc(t.stage)}</span><span class="stage-state">${esc(t.status)}</span><button data-work-edit="${esc(t.id)}">✎ 编辑本阶段</button></div><h3>${esc(taskTitle(t))}</h3><p>${esc(t.action)}</p><div class="stage-fields" ${t.owner||t.output?'':'hidden'}>${t.output?'<div><b>应形成成果</b><p>'+esc(t.output)+'</p></div>':''}${t.owner?'<div><b>负责人</b><p>'+esc(t.owner)+'</p></div>':''}</div></div></article>`).join('')||'<p class="empty">暂无阶段，点击新增阶段编排本项工作。</p>'}</div><details class="support-tasks" ${other.length?'':'hidden'}><summary>配套工作与月度跟进（${other.length}项，可编辑）</summary>${other.map(t=>`<div><span>${taskDate(t)} · ${esc(taskTitle(t))}</span><button data-work-edit="${esc(t.id)}">编辑</button></div>`).join('')}</details>`;}
$('#calendarView').onclick=()=>setView('calendar');$('#workView').onclick=()=>setView('work');$('#workCards').onclick=e=>{const b=e.target.closest('[data-work]');if(b){activeWork=b.dataset.work;renderWork();}};
$('#workTimeline').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.workEdit)openEditor(b.dataset.workEdit);else if(b.dataset.calendar){const t=state.tasks.find(t=>t.id===b.dataset.calendar);if(!t.month){openEditor(t.id);return;}year=t.year;month=t.month;$('#category').value='';$('#search').value='';setView('calendar');render();}else if(b.id==='addStage'){openEditor();$('#taskForm [name=category]').value=activeWork;$('#taskForm [name=stage]').value='新阶段';}else if(b.id==='exportWork'){
  const rows=workRows().sort(stageSort);
  const content=plannerCsv([['年份','月份','阶段','事项','状态','具体工作','交付成果','负责人'],
    ...rows.map(t=>[t.year,t.month||'按通知',t.stage,taskTitle(t),t.status,t.action,t.output,t.owner])]);
  download(content,'text/csv;charset=utf-8',workLabel(activeWork)+'-全周期排期.csv');
}};
document.title='创院重点工作排期工作台';$('h1').innerHTML='创院重点工作排期工作台<span class="dot">.</span>';
setView('calendar');if(storageBlocked)$('#saveState').textContent='本机记录无法读取';





