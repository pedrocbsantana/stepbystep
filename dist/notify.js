/* Avisos do sistema (com o app aberto ou recém-aberto) e exportação para calendário (.ics).
   Regras em reminders-core.js. Nada da Clareza é avisado ou exportado. */
(() => {
  'use strict';
  const R = ReminderCore;
  db.prefs ??= {};
  db.meta ??= {};
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = 'Notification' in window;
  const todayKey = () => localDate(new Date());
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(db)); } catch {} };
  const enabled = () => supported && Notification.permission === 'granted' && db.prefs.notify !== false;

  async function notify(title, body, tag) {
    if (!enabled()) return false;
    const options = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(title, options); return true; }
      new Notification(title, options);
      return true;
    } catch { return false; }
  }

  // ---------- Configurações ----------
  function renderStatus() {
    const status = $('notifyStatus'), enable = $('notifyEnable'), test = $('notifyTest');
    test.hidden = !enabled();
    enable.hidden = false;
    if (!supported) {
      status.textContent = isIOS && !standalone
        ? 'No iPhone, instale o app (Compartilhar → Adicionar à Tela de Início) e ative por lá.'
        : 'Este navegador não suporta avisos.';
      enable.hidden = true;
    } else if (Notification.permission === 'denied') {
      status.textContent = 'Bloqueados. Libere nas configurações do navegador.';
      enable.hidden = true;
    } else if (enabled()) {
      status.textContent = 'Ativos: compromissos 10 min antes, fim do timer e resumo do dia.';
      enable.textContent = 'Desativar';
    } else {
      status.textContent = 'Desativados.';
      enable.textContent = 'Ativar avisos';
    }
    const last = db.meta.icsExportedAt;
    $('icsStatus').textContent = last
      ? 'Última exportação: ' + new Date(last).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + '.'
      : 'Compromissos, revisões e acompanhamentos de vagas, com alerta.';
  }
  $('notifyEnable').onclick = async () => {
    if (enabled()) { db.prefs.notify = false; persist(); renderStatus(); return; }
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    db.prefs.notify = result === 'granted';
    persist();
    renderStatus();
    if (result === 'granted') notify('Avisos ativos', 'Tudo certo.', 'test');
  };
  $('notifyTest').onclick = () => notify('Teste', 'Os avisos estão funcionando.', 'test');
  $('openSettings').addEventListener('click', renderStatus);

  // ---------- Avisos ----------
  // Fim do timer (chamado por app.js).
  window.Notify = { timerDone: task => notify('Rodada concluída', task || '', 'timer') };

  // Resumo do dia: uma vez por dia, na primeira abertura.
  function dailySummary() {
    const t = todayKey();
    if (!enabled() || db.meta.summaryOn === t) return;
    const s = R.summary(db, t);
    db.meta.summaryOn = t;
    persist();
    if (s.text) notify('Hoje', s.text, 'summary');
  }
  // Compromissos que começam nos próximos 10 minutos.
  function checkUpcoming() {
    if (!enabled()) return;
    const t = todayKey();
    db.meta.notified ??= {};
    for (const k of Object.keys(db.meta.notified)) if (!k.startsWith(t)) delete db.meta.notified[k];
    let changed = false;
    for (const a of R.upcoming(db, new Date(), 10)) {
      const k = `${t}|${a.id}`;
      if (db.meta.notified[k]) continue;
      db.meta.notified[k] = true; changed = true;
      notify(a.title, `${a.start}–${a.end}`, 'event-' + a.id);
    }
    if (changed) persist();
  }
  setInterval(checkUpcoming, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { dailySummary(); checkUpcoming(); } });
  window.addEventListener('load', () => setTimeout(() => { dailySummary(); checkUpcoming(); }, 1500));

  // ---------- Calendário (.ics) ----------
  async function exportICS(onlyNew) {
    const all = R.collect(db, todayKey()).filter(v => !(v.kind === 'event' && v.done));
    db.meta.icsExported ??= {};
    const items = onlyNew ? R.changed(all, db.meta.icsExported) : all;
    if (!items.length) { $('icsStatus').textContent = 'Nada novo para exportar.'; return; }
    const ics = R.toICS(items), name = `stepbystep-${todayKey()}.ics`;
    const file = new File([ics], name, { type: 'text/calendar' });
    let done = false;
    if (isIOS && standalone && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); done = true; } catch { return; }
    }
    if (!done) {
      const url = URL.createObjectURL(file), a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    items.forEach(v => (db.meta.icsExported[v.uid] = R.signature(v)));
    db.meta.icsExportedAt = Date.now();
    persist();
    renderStatus();
    $('icsStatus').textContent = `${items.length} ${items.length === 1 ? 'item exportado' : 'itens exportados'}.`;
  }
  $('icsNew').onclick = () => exportICS(true);
  $('icsAll').onclick = () => exportICS(false);

  renderStatus();
})();
