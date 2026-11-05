/* Escrita livre por data. Usa os dias e o backup existentes. */
(()=>{
  'use strict';
  function updateCount(){const n=$('dailyJournal').value.length;$('journalCount').textContent=`${n} ${n===1?'caractere':'caracteres'}`}
  function loadJournal(){
    $('dailyJournal').value=typeof day.journal==='string'?day.journal:'';
    $('journalDate').textContent=new Date(date+'T12:00:00').toLocaleDateString('pt-BR');
    $('journalSave').textContent='Salvo automaticamente neste navegador.';
    updateCount();
  }
  $('dailyJournal').addEventListener('input',()=>{
    day.journal=$('dailyJournal').value;
    updateCount();
    try{localStorage.setItem(key,JSON.stringify(db));$('journalSave').textContent='Salvo automaticamente.'}
    catch{$('journalSave').textContent='Não foi possível salvar. Exporte um backup para preservar seu texto.'}
  });
  window.DailyJournal={load:loadJournal};
  loadJournal();
})();
