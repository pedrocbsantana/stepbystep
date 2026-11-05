/* Lembretes: regras puras. Junta compromissos, revisões e acompanhamentos de vagas,
   gera o resumo do dia e o arquivo .ics para calendários. Sem DOM.
   A Clareza fica de fora de propósito. */
(root => {
  'use strict';
  const pad = n => String(n).padStart(2, '0');

  // Itens futuros (a partir de "today", formato YYYY-MM-DD).
  function collect(db, today) {
    const out = [];
    for (const [date, day] of Object.entries(db.days || {})) {
      if (date < today) continue;
      for (const a of day.appointments || [])
        out.push({ kind: 'event', uid: `event-${a.id}`, date, start: a.start, end: a.end, title: a.title, notes: a.notes || '', done: !!a.done });
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
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(v.title)}`, 'TRIGGER:-PT10M', 'END:VALARM');
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
  const signature = v => [v.date, v.start || '', v.end || '', v.title, v.notes || ''].join('|');
  function changed(items, exported = {}) {
    return items.filter(v => v.kind !== 'event' || !v.done).filter(v => exported[v.uid] !== signature(v));
  }

  root.ReminderCore = { collect, summary, upcoming, toICS, signature, changed };
})(typeof window === 'undefined' ? globalThis : window);
