/* Clareza: regras puras (contagem, marcos, padrões, validação e mesclagem de backup). Sem DOM. */
(root => {
  'use strict';
  const DAY = 864e5;
  const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365];
  const TRIGGERS = ['Tédio', 'Solidão', 'Cansaço', 'Estresse', 'Ansiedade', 'Celular na cama', 'Redes sociais', 'Tarde da noite'];
  const RESULTS = ['passed', 'strong', 'relapse'];

  const uid = () => (root.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const ms = iso => new Date(iso).getTime();
  const validISO = v => typeof v === 'string' && Number.isFinite(ms(v));
  const pad = n => String(n).padStart(2, '0');
  const dateKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  function empty() {
    return { version: 1, start: null, streaks: [], checkins: [], sos: [], reasons: '', plans: [], env: {} };
  }
  function normalize(c) {
    const base = empty();
    if (!c || typeof c !== 'object') return base;
    return {
      ...base, ...c,
      streaks: Array.isArray(c.streaks) ? c.streaks : [],
      checkins: Array.isArray(c.checkins) ? c.checkins : [],
      sos: Array.isArray(c.sos) ? c.sos : [],
      plans: Array.isArray(c.plans) ? c.plans : [],
      env: c.env && typeof c.env === 'object' ? c.env : {},
      reasons: typeof c.reasons === 'string' ? c.reasons : '',
    };
  }

  // Dias completos entre dois instantes (nunca negativo).
  const daysBetween = (a, b) => Math.max(0, Math.floor((b - a) / DAY));
  const current = (c, now = Date.now()) => (c.start ? daysBetween(ms(c.start), now) : 0);
  const streakDays = s => daysBetween(ms(s.start), ms(s.end));
  const best = (c, now = Date.now()) => Math.max(current(c, now), ...c.streaks.map(streakDays), 0);
  // Total acumulado: um recomeço não apaga os dias já vividos.
  const total = (c, now = Date.now()) => c.streaks.reduce((n, s) => n + streakDays(s), 0) + current(c, now);

  function milestone(days) {
    const next = MILESTONES.find(m => m > days) ?? null;
    const prev = [...MILESTONES].reverse().find(m => m <= days) ?? 0;
    const progress = next ? (days - prev) / (next - prev) : 1;
    return { prev, next, remaining: next ? next - days : 0, progress };
  }

  function begin(c, startISO) {
    if (!validISO(startISO)) throw Error('Data de início inválida.');
    c.start = startISO;
    return c;
  }
  // Fecha o período atual e começa outro agora. Retorna os dias do período encerrado.
  function restart(c, nowISO, info = {}) {
    if (!c.start) { c.start = nowISO; return 0; }
    const s = { id: uid(), start: c.start, end: nowISO, triggers: (info.triggers || []).filter(t => typeof t === 'string'), note: String(info.note || '').slice(0, 500) };
    c.streaks.push(s);
    c.start = nowISO;
    return streakDays(s);
  }
  function setStart(c, startISO, now = Date.now()) {
    if (!validISO(startISO) || ms(startISO) > now) throw Error('Escolha uma data que não esteja no futuro.');
    const lastEnd = Math.max(0, ...c.streaks.map(s => ms(s.end)));
    if (ms(startISO) < lastEnd) throw Error('A data não pode ser anterior ao último recomeço.');
    c.start = startISO;
  }

  // Situação de um dia do calendário: 'reset' (houve recomeço), 'firm' (dentro de um período), ou null.
  function dayStatus(c, key, now = Date.now()) {
    if (c.streaks.some(s => dateKey(ms(s.end)) === key)) return 'reset';
    const endOfDay = ms(key + 'T23:59:59');
    const startOfDay = ms(key + 'T00:00:00');
    if (startOfDay > now) return null;
    const inPeriod = (a, b) => a <= endOfDay && b >= startOfDay;
    if (c.start && inPeriod(ms(c.start), now)) return 'firm';
    if (c.streaks.some(s => inPeriod(ms(s.start), ms(s.end)))) return 'firm';
    return null;
  }

  const PERIODS = [['Madrugada', 0, 5], ['Manhã', 6, 11], ['Tarde', 12, 17], ['Noite', 18, 23]];
  function patterns(c) {
    const triggers = Object.fromEntries(TRIGGERS.map(t => [t, 0]));
    const periods = Object.fromEntries(PERIODS.map(([p]) => [p, 0]));
    const addTriggers = list => (list || []).forEach(t => { if (t in triggers) triggers[t]++; });
    c.checkins.forEach(v => { if (v.urge >= 1) addTriggers(v.triggers); });
    c.streaks.forEach(s => addTriggers(s.triggers));
    const moments = [...c.checkins.filter(v => v.urge >= 3).map(v => v.at), ...c.sos.map(v => v.at), ...c.streaks.map(s => s.end)];
    moments.forEach(at => {
      const h = new Date(at).getHours();
      const p = PERIODS.find(([, a, b]) => h >= a && h <= b);
      if (p) periods[p[0]]++;
    });
    const sos = { total: c.sos.length, passed: c.sos.filter(v => v.result === 'passed').length };
    return { triggers, periods, sos, samples: moments.length + c.checkins.length };
  }

  function validate(c) {
    if (c === undefined || c === null) return;
    if (typeof c !== 'object' || Array.isArray(c)) throw Error('Dados de Clareza inválidos.');
    if (c.start !== null && c.start !== undefined && !validISO(c.start)) throw Error('Início de Clareza inválido.');
    for (const s of c.streaks || []) if (typeof s.id !== 'string' || !validISO(s.start) || !validISO(s.end) || ms(s.end) < ms(s.start)) throw Error('Período de Clareza inválido.');
    for (const v of c.checkins || []) if (typeof v.id !== 'string' || !validISO(v.at) || !Number.isInteger(v.urge) || v.urge < 0 || v.urge > 5) throw Error('Check-in inválido.');
    for (const v of c.sos || []) if (typeof v.id !== 'string' || !validISO(v.at) || !RESULTS.includes(v.result)) throw Error('Registro de SOS inválido.');
    for (const v of c.plans || []) if (typeof v.id !== 'string' || typeof v.when !== 'string' || typeof v.then !== 'string') throw Error('Plano inválido.');
  }

  // Mescla por id; dados locais ganham nos conflitos (mesma regra do restante do backup).
  function merge(local, incoming) {
    const out = normalize(JSON.parse(JSON.stringify(local || empty())));
    const inc = normalize(incoming);
    for (const k of ['streaks', 'checkins', 'sos', 'plans']) {
      const ids = new Set(out[k].map(v => v.id));
      for (const v of inc[k]) if (!ids.has(v.id)) { out[k].push(v); ids.add(v.id); }
    }
    out.streaks.sort((a, b) => ms(a.start) - ms(b.start));
    if (!out.start && inc.start) {
      const lastEnd = Math.max(0, ...out.streaks.map(s => ms(s.end)));
      if (ms(inc.start) >= lastEnd) out.start = inc.start;
    }
    if (!out.reasons.trim() && inc.reasons) out.reasons = inc.reasons;
    for (const [k, v] of Object.entries(inc.env)) if (v) out.env[k] = true;
    return out;
  }

  root.ClarezaCore = { MILESTONES, TRIGGERS, uid, dateKey, empty, normalize, current, best, total, milestone, begin, restart, setStart, dayStatus, patterns, validate, merge };
})(typeof window === 'undefined' ? globalThis : window);
