/* Meu dia: regras puras, sem DOM. Usadas pelo app.js, pelo backup e pela sincronização. */
(function (root) {
  "use strict";

  const dateKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function validDate(d) {
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const dt = new Date(d + "T12:00:00");
    return !isNaN(dt) && dateKey(dt) === d;
  }

  function addDays(key, n) {
    const d = new Date(key + "T12:00:00");
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  // Dia novo a partir do modelo de plano.
  function newDay(template) {
    return {
      blocks: (template || []).map(({ name, min }) => ({ name, min, done: false })),
      task: "",
      timerMinutes: 10,
      rounds: 0,
      checks: [],
      distractions: [],
      wentWell: "",
      nextStep: "",
      feeling: "",
      reviewed: false,
    };
  }

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

  // Remove dias vazios, menos o que está aberto na tela.
  function pruneEmptyDays(days, keep) {
    for (const [k, v] of Object.entries(days)) if (k !== keep && isEmptyDay(v)) delete days[k];
    return days;
  }

  // Pendências: itens não feitos do último dia anterior com checklist.
  function carrySource(days, date) {
    const prev = Object.keys(days)
      .filter((k) => k < date && days[k].checks?.length)
      .sort()
      .pop();
    if (!prev) return null;
    const open = days[prev].checks.filter((c) => !c.done && !c.movedTo);
    return open.length ? { date: prev, open } : null;
  }

  // O "primeiro passo de amanhã" do último dia anterior vira sugestão para a tarefa.
  function suggestion(days, date) {
    const prev = Object.keys(days)
      .filter((k) => k < date && days[k].nextStep?.trim())
      .sort()
      .pop();
    return prev ? days[prev].nextStep.trim() : "";
  }

  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

  // Valida um dia vindo de fora (backup ou nuvem). Lança erro se estiver estragado.
  function validateDay(d, v) {
    if (
      !validDate(d) ||
      !v ||
      typeof v !== "object" ||
      !Array.isArray(v.blocks) ||
      !Array.isArray(v.checks) ||
      !Array.isArray(v.distractions) ||
      !Number.isFinite(v.timerMinutes) ||
      v.timerMinutes < 1 ||
      v.timerMinutes > 180
    )
      throw Error("Dia inválido.");
    for (const b of v.blocks)
      if (!b || typeof b.name !== "string" || !Number.isFinite(b.min) || b.min < 1)
        throw Error("Bloco inválido.");
    for (const c of v.checks)
      if (!c || typeof c.text !== "string" || (c.doing !== undefined && typeof c.doing !== "boolean"))
        throw Error("Checklist inválido.");
    if (v.distractions.some((x) => typeof x !== "string")) throw Error("Distração inválida.");
    if (v.rounds !== undefined && !Number.isFinite(v.rounds)) throw Error("Rodadas inválidas.");
    if (v.appointments !== undefined && !Array.isArray(v.appointments))
      throw Error("Agenda inválida.");
    for (const a of v.appointments || [])
      if (
        !a ||
        typeof a.id !== "string" ||
        typeof a.title !== "string" ||
        !TIME.test(a.start) ||
        !TIME.test(a.end) ||
        a.end <= a.start
      )
        throw Error("Compromisso inválido.");
    return v;
  }

  function validatePlan(plan) {
    if (
      !Array.isArray(plan) ||
      !plan.length ||
      plan.some((b) => !b || typeof b.name !== "string" || !Number.isFinite(b.min) || b.min < 1)
    )
      throw Error("Modelo de plano inválido.");
    return plan;
  }

  // ---------- Quadro (espelho do checklist) ----------
  // Cada tarefa do checklist vira um cartão. Itens levados para outro dia aparecem só no dia de destino.
  const STATUSES = ["todo", "doing", "done"];
  const checkStatus = (c) => (c.done ? "done" : c.doing ? "doing" : "todo");
  function setCheckStatus(c, status) {
    if (!STATUSES.includes(status)) throw Error("Status inválido.");
    c.done = status === "done";
    if (status === "doing") c.doing = true;
    else delete c.doing;
  }
  // Cartões de todos os dias, por coluna. "Feito" mostra só os últimos `doneDays` dias.
  function boardCards(days, today, doneDays = 14) {
    const cols = { todo: [], doing: [], done: [] };
    const limit = addDays(today, -doneDays);
    for (const date of Object.keys(days || {}).sort())
      (days[date].checks || []).forEach((c, index) => {
        if (c.movedTo) return;
        const status = checkStatus(c);
        if (status === "done" && date < limit) return;
        cols[status].push({ date, index, text: c.text, status, late: status !== "done" && date < today });
      });
    // Pendentes: mais antigos primeiro (o atrasado no topo). Feitos: mais recentes primeiro.
    cols.done.reverse();
    return cols;
  }

  root.DayCore = {
    STATUSES,
    checkStatus,
    setCheckStatus,
    boardCards,
    dateKey,
    validDate,
    addDays,
    newDay,
    isEmptyDay,
    pruneEmptyDays,
    carrySource,
    suggestion,
    validateDay,
    validatePlan,
  };
})(typeof window === "undefined" ? globalThis : window);
