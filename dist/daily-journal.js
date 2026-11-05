/* Escrita livre por data. Usa os dias e o backup existentes. */
(()=>{
  'use strict';
  function updateCount(){const n=$('dailyJournal').value.length;$('journalCount').textContent=`${n} ${n===1?'caractere':'caracteres'}`}
  function loadJournal(){
    $('dailyJournal').value=typeof day.journal==='string'?day.journal:'';
    $('journalDate').textContent=new Date(date+'T12:00:00').toLocaleDateString('pt-BR');
    $('journalSave').textContent='';
    updateCount();
  }
  $('dailyJournal').addEventListener('input',()=>{
    day.journal=$('dailyJournal').value;
    updateCount();
    try{localStorage.setItem(key,JSON.stringify(db));$('journalSave').textContent='Salvo'}
    catch{$('journalSave').textContent='Falha ao salvar. Exporte um backup.'}
  });
  window.DailyJournal={load:loadJournal};
  loadJournal();
})();
