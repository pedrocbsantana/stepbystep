/* Lembretes: regras puras. Junta compromissos, revisões e acompanhamentos de vagas,
   gera o resumo do dia e o arquivo .ics para calendários. Sem DOM.
   A Clareza fica de fora de propósito. */
(root => {
  'use strict';
  const pad = n => String(n).padStart(2, '0');

  // ---------- Lembretes de compromissos ----------
  // Cada compromisso guarda "reminders": minutos antes do início (0 = na hora).
  // Sem lista própria, vale o padrão das configurações (db.prefs.reminders), ou 10 min.
  const MAX_REMINDER = 60 * 24 * 30;
  const DEFAULT_REMINDERS = [10];
  const validReminders = r => Array.isArray(r) && r.length <= 10 && r.every(n => Number.isInteger(n) && n >= 0 && n <= MAX_REMINDER);
  const normReminders = r => [...new Set(r)].sort((a, b) => b - a);
  function remindersOf(a, prefs) {
    if (validReminders(a.reminders)) return normReminders(a.reminders);
    if (validReminders(prefs?.reminders)) return normReminders(prefs.reminders);
    return DEFAULT_REMINDERS;
  }
  // "2 dias", "1 h 30 min", "na hora".
  function reminderLabel(min) {
    if (!min) return 'na hora';
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60, out = [];
    if (d) out.push(d === 7 && !h && !m ? '1 semana' : `${d} dia${d === 1 ? '' : 's'}`);
    if (h) out.push(`${h} h`);
    if (m) out.push(`${m} min`);
    return out.join(' ');
  }
  const localKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOf = (date, time) => new Date(`${date}T${time}:00`);

  // Lembretes vencidos e ainda não avisados. Um compromisso que ainda não começou avisa uma vez
  // por lembrete vencido; se vários venceram com o app fechado, sai só um aviso (o mais recente)
  // e os outros são marcados como avisados. "notified" é um objeto de chaves já avisadas.
  function dueReminders(db, now, notified = {}) {
    const out = [], today = localKey(now);
    for (const [date, day] of Object.entries(db.days || {})) {
      if (date < today) continue;
      for (const a of day.appointments || []) {
        if (a.done) continue;
        const start = startOf(date, a.start);
        if (start <= now) continue;
        const due = remindersOf(a, db.prefs).filter(min => start - min * 60000 <= now);
        const keys = due.map(min => `${date}|${a.id}|${min}`).filter(k => !notified[k]);
        if (!keys.length) continue;
        out.push({ ...a, date, minutesLeft: Math.round((start - now) / 60000), keys });
      }
    }
    return out;
  }
  // Texto do aviso: "Em 2 dias · ter., 25/11 · 14:00–15:00".
  function reminderText(item, now) {
    const left = item.minutesLeft;
    const when = left < 1 ? 'Agora' : `Em ${reminderLabel(left >= 1440 ? Math.round(left / 1440) * 1440 : left >= 60 ? Math.round(left / 60) * 60 : left)}`;
    const sameDay = item.date === localKey(now);
    const day = sameDay ? 'hoje' : new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    return `${when} · ${day} · ${item.start}–${item.end}`;
  }
  // Apaga marcas de avisos de dias que já passaram.
  function pruneNotified(notified, today) {
    for (const k of Object.keys(notified)) if (k.slice(0, 10) < today) delete notified[k];
    return notified;
  }

  // Itens futuros (a partir de "today", formato YYYY-MM-DD).
  function collect(db, today) {
    const out = [];
    for (const [date, day] of Object.entries(db.days || {})) {
      if (date < today) continue;
      for (const a of day.appointments || [])
        out.push({ kind: 'event', uid: `event-${a.id}`, date, start: a.start, end: a.end, title: a.title, notes: a.notes || '', done: !!a.done, reminders: remindersOf(a, db.prefs) });
    }
    for (const n of db.study?.notes || []) {
      const r = n.review;
      if (r?.enabled && r.nextDue) {
        const date = r.nextDue < today ? today : r.nextDue;
        out.push({ kind: 'review', uid: `review-${n.id}-${r.stage}`, date, title: `Revisão: ${n.title || 'anotação'}`, overdue: r.nextDue < today });
      }
    }
    for (const v of db.applications || []) {
      if (v.followUp && !['Contratado', 'Encerrada'].includes(v.status)) {
        const date = v.followUp < today ? today : v.followUp;
        out.push({ kind: 'followup', uid: `followup-${v.id}-${v.followUp}`, date, title: `Acompanhar: ${v.company} · ${v.role}`, notes: v.nextAction || '', overdue: v.followUp < today });
      }
    }
    return out.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  }

  // Resumo do dia para a notificação de abertura.
  function summary(db, today) {
    const items = collect(db, today).filter(v => v.date === today && !v.done);
    const count = k => items.filter(v => v.kind === k).length;
    const events = count('event'), reviews = count('review'), followups = count('followup');
    const parts = [];
    if (events) parts.push(`${events} compromisso${events === 1 ? '' : 's'}`);
    if (reviews) parts.push(`${reviews} revis${reviews === 1 ? 'ão' : 'ões'}`);
    if (followups) parts.push(`${followups} acompanhamento${followups === 1 ? '' : 's'}`);
    return { events, reviews, followups, text: parts.join(' · ') };
  }

  // Compromissos que começam dentro da janela (minutos) a partir de agora.
  function upcoming(db, now, windowMin = 10) {
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const mins = now.getHours() * 60 + now.getMinutes();
    return (db.days?.[today]?.appointments || []).filter(a => {
      if (a.done) return false;
      const [h, m] = a.start.split(':').map(Number), start = h * 60 + m;
      return start - mins >= 0 && start - mins <= windowMin;
    }).map(a => ({ ...a, date: today }));
  }

  // ---------- iCalendar (RFC 5545) ----------
  const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  // Dobra linhas longas (máx. 75 octetos), sem cortar caracteres UTF-8 no meio.
  function fold(line) {
    const enc = new TextEncoder(), out = [];
    let cur = '', size = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
      cur += ch; size += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  const ymd = d => d.replace(/-/g, '');
  const nextDay = d => { const v = new Date(d + 'T12:00:00'); v.setDate(v.getDate() + 1); return `${v.getFullYear()}${pad(v.getMonth() + 1)}${pad(v.getDate())}`; };
  const stampOf = date => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

  function toICS(items, now = new Date()) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//stepbystep//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:stepbystep'];
    for (const v of items) {
      L.push('BEGIN:VEVENT', `UID:${v.uid}@stepbystep`, `DTSTAMP:${stampOf(now)}`, `SUMMARY:${esc(v.title)}`);
      if (v.kind === 'event') {
        // Hora local "flutuante": o calendário usa o fuso do aparelho.
        L.push(`DTSTART:${ymd(v.date)}T${v.start.replace(':', '')}00`, `DTEND:${ymd(v.date)}T${v.end.replace(':', '')}00`);
        for (const min of v.reminders || DEFAULT_REMINDERS)
          L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(v.title)}`, min ? `TRIGGER:-PT${min}M` : 'TRIGGER:PT0M', 'END:VALARM');
      } else {
        L.push(`DTSTART;VALUE=DATE:${ymd(v.date)}`, `DTEND;VALUE=DATE:${nextDay(v.date)}`, 'TRANSP:TRANSPARENT');
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(v.title)}`, 'TRIGGER:PT9H', 'END:VALARM');
      }
      if (v.notes) L.push(`DESCRIPTION:${esc(v.notes)}`);
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  // Assinatura para exportar só o que é novo ou mudou desde a última exportação.
  const signature = v => [v.date, v.start || '', v.end || '', v.title, v.notes || '', ...(v.reminders && v.reminders.join(',') !== '10' ? [v.reminders.join(',')] : [])].join('|');
  function changed(items, exported = {}) {
    return items.filter(v => v.kind !== 'event' || !v.done).filter(v => exported[v.uid] !== signature(v));
  }

  root.ReminderCore = { MAX_REMINDER, DEFAULT_REMINDERS, validReminders, remindersOf, reminderLabel, dueReminders, reminderText, pruneNotified, collect, summary, upcoming, toICS, signature, changed };
})(typeof window === 'undefined' ? globalThis : window);
