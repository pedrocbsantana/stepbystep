/* Agenda: calendário do mês com os compromissos de todos os dias, o dia escolhido
   e os próximos compromissos. Usa o mesmo formulário de compromisso do Meu dia
   (openEvent, em app.js), com os lembretes de cada um. Não guarda nada próprio. */
(() => {
  'use strict';
  const E = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const today = () => DayCore.dateKey(new Date());
  const WEEK = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  let month = today().slice(0, 7), selected = today();

  const page = document.createElement('section');
  page.id = 'agendaPage';
  page.className = 'study-page agenda-page';
  page.hidden = true;
  page.innerHTML = `
  <div class="study-top"><div><h1>Agenda</h1></div>
    <div class="tools"><button class="primary" id="agNew">+ Compromisso</button></div></div>
  <div class="ag-layout">
    <section class="card ag-month" aria-labelledby="agMonthTitle">
      <div class="ag-head">
        <button type="button" id="agPrev" aria-label="Mês anterior">←</button>
        <h2 id="agMonthTitle" aria-live="polite"></h2>
        <button type="button" id="agNext" aria-label="Próximo mês">→</button>
        <button type="button" id="agToday">Hoje</button>
      </div>
      <div class="ag-week" aria-hidden="true">${WEEK.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="ag-grid" id="agGrid"></div>
    </section>
    <div class="ag-side">
      <section class="card ag-day" aria-labelledby="agDayTitle">
        <h2 id="agDayTitle"></h2>
        <ul class="ag-list" id="agDayList"></ul>
        <button type="button" id="agAddDay">+ Compromisso neste dia</button>
      </section>
      <section class="card ag-next" aria-labelledby="agNextTitle">
        <h2 id="agNextTitle">Próximos 30 dias</h2>
        <ul class="ag-list" id="agNextList"></ul>
      </section>
    </div>
  </div>`;
  document.getElementById('studyPage').before(page);
  const $a = (id) => page.querySelector('#' + id);

  const apptsOf = (d) => [...(db.days[d]?.appointments || [])].sort((a, b) => a.start.localeCompare(b.start));
  const longDate = (d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => {
    const s = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', opts);
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const remindersText = (a) => {
    let r = ReminderCore.remindersOf(a, db.prefs);
    if (!r.length) return 'Sem aviso';
    const daily = [1, 2, 3, 4, 5, 6, 7].map((d) => d * 1440), parts = [];
    if (daily.every((m) => r.includes(m))) { parts.push('todo dia na última semana'); r = r.filter((m) => !daily.includes(m)); }
    parts.push(...r.map((m) => (m ? ReminderCore.reminderLabel(m) + ' antes' : 'na hora')));
    return 'Avisa ' + parts.join(', ');
  };
  const item = (a, d, showDate) => `
    <li><button type="button" class="ag-item${a.done ? ' done' : ''}" data-open="${E(a.id)}" data-date="${d}">
      <span class="ag-time">${showDate ? `${longDate(d, { weekday: 'short', day: '2-digit', month: '2-digit' })} · ` : ''}${a.start}–${a.end}</span>
      <span class="ag-title">${E(a.title)}</span>
      <span class="ag-rem">${E(remindersText(a))}</span>
    </button></li>`;

  function render() {
    if (page.hidden) return;
    const t = today();
    const first = new Date(month + '-01T12:00:00');
    $a('agMonthTitle').textContent = longDate(month + '-01', { month: 'long', year: 'numeric' });
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = DayCore.dateKey(d), list = apptsOf(key), out = key.slice(0, 7) !== month;
      if (i === 35 && out) break; // 5 semanas bastam quando a 6ª é toda do mês seguinte
      cells.push(`<button type="button" class="ag-cell${out ? ' out' : ''}${key === t ? ' today' : ''}${key === selected ? ' selected' : ''}" data-day="${key}"
        aria-label="${longDate(key)}${list.length ? `, ${list.length} compromisso${list.length === 1 ? '' : 's'}` : ''}" ${key === selected ? 'aria-current="date"' : ''}>
        <span class="ag-num">${d.getDate()}</span>
        ${list.slice(0, 2).map((a) => `<span class="ag-chip${a.done ? ' done' : ''}">${a.start} ${E(a.title)}</span>`).join('')}
        ${list.length > 2 ? `<span class="ag-more">+${list.length - 2}</span>` : ''}
        ${list.length ? `<span class="ag-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(list.length, 3))}</span>` : ''}
      </button>`);
    }
    $a('agGrid').innerHTML = cells.join('');

    $a('agDayTitle').textContent = selected === t ? 'Hoje · ' + longDate(selected, { day: 'numeric', month: 'long' }) : longDate(selected);
    const day = apptsOf(selected);
    $a('agDayList').innerHTML = day.map((a) => item(a, selected)).join('') || '<li class="small">Nenhum compromisso.</li>';

    const next = [];
    for (let i = 0; i <= 30; i++) {
      const d = DayCore.addDays(t, i);
      for (const a of apptsOf(d)) if (!a.done) next.push(item(a, d, true));
    }
    $a('agNextList').innerHTML = next.join('') || '<li class="small">Nada marcado.</li>';
  }

  $a('agGrid').addEventListener('click', (e) => {
    const c = e.target.closest('[data-day]');
    if (!c) return;
    selected = c.dataset.day;
    if (selected.slice(0, 7) !== month) month = selected.slice(0, 7);
    render();
  });
  page.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) openEvent(b.dataset.open, null, b.dataset.date);
  });
  const shift = (n) => {
    const d = new Date(month + '-01T12:00:00');
    d.setMonth(d.getMonth() + n);
    month = DayCore.dateKey(d).slice(0, 7);
    render();
  };
  $a('agPrev').onclick = () => shift(-1);
  $a('agNext').onclick = () => shift(1);
  $a('agToday').onclick = () => { selected = today(); month = selected.slice(0, 7); render(); };
  $a('agNew').onclick = () => openEvent(null, 9, selected);
  $a('agAddDay').onclick = () => openEvent(null, 9, selected);
  // Salvar ou excluir no formulário (ou chegar algo da nuvem) redesenha a agenda.
  window.addEventListener('stepbystep:saved', () => setTimeout(render));

  window.AgendaPage = {
    setVisible(v) { page.hidden = !v; if (v) render(); },
    refresh: render,
  };
})();
