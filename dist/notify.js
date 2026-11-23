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
  const persist = () => { try { saveDB(); } catch {} };
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

  // ---------- Seletor de lembretes ----------
  const PRESETS = [0, 10, 30, 60, 120, 1440, 2880, 4320, 10080];
  const DAILY = [1440, 2880, 4320, 5760, 7200, 8640, 10080]; // 1 a 7 dias antes
  const UNITS = [['min', 1], ['horas', 60], ['dias', 1440]];
  function mountPicker(el, values, onChange) {
    el._values = [...values];
    el._onChange = onChange;
    const draw = () => {
      const vals = el._values, extra = vals.filter(v => !PRESETS.includes(v));
      el.innerHTML = [...PRESETS, ...extra].sort((a, b) => a - b).map(v =>
        `<button type="button" class="chip-button reminder-chip" data-min="${v}" aria-pressed="${vals.includes(v)}">${R.reminderLabel(v)}</button>`).join('') +
        `<button type="button" class="chip-button reminder-chip reminder-daily" data-daily aria-pressed="${DAILY.every(v => vals.includes(v))}">Todo dia na última semana</button>` +
        `<span class="reminder-custom"><input type="number" min="1" max="999" inputmode="numeric" aria-label="Outro tempo"><select aria-label="Unidade">${UNITS.map(([l, m]) => `<option value="${m}">${l}</option>`).join('')}</select><button type="button" class="chip-button" data-add>Adicionar</button></span>` +
        (vals.length ? '' : '<p class="small">Sem aviso para este compromisso.</p>');
    };
    el.onclick = e => {
      const chip = e.target.closest('[data-min]');
      if (chip) {
        const v = +chip.dataset.min;
        el._values = el._values.includes(v) ? el._values.filter(x => x !== v) : [...el._values, v].slice(-10);
      } else if (e.target.closest('[data-daily]')) {
        const on = DAILY.every(v => el._values.includes(v));
        el._values = on ? el._values.filter(v => !DAILY.includes(v)) : [...new Set([...DAILY, ...el._values])].sort((a, b) => b - a).slice(0, 10);
      } else if (e.target.closest('[data-add]')) {
        const n = +el.querySelector('input').value, v = n * +el.querySelector('select').value;
        if (!Number.isInteger(v) || v < 1 || v > R.MAX_REMINDER) return;
        if (!el._values.includes(v)) el._values = [...el._values, v].slice(-10);
      } else return;
      draw();
      el._onChange?.(el._values);
    };
    draw();
  }
  window.Reminders = {
    mount: (el, values) => mountPicker(el, values),
    read: el => [...new Set(el._values || [])].sort((a, b) => b - a),
  };

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
      const closed = !pushSupported ? ' Este navegador não recebe avisos com o app fechado.'
        : !linked() ? ' Para receber com o app fechado, ligue a Sincronização.'
        : pushState === 'ok' ? ' Chegam também com o app fechado.'
        : pushState === 'erro' ? ' Não deu para ativar os avisos com o app fechado; tente Desativar e Ativar de novo.' : '';
      status.textContent = `Ativos: compromissos (padrão: ${R.remindersOf({}, db.prefs).map(R.reminderLabel).join(', ') || 'sem aviso'} antes), fim do timer e resumo do dia.` + closed;
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
    if (enabled()) { db.prefs.notify = false; persist(); await unsubscribePush(); renderStatus(); return; }
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    db.prefs.notify = result === 'granted';
    persist();
    renderStatus();
    if (result === 'granted') {
      notify('Avisos ativos', 'Tudo certo.', 'test');
      await subscribePush();
      lastJobs = '';
      syncJobs();
      renderStatus();
    }
  };
  $('notifyTest').onclick = () => notify('Teste', 'Os avisos estão funcionando.', 'test');
  $('openSettings').addEventListener('click', () => {
    renderStatus();
    mountPicker($('defaultReminders'), R.remindersOf({}, db.prefs), v => { db.prefs.reminders = [...v].sort((a, b) => b - a); persist(); renderStatus(); });
  });

  // ---------- Push (avisos com o app fechado) ----------
  // O servidor (Neon Function "lembretes") lê push_jobs a cada 5 min e envia para os aparelhos
  // de push_subs. Precisa da sincronização ligada (usa o mesmo acesso ao banco).
  const VAPID_PUBLIC = 'BKpQa6FsDJYtnw_EXIj4Adan6PsBQGzeYAtjc3NXSjgwwVY4DAspMQMq4d3_BwGWhachXypUTCRM-mOVDJ9AsnE';
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
  const linked = () => !!window.Sync?.status().linked;
  const b64 = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  let pushState = '';

  async function subscribePush() {
    if (!pushSupported || !enabled() || !linked()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC) });
      const json = sub.toJSON();
      await Sync.query(
        `INSERT INTO push_subs (endpoint, sub, device, active) VALUES ($1, $2::jsonb, $3, true)
         ON CONFLICT (endpoint) DO UPDATE SET sub = excluded.sub, device = excluded.device, active = true, updated_at = now()`,
        [json.endpoint, JSON.stringify(json), navigator.userAgent.slice(0, 120)]);
      pushState = 'ok';
      return true;
    } catch (err) {
      pushState = 'erro';
      console.warn('[push] inscrição', err);
      return false;
    }
  }
  async function unsubscribePush() {
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (!sub) return;
      if (linked()) await Sync.query('UPDATE push_subs SET active = false, updated_at = now() WHERE endpoint = $1', [sub.endpoint]).catch(() => {});
      await sub.unsubscribe();
    } catch {}
    pushState = '';
  }

  // Envia a lista de lembretes futuros e desativa os que sumiram (compromisso apagado,
  // concluído ou lembrete desmarcado). Roda depois de salvar e de sincronizar.
  let jobsTimer = null, lastJobs = '';
  async function syncJobs() {
    if (!linked()) return;
    const jobs = R.pushJobs(db, new Date());
    const sig = JSON.stringify(jobs);
    if (sig === lastJobs) return;
    try {
      await Sync.query(
        `WITH j AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text, "fireAt" timestamptz, title text, body text, tag text)),
         up AS (
           INSERT INTO push_jobs (id, fire_at, title, body, tag, active)
           SELECT id, "fireAt", title, body, tag, true FROM j
           ON CONFLICT (id) DO UPDATE SET
             sent_at = CASE WHEN push_jobs.fire_at <> excluded.fire_at THEN NULL ELSE push_jobs.sent_at END,
             fire_at = excluded.fire_at, title = excluded.title, body = excluded.body, tag = excluded.tag,
             active = true, updated_at = now()
           RETURNING id)
         UPDATE push_jobs SET active = false, updated_at = now()
          WHERE active AND sent_at IS NULL AND fire_at > now() AND id NOT IN (SELECT id FROM j)`,
        [sig]);
      lastJobs = sig;
    } catch (err) { console.warn('[push] lembretes', err); }
  }
  const scheduleJobs = () => { clearTimeout(jobsTimer); jobsTimer = setTimeout(syncJobs, 4000); };
  window.addEventListener('stepbystep:saved', scheduleJobs);
  window.addEventListener('stepbystep:synced', () => { scheduleJobs(); if (enabled() && pushState !== 'ok') subscribePush().then(renderStatus); });

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
  // Lembretes dos compromissos (dias, horas ou minutos antes, conforme cada um).
  function checkUpcoming() {
    if (!enabled()) return;
    const now = new Date();
    db.meta.notified = R.pruneNotified(db.meta.notified || {}, todayKey());
    const due = R.dueReminders(db, now, db.meta.notified);
    for (const a of due) {
      a.keys.forEach(k => (db.meta.notified[k] = true));
      notify(a.title, R.reminderText(a, now), 'event-' + a.id);
    }
    if (due.length) persist();
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
  // Ao abrir: renova a inscrição (o navegador pode trocá-la) e envia os lembretes.
  window.addEventListener('load', () => setTimeout(() => { if (enabled()) subscribePush().then(renderStatus); syncJobs(); }, 3000));
})();
