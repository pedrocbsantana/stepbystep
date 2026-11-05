/* StepByStep: regras puras, sem dependências nem acesso ao navegador. */ (function(root){
  'use strict';
  const uid=()=> 's-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const validDate=d=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
    const dt=new Date(d+'T12:00:00');
    return !isNaN(dt)&&dateKey(dt)===d
  };
  const addDays=(key,n)=>{
    const d=new Date(key+'T12:00:00');
    d.setDate(d.getDate()+n);
    return dateKey(d)
  };
  const intervals=[1,3,7,15];
  const empty=()=>({
    version:1,subjects:[],topics:[],notes:[],sessions:[],active:null
  });
  function schedule(note,date=dateKey()){
    const history=note.review?.history||[];
    note.review={
      enabled:true,cycle:uid(),completedOn:date,stage:0,nextDue:addDays(date,1),history
    }
  } function rate(note,rating,date=dateKey()){
    const r=note.review;
    if(!r?.enabled||!r.nextDue||r.nextDue>date||!['no','partial','good'].includes(rating))return false;
    const {
      nextDue:due,stage,cycle
    }=r;
    if(r.history.some(h=>h.cycle===cycle&&h.due===due&&h.stage===stage&&h.date===date))return false;
    r.history.push({
      id:uid(),cycle,date,due,stage,rating
    });
    if(rating==='good'){
      r.stage++;
      r.nextDue=r.stage<4?[addDays(r.completedOn,intervals[r.stage]),addDays(date,1)].sort().pop():null;
      if(!r.nextDue)r.enabled=false
    }  else r.nextDue=addDays(date,rating==='no'?1:2);
    return true;
  } const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  function highlight(text){
    const re=/(\/\/[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:SELECT|FROM|WHERE|INTO|DATA|TYPE|LOOP|ENDLOOP|IF|ENDIF|CLASS|METHOD|ENDMETHOD|define|view|entity|as|select|inner|join|on|association|const|let|function|return|async|await|import|export|class|public|private|static|void|new|if|else|for|while|true|false|null)\b|\b\d+(?:\.\d+)?\b)/gi;
    let html='',last=0;
    for(const m of text.matchAll(re)){
      html+=esc(text.slice(last,m.index));
      const kind=m[0].startsWith('//')?'comment':/^["']/.test(m[0])?'string':/^\d/.test(m[0])?'number':'keyword';
      html+=`<span class="syntax-${kind}">${esc(m[0])}</span>`;
      last=m.index+m[0].length
    }return html+esc(text.slice(last))
  } function inline(t){
    return esc(t).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>')
  } function markdown(text){
    let html='',inCode=false,buffer=[],lang='';
    for(const line of String(text).split('\n')){
      if(line.startsWith('```')){
        if(inCode){
          html+=`<pre><span class="code-lang">${esc(lang||'código')}</span><code>${highlight(buffer.join('\n'))}</code></pre>`;
          buffer=[]
        }else lang=line.slice(3).trim();
        inCode=!inCode;
        continue
      }if(inCode){
        buffer.push(line);
        continue
      }const heading=line.match(/^(#{1,3})\s+(.+)$/),check=line.match(/^\s*- \[([ xX])\] (.*)$/),list=line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if(heading)html+=`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
      else if(check)html+=`<div class="md-check">${check[1].toLowerCase()==='x'?'☑':'☐'} ${inline(check[2])}</div>`;
      else if(list)html+=`<div class="md-list">• ${inline(list[1])}</div>`;
      else html+=line?`<p>${inline(line)}</p>`:'<div class="md-space"></div>'
    }if(inCode)html+=`<pre><code>${highlight(buffer.join('\n'))}</code></pre>`;
    return html
  } function validateStudy(s){
    if(!s||s.version!==1)throw Error('Versão de estudos inválida.');
    for(const k of ['subjects','topics','notes','sessions']){
      if(!Array.isArray(s[k])||s[k].length>100000)throw Error('Formato inválido: '+k);
      const ids=new Set();
      for(const v of s[k]){
        if(!v||typeof v.id!=='string'||!/^[A-Za-z0-9_-]+$/.test(v.id)||ids.has(v.id))throw Error('Identificador inválido ou duplicado.');
        ids.add(v.id)
      }
    }  const text=(v,k)=>{
      if(typeof v[k]!=='string')throw Error('Campo inválido: '+k)
    };
    s.subjects.forEach(v=>text(v,'name'));
    for(const v of s.topics){
      text(v,'name');
      if(!s.subjects.some(x=>x.id===v.subjectId))throw Error('Tópico sem matéria.');
      const seen=new Set([v.id]);
      let parent=v.parentId;
      while(parent){
        const t=s.topics.find(x=>x.id===parent&&x.subjectId===v.subjectId);
        if(!t||seen.has(parent))throw Error('Hierarquia de tópicos inválida.');
        seen.add(parent);
        parent=t.parentId
      }
    }  for(const v of s.notes){
      for(const k of ['title','body','tags','learned','explanation','createdAt','updatedAt'])text(v,k);
      if(!s.subjects.some(x=>x.id===v.subjectId)||!Array.isArray(v.questions))throw Error('Anotação inválida.');
      if(v.topicId&&!s.topics.some(t=>t.id===v.topicId&&t.subjectId===v.subjectId))throw Error('Anotação sem tópico válido.');
      for(const q of v.questions){
        text(q,'id');
        text(q,'question');
        text(q,'answer');
        if(!/^[A-Za-z0-9_-]+$/.test(q.id))throw Error('Pergunta inválida.')
      }if(v.review){
        const r=v.review;
        if(!Array.isArray(r.history)||!Number.isInteger(r.stage)||r.stage<0||r.stage>4||!validDate(r.completedOn)||(r.nextDue!==null&&!validDate(r.nextDue)))throw Error('Agendamento inválido.');
        for(const h of r.history)if(!validDate(h.date)||!validDate(h.due)||!['no','partial','good'].includes(h.rating)||!Number.isInteger(h.stage))throw Error('Histórico de revisão inválido.')
      }
    }  for(const v of s.sessions)if(!Number.isFinite(v.minutes)||v.minutes<=0||v.minutes>1440||!validDate(v.date)||typeof v.subjectName!=='string')throw Error('Sessão inválida.');
    return s;
  } function validateBackup(payload){
    if(!payload||payload.format!=='stepbystep-backup'||payload.version!==1||!payload.data)throw Error('Arquivo de backup inválido.');
    const incoming=payload.data;
    if(incoming.applications!==undefined)root.ApplicationCore?.validate(incoming.applications);
    validateStudy(incoming.study);
    if(!incoming.days||typeof incoming.days!=='object'||Array.isArray(incoming.days))throw Error('Histórico diário inválido.');
    for(const [d,v] of Object.entries(incoming.days)){
      if(!validDate(d)||!v||!Array.isArray(v.blocks)||!Array.isArray(v.checks)||!Array.isArray(v.distractions)||!Number.isFinite(v.timerMinutes)||v.timerMinutes<1||v.timerMinutes>180)throw Error('Dia inválido no backup.');
      for(const b of v.blocks)if(typeof b.name!=='string'||!Number.isFinite(b.min)||b.min<1)throw Error('Bloco inválido.');
      for(const c of v.checks)if(typeof c.text!=='string')throw Error('Checklist inválido.');
      if(v.distractions.some(x=>typeof x!=='string'))throw Error('Distração inválida.');
      for(const a of v.appointments||[])if(typeof a.id!=='string'||typeof a.title!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.end)||a.end<=a.start)throw Error('Compromisso inválido.')
    }  return incoming;
  } function mergeBackup(current,incoming){
    const merged=JSON.parse(JSON.stringify(current));
    for(const k of ['subjects','topics','notes','sessions']){
      const ids=new Set(merged.study[k].map(v=>v.id));
      for(const v of incoming.study[k])if(!ids.has(v.id)){
        merged.study[k].push(v);
        ids.add(v.id)
      }
    }for(const [d,v] of Object.entries(incoming.days))if(!merged.days[d])merged.days[d]=v;
    if(incoming.music&&Array.isArray(incoming.music.items)){
      merged.music??={
        items:[],selected:'',auto:true,volume:35
      };
      const ids=new Set(merged.music.items.map(v=>v.id));
      for(const v of incoming.music.items)if(typeof v.id==='string'&&typeof v.name==='string'&&typeof v.url==='string'&&['playlist','video'].includes(v.kind)&&/^[A-Za-z0-9_-]{10,150}$/.test(v.media)&&!ids.has(v.id)){
        merged.music.items.push({
          ...v,url:v.kind==='playlist'?'https://www.youtube.com/playlist?list='+encodeURIComponent(v.media):'https://www.youtube.com/watch?v='+encodeURIComponent(v.media)
        });
        ids.add(v.id)
      }
    }if(incoming.applications)merged.applications=root.ApplicationCore.merge(merged.applications||[],incoming.applications);
    validateStudy(merged.study);
    return merged
  } root.StudyCore={
    uid,dateKey,validDate,addDays,intervals,empty,schedule,rate,esc,markdown,validateStudy,validateBackup,mergeBackup
  };
})(typeof window==='undefined'?globalThis:window);
