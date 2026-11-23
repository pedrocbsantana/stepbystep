/* Quadro: espelho do checklist de todos os dias, em colunas A fazer / Fazendo / Feito.
   Não guarda nada próprio: mover um cartão muda o item no checklist do dia dele
   (campos done e doing), então o quadro sincroniza junto com os dias. Regras em day-core.js. */
(() => {
  'use strict';
  const COLS = [['todo', 'A fazer'], ['doing', 'Fazendo'], ['done', 'Feito']];
  const E = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const today = () => DayCore.dateKey(new Date());

  const page = document.createElement('section');
  page.id = 'boardPage';
  page.className = 'study-page board-page';
  page.hidden = true;
  page.innerHTML = `
  <div class="study-top"><div><h1>Quadro</h1><p class="small">Todas as tarefas dos seus checklists. Mover aqui marca lá, e vice-versa.</p></div></div>
  <form id="boardForm" class="board-form">
    <input id="boardInput" placeholder="Nova tarefa para hoje…" aria-label="Nova tarefa para hoje" maxlength="300">
    <button class="primary">Adicionar</button>
  </form>
  <div id="board" class="board"></div>`;
  document.getElementById('studyPage').before(page);
  const board = page.querySelector('#board');

  const dayLabel = (d) => {
    const t = today();
    if (d === t) return 'hoje';
    if (d === DayCore.addDays(t, -1)) return 'ontem';
    if (d === DayCore.addDays(t, 1)) return 'amanhã';
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  };

  function render() {
    if (page.hidden) return;
    const cols = DayCore.boardCards(db.days, today());
    board.innerHTML = COLS.map(([id, label], ci) => `
      <section class="board-col" data-col="${id}" aria-label="${label}">
        <h2>${label} <span class="board-count">${cols[id].length}</span></h2>
        <ul class="board-list">${cols[id].map((c) => `
          <li class="board-card${c.late ? ' late' : ''}" draggable="true" data-date="${c.date}" data-index="${c.index}">
            <span class="board-text">${E(c.text)}</span>
            <span class="board-meta">
              <span class="board-date">${c.late ? 'atrasada · ' : ''}${dayLabel(c.date)}</span>
              <span class="board-actions">
                ${ci > 0 ? `<button type="button" data-move="${COLS[ci - 1][0]}" aria-label="Mover ${E(c.text)} para ${COLS[ci - 1][1]}" title="${COLS[ci - 1][1]}">←</button>` : ''}
                ${ci < 2 ? `<button type="button" data-move="${COLS[ci + 1][0]}" aria-label="Mover ${E(c.text)} para ${COLS[ci + 1][1]}" title="${COLS[ci + 1][1]}">→</button>` : ''}
                <button type="button" class="remove" data-remove aria-label="Remover ${E(c.text)}" title="Remover">×</button>
              </span>
            </span>
          </li>`).join('') || '<li class="board-empty">Nada aqui.</li>'}
        </ul>
      </section>`).join('');
  }

  // Grava e atualiza o Meu dia (o checklist do dia aberto pode ter mudado).
  function commit() {
    save();
    if (typeof renderLists === 'function') renderLists();
    render();
  }
  const checkOf = (el) => db.days[el.dataset.date]?.checks[+el.dataset.index];

  function move(card, status) {
    const c = checkOf(card);
    if (!c) return;
    DayCore.setCheckStatus(c, status);
    commit();
  }

  board.addEventListener('click', (e) => {
    const card = e.target.closest('.board-card');
    if (!card) return;
    if (e.target.closest('[data-move]')) move(card, e.target.closest('[data-move]').dataset.move);
    else if (e.target.closest('[data-remove]')) {
      db.days[card.dataset.date]?.checks.splice(+card.dataset.index, 1);
      commit();
    }
  });

  // Arrastar entre colunas (mouse). No celular, use as setas.
  let dragged = null;
  board.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.board-card');
    if (!dragged) return;
    dragged.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragged.dataset.date);
  });
  board.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    dragged = null;
    board.querySelectorAll('.drop').forEach((c) => c.classList.remove('drop'));
  });
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.board-col');
    if (!col || !dragged) return;
    e.preventDefault();
    board.querySelectorAll('.drop').forEach((c) => c !== col && c.classList.remove('drop'));
    col.classList.add('drop');
  });
  board.addEventListener('drop', (e) => {
    const col = e.target.closest('.board-col');
    if (!col || !dragged) return;
    e.preventDefault();
    move(dragged, col.dataset.col);
  });

  page.querySelector('#boardForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = page.querySelector('#boardInput'), text = input.value.trim();
    if (!text) return;
    const t = today();
    db.days[t] ??= defaults();
    db.days[t].checks.push({ text, done: false });
    input.value = '';
    commit();
    input.focus();
  });

  window.Board = {
    setVisible(v) {
      page.hidden = !v;
      if (v) render();
    },
    refresh: render,
  };
})();
