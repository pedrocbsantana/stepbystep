/* Meu dia: plano, timer, checklist, distrações, agenda, música, histórico de dias. */

const $ = (id) => document.getElementById(id),
  key = "um-passo-v1",
  localDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let db;
try {
  db = JSON.parse(localStorage.getItem(key)) || { days: {} };
} catch {
  db = { days: {} };
}
if (!db.days) db.days = {};
let date = localDate(new Date()),
  weekOffset = 0,
  interval = null,
  end = 0,
  remaining = 600,
  running = false;
// Modelo de plano: cada dia novo começa com estes blocos. Editável em "Salvar como modelo".
const DEFAULT_PLAN = [
  ["ABAP / RAP", 60],
  ["Candidaturas", 30],
  ["Landing pages", 30],
  ["CRM", 20],
  ["Pausa", 10],
].map(([name, min]) => ({ name, min }));
if (!Array.isArray(db.planTemplate) || !db.planTemplate.length)
  db.planTemplate = DEFAULT_PLAN;
db.meta ??= {};
// Lixeira: dias apagados ficam disponíveis para desfazer por 30 dias.
const TRASH_DAYS = 30;
for (const [k, v] of Object.entries(db.deletedDays || {}))
  if (!v?.deletedAt || Date.now() - v.deletedAt > TRASH_DAYS * 864e5)
    delete db.deletedDays[k];
