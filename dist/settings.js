/* Configurações globais: tema (escuro/claro/sistema) e backup acessível de qualquer aba. */
(()=>{
  'use strict';
  const THEME_KEY='stepbystep-theme';
  const media=window.matchMedia?.('(prefers-color-scheme: light)');
  const readChoice=()=>{try{return localStorage.getItem(THEME_KEY)||'dark'}catch{return 'dark'}};
  let choice=readChoice();

  function resolved(){return choice==='system'?(media?.matches?'light':'dark'):choice}
  function apply(){
    const theme=resolved();
    if(theme==='light')document.documentElement.dataset.theme='light';
    else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f3f2ec':'#131615');
    const toggle=$('themeToggle');
    toggle.textContent=theme==='light'?'☀':'☾';
    toggle.setAttribute('aria-label',theme==='light'?'Mudar para o tema escuro':'Mudar para o tema claro');
    document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===choice)));
  }
  function setChoice(next){
    choice=next;
    try{localStorage.setItem(THEME_KEY,choice)}catch{}
    apply();
  }
  $('themeToggle').onclick=()=>setChoice(resolved()==='light'?'dark':'light');
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>setChoice(b.dataset.themeChoice));
  media?.addEventListener?.('change',()=>{if(choice==='system')apply()});

  const dialog=$('settingsDialog');
  // Seções que podem ser escondidas. Nada é apagado, só some da tela.
  const SECTIONS={
    agenda:{views:[],els:()=>[document.querySelector('.agenda')]},
    studies:{views:['studies','reviews','history'],els:()=>[$('studyDashboard')]},
    applications:{views:['applications'],els:()=>[]},
    clareza:{views:['clareza'],els:()=>[]},
  };
  db.prefs??={};db.prefs.sections??={};
  const isOn=k=>db.prefs.sections[k]!==false;
  function applySections(){
    for(const [k,cfg] of Object.entries(SECTIONS)){
      const on=isOn(k);
      cfg.views.forEach(v=>{const b=document.querySelector(`[data-study-view="${v}"]`);if(b)b.hidden=!on});
      cfg.els().forEach(el=>{if(el)el.hidden=!on});
      const current=document.querySelector('.main-nav [aria-current=page]')?.dataset.studyView;
      if(!on&&cfg.views.includes(current))document.querySelector('[data-study-view="dashboard"]')?.click();
    }
    document.querySelectorAll('[data-section]').forEach(c=>c.checked=isOn(c.dataset.section));
  }
  document.querySelectorAll('[data-section]').forEach(c=>c.onchange=()=>{
    db.prefs.sections[c.dataset.section]=c.checked;
    try{localStorage.setItem(key,JSON.stringify(db))}catch{}
    applySections();
  });
  window.applySections=applySections;
  function renderBackupInfo(){
    const last=db.meta?.lastBackupAt;
    $('lastBackupInfo').textContent=last?'Último backup: '+new Date(last).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})+'.':'Nenhum backup feito ainda.';
  }
  $('openSettings').onclick=()=>{apply();applySections();renderBackupInfo();dialog.showModal()};
  $('closeSettings').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  // Reaproveita a exportação/importação já validadas em studies.js.
  $('settingsExport').onclick=()=>{dialog.close();$('exportStudy').click()};
  $('settingsImport').onclick=()=>{dialog.close();$('importStudy').click()};

  apply();
  applySections();
})();

/* No celular, mantém a aba ativa visível na barra de navegação com rolagem. */
(()=>{
  const nav=document.querySelector('.main-nav');if(!nav)return;
  nav.addEventListener('click',e=>{const b=e.target.closest('button');if(b)b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})});
})();
