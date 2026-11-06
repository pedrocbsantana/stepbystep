/* Interface de estudos. Integra-se ao estado db, agenda, timer e playlists existentes. */ (()=>{
  'use strict';
  const C=StudyCore,E=C.esc,today=C.dateKey;
  db.study??=C.empty();
  let S=db.study,subjectId=S.subjects[0]?.id||'',topicId='',noteId='',view='dashboard',preview=false,query='',focusStartedAt=null,dialogAction=null;
  const root=document.createElement('div');
  root.innerHTML=`<section id="studyPage" class="study-page" hidden><div class="study-top"><div><h1>Estudos</h1></div><div class="tools"><button id="exportStudy" hidden>Exportar backup</button><button id="importStudy" hidden>Importar backup</button><input id="studyFile" type="file" accept="application/json,.json" hidden></div></div><div class="study-layout"><aside class="study-sidebar"><input class="study-search" id="studySearch" placeholder="Buscar título, conteúdo ou tag…" aria-label="Buscar anotações"><button class="primary" id="addSubject">+ Matéria</button><div id="studyTree" class="study-tree"></div></aside><div id="studyEditor" class="study-editor"></div></div></section><section id="revisionPage" class="study-page" hidden><div class="study-top"><div><h1>Revisões</h1></div><button id="reviewGoStudies">Abrir estudos</button></div><details class="review-rules"><summary>Como funciona</summary><p>Etapas em 1, 3, 7 e 15 dias. “Lembrei bem” avança; “Parcialmente” repete em 2 dias; “Não lembrei” repete amanhã.</p></details><div id="reviewList"></div><h2 class="study-section-title">Próximas revisões</h2><div id="upcomingReviews"></div><h2 class="study-section-title">Revisões concluídas</h2><div id="reviewHistory" class="study-table-wrap"></div></section><section id="studyHistoryPage" class="study-page" hidden><div class="study-top"><div><h1>Histórico de estudos</h1></div><button id="historyGoStudies">Abrir estudos</button></div><div id="studyHistoryContent"></div></section><dialog id="studyDialog" class="study-dialog" aria-labelledby="studyDialogTitle"><form id="studyDialogForm"><h2 id="studyDialogTitle"></h2><div id="studyDialogBody"></div><p id="studyDialogError" class="event-error" role="alert"></p><div class="dialog-buttons"><button type="button" id="studyDialogCancel">Cancelar</button><button class="primary" id="studyDialogSubmit">Salvar</button></div></form></dialog><div id="studyToast" class="study-toast" role="status" hidden></div>`;
  document.querySelector('footer').before(root);
  const NAV_ICONS={"dashboard": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4\"/>", "studies": "<path d=\"M2.5 5.5c0-.8.7-1.5 1.5-1.5h5a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4c-.8 0-1.5-.7-1.5-1.5z\"/><path d=\"M21.5 5.5c0-.8-.7-1.5-1.5-1.5h-5a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20c.8 0 1.5-.7 1.5-1.5z\"/>", "reviews": "<path d=\"M3.5 12a8.5 8.5 0 0 1 14.6-5.9L20.5 8.5\"/><path d=\"M20.5 3.5v5h-5\"/><path d=\"M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5\"/><path d=\"M3.5 20.5v-5h5\"/>", "applications": "<rect x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2.5\"/><path d=\"M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7M3 12.5h18\"/>", "clareza": "<path d=\"M12 21c-4.4-1.6-7-5-7-9.2C5 7 8.6 4 12 3c3.4 1 7 4 7 8.8 0 4.2-2.6 7.6-7 9.2Z\"/><path d=\"M12 21V10\"/>", "history": "<path d=\"M3.5 3.5v17h17\"/><path d=\"M8 16v-3M12.5 16V9M17 16V6\"/>"},NAV_SHORT={"dashboard": "Dia", "studies": "Estudos", "reviews": "Revisões", "applications": "Vagas", "clareza": "Clareza", "history": "Histórico"};const nav=document.createElement('nav');
  nav.className='main-nav';
  nav.setAttribute('aria-label','Navegação principal');
  nav.innerHTML=[['dashboard','Meu dia'],['studies','Estudos'],['reviews','Revisões'],['applications','Candidaturas'],['clareza','Clareza'],['history','Histórico']].map(([id,label])=>`<button data-study-view="${id}" ${id==='dashboard'?'aria-current="page"':''} title="${label}"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[id]}</svg><span class="nav-label">${label}</span><span class="nav-short" aria-hidden="true">${NAV_SHORT[id]}</span></button>`).join('');
  document.querySelector('header .tag').replaceWith(nav);
  const dashboard=document.createElement('section');
  dashboard.id='studyDashboard';
  dashboard.className='card study-dashboard';
  const dashboardSlot=document.getElementById('studyDashboardSlot');if(dashboardSlot)dashboardSlot.replaceWith(dashboard);else document.querySelector('main .intro').after(dashboard);
  const context=document.createElement('div');
  context.id='focusStudyContext';
  context.className='focus-study-context';
  context.hidden=true;
  $('task').before(context);
  let toastTimeout;
  function toast(text){
    $('studyToast').textContent=text;
    $('studyToast').hidden=false;
    clearTimeout(toastTimeout);
    toastTimeout=setTimeout(()=>$('studyToast').hidden=true,4500)
  } function persist(message){
    try{
      localStorage.setItem(key,JSON.stringify(db));
      if($('noteSave'))$('noteSave').textContent='Salvo automaticamente';
      $('saveStatus').textContent='Salvo neste navegador.';
      if(message)toast(message);
      renderDashboard();
      return true
    }catch{
      if($('noteSave'))$('noteSave').textContent='Falha ao salvar';
      $('saveStatus').textContent='Falha ao salvar. Exporte um backup.';
      toast('Falha ao salvar. Exporte um backup.');
      return false
    }
  } function go(target){
    view=target;
    window.Applications?.setVisible(target==='applications');
    window.Clareza?.setVisible(target==='clareza');document.getElementById('clarezaPage')&&(document.getElementById('clarezaPage').hidden=target!=='clareza');
    document.body.classList.remove('focus-mode');
    $('focusMode').textContent='Expandir';
    document.querySelector('main').hidden=target!=='dashboard';
    $('studyPage').hidden=target!=='studies';
    $('revisionPage').hidden=target!=='reviews';
    $('studyHistoryPage').hidden=target!=='history';
    nav.querySelectorAll('button').forEach(b=>{
      if(b.dataset.studyView===target)b.setAttribute('aria-current','page');
      else b.removeAttribute('aria-current')
    });
    if(target==='studies')renderStudies();
    if(target==='reviews')renderReviews();
    if(target==='history')renderHistoryPage();
    window.FocusDock?.setView(target);
    const heading=document.querySelector('main:not([hidden]) h1, .study-page:not([hidden]) h1');
    if(heading){
      heading.tabIndex=-1;
      heading.focus({preventScroll:true});
      document.querySelector('.skip-link').href='#'+(heading.id||(heading.id='pageTitle-'+target));
    }
    window.scrollTo({top:0,behavior:'instant'})
  } nav.onclick=e=>{
    const b=e.target.closest('[data-study-view]');
    if(b)go(b.dataset.studyView)
  };
  $('reviewGoStudies').onclick=$('historyGoStudies').onclick=()=>go('studies');
  function modal(title,body,action,label='Salvar'){
    dialogAction=action;
    $('studyDialogTitle').textContent=title;
    $('studyDialogBody').innerHTML=body;
    $('studyDialogError').textContent='';
    $('studyDialogSubmit').textContent=label;
    if(!$('studyDialog').open)$('studyDialog').showModal()
  } $('studyDialogCancel').onclick=()=>$('studyDialog').close();
  $('studyDialogForm').onsubmit=e=>{
    e.preventDefault();
    try{
      if(dialogAction?.()!==false)$('studyDialog').close()
    }catch(err){
      $('studyDialogError').textContent=err.message
    }
  };
  const subject=()=>S.subjects.find(v=>v.id===subjectId),note=()=>S.notes.find(v=>v.id===noteId),sorted=a=>[...a].sort((a,b)=>(a.order||0)-(b.order||0));
  function descendants(id){
    const found=new Set([id]);
    let old;
    do{
      old=found.size;
      S.topics.forEach(t=>{
        if(found.has(t.parentId))found.add(t.id)
      })
    }while(old!==found.size);
    return found
  } function subjectOptions(selected=''){
    return sorted(S.subjects).map(v=>`<option value="${E(v.id)}" ${selected===v.id?'selected':''}>${E(v.name)}</option>`).join('')
  } function topicOptions(sid,selected='',exclude=new Set()){
    return '<option value="">Sem tópico</option>'+sorted(S.topics.filter(v=>v.subjectId===sid&&!exclude.has(v.id))).map(v=>`<option value="${E(v.id)}" ${selected===v.id?'selected':''}>${E(v.name)}</option>`).join('')
  } function editEntity(kind,id=null){
    const arr=kind==='subject'?S.subjects:S.topics,entity=arr.find(v=>v.id===id);
    if(kind==='topic'&&!subjectId){
      toast('Crie uma matéria primeiro.');
      return
    }modal((entity?'Editar ':'Nova ')+(kind==='subject'?'matéria':'tópico'),`<label for="entityName">Nome</label><input id="entityName" maxlength="120" required value="${E(entity?.name||'')}">${kind==='topic'?`<label for="entityParent">Tópico superior (opcional)</label><select id="entityParent">${
      topicOptions(subjectId,entity?.parentId||'',id?descendants(id):new Set())
    }</select>`:''}`,()=>{
      const name=$('entityName').value.trim();
      if(!name)throw Error('Informe um nome.');
      if(entity){
        entity.name=name;
        if(kind==='topic')entity.parentId=$('entityParent').value
      }else{
        const item={
          id:C.uid(),name,order:arr.length
        };
        if(kind==='topic'){
          item.subjectId=subjectId;
          item.parentId=$('entityParent').value;
          topicId=item.id
        }else{
          subjectId=item.id;
          topicId='';
          noteId=''
        }arr.push(item)
      }persist('Salvo.');
      renderStudies();
      refreshAgendaOptions()
    })
  } function removeEntity(kind,id){
    const entity=(kind==='subject'?S.subjects:kind==='topic'?S.topics:S.notes).find(v=>v.id===id);
    if(!entity)return;
    const topics=kind==='topic'?descendants(id):new Set(S.topics.filter(t=>t.subjectId===id).map(v=>v.id)),notes=kind==='note'?[entity]:S.notes.filter(v=>kind==='subject'?v.subjectId===id:topics.has(v.topicId));
    modal('Excluir '+(kind==='subject'?'matéria':kind==='topic'?'tópico':'anotação')+'?',`<p>“${E(entity.name||entity.title)}” será excluído${kind!=='note'?`, com ${
      notes.length
    } anotação(ões) relacionada(s)`:''}, incluindo perguntas e revisões. Sessões já registradas permanecem no histórico.</p>`,()=>{
      if(kind==='subject'){
        S.subjects=S.subjects.filter(v=>v.id!==id);
        S.topics=S.topics.filter(v=>v.subjectId!==id)
      }if(kind==='topic')S.topics=S.topics.filter(v=>!topics.has(v.id));
      const ids=new Set(notes.map(v=>v.id));
      S.notes=S.notes.filter(v=>!ids.has(v.id));
      if(ids.has(noteId))noteId='';
      if(!subject())subjectId=S.subjects[0]?.id||'';
      if(!S.topics.some(v=>v.id===topicId))topicId='';
      persist('Excluído.');
      renderStudies();
      refreshAgendaOptions()
    },'Excluir')
  } function reorder(kind,id,direction){
    const arr=kind==='subject'?S.subjects:kind==='topic'?S.topics:S.notes,item=arr.find(v=>v.id===id),peers=sorted(arr.filter(v=>kind==='subject'||(v.subjectId===item.subjectId&&(kind==='topic'?(v.parentId||'')===(item.parentId||''):(v.topicId||'')===(item.topicId||'')))));
    const from=peers.indexOf(item),to=from+direction;
    if(to<0||to>=peers.length)return;
    [peers[from],peers[to]]=[peers[to],peers[from]];
    peers.forEach((v,i)=>v.order=i);
    persist();
    renderStudies()
  } function actions(kind,id){
    return `<span class="tree-actions"><button data-entity="${kind}" data-id="${id}" data-do="up" aria-label="Mover para cima">↑</button><button data-entity="${kind}" data-id="${id}" data-do="down" aria-label="Mover para baixo">↓</button><button data-entity="${kind}" data-id="${id}" data-do="edit" aria-label="Editar">✎</button><button data-entity="${kind}" data-id="${id}" data-do="delete" aria-label="Excluir">×</button></span>`
  } function renderTree(){
    if(query){
      const q=query.toLocaleLowerCase('pt-BR'),matches=S.notes.filter(n=>[n.title,n.body,n.learned,n.explanation,n.tags,...n.questions.map(v=>v.question+' '+v.answer)].join(' ').toLocaleLowerCase('pt-BR').includes(q));
      $('studyTree').innerHTML=matches.map(n=>`<div class="tree-line"><button class="tree-name" data-note="${n.id}">${E(n.title||'Sem título')}<span class="small"> · ${E(S.subjects.find(s=>s.id===n.subjectId)?.name)}</span></button></div>`).join('')||'<p class="small">Nenhuma anotação encontrada.</p>';
      return
    }const notesHTML=(sid,tid)=>sorted(S.notes.filter(n=>n.subjectId===sid&&(n.topicId||'')===tid)).map(n=>`<div class="tree-note tree-line"><button class="tree-name ${noteId===n.id?'active':''}" data-note="${n.id}">↳ ${E(n.title||'Sem título')}</button>${actions('note',n.id)}</div>`).join('');
    const topicsHTML=(sid,parent='')=>sorted(S.topics.filter(t=>t.subjectId===sid&&(t.parentId||'')===parent)).map(t=>`<div class="tree-topic"><div class="tree-line"><button class="tree-name ${topicId===t.id?'active':''}" data-topic="${t.id}">${E(t.name)}</button>${actions('topic',t.id)}</div>${notesHTML(sid,t.id)}${topicsHTML(sid,t.id)}</div>`).join('');
    $('studyTree').innerHTML=sorted(S.subjects).map(s=>`<div class="tree-subject"><div class="tree-line"><button class="tree-name ${subjectId===s.id?'active':''}" data-subject="${s.id}">${E(s.name)}</button>${actions('subject',s.id)}</div>${topicsHTML(s.id)}${notesHTML(s.id,'')}</div>`).join('')||''
  } $('addSubject').onclick=()=>editEntity('subject');
  $('studySearch').oninput=()=>{
    query=$('studySearch').value;
    renderTree()
  };
  $('studyTree').onclick=e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if(b.dataset.do){
      const {
        entity,id,do:action
      }=b.dataset;
      if(action==='delete')removeEntity(entity,id);
      else if(action==='edit'){
        if(entity==='note')openNote(id);
        else{
          if(entity==='topic')subjectId=S.topics.find(v=>v.id===id).subjectId;
          editEntity(entity,id)
        }
      }else reorder(entity,id,action==='up'?-1:1);
      return
    }if(b.dataset.note){
      openNote(b.dataset.note);
      return
    }if(b.dataset.subject){
      subjectId=b.dataset.subject;
      topicId='';
      noteId=''
    }if(b.dataset.topic){
      const t=S.topics.find(t=>t.id===b.dataset.topic);
      subjectId=t.subjectId;
      topicId=t.id;
      noteId=''
    }renderStudies()
  };
  function openNote(id){
    noteId=id;
    const n=note();
    if(!n)return;
    subjectId=n.subjectId;
    topicId=n.topicId||'';
    preview=false;
    go('studies')
  } function createNote(){
    if(!subjectId)return;
    const now=new Date().toISOString();
    const n={
      id:C.uid(),subjectId,topicId,title:'Nova anotação',body:'',tags:'',learned:'',explanation:'',questions:[],createdAt:now,updatedAt:now,order:S.notes.length,review:null
    };
    S.notes.push(n);
    noteId=n.id;
    preview=false;
    persist();
    renderStudies();
    $('noteTitle').focus();
    $('noteTitle').select()
  } function relatedNotesHTML(){
    const ids=topicId?descendants(topicId):null;
    const notes=sorted(S.notes.filter(n=>n.subjectId===subjectId&&(!ids||ids.has(n.topicId))));
    return notes.length?'<div class="study-related" style="margin:18px 0">'+notes.map(n=>`<p><button data-related-note="${n.id}">${E(n.title||'Sem título')}</button></p>`).join('')+'</div>':''
  } function renderStudies(){
    renderTree();
    const n=note();
    if(!n){
      $('studyEditor').innerHTML=subject()?`<div class="study-empty"><h2>Nenhuma anotação aberta</h2><p>${E(topicId?S.topics.find(t=>t.id===topicId)?.name:subject().name)}</p>${relatedNotesHTML()}<div class="study-row" style="justify-content:center"><button class="primary" id="newNote">+ Anotação</button><button id="newTopic">+ Tópico</button><button id="subjectFocus">Iniciar foco</button></div></div>`:'<div class="study-empty"><h2>Nenhuma matéria</h2><button class="primary" id="firstSubject">Criar matéria</button></div>';
      $('studyEditor').querySelectorAll('[data-related-note]').forEach(b=>b.onclick=()=>openNote(b.dataset.relatedNote));
      if($('newNote'))$('newNote').onclick=createNote;
      if($('newTopic'))$('newTopic').onclick=()=>editEntity('topic');
      if($('firstSubject'))$('firstSubject').onclick=()=>editEntity('subject');
      if($('subjectFocus'))$('subjectFocus').onclick=()=>beginStudy(subjectId,topicId);
      return
    } $('studyEditor').innerHTML=`<div class="note-location"><select id="noteSubject" aria-label="Matéria da anotação">${subjectOptions(n.subjectId)}</select><select id="noteTopic" aria-label="Tópico da anotação">${topicOptions(n.subjectId,n.topicId)}</select><button class="quiet" id="newNote">+ Anotação</button><button class="quiet" id="newTopic">+ Tópico</button></div><input class="note-title" id="noteTitle" aria-label="Título da anotação" maxlength="200" value="${E(n.title)}"><div class="note-meta">Criada: ${new Date(n.createdAt).toLocaleString('pt-BR')} · Editada: <span id="noteEdited">${new Date(n.updatedAt).toLocaleString('pt-BR')}</span> · <span class="study-save" id="noteSave">Salvo automaticamente</span></div><input class="study-tags" id="noteTags" aria-label="Tags da anotação" placeholder="Tags opcionais, separadas por vírgula" value="${E(n.tags)}"><div class="note-tools"><div class="study-row"><button id="previewNote">${preview?'Editar Markdown':'Visualizar'}</button><button class="primary" id="noteFocus">Iniciar foco</button></div><button id="scheduleNote">${n.review?.enabled?'Desativar revisões':n.review?.nextDue?'Retomar revisões':'Concluir estudo e revisar'}</button></div><div class="small">${reviewLabel(n)}</div><div class="md-toolbar" ${preview?'hidden':''}><button data-md="heading">H2</button><button data-md="bold"><strong>B</strong></button><button data-md="italic"><em>I</em></button><button data-md="list">Lista</button><button data-md="check">☐ Lista</button><button data-md="code">&lt;/&gt; Código</button></div><textarea class="markdown-source" id="noteBody" aria-label="Conteúdo Markdown" spellcheck="false" placeholder="Escreva em Markdown. Use três crases para blocos de código." ${preview?'hidden':''}>${E(n.body)}</textarea><div class="markdown-preview" id="notePreview" ${preview?'':'hidden'}>${C.markdown(n.body)||'<p class="small">Vazio.</p>'}</div><details class="active-learning"><summary>Fixação</summary><label for="noteLearned">O que aprendi?</label><textarea id="noteLearned" >${E(n.learned)}</textarea><label for="noteExplanation">Com minhas palavras</label><textarea id="noteExplanation" >${E(n.explanation)}</textarea><h3 class="study-section-title">Perguntas de fixação</h3><div id="noteQuestions">${questionHTML(n)}</div><button id="addQuestion">+ Pergunta</button></details>`;
    $('newNote').onclick=createNote;
    $('newTopic').onclick=()=>editEntity('topic');
    for(const id of ['noteTitle','noteBody','noteTags','noteLearned','noteExplanation'])$(id).oninput=flushNote;
    $('previewNote').onclick=()=>{
      preview=!preview;
      renderStudies()
    };
    $('noteFocus').onclick=()=>beginStudy(n.subjectId,n.topicId,n.id);
    $('scheduleNote').onclick=()=>{
      if(n.review?.enabled){
        n.review.enabled=false;
        persist('Agendamento desativado.');
        renderStudies()
      }else if(n.review?.nextDue){
        n.review.enabled=true;
        n.review.nextDue=[n.review.nextDue,C.addDays(today(),1)].sort().pop();
        persist('Revisões retomadas.');
        renderStudies()
      }else modal('Concluir estudo e programar revisões?','<p>Revisões em 1, 3, 7 e 15 dias a partir de hoje. O histórico anterior será preservado.</p>',()=>{
        C.schedule(n);
        persist('Estudo concluído. Primeira revisão amanhã.');
        renderStudies()
      },'Programar')
    };
    $('noteSubject').onchange=()=>{
      n.subjectId=$('noteSubject').value;
      n.topicId='';
      subjectId=n.subjectId;
      topicId='';
      touch(n);
      persist();
      renderStudies()
    };
    $('noteTopic').onchange=()=>{
      n.topicId=$('noteTopic').value;
      topicId=n.topicId;
      touch(n);
      persist();
      renderStudies()
    };
    $('addQuestion').onclick=()=>{
      n.questions.push({
        id:C.uid(),question:'',answer:''
      });
      touch(n);
      persist();
      $('noteQuestions').innerHTML=questionHTML(n)
    };
    $('noteQuestions').oninput=e=>{
      const t=e.target,q=n.questions.find(q=>q.id===t.dataset.qid);
      if(q){
        q[t.dataset.field]=t.value;
        touch(n);
        persist()
      }
    };
    $('noteQuestions').onclick=e=>{
      const id=e.target.dataset.deleteQ;
      if(id)modal('Excluir pergunta?','<p>A pergunta e sua resposta serão removidas.</p>',()=>{
        n.questions=n.questions.filter(v=>v.id!==id);
        touch(n);
        persist();
        $('noteQuestions').innerHTML=questionHTML(n)
      },'Excluir')
    };
    $('studyEditor').querySelectorAll('[data-md]').forEach(b=>b.onclick=()=>insertMarkdown(b.dataset.md));
    $('noteBody').onkeydown=e=>{
      if(e.key==='Tab'){
        e.preventDefault();
        insertText('  ','')
      }
    }
  } function questionHTML(n){
    return n.questions.map((q,i)=>`<div class="qa-card"><label>Pergunta ${i+1}</label><input data-qid="${q.id}" data-field="question" aria-label="Pergunta ${i+1}" value="${E(q.question)}" placeholder="O que você quer lembrar?"><details><summary>Revelar / editar resposta</summary><textarea data-qid="${q.id}" data-field="answer" aria-label="Resposta ${i+1}">${E(q.answer)}</textarea></details><button data-delete-q="${q.id}">Excluir pergunta</button></div>`).join('')
  } function touch(n){
    n.updatedAt=new Date().toISOString();
    if($('noteEdited'))$('noteEdited').textContent=new Date(n.updatedAt).toLocaleString('pt-BR')
  } function flushNote(){
    const n=note();
    if(!n||!$('noteTitle'))return;
    n.title=$('noteTitle').value;
    n.body=$('noteBody').value;
    n.tags=$('noteTags').value;
    n.learned=$('noteLearned').value;
    n.explanation=$('noteExplanation').value;
    touch(n);
    persist();
    renderTree()
  } function insertText(before,after){
    const t=$('noteBody'),a=t.selectionStart,b=t.selectionEnd;
    t.setRangeText(before+t.value.slice(a,b)+after,a,b,'end');
    t.focus();
    flushNote()
  } function insertMarkdown(kind){
    const w={
      heading:['\n## ',''],bold:['**','**'],italic:['*','*'],list:['\n- ',''],check:['\n- [ ] ',''],code:['\n```abap\n','\n```\n']
    };
    insertText(...w[kind])
  } function reviewLabel(n){
    const r=n.review;
    return r?.enabled?`Próxima revisão: ${r.nextDue} · etapa ${r.stage+1}/4`:r?.history?.length?'Revisões pausadas ou ciclo concluído. Histórico preservado.':'Sem revisões agendadas.'
  } function pending(){
    return S.notes.filter(n=>n.review?.enabled&&n.review.nextDue&&n.review.nextDue<=today())
  } function renderReviews(){
    const items=pending();
    $('reviewList').innerHTML=items.length?items.map(n=>`<article class="review-card"><h3>${E(n.title)}</h3><p class="small">${E(S.subjects.find(s=>s.id===n.subjectId)?.name)} · prevista para ${E(n.review.nextDue)} · etapa ${n.review.stage+1}/4</p><details><summary>Perguntas e respostas</summary>${n.questions.map(q=>`<div class="qa-card"><strong>${
      E(q.question)
    }</strong><details><summary>Revelar resposta</summary><p style="white-space:pre-wrap">${
      E(q.answer)
    }</p></details></div>`).join('')||'<p class="small">Sem perguntas.</p>'}</details><button data-open-review="${n.id}" style="margin-top:14px">Consultar anotação</button><div class="ratings"><button data-rate="no" data-note="${n.id}">Não lembrei</button><button data-rate="partial" data-note="${n.id}">Parcialmente</button><button data-rate="good" data-note="${n.id}">Lembrei bem</button></div></article>`).join(''):'<div class="card study-empty"><h2>Nada para revisar hoje</h2></div>';
    $('upcomingReviews').innerHTML=S.notes.filter(n=>n.review?.enabled&&n.review.nextDue>today()).sort((a,b)=>a.review.nextDue.localeCompare(b.review.nextDue)).map(n=>`<p class="small">${n.review.nextDue} · ${E(n.title)}</p>`).join('')||'<p class="small">Nenhuma revisão futura agendada.</p>';
    const history=S.notes.flatMap(n=>(n.review?.history||[]).map(h=>({
      ...h,title:n.title
    }))).sort((a,b)=>b.date.localeCompare(a.date));
    $('reviewHistory').innerHTML=history.length?`<table class="study-table"><thead><tr><th>Data</th><th>Anotação</th><th>Etapa</th><th>Lembrança</th></tr></thead><tbody>${history.map(h=>`<tr><td>${
      h.date
    }</td><td>${
      E(h.title)
    }</td><td>${
      h.stage+1
    }</td><td>${
      {
        no:'Não lembrei',partial:'Parcialmente',good:'Bem'
      }[h.rating]
    }</td></tr>`).join('')}</tbody></table>`:'<p class="small">Nenhuma revisão concluída ainda.</p>'
  } $('reviewList').onclick=e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if(b.dataset.openReview){
      openNote(b.dataset.openReview);
      return
    }const n=S.notes.find(n=>n.id===b.dataset.note);
    if(n&&C.rate(n,b.dataset.rate)){
      persist('Revisão registrada.');
      renderReviews()
    }
  };
  function formatMinutes(m){
    return m<60?`${Math.round(m*10)/10} min`:`${Math.floor(m/60)}h ${Math.round(m%60)}min`
  } function nextReviewLabel(){
    const next=S.notes.filter(n=>n.review?.enabled&&n.review.nextDue).map(n=>n.review.nextDue).sort()[0];
    if(!next)return '—';
    const t=today();
    if(next<=t)return 'Hoje';
    if(next===C.addDays(t,1))return 'Amanhã';
    return new Date(next+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  }
  function renderDashboard(){
    const now=today(),start=new Date(now+'T12:00:00');
    start.setDate(start.getDate()-((start.getDay()+6)%7));
    const week=C.dateKey(start),sessions=S.sessions,t=sessions.filter(v=>v.date===now).reduce((n,v)=>n+v.minutes,0),w=sessions.filter(v=>v.date>=week&&v.date<=now).reduce((n,v)=>n+v.minutes,0),recent=[...new Set([...sessions].sort((a,b)=>(b.finishedAt||b.date).localeCompare(a.finishedAt||a.date)).map(v=>v.subjectName))].slice(0,3);
    dashboard.innerHTML=`<div class="heading"><h2>Estudos</h2><button class="quiet" data-open-studies>Abrir</button></div><div class="study-stats"><div class="study-stat"><strong>${formatMinutes(t)}</strong><span>Estudados hoje</span></div><div class="study-stat"><strong>${formatMinutes(w)}</strong><span>Nesta semana</span></div><div class="study-stat"><strong>${pending().length}</strong><span>Revisões pendentes</span></div><div class="study-stat"><strong>${nextReviewLabel()}</strong><span>Próxima revisão</span></div></div><div class="study-row" style="justify-content:space-between"><span class="small">${recent.length?'Recentes: '+recent.map(E).join(' · '):''}</span><button class="quiet" data-open-study-history>Ver histórico</button></div>`
  } dashboard.onclick=e=>{
    if(e.target.closest('[data-open-studies]'))go('studies');
    if(e.target.closest('[data-open-study-history]'))go('history')
  };
  function renderHistoryPage(){
    const grouped={
    };
    S.sessions.forEach(v=>{
      grouped[v.date]??={
        minutes:0,count:0,subjects:new Set()
      };
      grouped[v.date].minutes+=v.minutes;
      grouped[v.date].count++;
      grouped[v.date].subjects.add(v.subjectName)
    });
    const keys=Object.keys(grouped).sort().reverse();
    $('studyHistoryContent').innerHTML=keys.length?`<div class="card study-table-wrap"><table class="study-table"><thead><tr><th>Dia</th><th>Tempo real</th><th>Sessões</th><th>Matérias</th></tr></thead><tbody>${keys.map(k=>`<tr><td>${
      k
    }</td><td>${
      formatMinutes(grouped[k].minutes)
    }</td><td>${
      grouped[k].count
    }</td><td>${
      [...grouped[k].subjects].map(E).join(', ')
    }</td></tr>`).join('')}</tbody></table><h2 class="study-section-title">Sessões</h2>${[...S.sessions].sort((a,b)=>(b.finishedAt||b.date).localeCompare(a.finishedAt||a.date)).map(v=>`<p class="small">${
      v.date
    } · ${
      E(v.subjectName)
    }${
      v.topicName?' / '+E(v.topicName):''
    } · ${
      formatMinutes(v.minutes)
    }${
      v.noteTitle?' · '+E(v.noteTitle):''
    }</p>`).join('')}</div>`:'<div class="card study-empty"><h2>Nenhuma sessão registrada</h2></div>'
  } // Tempo real: só trechos em execução nesta aba. IDs únicos impedem duplicação.
  function elapsed(){
    return (S.active?.elapsedMs||0)+(focusStartedAt!==null?Math.max(0,Date.now()-focusStartedAt):0)
  } function updateFocusClock(){
    if(!S.active||!$('studyFocusClock'))return;
    const sec=Math.floor(elapsed()/1000);
    $('studyFocusClock').textContent=`Foco: ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} · Playlist: ${selectedMusic()?.name||'Sem música'}`
  } function updateFocusContext(){
    const a=S.active;
    context.hidden=!a;
    if(!a)return;
    context.innerHTML=`<div class="study-row"><strong>Estudando ${E(a.subjectName)}</strong><button id="recordStudySession">Registrar sessão</button></div><div class="small">${E(a.topicName||'Sem tópico')}${a.noteTitle?' · '+E(a.noteTitle):''}</div><div class="small" id="studyFocusClock"></div>`;
    $('recordStudySession').onclick=()=>{
      if(running)pause();
      else onPause();
      recordSession()
    };
    updateFocusClock()
  } function beginStudy(sid,tid='',nid='',eventRef=null){
    if(S.active){
      toast('Registre ou descarte a sessão atual antes de iniciar outra.');
      go('dashboard');
      context.scrollIntoView({
        block:'center',behavior:'smooth'
      });
      return
    }const sub=S.subjects.find(v=>v.id===sid);
    if(!sub){
      toast('A matéria vinculada não está disponível.');
      return
    }if(running)pause();
    const top=S.topics.find(v=>v.id===tid),n=S.notes.find(v=>v.id===nid);
    S.active={
      id:C.uid(),subjectId:sid,topicId:tid,noteId:nid,subjectName:sub.name,topicName:top?.name||'',noteTitle:n?.title||'',elapsedMs:0,createdAt:new Date().toISOString(),eventRef
    };
    focusStartedAt=null;
    persist();
    go('dashboard');
    updateFocusContext();
    day.task=n?.title||[sub.name,top?.name].filter(Boolean).join(' / ');
    $('task').value=day.task;
    save();
    context.scrollIntoView({
      block:'center',behavior:'smooth'
    });
    $('start').click()
  } function onStart(){
    if(S.active&&focusStartedAt===null){
      focusStartedAt=Date.now();
      updateFocusClock()
    }
  } function onPause(){
    if(S.active&&focusStartedAt!==null){
      S.active.elapsedMs=elapsed();
      focusStartedAt=null;
      persist();
      updateFocusClock()
    }
  } function recordSession(){
    const a=S.active;
    if(!a)return;
    onPause();
    modal('Registrar tempo estudado',`<p class="small">${E(a.subjectName)}${a.topicName?' / '+E(a.topicName):''}</p><label for="studyMinutes">Minutos efetivamente estudados</label><input id="studyMinutes" type="number" min="0.1" max="1440" step="0.1" required value="${Math.max(.1,Math.round(a.elapsedMs/6000)/10)}"><p class="small">Medido: ${formatMinutes(a.elapsedMs/60000)}. Ajuste se necessário. Só o tempo confirmado entra no progresso.</p><button type="button" id="discardStudySession" class="quiet" style="margin-top:15px">Descartar sessão sem registrar</button>`,()=>{
      const m=Number($('studyMinutes').value);
      if(!Number.isFinite(m)||m<=0||m>1440)throw Error('Informe de 0,1 a 1440 minutos.');
      if(!S.sessions.some(v=>v.id===a.id))S.sessions.push({
        ...a,date:today(),minutes:m,finishedAt:new Date().toISOString()
      });
      if(a.eventRef){
        const event=db.days[a.eventRef.date]?.appointments?.find(v=>v.id===a.eventRef.id);
        if(event)event.done=true
      }S.active=null;
      focusStartedAt=null;
      persist('Sessão registrada.');
      updateFocusContext();
      renderAgenda();
      renderHistoryPage()
    },'Registrar');
    $('discardStudySession').onclick=()=>{
      modal('Descartar sessão?','<p>O tempo desta sessão não entrará no histórico de estudos.</p>',()=>{
        S.active=null;
        focusStartedAt=null;
        persist('Sessão descartada.');
        updateFocusContext()
      },'Descartar')
    }
  } const eventExtra=document.createElement('div');
  eventExtra.innerHTML=`<label for="eventType">Tipo de compromisso</label><select id="eventType"><option value="regular">Compromisso</option><option value="study">Estudo</option></select><div id="eventStudyFields" hidden><label for="eventSubject">Matéria</label><select id="eventSubject"></select><label for="eventTopic">Tópico (opcional)</label><select id="eventTopic"></select><div id="eventStudyActions"></div></div>`;
  $('eventTitle').previousElementSibling.before(eventExtra);
  function refreshAgendaOptions(){
    const sid=$('eventSubject').value;
    $('eventSubject').innerHTML='<option value="">Escolher matéria</option>'+subjectOptions(sid);
    $('eventTopic').innerHTML=topicOptions($('eventSubject').value);
    $('eventSubject').required=$('eventType').value==='study'
  } function hydrateStudyEvent(v,eventDate){
    $('eventType').value=v?.type==='study'?'study':'regular';
    refreshAgendaOptions();
    $('eventSubject').value=v?.subjectId||'';
    $('eventTopic').innerHTML=topicOptions(v?.subjectId||'',v?.topicId||'');
    $('eventStudyFields').hidden=$('eventType').value!=='study';
    $('eventSubject').required=$('eventType').value==='study';
    $('eventStudyActions').innerHTML=v?.type==='study'?`<button type="button" id="eventOpenNotes">Abrir anotações</button><button type="button" id="eventStartFocus">Iniciar foco</button><button type="button" id="eventCompleteStudy">${v.done?'Sessão concluída':'Marcar concluída'}</button>`:'';
    if(v?.type==='study'){
      $('eventOpenNotes').onclick=()=>{
        const sid=$('eventSubject').value,tid=$('eventTopic').value;
        if(!S.subjects.some(s=>s.id===sid)){
          toast('Escolha uma matéria disponível.');
          return
        }subjectId=sid;
        topicId=tid;
        noteId='';
        query='';
        $('studySearch').value='';
        $('eventDialog').close();
        go('studies')
      };
      $('eventStartFocus').onclick=()=>{
        const sid=$('eventSubject').value,tid=$('eventTopic').value;
        $('eventDialog').close();
        beginStudy(sid,tid,'',{
          date:eventDate,id:v.id
        })
      };
      $('eventCompleteStudy').onclick=()=>{
        const event=db.days[eventDate]?.appointments?.find(e=>e.id===v.id);
        if(event){
          event.done=true;
          $('eventDone').checked=true;
          save();
          renderAgenda();
          $('eventCompleteStudy').textContent='Sessão concluída';
          toast('Compromisso concluído.')
        }
      }
    }
  } function readStudyEvent(){
    return $('eventType').value==='study'?{
      type:'study',subjectId:$('eventSubject').value,topicId:$('eventTopic').value
    }:{
      type:'regular'
    }
  } $('eventType').onchange=()=>{
    $('eventStudyFields').hidden=$('eventType').value!=='study';
    $('eventSubject').required=$('eventType').value==='study'
  };
  $('eventSubject').onchange=()=>{
    $('eventTopic').innerHTML=topicOptions($('eventSubject').value)
  };
  refreshAgendaOptions();
  window.StudyUI={refresh(){S=db.study;renderDashboard();refreshAgendaOptions();if(!subject())subjectId=S.subjects[0]?.id||'';if(view==='studies')renderStudies();if(view==='reviews')renderReviews();if(view==='history')renderHistoryPage()}};
  window.StudyBridge={
    onStart,onPause,onFinish:()=>{
      onPause();
      recordSession()
    },openEvent:hydrateStudyEvent,readEvent:readStudyEvent
  };
  setInterval(updateFocusClock,1000);
  window.addEventListener('pagehide',onPause);
  $('exportStudy').onclick=()=>{
    if(running)pause();
    else onPause();
    db.meta??={};db.meta.lastBackupAt=Date.now();delete db.meta.backupSnoozeUntil;
    try{localStorage.setItem(key,JSON.stringify(db))}catch{}
    window.renderBackupNudge?.();
    const payload={
      format:'stepbystep-backup',version:1,exportedAt:new Date().toISOString(),data:db
    },blob=new Blob([JSON.stringify(payload,null,2)],{
      type:'application/json'
    }),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;
    a.download=`stepbystep-backup-${today()}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    toast('Backup exportado.')
  };
  $('importStudy').onclick=()=>$('studyFile').click();
  $('studyFile').onchange=async()=>{
    const f=$('studyFile').files[0];
    $('studyFile').value='';
    if(!f)return;
    try{
      if(f.size>20*1024*1024)throw Error('O backup deve ter até 20 MB.');
      const incoming=C.validateBackup(JSON.parse(await f.text()));
      modal('Importar backup?',`<p>Registros novos serão adicionados. Os existentes não mudam.</p><p class="small">${incoming.study.subjects.length} matérias, ${incoming.study.notes.length} anotações e ${incoming.study.sessions.length} sessões no arquivo.</p>`,()=>{
        if(running)pause();
        const merged=C.mergeBackup(db,incoming);
        localStorage.setItem(key,JSON.stringify(merged));
        db=merged;
        S=db.study;
        day=db.days[date];
        subjectId=S.subjects[0]?.id||'';
        noteId='';
        topicId='';
        persist('Backup importado.');
        renderStudies();
        renderAgenda();
        renderHistory();
        renderWeek();
        refreshAgendaOptions();
        renderMusic();
        updateFocusContext();
        window.Clareza?.refresh();window.applySections?.();window.renderBackupNudge?.()
      },'Importar')
    }catch(err){
      toast(err.message||'Não foi possível ler o arquivo.')
    }
  };
  renderDashboard();
  updateFocusContext();
  if(S.active)toast('Sessão de estudo pausada.');
})();