const defaults = () => ({
  blocks: db.planTemplate.map(({ name, min }) => ({ name, min, done: false })),
  task: "",
  timerMinutes: 10,
  rounds: 0,
  checks: [],
  distractions: [],
  wentWell: "",
  nextStep: "",
  feeling: "",
  reviewed: false,
});
let day;
// Um dia só "existe" no histórico quando tem algum registro de verdade.
function isEmptyDay(v) {
  return (
    !v ||
    !(
      v.planEdited ||
      v.rounds > 0 ||
      v.blocks?.some((b) => b.done) ||
      v.checks?.length ||
      v.distractions?.length ||
      v.appointments?.length ||
      v.wentWell ||
      v.nextStep ||
      v.feeling ||
      v.reviewed ||
      v.journal ||
      v.task
    )
  );
}
function pruneEmptyDays() {
  for (const [k, v] of Object.entries(db.days))
    if (k !== date && isEmptyDay(v)) delete db.days[k];
}
// Resumo do dia no topo: blocos, foco e checklist.
function renderSummary() {
  if (!day) return;
  const blocks = day.blocks.filter((b) => b.done).length,
    checks = day.checks.filter((c) => c.done).length;
  $("daySummary").innerHTML =
    `<span class="sum-item"><b>${blocks}/${day.blocks.length}</b> blocos</span>` +
    `<span class="sum-item"><b>${day.rounds}</b> ${day.rounds === 1 ? "rodada" : "rodadas"} de foco</span>` +
    `<span class="sum-item"><b>${checks}/${day.checks.length}</b> checklist</span>`;
}
function save() {
  renderSummary();
  pruneEmptyDays();
  renderHistory();
  try {
    localStorage.setItem(key, JSON.stringify(db));
    $("saveStatus").textContent =
      "Salvo";
  } catch {
    $("saveStatus").textContent =
      "Falha ao salvar";
  }
}
// Lembrete gentil de backup: os dados só existem neste navegador.
function renderBackupNudge() {
  const last = db.meta.lastBackupAt || 0,
    days = Object.values(db.days).filter((v) => !isEmptyDay(v)).length,
    stale = Date.now() - last > 7 * 864e5,
    snoozed = (db.meta.backupSnoozeUntil || 0) > Date.now();
  const show = days >= 3 && stale && !snoozed;
  $("backupNudge").hidden = !show;
  if (show)
    $("backupNudgeText").textContent = last
      ? `Último backup há ${Math.floor((Date.now() - last) / 864e5)} dias.`
      : "Nenhum backup ainda.";
}
window.renderBackupNudge = renderBackupNudge;
$("backupNow").onclick = () => $("exportStudy").click();
$("backupLater").onclick = () => {
  db.meta.backupSnoozeUntil = Date.now() + 3 * 864e5;
  save();
  renderBackupNudge();
};
function escapeHTML(t) {
  return String(t).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function load() {
  day = db.days[date] || (db.days[date] = defaults());
  $("date").value = date;
  {
    const t = localDate(new Date()),
      label = new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    $("introDate").textContent = date === t ? "Hoje" : "";
    $("introTitle").textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }
  ["task", "wentWell", "nextStep", "feeling", "timerMinutes"].forEach(
    (k) => ($(k).value = day[k]),
  );
  day.appointments ??= [];
  remaining = day.remaining ?? day.timerMinutes * 60;
  render();
  clock();
  scrollAgenda();
  window.DailyJournal?.load();
}
// O "primeiro passo de amanhã" do último dia anterior vira sugestão para a tarefa.
function renderSuggestion() {
  const prev = Object.keys(db.days)
      .filter((k) => k < date && db.days[k].nextStep?.trim())
      .sort()
      .pop(),
    text = prev ? db.days[prev].nextStep.trim() : "";
  const show = !!text && !day.task?.trim() && !running;
  $("taskSuggestion").hidden = !show;
  if (show) {
    $("taskSuggestionText").textContent = text;
    $("taskSuggestion").dataset.text = text;
  }
}
$("useSuggestion").onclick = () => {
  day.task = $("taskSuggestion").dataset.text || "";
  $("task").value = day.task;
  save();
  renderSuggestion();
  $("task").focus();
};
function render() {
  renderSummary();
  renderSuggestion();
  renderBackupNudge();
  renderAgenda();
  renderHistory();
  renderBlocks();
  renderLists();
  renderWeek();
  $("sessions").textContent =
    `${day.rounds} rodada${day.rounds === 1 ? "" : "s"} de foco`;
  $("reviewStatus").textContent = day.reviewed ? "Salvo" : "";
}
function renderBlocks() {
  $("blocks").innerHTML = day.blocks
    .map(
      (b, i) =>
        `<div class="block ${b.done ? "done" : ""}" data-block-index="${i}"><button type="button" class="drag-handle" data-drag="${i}" aria-label="Reordenar ${escapeHTML(b.name)}, posição ${i + 1} de ${day.blocks.length}" aria-describedby="reorderHint" title="Arraste para reordenar">⠿</button><input type="checkbox" data-done="${i}" ${b.done ? "checked" : ""} aria-label="Concluir ${escapeHTML(b.name)}"><input type="text" data-name="${i}" value="${escapeHTML(b.name)}" aria-label="Nome do bloco ${i + 1}"><input class="duration" type="number" min="1" max="600" data-min="${i}" value="${b.min}" aria-label="Minutos de ${escapeHTML(b.name)}"><button class="remove" data-remove="${i}" aria-label="Remover ${escapeHTML(b.name)}">×</button></div>`,
    )
    .join("");
  let n = day.blocks.filter((b) => b.done).length,
    total = day.blocks.reduce((a, b) => a + Number(b.min), 0);
  $("total").textContent =
    `${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
  $("completed").textContent = `${n}/${day.blocks.length} concluídos`;
  $("progress").style.width =
    (day.blocks.length ? (n / day.blocks.length) * 100 : 0) + "%";
}
$("blocks").addEventListener("change", (e) => {
  let t = e.target;
  if (t.dataset.done !== undefined) day.blocks[t.dataset.done].done = t.checked;
  if (t.dataset.name !== undefined) day.blocks[t.dataset.name].name = t.value;
  if (t.dataset.name !== undefined || t.dataset.min !== undefined)
    day.planEdited = true;
  if (t.dataset.min !== undefined)
    day.blocks[t.dataset.min].min = Math.max(
      1,
      Math.min(600, parseInt(t.value) || 1),
    );
  save();
  renderBlocks();
  renderWeek();
});
$("blocks").addEventListener("click", (e) => {
  if (e.target.dataset.remove !== undefined) {
    day.blocks.splice(+e.target.dataset.remove, 1);
    day.planEdited = true;
    save();
    renderBlocks();
    renderWeek();
  }
});
$("savePlanTemplate").onclick = () => {
  db.planTemplate = day.blocks.map(({ name, min }) => ({ name, min }));
  save();
  $("planStatus").textContent = "Modelo salvo.";
  setTimeout(() => ($("planStatus").textContent = ""), 4000);
};
$("addBlock").onclick = () => {
  day.blocks.push({ name: "Novo bloco", min: 10, done: false });
  day.planEdited = true;
  save();
  renderBlocks();
};
function renderLists() {
  $("checklist").innerHTML = day.checks
    .map(
      (c, i) =>
        `<li class="${c.done ? "done" : ""} ${c.movedTo ? "moved" : ""}"><input type="checkbox" data-check="${i}" ${c.done ? "checked" : ""} ${c.movedTo ? "disabled" : ""} aria-label="Concluir ${escapeHTML(c.text)}"><span>${escapeHTML(c.text)}${c.movedTo ? ` <small>levada para ${shortDate(c.movedTo)}</small>` : ""}</span><button class="remove" data-delcheck="${i}" aria-label="Remover tarefa">×</button></li>`,
    )
    .join("");
  $("checkCount").textContent =
    `${day.checks.filter((c) => c.done).length}/${day.checks.length}`;
  $("distractions").innerHTML = day.distractions
    .map(
      (t, i) =>
        `<li><span>${escapeHTML(t)}</span><button type="button" class="chip-button" data-distask="${i}" title="Mover para o checklist de amanhã">Amanhã</button><button class="remove" data-deldis="${i}" aria-label="Remover distração">×</button></li>`,
    )
    .join("");
  $("emptyDistractions").hidden = day.distractions.length > 0;
  renderCarry();
}
const shortDate = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
function addDaysKey(d, n) {
  const v = new Date(d + "T12:00:00");
  v.setDate(v.getDate() + n);
  return localDate(v);
}
// Pendências: itens não feitos do último dia anterior com checklist.
function carrySource() {
  const prev = Object.keys(db.days)
    .filter((k) => k < date && db.days[k].checks?.length)
    .sort()
    .pop();
  if (!prev) return null;
  const open = db.days[prev].checks.filter((c) => !c.done && !c.movedTo);
  return open.length ? { date: prev, open } : null;
}
function renderCarry() {
  const src = carrySource();
  $("carryChecks").hidden = !src;
  if (src)
    $("carryChecks").textContent =
      `Trazer ${src.open.length} pendência${src.open.length === 1 ? "" : "s"} de ${shortDate(src.date)}`;
}
$("carryChecks").onclick = () => {
  const src = carrySource();
  if (!src) return;
  src.open.forEach((c) => {
    day.checks.push({ text: c.text, done: false, from: src.date });
    c.movedTo = date;
  });
  save();
  renderLists();
};
// Distração vira tarefa no checklist do dia seguinte.
$("distractions").addEventListener("click", (e) => {
  const b = e.target.closest("[data-distask]");
  if (!b) return;
  const [text] = day.distractions.splice(+b.dataset.distask, 1),
    next = addDaysKey(date, 1);
  db.days[next] ??= defaults();
  db.days[next].checks.push({ text, done: false, from: date });
  save();
  renderLists();
  $("saveStatus").textContent = `Movido para ${shortDate(next)}.`;
});
$("checkForm").onsubmit = (e) => {
  e.preventDefault();
  let t = $("checkInput").value.trim();
  if (t) {
    day.checks.push({ text: t, done: false });
    $("checkInput").value = "";
    save();
    renderLists();
  }
};
$("distractionForm").onsubmit = (e) => {
  e.preventDefault();
  let t = $("distractionInput").value.trim();
  if (t) {
    day.distractions.push(t);
    $("distractionInput").value = "";
    save();
    renderLists();
  }
};
$("checklist").onchange = (e) => {
  if (e.target.dataset.check !== undefined) {
    day.checks[e.target.dataset.check].done = e.target.checked;
    save();
    renderLists();
  }
};
document.addEventListener("click", (e) => {
  if (e.target.dataset.delcheck !== undefined) {
    day.checks.splice(+e.target.dataset.delcheck, 1);
    save();
    renderLists();
  }
  if (e.target.dataset.deldis !== undefined) {
    day.distractions.splice(+e.target.dataset.deldis, 1);
    save();
    renderLists();
  }
});
const RING = 2 * Math.PI * 54;
function clock() {
  $("clock").textContent =
    `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const totalSeconds = (day?.timerMinutes || 10) * 60,
    progress = Math.min(1, Math.max(0, 1 - remaining / totalSeconds));
  $("timerRing").style.strokeDasharray = RING;
  $("timerRing").style.strokeDashoffset = RING * (1 - progress);
  document.querySelector(".focus-card").classList.toggle("is-running", running);
  $("start").textContent = running
    ? "Pausar"
    : remaining === 0
      ? "Nova rodada"
      : "Começar";
}
function pause() {
  window.StudyBridge?.onPause();
  pauseFocusMusic();
  if (running) remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
  running = false;
  clearInterval(interval);
  day.remaining = remaining;
  save();
  clock();
}
function finish() {
  window.FocusDock?.ring();
  window.Notify?.timerDone(day.task);
  window.StudyBridge?.onFinish();
  pauseFocusMusic();
  running = false;
  clearInterval(interval);
  remaining = 0;
  day.remaining = 0;
  day.rounds++;
  save();
  clock();
  render();
  $("timerNote").textContent =
    "Rodada concluída.";
}
function tick() {
  remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
  if (!remaining) finish();
  else clock();
}
$("start").onclick = () => {
  if (running) {
    pause();
    return;
  }
  if (!$("task").value.trim()) {
    $("task").setAttribute("aria-invalid", "true");
    $("task").focus();
    $("timerNote").textContent =
      "Escreva a tarefa primeiro.";
    return;
  }
  $("task").removeAttribute("aria-invalid");
  if (!remaining) remaining = day.timerMinutes * 60;
  running = true;
  end = Date.now() + remaining * 1000;
  interval = setInterval(tick, 250);
  $("timerNote").textContent = "";
  startFocusMusic();
  window.StudyBridge?.onStart();
  clock();
};
$("reset").onclick = () => {
  pause();
  remaining = day.timerMinutes * 60;
  day.remaining = remaining;
  save();
  clock();
  $("timerNote").textContent = "";
};
$("timerMinutes").onchange = () => {
  pause();
  day.timerMinutes = Math.max(
    1,
    Math.min(180, parseInt($("timerMinutes").value) || 10),
  );
  $("timerMinutes").value = day.timerMinutes;
  remaining = day.timerMinutes * 60;
  day.remaining = remaining;
  save();
  clock();
};
$("finishTask").onclick = () => {
  let t = day.task.trim();
  if (!t) {
    $("task").focus();
    return;
  }
  pause();
  day.checks.push({ text: t, done: true });
  day.task = "";
  $("task").value = "";
  remaining = day.timerMinutes * 60;
  day.remaining = remaining;
  save();
  renderLists();
  clock();
  $("timerNote").textContent =
    "Tarefa concluída.";
};
$("focusMode").onclick = () => {
  let active = document.body.classList.toggle("focus-mode");
  $("focusMode").textContent = active ? "Voltar" : "Expandir";
};
["task", "wentWell", "nextStep", "feeling"].forEach((k) =>
  $(k).addEventListener("input", () => {
    day[k] = $(k).value;
    if (k !== "task") day.reviewed = false;
    if (k === "task") renderSuggestion();
    save();
    $("reviewStatus").textContent = day.reviewed ? "Salvo" : "";
  }),
);
$("saveReview").onclick = () => {
  day.reviewed = true;
  save();
  $("reviewStatus").textContent = "Salvo";
};
function selectDay(value) {
  if (!value) return;
  pause();
  date = value;
  weekOffset = 0;
  load();
  save();
  $("timerNote").textContent = "";
}
function shiftDay(amount) {
  let d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + amount);
  selectDay(localDate(d));
}
$("date").onchange = () => selectDay($("date").value);
$("prevDay").onclick = () => shiftDay(-1);
$("nextDay").onclick = () => shiftDay(1);
$("today").onclick = () => selectDay(localDate(new Date()));
$("historyRows").onclick = (e) => {
  const target = e.target.closest("[data-open-day]");
  if (target) selectDay(target.dataset.openDay);
  const remove = e.target.closest("[data-delete-day]");
  if (remove) requestDeleteDay(remove.dataset.deleteDay);
};
function renderHistory() {
  renderDeletedNotice();
  const dates = Object.keys(db.days)
    .filter((d) => !isEmptyDay(db.days[d]))
    .sort()
    .reverse();
  $("historySummary").textContent =
    `${dates.length} dia${dates.length === 1 ? "" : "s"}`;
  $("historyEmpty").hidden = dates.length > 0;
  $("historyRows").innerHTML = dates
    .map((d) => {
      const v = db.days[d],
        label = new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      return `<tr class="${d === date ? "selected" : ""}"><td>${escapeHTML(label)}${d === localDate(new Date()) ? " · hoje" : ""}</td><td>${v.blocks.filter((b) => b.done).length}/${v.blocks.length}</td><td>${(v.appointments || []).length} compromisso${(v.appointments || []).length === 1 ? "" : "s"}</td><td>${v.rounds} rodada${v.rounds === 1 ? "" : "s"}</td><td>${v.checks.filter((c) => c.done).length}/${v.checks.length}</td><td>${v.reviewed ? "Salva ✓" : v.wentWell || v.nextStep || v.feeling ? "Em andamento" : "Sem revisão"}</td><td><button data-open-day="${d}" aria-label="Abrir dia ${escapeHTML(label)}" ${d === date ? 'aria-current="date"' : ""}>${d === date ? "Aberto" : "Abrir"}</button>${d < localDate(new Date()) ? `<button class="delete-day" data-delete-day="${d}" aria-label="Apagar dia ${escapeHTML(label)}">Apagar dia</button>` : ""}</td></tr>`;
    })
    .join("");
}
function renderWeek() {
  let base = new Date(date + "T12:00:00");
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + weekOffset * 7);
  let n = 0,
    names = ["S", "T", "Q", "Q", "S", "S", "D"];
  $("week").innerHTML = names
    .map((name, i) => {
      let d = new Date(base);
      d.setDate(d.getDate() + i);
      let data = db.days[localDate(d)],
        active = !!data && (data.rounds > 0 || data.blocks.some((b) => b.done));
      if (active) n++;
      return `<div class="day ${active ? "active" : ""} ${localDate(d) === localDate(new Date()) ? "today" : ""}" title="${d.toLocaleDateString("pt-BR")}: ${active ? "praticou" : "sem registro de prática"}"><div>${name}</div><div class="dot">${active ? "✓" : d.getDate()}</div></div>`;
    })
    .join("");
  $("weekCount").textContent = `${n}/7 dias`;
  let last = new Date(base);
  last.setDate(last.getDate() + 6);
  $("weekLabel").textContent =
    `${base.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${last.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}
$("prevWeek").onclick = () => {
  weekOffset--;
  renderWeek();
};
$("nextWeek").onclick = () => {
  weekOffset++;
  renderWeek();
};
let editingEvent = null,
  eventSourceDate = null,
  calendarView = (() => {
    try {
      return localStorage.getItem("stepbystep-agenda-view") === "week"
        ? "week"
        : "day";
    } catch {
      return "day";
    }
  })(),
  miniMonth = null;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function agendaPeriod(dates) {
  const a = new Date(dates[0] + "T12:00:00");
  if (dates.length === 1)
    return capitalize(
      a.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    );
  const b = new Date(dates[dates.length - 1] + "T12:00:00"),
    sameMonth = a.getMonth() === b.getMonth();
  return sameMonth
    ? `${a.getDate()} – ${b.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}`
    : `${a.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${b.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
}
const minuteValue = (t) => {
  let [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const timeValue = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
function calendarDates() {
  const d = new Date(date + "T12:00:00");
  if (calendarView === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: calendarView === "week" ? 7 : 1 }, (_, i) => {
    const v = new Date(d);
    v.setDate(v.getDate() + i);
    return localDate(v);
  });
}
function scrollAgenda() {
  const first = calendarDates()
    .flatMap((d) => db.days[d]?.appointments || [])
    .map((v) => minuteValue(v.start))
    .sort((a, b) => a - b)[0];
  $("agendaScroll").scrollTop = Math.max(0, Math.min(first ?? 420, 420) - 14);
}
function renderMini() {
  if (!miniMonth) miniMonth = date.slice(0, 7);
  let m = new Date(miniMonth + "-01T12:00:00");
  $("miniTitle").textContent = m.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const start = new Date(m);
  start.setDate(1 - m.getDay());
  $("miniGrid").innerHTML =
    ["D", "S", "T", "Q", "Q", "S", "S"]
      .map((v) => `<span class="weekday">${v}</span>`)
      .join("") +
    Array.from({ length: 42 }, (_, i) => {
      let d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = localDate(d);
      return `<button data-mini-date="${key}" class="${key === date ? "selected " : ""}${key === localDate(new Date()) ? "is-today " : ""}${d.getMonth() !== m.getMonth() ? "outside " : ""}${db.days[key]?.appointments?.length ? "has-event" : ""}" aria-label="Selecionar ${d.toLocaleDateString("pt-BR")}">${d.getDate()}</button>`;
    }).join("");
}
function renderAgenda() {
  const dates = calendarDates(),
    today = localDate(new Date());
  $("agendaTitle").textContent = agendaPeriod(dates);
  document
    .querySelectorAll("[data-cal-view]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.calView === calendarView),
      ),
    );
  $("calendarMobileNote").hidden = calendarView !== "week";
  $("calendarSheet").classList.toggle("one-day", calendarView === "day");
  $("calendarSheet").style.setProperty("--days", dates.length);
  $("calendarDays").innerHTML =
    '<div class="calendar-gutter"></div>' +
    dates
      .map((d) => {
        const v = new Date(d + "T12:00:00");
        return `<button class="calendar-day ${d === today ? "today" : ""} ${d === date ? "selected" : ""}" data-select-day="${d}" aria-label="Selecionar dia ${v.toLocaleDateString("pt-BR")}"><span class="dow">${v.toLocaleDateString("pt-BR", { weekday: "short" })}</span><span class="day-number">${v.getDate()}</span></button>`;
      })
      .join("");
  let all = [];
  $("agendaGrid").innerHTML =
    '<div class="time-labels">' +
    Array.from(
      { length: 24 },
      (_, i) =>
        `<span class="time-label" style="top:${i * 60 + 1}px">${String(i).padStart(2, "0")}:00</span>`,
    ).join("") +
    "</div>" +
    dates
      .map((d) => {
        const events = [...(db.days[d]?.appointments || [])].sort(
          (a, b) =>
            a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
        );
        all.push(...events.map((v) => ({ ...v, date: d })));
        let html = Array.from(
          { length: 24 },
          (_, i) =>
            `<button class="calendar-hour" style="top:${i * 60}px" data-hour="${i}" data-event-date="${d}" aria-label="Criar compromisso em ${d.split("-").reverse().join("/")} às ${i}:00">+</button>`,
        ).join("");
        let groups = [],
          group = [],
          until = -1;
        events.forEach((v) => {
          const start = minuteValue(v.start);
          if (start >= until && group.length) {
            groups.push(group);
            group = [];
            until = -1;
          }
          group.push(v);
          until = Math.max(until, minuteValue(v.end));
        });
        if (group.length) groups.push(group);
        groups.forEach((group) => {
          let ends = [],
            positions = group.map((v) => {
              const start = minuteValue(v.start);
              let column = ends.findIndex((e) => e <= start);
              if (column < 0) column = ends.length;
              ends[column] = minuteValue(v.end);
              return { v, column };
            });
          positions.forEach(({ v, column }) => {
            const duration = minuteValue(v.end) - minuteValue(v.start);
            html += `<button class="appointment ${v.done ? "completed" : ""}" data-event="${escapeHTML(v.id)}" data-event-date="${d}" style="top:${minuteValue(v.start)}px;height:${Math.max(18, duration - 2)}px;left:calc(${(column / ends.length) * 100}% + 2px);width:calc(${100 / ends.length}% - 4px)" aria-label="Editar ${escapeHTML(v.title)}, ${v.start} às ${v.end}, ${d}"><strong>${escapeHTML(v.title)}</strong><small>${v.start}–${v.end}</small></button>`;
          });
        });
        if (d === today) {
          const now = new Date();
          html += `<div class="now-line" style="top:${now.getHours() * 60 + now.getMinutes()}px"></div>`;
        }
        return `<div class="calendar-column ${d === date ? "selected" : ""}">${html}</div>`;
      })
      .join("");
  $("agendaCount").textContent =
    `${all.length} compromisso${all.length === 1 ? "" : "s"} ${calendarView === "week" ? "na semana" : "no dia"} · ${all.filter((v) => v.done).length} concluído${all.filter((v) => v.done).length === 1 ? "" : "s"}`;
  $("agendaEmpty").hidden = all.length > 0;
  $("agendaList").innerHTML = "";
}
function openEvent(id = null, hour = null, eventDate = date) {
  editingEvent = id;
  eventSourceDate = eventDate;
  const v = id
    ? (db.days[eventDate]?.appointments || []).find((e) => e.id === id)
    : null;
  if (id && !v) return;
  $("eventForm").reset();
  $("eventDialogTitle").textContent = v
    ? "Editar compromisso"
    : "Novo compromisso";
  $("eventDay").value = eventDate;
  $("eventTitle").value = v?.title || "";
  $("eventStart").value =
    v?.start || (hour !== null ? timeValue(hour * 60) : "");
  $("eventEnd").value =
    v?.end || (hour !== null ? timeValue(Math.min(1439, hour * 60 + 60)) : "");
  $("eventNotes").value = v?.notes || "";
  $("eventDone").checked = !!v?.done;
  $("deleteEvent").hidden = !v;
  $("eventError").textContent = "";
  window.StudyBridge?.openEvent(v, eventDate);
  $("eventDialog").showModal();
}
$("newEvent").onclick = () => openEvent();
$("agendaGrid").onclick = (e) => {
  const event = e.target.closest("[data-event]"),
    hour = e.target.closest("[data-hour]");
  if (event) openEvent(event.dataset.event, null, event.dataset.eventDate);
  else if (hour) openEvent(null, +hour.dataset.hour, hour.dataset.eventDate);
};
function pickCalendarDay(value) {
  miniMonth = value.slice(0, 7);
  selectDay(value);
}
$("calendarDays").onclick = (e) => {
  const t = e.target.closest("[data-select-day]");
  if (t) pickCalendarDay(t.dataset.selectDay);
};
function shiftMini(n) {
  const d = new Date(miniMonth + "-01T12:00:00");
  d.setMonth(d.getMonth() + n);
  miniMonth = localDate(d).slice(0, 7);
  renderMini();
}
document.querySelectorAll("[data-cal-view]").forEach(
  (b) =>
    (b.onclick = () => {
      calendarView = b.dataset.calView;
      try {
        localStorage.setItem("stepbystep-agenda-view", calendarView);
      } catch {}
      renderAgenda();
      scrollAgenda();
    }),
);
["closeEvent", "cancelEvent"].forEach(
  (id) => ($(id).onclick = () => $("eventDialog").close()),
);
$("eventForm").onsubmit = (e) => {
  e.preventDefault();
  const title = $("eventTitle").value.trim(),
    start = $("eventStart").value,
    end = $("eventEnd").value,
    target = $("eventDay").value;
  if (
    !title ||
    !target ||
    !start ||
    !end ||
    minuteValue(end) <= minuteValue(start)
  ) {
    $("eventError").textContent =
      "Preencha título e data; o fim deve ser depois do início.";
    return;
  }
  const v = {
    id:
      editingEvent ||
      crypto.randomUUID?.() ||
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
    title,
    start,
    end,
    notes: $("eventNotes").value.trim(),
    done: $("eventDone").checked,
    ...(window.StudyBridge?.readEvent() || {}),
  };
  db.days[target] ??= defaults();
  db.days[target].appointments ??= [];
  if (editingEvent)
    db.days[eventSourceDate].appointments = db.days[
      eventSourceDate
    ].appointments.filter((v) => v.id !== editingEvent);
  db.days[target].appointments.push(v);
  save();
  $("eventDialog").close();
  pickCalendarDay(target);
  $("agendaScroll").scrollTop = Math.max(0, minuteValue(start) - 30);
};
$("deleteEvent").onclick = () => {
  db.days[eventSourceDate].appointments = db.days[
    eventSourceDate
  ].appointments.filter((v) => v.id !== editingEvent);
  save();
  renderAgenda();
  $("eventDialog").close();
};
setInterval(() => {
  const now = new Date();
  document
    .querySelectorAll(".now-line")
    .forEach(
      (el) => (el.style.top = now.getHours() * 60 + now.getMinutes() + "px"),
    );
}, 60000);
let musicPlayer = null,
  musicReady = false,
  musicAPIRequested = false,
  musicPendingPlay = false,
  musicLoadedId = null;
db.music ??= { items: [], selected: "", auto: true, volume: 35 };
function selectedMusic() {
  return db.music.items.find((v) => v.id === db.music.selected);
}
function parseMusicURL(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(
      host,
    )
  )
    return null;
  const list = url.searchParams.get("list");
  if (list && /^[A-Za-z0-9_-]{10,150}$/.test(list))
    return {
      kind: "playlist",
      media: list,
      url: "https://www.youtube.com/playlist?list=" + encodeURIComponent(list),
    };
  let video =
    host === "youtu.be"
      ? url.pathname.split("/")[1]
      : url.searchParams.get("v");
  if (!video && /^\/(live|embed|shorts)\//.test(url.pathname))
    video = url.pathname.split("/")[2];
  if (video && /^[A-Za-z0-9_-]{11}$/.test(video))
    return {
      kind: "video",
      media: video,
      url: "https://www.youtube.com/watch?v=" + video,
    };
  return null;
}
function renderMusic() {
  const config = db.music;
  $("musicSelect").innerHTML =
    '<option value="">Sem música</option>' +
    config.items
      .map(
        (v) =>
          `<option value="${escapeHTML(v.id)}">${escapeHTML(v.name)}</option>`,
      )
      .join("");
  $("musicSelect").value = config.selected;
  $("musicAuto").checked = config.auto;
  $("musicVolume").value = config.volume;
  $("volumeValue").textContent = config.volume + "%";
  const selected = selectedMusic();
  $("removeMusic").hidden = !selected;
  $("musicPlayerWrap").hidden = !selected;
  if (selected) $("youtubeLink").href = selected.url;
}
function requestMusicAPI() {
  if (window.YT?.Player) {
    createMusicPlayer();
    return;
  }
  if (musicAPIRequested) return;
  musicAPIRequested = true;
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.onerror = () => {
    musicAPIRequested = false;
    $("musicStatus").textContent =
      "Não foi possível carregar o YouTube.";
  };
  document.head.appendChild(script);
}
window.onYouTubeIframeAPIReady = () => {
  if (selectedMusic()) createMusicPlayer();
};
function createMusicPlayer() {
  if (musicPlayer || !selectedMusic()) return;
  musicPlayer = new YT.Player("youtubePlayer", {
    width: "100%",
    height: "250",
    playerVars: { playsinline: 1, origin: location.origin, controls: 1 },
    events: {
      onReady: (e) => {
        musicReady = true;
        e.target.getIframe().title = "Música para focar — YouTube";
        e.target.getIframe().allow =
          "autoplay; encrypted-media; picture-in-picture; fullscreen";
        e.target.setVolume(db.music.volume);
        cueSelectedMusic();
        if (musicPendingPlay) e.target.playVideo();
      },
      onStateChange: (e) => {
        if (e.data === 1) {
          musicPendingPlay = false;
          $("musicStatus").textContent = "Tocando.";
        } else if (e.data === 2)
          $("musicStatus").textContent = "Pausada.";
      },
      onAutoplayBlocked: () => {
        musicPendingPlay = false;
        $("musicStatus").textContent =
          "Autoplay bloqueado. Clique em Tocar.";
      },
      onError: () => {
        musicPendingPlay = false;
        $("musicStatus").textContent =
          "Não foi possível tocar este link.";
      },
    },
  });
}
function cueSelectedMusic() {
  const v = selectedMusic();
  if (!v || !musicReady || musicLoadedId === v.id) return;
  musicLoadedId = v.id;
  if (v.kind === "playlist")
    musicPlayer.cuePlaylist({ listType: "playlist", list: v.media });
  else musicPlayer.cueVideoById(v.media);
}
function playFocusMusic() {
  const v = selectedMusic();
  if (!v) return;
  musicPendingPlay = true;
  $("musicPlayerWrap").hidden = false;
  $("musicStatus").textContent =
    "Carregando…";
  if (musicReady) {
    cueSelectedMusic();
    musicPlayer.playVideo();
  } else requestMusicAPI();
}
function startFocusMusic() {
  if (db.music.auto && selectedMusic()) playFocusMusic();
}
function pauseFocusMusic() {
  musicPendingPlay = false;
  if (musicReady && db.music.auto) musicPlayer.pauseVideo();
}
$("addMusic").onclick = () => {
  $("musicForm").hidden = false;
  $("musicName").focus();
};
$("cancelMusic").onclick = () => {
  $("musicForm").hidden = true;
  $("musicError").textContent = "";
};
$("musicForm").onsubmit = (e) => {
  e.preventDefault();
  const name = $("musicName").value.trim(),
    parsed = parseMusicURL($("musicURL").value);
  if (!name || !parsed) {
    $("musicError").textContent =
      "Informe nome e link válido do YouTube.";
    return;
  }
  const item = {
    id:
      "music-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2),
    name,
    ...parsed,
  };
  if (musicReady) musicPlayer.pauseVideo();
  db.music.items.push(item);
  db.music.selected = item.id;
  musicLoadedId = null;
  musicPendingPlay = false;
  save();
  renderMusic();
  $("musicForm").reset();
  $("musicForm").hidden = true;
  $("musicError").textContent = "";
  $("musicStatus").textContent =
    "Playlist selecionada.";
  requestMusicAPI();
  if (musicReady) cueSelectedMusic();
  if (running && db.music.auto) playFocusMusic();
};
$("musicSelect").onchange = () => {
  musicPendingPlay = false;
  if (musicReady) musicPlayer.pauseVideo();
  db.music.selected = $("musicSelect").value;
  musicLoadedId = null;
  save();
  renderMusic();
  if (selectedMusic()) {
    requestMusicAPI();
    if (musicReady) cueSelectedMusic();
    $("musicStatus").textContent =
      "Playlist selecionada.";
    if (running && db.music.auto) playFocusMusic();
  } else $("musicStatus").textContent = "";
};
$("musicAuto").onchange = () => {
  db.music.auto = $("musicAuto").checked;
  save();
  if (running && db.music.auto) playFocusMusic();
};
$("musicVolume").oninput = () => {
  db.music.volume = Number($("musicVolume").value);
  $("volumeValue").textContent = db.music.volume + "%";
  if (musicReady) musicPlayer.setVolume(db.music.volume);
  save();
};
$("playMusic").onclick = () => playFocusMusic();
$("pauseMusic").onclick = () => {
  musicPendingPlay = false;
  if (musicReady) musicPlayer.pauseVideo();
};
$("removeMusic").onclick = () => {
  if (musicReady) musicPlayer.pauseVideo();
  musicPendingPlay = false;
  db.music.items = db.music.items.filter((v) => v.id !== db.music.selected);
  db.music.selected = "";
  musicLoadedId = null;
  save();
  renderMusic();
  $("musicStatus").textContent =
    "Playlist removida.";
};
renderMusic();
let pendingDeleteDay = null,
  deleteDialogMode = "delete";
function deletedEntries() {
  return Object.entries(db.deletedDays || {}).sort(
    (a, b) => b[1].deletedAt - a[1].deletedAt,
  );
}
function renderDeletedNotice() {
  const last = deletedEntries()[0];
  $("deletedNotice").hidden = !last;
  if (last)
    $("deletedMessage").textContent =
      `Dia ${new Date(last[0] + "T12:00:00").toLocaleDateString("pt-BR")} apagado.`;
}
function requestDeleteDay(value) {
  if (value >= localDate(new Date()) || !db.days[value]) return;
  pendingDeleteDay = value;
  deleteDialogMode = "delete";
  const v = db.days[value],
    label = new Date(value + "T12:00:00").toLocaleDateString("pt-BR");
  $("deleteDayTitle").textContent = `Apagar o dia ${label}?`;
  $("deleteDaySummary").textContent =
    `${v.blocks.length} blocos, ${v.checks.length} itens, ${v.distractions.length} distrações, ${(v.appointments || []).length} compromissos.`;
  $("deleteDayHint").textContent =
    "Dá para desfazer por 30 dias.";
  $("confirmDeleteDay").textContent = "Apagar dia";
  $("deleteDayDialog").showModal();
}
$("cancelDeleteDay").onclick = () => $("deleteDayDialog").close();
function restoreDeletedDay(value) {
  const saved = db.deletedDays?.[value];
  if (!saved) return;
  if (date === value) pause();
  db.days[value] = saved.data;
  delete db.deletedDays[value];
  if (date === value) {
    day = db.days[value];
    load();
  }
  save();
  render();
  $("historyPanel").open = true;
}
$("undoDeleteDay").onclick = () => {
  const last = deletedEntries()[0];
  if (!last) return;
  const [value] = last;
  if (db.days[value]) {
    pendingDeleteDay = value;
    deleteDialogMode = "restore";
    $("deleteDayTitle").textContent = "Restaurar os registros anteriores?";
    $("deleteDaySummary").textContent =
      `O dia ${new Date(value + "T12:00:00").toLocaleDateString("pt-BR")} já possui novos registros. Restaurar substituirá esses registros pelos que foram apagados.`;
    $("deleteDayHint").textContent = "";
    $("confirmDeleteDay").textContent = "Restaurar e substituir";
    $("deleteDayDialog").showModal();
  } else restoreDeletedDay(value);
};
$("confirmDeleteDay").onclick = () => {
  const value = pendingDeleteDay;
  if (!value) return;
  if (deleteDialogMode === "restore") {
    restoreDeletedDay(value);
    $("deleteDayDialog").close();
    return;
  }
  if (value >= localDate(new Date()) || !db.days[value]) {
    $("deleteDayDialog").close();
    return;
  }
  if (date === value) pause();
  db.deletedDays ??= {};
  db.deletedDays[value] = {
    data: JSON.parse(JSON.stringify(db.days[value])),
    deletedAt: Date.now(),
  };
  delete db.days[value];
  if (date === value) {
    date = localDate(new Date());
    weekOffset = 0;
    miniMonth = null;
    load();
  }
  save();
  render();
  $("historyPanel").open = true;
  $("deleteDayDialog").close();
  pendingDeleteDay = null;
};
let blockDrag = null;
function announceBlockOrder(name, index) {
  $("reorderStatus").textContent =
    `${name} movido para a posição ${index + 1} de ${day.blocks.length}.`;
}
function endBlockDrag(commit) {
  if (!blockDrag) return;
  const drag = blockDrag;
  blockDrag = null;
  document.body.classList.remove("reordering");
  if (commit && date === drag.date) {
    const order = [...$("blocks").querySelectorAll("[data-block-index]")].map(
      (row) => Number(row.dataset.blockIndex),
    );
    day.blocks = order.map((i) => day.blocks[i]);
    day.planEdited = true;
    save();
    renderBlocks();
    const index = order.indexOf(drag.index);
    $("blocks")
      .querySelector(`[data-drag="${index}"]`)
      ?.focus({ preventScroll: true });
    if (index !== drag.index) announceBlockOrder(day.blocks[index].name, index);
  } else renderBlocks();
  if ($("blocks").hasPointerCapture(drag.pointer))
    $("blocks").releasePointerCapture(drag.pointer);
}
$("blocks").addEventListener("pointerdown", (e) => {
  const handle = e.target.closest("[data-drag]");
  if (!handle || e.button !== 0) return;
  const index = Number(handle.dataset.drag);
  if (document.activeElement instanceof HTMLInputElement)
    document.activeElement.blur();
  e.preventDefault();
  const row = $("blocks").querySelector(`[data-block-index="${index}"]`);
  if (!row) return;
  blockDrag = {
    index,
    pointer: e.pointerId,
    date,
    row,
    startY: e.clientY,
    moved: false,
  };
  row.classList.add("dragging");
  document.body.classList.add("reordering");
  $("blocks").setPointerCapture(e.pointerId);
});
$("blocks").addEventListener("pointermove", (e) => {
  if (!blockDrag || e.pointerId !== blockDrag.pointer) return;
  e.preventDefault();
  const drag = blockDrag;
  if (Math.abs(e.clientY - drag.startY) < 5 && !drag.moved) return;
  drag.moved = true;
  const rows = [...$("blocks").querySelectorAll("[data-block-index]")].filter(
    (row) => row !== drag.row,
  );
  const next = rows.find((row) => {
    const r = row.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  });
  $("blocks").insertBefore(drag.row, next || null);
  if (e.clientY < 65) window.scrollBy(0, -12);
  else if (e.clientY > window.innerHeight - 65) window.scrollBy(0, 12);
});
$("blocks").addEventListener("pointerup", (e) => {
  if (blockDrag && e.pointerId === blockDrag.pointer) endBlockDrag(true);
});
$("blocks").addEventListener("pointercancel", () => endBlockDrag(false));
$("blocks").addEventListener("lostpointercapture", () => {
  if (blockDrag) endBlockDrag(false);
});
$("blocks").addEventListener("keydown", (e) => {
  const handle = e.target.closest("[data-drag]");
  if (!handle || !["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key))
    return;
  e.preventDefault();
  const from = Number(handle.dataset.drag),
    to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? day.blocks.length - 1
          : from + (e.key === "ArrowUp" ? -1 : 1);
  if (to < 0 || to >= day.blocks.length || to === from) return;
  const [block] = day.blocks.splice(from, 1);
  day.planEdited = true;
  day.blocks.splice(to, 0, block);
  save();
  renderBlocks();
  $("blocks")
    .querySelector(`[data-drag="${to}"]`)
    .focus({ preventScroll: true });
  announceBlockOrder(block.name, to);
});
// Nome e minutos dos blocos salvam enquanto você digita (antes só salvavam ao sair do campo,
// e um F5 com o cursor ainda no campo perdia a edição).
$("blocks").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.name !== undefined) day.blocks[t.dataset.name].name = t.value;
  else if (t.dataset.min !== undefined) {
    const v = parseInt(t.value);
    if (v >= 1 && v <= 600) day.blocks[t.dataset.min].min = v;
  } else return;
  day.planEdited = true;
  save();
});
// Garante a gravação ao recarregar, fechar ou trocar de app (no iPhone o app é suspenso sem aviso).
function flush() {
  // Salvar não é pausar: o prazo absoluto continua valendo em segundo plano.
  if (running) day.remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
  try {
    localStorage.setItem(key, JSON.stringify(db));
  } catch {}
}
window.addEventListener("beforeunload", flush);
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flush();
  else if (running) tick();
});
window.addEventListener("pageshow", () => {
  if (running) tick();
});
// Verifica se o navegador deixa salvar e pede armazenamento persistente
// (evita que o Safari apague os dados de sites pouco visitados).
(function checkStorage() {
  let ok = true;
  try {
    localStorage.setItem("stepbystep-probe", "1");
    ok = localStorage.getItem("stepbystep-probe") === "1";
    localStorage.removeItem("stepbystep-probe");
  } catch {
    ok = false;
  }
  if (!ok) {
    $("storageWarning").hidden = false;
    $("saveStatus").textContent = "Não está salvando";
  }
  navigator.storage?.persist?.().catch(() => {});
})();
load();

$("task").addEventListener("input", () => {
  if ($("task").hasAttribute("aria-invalid")) {
    $("task").removeAttribute("aria-invalid");
    $("timerNote").textContent = "";
  }
});
