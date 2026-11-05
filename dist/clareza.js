/* Clareza: interface. Regras em clareza-core.js; dados em db.clareza (mesma chave e mesmo backup). */
(() => {
  'use strict';
  const K = ClarezaCore, E = StudyCore.esc;
  db.clareza = K.normalize(db.clareza);
  let C = db.clareza, sosTimer = null, sosEnd = 0, sosStarted = 0, breathTimer = null, restartTriggers = new Set(), checkinTriggers = new Set(), checkinUrge = null;

  const ENV = [
    ['blockPhone', 'Bloqueador ou filtro ativo no celular'],
    ['blockPc', 'Bloqueador ou filtro ativo no computador'],
    ['phoneOut', 'Celular carrega fora do quarto'],
    ['apps', 'Saí de perfis e apps que me puxam'],
    ['sleep', 'Tenho um horário para dormir'],
    ['person', 'Tenho alguém de confiança para mandar mensagem'],
  ];
  const ACTIONS = ['Sair do cômodo onde estou', 'Deixar o celular em outro lugar', 'Tomar um banho', '20 flexões ou agachamentos', 'Caminhar 10 minutos', 'Beber um copo d’água', 'Mandar mensagem para alguém', 'Abrir uma tarefa do meu plano'];

  // ---------- Estrutura da página ----------
  const page = document.createElement('section');
  page.id = 'clarezaPage';
  page.className = 'study-page clareza';
  page.hidden = true;
  page.innerHTML = `
  <div class="study-top"><div><h1>Clareza</h1></div>
    <div class="tools"><button class="primary sos-button" id="openSos">Bateu a vontade</button></div></div>
  <div id="clzStartCard" class="card study-empty" hidden>
    <h2>Data de início</h2>
    <div class="clz-start-row"><input type="date" id="clzStartDate" aria-label="Data de início"><button class="primary" id="clzBegin">Começar</button></div>
  </div>
  <div id="clzMain">
    <div class="clz-hero card">
      <div class="clz-count">
        <div class="clz-ring-wrap"><svg class="clz-ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="54"/><circle class="ring-fill" id="clzRing" cx="60" cy="60" r="54"/></svg><div class="clz-days" id="clzDays">0</div></div>
        <div><div class="clz-days-label" id="clzDaysLabel">dias firmes</div><div class="small" id="clzSince"></div></div>
      </div>
      <div class="clz-milestone">
        <div class="progress"><div id="clzProgress"></div></div>
        <div class="small" id="clzNext"></div>
      </div>
      <div class="clz-stats">
        <div class="study-stat"><strong id="clzBest">0</strong><span>Recorde</span></div>
        <div class="study-stat"><strong id="clzTotal">0</strong><span>Total acumulado</span></div>
        <div class="study-stat"><strong id="clzSosRate">—</strong><span>Vontades superadas</span></div>
      </div>
      <div class="clz-hero-actions"><button class="quiet" id="clzEditStart">Ajustar início</button><button class="quiet clz-restart" id="clzRestart">Recomeçar</button></div>
    </div>

    <div class="grid-2 row-gap">
      <section class="card" aria-labelledby="clzCheckTitle">
        <div class="heading"><h2 id="clzCheckTitle">Check-in</h2><span class="small" id="clzLastCheck"></span></div>
        <div class="clz-scale" role="group" aria-label="Intensidade da vontade, de 0 a 5" id="clzScale">${[0, 1, 2, 3, 4, 5].map(n => `<button type="button" data-urge="${n}" aria-pressed="false">${n}</button>`).join('')}</div>
        <div class="clz-scale-legend small"><span>nenhuma</span><span>forte</span></div>
        <p class="small clz-subtitle">Gatilhos</p>
        <div class="clz-chips" id="clzCheckTriggers">${K.TRIGGERS.map(t => `<button type="button" class="chip-button" data-trigger="${E(t)}" aria-pressed="false">${E(t)}</button>`).join('')}</div>
        <div class="entry"><input id="clzCheckNote" maxlength="200" placeholder="Nota" aria-label="Nota do check-in"><button class="primary" id="clzCheckSave">Registrar</button></div>
        <p class="small clz-feedback" id="clzCheckFeedback" role="status"></p>
      </section>
      <section class="card" aria-labelledby="clzCalTitle">
        <div class="heading"><h2 id="clzCalTitle">Últimos 28 dias</h2><span class="small clz-legend"><i class="firm"></i> firme <i class="reset"></i> recomeço</span></div>
        <div class="clz-cal" id="clzCal"></div>
      </section>
    </div>

    <div class="grid-2 row-gap">
      <section class="card" aria-labelledby="clzWhyTitle">
        <div class="heading"><h2 id="clzWhyTitle">Motivos</h2><span class="small" id="clzWhySave"></span></div>
        <textarea id="clzReasons" aria-labelledby="clzWhyTitle"></textarea>
      </section>
      <section class="card" aria-labelledby="clzPlanTitle">
        <div class="heading"><h2 id="clzPlanTitle">Se… então</h2></div>
        <ul class="items clz-plans" id="clzPlans"></ul>
        <form class="clz-plan-form" id="clzPlanForm">
          <input id="clzWhen" maxlength="160" placeholder="Se…" aria-label="Situação de risco" required>
          <input id="clzThen" maxlength="160" placeholder="Então…" aria-label="O que vou fazer" required>
          <button class="primary">Adicionar</button>
        </form>
      </section>
    </div>

    <div class="grid-2 row-gap">
      <section class="card" aria-labelledby="clzEnvTitle">
        <div class="heading"><h2 id="clzEnvTitle">Ambiente</h2><span class="pill" id="clzEnvCount"></span></div>
        <ul class="items" id="clzEnv"></ul>
      </section>
      <section class="card" aria-labelledby="clzPatTitle">
        <div class="heading"><h2 id="clzPatTitle">Padrões</h2></div>
        <div id="clzPatterns"></div>
      </section>
    </div>

    <p class="small clz-help">Se estiver difícil sozinho, terapia (TCC) ajuda.</p>
  </div>`;
  document.querySelector('footer').before(page);

  // ---------- Diálogos ----------
  const sos = document.createElement('dialog');
  sos.id = 'sosDialog';
  sos.className = 'sos-dialog';
  sos.setAttribute('aria-labelledby', 'sosTitle');
  sos.innerHTML = `
    <div class="sos-head"><h2 id="sosTitle">10 minutos</h2><button type="button" class="remove" id="sosClose" aria-label="Fechar">×</button></div>
    <div class="sos-body">
      <div class="sos-breath"><div class="breath-circle" aria-hidden="true"></div><div class="breath-text" id="breathText" aria-live="polite">Inspire</div></div>
      <div class="sos-timer" id="sosClock" role="timer">10:00</div>
    </div>
    <div class="sos-reasons" id="sosReasons"></div>
    <div class="sos-plans" id="sosPlans"></div>
    <p class="clz-subtitle small">Ações</p>
    <div class="clz-chips" id="sosActions">${ACTIONS.map((a, i) => `<button type="button" class="chip-button" data-action="${i}" aria-pressed="false">${E(a)}</button>`).join('')}</div>
    <div class="sos-results" id="sosResults">
      <button class="primary" data-result="passed">Passou</button>
      <button data-result="strong">Mais 10 min</button>
      <button class="quiet" data-result="relapse">Recaída</button>
    </div>
    <p class="small sos-feedback" id="sosFeedback" role="status"></p>`;
  document.body.append(sos);

  const restartDialog = document.createElement('dialog');
  restartDialog.id = 'clzRestartDialog';
  restartDialog.setAttribute('aria-labelledby', 'clzRestartTitle');
  restartDialog.innerHTML = `
    <h2 id="clzRestartTitle">Recomeçar</h2>
    <p id="clzRestartText"></p>
    <p class="small clz-subtitle">Gatilhos</p>
    <div class="clz-chips" id="clzRestartTriggers">${K.TRIGGERS.map(t => `<button type="button" class="chip-button" data-trigger="${E(t)}" aria-pressed="false">${E(t)}</button>`).join('')}</div>
    <textarea id="clzRestartNote" maxlength="500" placeholder="Nota"></textarea>
    <div class="dialog-buttons"><button type="button" id="clzRestartCancel">Cancelar</button><button class="primary" id="clzRestartConfirm">Recomeçar</button></div>`;
  document.body.append(restartDialog);

  const startDialog = document.createElement('dialog');
  startDialog.id = 'clzStartDialog';
  startDialog.setAttribute('aria-labelledby', 'clzStartTitle');
  startDialog.innerHTML = `
    <h2 id="clzStartTitle">Ajustar início</h2>
    <label class="caption" for="clzEditDate">Data</label><input type="date" id="clzEditDate">
    <p class="event-error" id="clzStartError" role="alert"></p>
    <div class="dialog-buttons"><button type="button" id="clzStartCancel">Cancelar</button><button class="primary" id="clzStartSave">Salvar</button></div>`;
  document.body.append(startDialog);

  // ---------- Utilidades ----------
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(db)); return true; }
    catch { $('saveStatus').textContent = 'Não foi possível salvar. Exporte um backup.'; return false; }
  }
  const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const toggleChip = (b, set) => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); on ? set.add(b.dataset.trigger) : set.delete(b.dataset.trigger); };
  const resetChips = (root, set) => { set.clear(); root.querySelectorAll('[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', 'false')); };
  // Data local (YYYY-MM-DD) + hora atual, para não deslocar o dia pelo fuso.
  const localISO = key => { const now = new Date(), d = new Date(key + 'T00:00:00'); d.setHours(now.getHours(), now.getMinutes(), 0, 0); return d.toISOString(); };

  // ---------- Renderização ----------
  function render() {
    C = db.clareza = K.normalize(db.clareza);
    const started = !!C.start;
    $('clzStartCard').hidden = started;
    $('clzMain').hidden = !started;
    if (!started) { $('clzStartDate').value = localDate(new Date()); return; }
    const now = Date.now(), days = K.current(C, now), m = K.milestone(days);
    $('clzDays').textContent = days;
    $('clzDaysLabel').textContent = days === 1 ? 'dia firme' : 'dias firmes';
    const hours = Math.floor((now - new Date(C.start).getTime()) / 36e5);
    $('clzSince').textContent = `desde ${fmtDate(C.start)}${days === 0 ? ` · ${plural(hours, 'hora', 'horas')}` : ''}`;
    $('clzProgress').style.width = Math.round(m.progress * 100) + '%';
    const ring = 2 * Math.PI * 54;
    $('clzRing').style.strokeDasharray = ring;
    $('clzRing').style.strokeDashoffset = ring * (1 - m.progress);
    $('clzNext').textContent = m.next ? `Próximo marco: ${plural(m.next, 'dia', 'dias')} · faltam ${m.remaining}` : '';
    $('clzBest').textContent = K.best(C, now);
    $('clzTotal').textContent = K.total(C, now);
    const p = K.patterns(C);
    $('clzSosRate').textContent = p.sos.total ? `${p.sos.passed}/${p.sos.total}` : '—';
    renderCheckin(); renderCalendar(); renderPlans(); renderEnv(); renderPatterns(p);
    if (document.activeElement !== $('clzReasons')) $('clzReasons').value = C.reasons;
  }
  function renderCheckin() {
    const last = C.checkins[C.checkins.length - 1];
    $('clzLastCheck').textContent = last ? 'Último: ' + new Date(last.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  }
  function renderCalendar() {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const cells = Array.from({ length: 28 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - 27 + i); return d; });
    $('clzCal').innerHTML = cells.map(d => {
      const k = localDate(d), st = K.dayStatus(C, k);
      const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      return `<span class="clz-cell ${st || ''} ${k === localDate(new Date()) ? 'today' : ''}" title="${E(label)}${st === 'firm' ? ': firme' : st === 'reset' ? ': recomeço' : ''}">${d.getDate()}</span>`;
    }).join('');
  }
  function renderPlans() {
    $('clzPlans').innerHTML = C.plans.map(v => `<li><span><b>Se</b> ${E(v.when)}<br><b>então</b> ${E(v.then)}</span><button class="remove" data-plan="${E(v.id)}" aria-label="Remover plano">×</button></li>`).join('') || '';
  }
  function renderEnv() {
    $('clzEnv').innerHTML = ENV.map(([k, label]) => `<li class="${C.env[k] ? 'done' : ''}"><input type="checkbox" id="env-${k}" data-env="${k}" ${C.env[k] ? 'checked' : ''}><label for="env-${k}">${E(label)}</label></li>`).join('');
    $('clzEnvCount').textContent = `${ENV.filter(([k]) => C.env[k]).length}/${ENV.length}`;
  }
  function bars(obj) {
    const max = Math.max(1, ...Object.values(obj));
    return Object.entries(obj).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="clz-bar"><span>${E(k)}</span><i style="--w:${Math.round((n / max) * 100)}%"></i><b>${n}</b></div>`).join('');
  }
  function renderPatterns(p) {
    const t = bars(p.triggers), h = bars(p.periods);
    $('clzPatterns').innerHTML = !p.samples
      ? '<p class="small">Sem dados ainda.</p>'
      : `<p class="clz-subtitle small">Gatilhos</p>${t || '<p class="small">—</p>'}<p class="clz-subtitle small">Horários</p>${h || '<p class="small">—</p>'}`;
  }

  // ---------- Começar / ajustar / recomeçar ----------
  $('clzBegin').onclick = () => {
    const v = $('clzStartDate').value || localDate(new Date());
    if (v > localDate(new Date())) { $('clzStartDate').focus(); return; }
    K.begin(C, v === localDate(new Date()) ? new Date().toISOString() : localISO(v));
    persist(); render();
  };
  $('clzEditStart').onclick = () => { $('clzEditDate').value = localDate(new Date(C.start)); $('clzEditDate').max = localDate(new Date()); $('clzStartError').textContent = ''; startDialog.showModal(); };
  $('clzStartCancel').onclick = () => startDialog.close();
  $('clzStartSave').onclick = () => {
    try { K.setStart(C, localISO($('clzEditDate').value)); persist(); startDialog.close(); render(); }
    catch (err) { $('clzStartError').textContent = err.message; }
  };
  function openRestart() {
    const days = K.current(C);
    $('clzRestartText').textContent = days > 0
      ? `${plural(days, 'dia continua', 'dias continuam')} no total acumulado.`
      : '';
    resetChips($('clzRestartTriggers'), restartTriggers);
    $('clzRestartNote').value = '';
    restartDialog.showModal();
  }
  $('clzRestart').onclick = openRestart;
  $('clzRestartTriggers').onclick = e => { const b = e.target.closest('[data-trigger]'); if (b) toggleChip(b, restartTriggers); };
  $('clzRestartCancel').onclick = () => restartDialog.close();
  $('clzRestartConfirm').onclick = () => {
    K.restart(C, new Date().toISOString(), { triggers: [...restartTriggers], note: $('clzRestartNote').value.trim() });
    persist(); restartDialog.close(); render();
  };

  // ---------- Check-in ----------
  $('clzScale').onclick = e => {
    const b = e.target.closest('[data-urge]'); if (!b) return;
    checkinUrge = +b.dataset.urge;
    $('clzScale').querySelectorAll('[data-urge]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  };
  $('clzCheckTriggers').onclick = e => { const b = e.target.closest('[data-trigger]'); if (b) toggleChip(b, checkinTriggers); };
  $('clzCheckSave').onclick = () => {
    if (checkinUrge === null) { $('clzCheckFeedback').textContent = 'Escolha de 0 a 5.'; return; }
    C.checkins.push({ id: K.uid(), at: new Date().toISOString(), urge: checkinUrge, triggers: [...checkinTriggers], note: $('clzCheckNote').value.trim().slice(0, 200) });
    persist();
    $('clzCheckFeedback').textContent = 'Registrado.';
    checkinUrge = null; $('clzCheckNote').value = '';
    $('clzScale').querySelectorAll('[data-urge]').forEach(x => x.setAttribute('aria-pressed', 'false'));
    resetChips($('clzCheckTriggers'), checkinTriggers);
    render();
  };

  // ---------- Motivos, planos, ambiente ----------
  $('clzReasons').addEventListener('input', () => { C.reasons = $('clzReasons').value; $('clzWhySave').textContent = persist() ? 'Salvo' : 'Falha ao salvar'; });
  $('clzPlanForm').onsubmit = e => {
    e.preventDefault();
    const when = $('clzWhen').value.trim(), then = $('clzThen').value.trim();
    if (!when || !then) return;
    C.plans.push({ id: K.uid(), when, then });
    $('clzPlanForm').reset(); persist(); renderPlans();
  };
  $('clzPlans').onclick = e => { const b = e.target.closest('[data-plan]'); if (!b) return; C.plans = C.plans.filter(v => v.id !== b.dataset.plan); persist(); renderPlans(); };
  $('clzEnv').onchange = e => { const k = e.target.dataset.env; if (!k) return; if (e.target.checked) C.env[k] = true; else delete C.env[k]; persist(); renderEnv(); };

  // ---------- SOS: 10 minutos para atravessar a vontade ----------
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function sosClock() {
    const left = Math.max(0, Math.ceil((sosEnd - Date.now()) / 1000));
    $('sosClock').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    if (!left) { clearInterval(sosTimer); sosTimer = null; $('sosFeedback').textContent = 'Tempo encerrado.'; }
  }
  function startSosTimer() {
    sosEnd = Date.now() + 10 * 60 * 1000;
    clearInterval(sosTimer); sosTimer = setInterval(sosClock, 500); sosClock();
  }
  function breathe() {
    // Ciclo de 10s: inspira 4s, solta 6s (expiração mais longa acalma).
    const phase = ((Date.now() - sosStarted) / 1000) % 10;
    $('breathText').textContent = phase < 4 ? 'Inspire' : 'Expire';
  }
  function openSos() {
    sosStarted = Date.now();
    $('sosReasons').innerHTML = C.reasons.trim()
      ? `<p class="clz-subtitle small">Motivos</p><blockquote>${E(C.reasons.trim()).replace(/\n/g, '<br>')}</blockquote>`
      : '';
    $('sosPlans').innerHTML = C.plans.length ? `<p class="clz-subtitle small">Plano</p>${C.plans.slice(0, 3).map(v => `<p class="sos-plan"><b>Se</b> ${E(v.when)}, <b>então</b> ${E(v.then)}</p>`).join('')}` : '';
    $('sosActions').querySelectorAll('[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('sosFeedback').textContent = '';
    sos.classList.toggle('still', !!reduceMotion);
    startSosTimer();
    clearInterval(breathTimer); breathTimer = setInterval(breathe, 250); breathe();
    sos.showModal();
  }
  function closeSos() { clearInterval(sosTimer); clearInterval(breathTimer); sosTimer = breathTimer = null; if (sos.open) sos.close(); }
  $('openSos').onclick = openSos;
  $('sosClose').onclick = closeSos;
  sos.addEventListener('close', () => { clearInterval(sosTimer); clearInterval(breathTimer); });
  $('sosActions').onclick = e => { const b = e.target.closest('[data-action]'); if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); };
  $('sosResults').onclick = e => {
    const b = e.target.closest('[data-result]'); if (!b) return;
    const result = b.dataset.result;
    C.sos.push({ id: K.uid(), at: new Date(sosStarted).toISOString(), result, minutes: Math.round((Date.now() - sosStarted) / 60000) });
    persist();
    if (result === 'strong') {
      sosStarted = Date.now(); startSosTimer();
      $('sosFeedback').textContent = 'Mais 10 minutos.';
      return;
    }
    closeSos(); render();
    if (result === 'relapse') openRestart();
    else { const t = $('studyToast'); t.textContent = 'Registrado.'; t.hidden = false; setTimeout(() => (t.hidden = true), 4000); }
  };

  window.Clareza = { setVisible: v => { if (v) render(); }, refresh: render };
  // Atualiza o contador quando a página fica aberta por muito tempo.
  setInterval(() => { if (!page.hidden) render(); }, 60000);
  render();
})();
