/* Sincronização entre aparelhos pelo banco Postgres (Neon).
   O app fala direto com o endpoint HTTP do Neon usando um papel restrito, que só pode
   ler, inserir e atualizar a tabela sync_docs. A chave (senha desse papel) fica só neste
   aparelho, nunca no código nem no backup. Regras em sync-core.js. */
(() => {
  'use strict';
  const SC = SyncCore;
  const HOST = 'ep-hidden-butterfly-bev9b8e5.c-9.us-east-2.aws.neon.tech';
  const ROLE = 'stepbystep_sync', DB = 'neondb';
  const STATE_KEY = 'stepbystep-sync';

  const readState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; } };
  let st = readState();
  const writeState = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch {} };
  st.device ??= 'd-' + Math.random().toString(36).slice(2, 10);
  st.known ??= {};
  st.lastRev ??= 0;

  // ---------- Transporte ----------
  async function sql(query, params = [], keyOverride) {
    const conn = `postgresql://${ROLE}:${encodeURIComponent(keyOverride || st.key)}@${HOST}/${DB}?sslmode=require`;
    let res;
    try {
      res = await fetch(`https://${HOST}/sql`, {
        method: 'POST',
        headers: { 'Neon-Connection-String': conn, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'false' },
        body: JSON.stringify({ query, params }),
      });
    } catch { throw Object.assign(new Error('Sem conexão.'), { offline: true }); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const auth = /password|authentication|role .* does not exist/i.test(body.message || '');
      throw Object.assign(new Error(auth ? 'Chave inválida.' : 'Erro na nuvem.'), { auth, detail: body.message });
    }
    return body.rows || [];
  }

  // ---------- Ciclo de sincronização ----------
  let busy = false, again = false, applying = false;
  // Dias vazios (inclusive o de hoje, criado só por abrir o app) não sobem nem bloqueiam o que vem da nuvem.
  const skip = (k, v) => (k.startsWith('day:') && typeof isEmptyDay === 'function' && isEmptyDay(v)) || (k === 'clz:core' && !v.start && !v.reasons && !Object.keys(v.env || {}).length);
  // Há dados de verdade neste aparelho? (ignora padrões como modelo de plano e preferências)
  const hasLocalData = () => Object.keys(SC.explode(db, skip)).some(k => !['plan', 'music', 'sections'].includes(k));

  async function pull(opts) {
    let changed = [];
    for (;;) {
      const rows = await sql(
        'SELECT key, data::text AS data, deleted, rev FROM sync_docs WHERE rev > $1 ORDER BY rev LIMIT 1000',
        [String(Math.max(0, st.lastRev - 20))]);
      const parsed = rows.map(r => ({ key: r.key, data: r.data == null ? null : JSON.parse(r.data), deleted: r.deleted === 't' || r.deleted === true, rev: Number(r.rev) }));
      changed = changed.concat(SC.applyRemote(db, parsed, st.known, { ...opts, skip }));
      const max = Math.max(st.lastRev, ...parsed.map(r => r.rev));
      const done = rows.length < 1000 || max === st.lastRev;
      st.lastRev = max;
      if (done) break;
    }
    return [...new Set(changed)];
  }

  async function push() {
    const changes = SC.localChanges(SC.explode(db, skip), st.known);
    for (let i = 0; i < changes.length; i += 200) {
      const batch = changes.slice(i, i + 200);
      await sql(
        `INSERT INTO sync_docs (key, data, deleted, device)
         SELECT x->>'key', x->'data', (x->>'deleted')::boolean, $2 FROM jsonb_array_elements($1::jsonb) AS x
         ON CONFLICT (key) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, device = excluded.device,
           rev = nextval('sync_rev_seq'), updated_at = now()`,
        [JSON.stringify(batch.map(c => ({ key: c.key, data: c.data, deleted: c.deleted }))), st.device]);
      batch.forEach(c => (st.known[c.key] = c.hash));
      writeState();
    }
    return changes.length;
  }

  async function sync(opts = {}) {
    if (!st.key) return;
    if (busy) { again = true; return; }
    busy = true;
    setStatus('Sincronizando…');
    try {
      const changed = await pull(opts);
      if (changed.length) {
        applying = true;
        try { localStorage.setItem(key, JSON.stringify(db)); } finally { applying = false; }
        refreshUI(changed);
      }
      await push();
      st.lastSyncAt = Date.now(); st.error = '';
      writeState();
      setStatus();
    } catch (err) {
      st.error = err.message;
      writeState();
      setStatus();
      if (err.auth) console.warn('[sync]', err.detail);
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(sync, 300); }
    }
  }

  function refreshUI(keys) {
    try {
      if (keys.some(k => k.startsWith('day:') || k === 'plan')) {
        if (typeof running !== 'undefined' && running) render(); else load();
      }
      if (keys.includes('music') && typeof renderMusic === 'function') renderMusic();
      window.StudyUI?.refresh();
      window.Applications?.refresh?.();
      window.Clareza?.refresh();
      window.applySections?.();
      window.renderBackupNudge?.();
    } catch (e) { console.warn('[sync] refresh', e); }
  }

  // Sincroniza alguns segundos depois de cada gravação local.
  let timer = null;
  const schedule = () => { if (!st.key) return; clearTimeout(timer); timer = setTimeout(sync, 2500); };
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === window.localStorage && k === key && !applying) schedule();
  };
  setInterval(() => { if (!document.hidden) sync(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('online', () => sync());
  // Antes de sair, tenta enviar o que falta (melhor esforço).
  window.addEventListener('pagehide', () => { if (st.key) sync(); });

  // ---------- Configurações ----------
  function setStatus(text) {
    const el = $('syncStatus');
    if (!el) return;
    if (text) { el.textContent = text; return; }
    if (!st.key) el.textContent = 'Desconectado. Os dados ficam só neste aparelho.';
    else if (st.error) el.textContent = st.error === 'Sem conexão.' ? 'Sem conexão. Tenta de novo quando a internet voltar.' : st.error;
    else if (st.lastSyncAt) el.textContent = 'Sincronizado às ' + new Date(st.lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
    else el.textContent = 'Conectado.';
    $('syncLinked').hidden = !st.key;
    $('syncUnlinked').hidden = !!st.key;
    $('syncChoice').hidden = true;
  }

  let pendingKey = '';
  $('syncConnect').onclick = async () => {
    const k = $('syncKey').value.trim();
    if (!k) { $('syncKey').focus(); return; }
    setStatus('Conectando…');
    try {
      const [{ n }] = await sql('SELECT count(*)::int AS n FROM sync_docs WHERE NOT deleted', [], k);
      if (Number(n) > 0 && hasLocalData()) {
        pendingKey = k;
        $('syncChoice').hidden = false;
        $('syncStatus').textContent = 'A nuvem e este aparelho já têm dados. Em caso de conflito, usar:';
        return;
      }
      finishConnect(k, Number(n) > 0);
    } catch (err) {
      $('syncStatus').textContent = err.message;
    }
  };
  function finishConnect(k, preferRemote) {
    st = { device: st.device, key: k, known: {}, lastRev: 0 };
    writeState();
    $('syncKey').value = '';
    setStatus('Conectando…');
    sync({ preferRemote });
  }
  $('syncUseRemote').onclick = () => finishConnect(pendingKey, true);
  $('syncUseLocal').onclick = () => finishConnect(pendingKey, false);
  $('syncNow').onclick = () => sync();
  $('syncUnlink').onclick = () => {
    st = { device: st.device, known: {}, lastRev: 0 };
    writeState();
    setStatus();
  };
  $('openSettings').addEventListener('click', () => setStatus());

  window.Sync = { sync, status: () => ({ linked: !!st.key, lastSyncAt: st.lastSyncAt, error: st.error }) };
  setStatus();
  if (st.key) setTimeout(sync, 800);
})();
