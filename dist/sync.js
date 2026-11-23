/* Sincronização entre aparelhos pelo banco Postgres (Neon).
   O app fala direto com o endpoint HTTP do Neon usando um papel restrito, que só pode
   ler, inserir e atualizar a tabela sync_docs. A chave (senha desse papel) fica só neste
   aparelho, nunca no código nem no backup. Com a cifragem ativada (⚙ → Sincronização),
   os documentos sobem cifrados com uma chave derivada dela. Regras em sync-core.js. */
(() => {
  'use strict';
  const SC = SyncCore;
  const HOST = 'ep-sweet-fire-beqdyjww.c-9.us-east-2.aws.neon.tech';
  const ROLE = 'stepbystep_sync', DB = 'neondb';
  const STATE_KEY = 'stepbystep-sync';

  const readState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; } };
  let st = readState();
  const writeState = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch {} };
  st.device ??= 'd-' + Math.random().toString(36).slice(2, 10);
  st.known ??= {};
  st.lastRev ??= 0;

  // ---------- Cifra ----------
  // Derivar a chave custa ~100 ms; guarda o resultado enquanto a chave de sincronização for a mesma.
  let cipher = null;
  const cryptoKey = () => {
    if (!cipher || cipher.secret !== st.key) cipher = { secret: st.key, key: SC.deriveKey(st.key) };
    return cipher.key;
  };

  // ---------- Transporte ----------
  async function sql(query, params = [], { keyOverride, keepalive = false } = {}) {
    const conn = `postgresql://${ROLE}:${encodeURIComponent(keyOverride || st.key)}@${HOST}/${DB}?sslmode=require`;
    let res;
    try {
      res = await fetch(`https://${HOST}/sql`, {
        method: 'POST',
        headers: { 'Neon-Connection-String': conn, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'false' },
        body: JSON.stringify({ query, params }),
        keepalive,
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
  const skip = (k, v) => (k.startsWith('day:') && DayCore.isEmptyDay(v)) || (k === 'clz:core' && !v.start && !v.reasons && !Object.keys(v.env || {}).length);
  // Há dados de verdade neste aparelho? (ignora padrões como modelo de plano e preferências)
  const hasLocalData = () => Object.keys(SC.explode(db, skip)).some(k => !['plan', 'music', 'sections'].includes(k));
  const onReject = (k, err) => console.warn('[sync] documento recusado', k, err.message);

  // Grava o estado sem disparar outra sincronização.
  function writeLocal() {
    applying = true;
    try { localStorage.setItem(key, JSON.stringify(db)); } finally { applying = false; }
  }

  // Uma versão antiga do app, aberta em outra aba, pode ter gravado documentos ainda cifrados
  // como se fossem dados. Abre esses documentos no lugar.
  async function repairSealed() {
    const k = await cryptoKey(), fixed = [];
    for (const [docKey, value] of Object.entries(SC.explode(db))) {
      if (!SC.isSealed(value)) continue;
      try { SC.applyDoc(db, docKey, await SC.unseal(k, docKey, value), false); fixed.push(docKey); }
      catch { SC.applyDoc(db, docKey, null, true); delete st.known[docKey]; fixed.push(docKey); }
    }
    return fixed;
  }

  async function pull(opts) {
    const k = await cryptoKey();
    let changed = [];
    for (;;) {
      const rows = await sql(
        'SELECT key, data::text AS data, deleted, rev FROM sync_docs WHERE rev > $1 ORDER BY rev LIMIT 1000',
        [String(Math.max(0, st.lastRev - 20))]);
      const parsed = [];
      for (const r of rows) {
        const row = { key: r.key, deleted: r.deleted === 't' || r.deleted === true, rev: Number(r.rev), data: null };
        try {
          const raw = r.data == null ? null : JSON.parse(r.data);
          // Outro aparelho já cifra: este passa a cifrar também.
          if (!st.sealed && SC.isSealed(raw)) st.sealed = true;
          if (!row.deleted && raw != null) row.data = await SC.unseal(k, r.key, raw);
          parsed.push(row);
        } catch (err) {
          // Cifrado com outra chave (ex.: depois de trocar a senha) ou estragado: ignora.
          onReject(r.key, err);
        }
      }
      changed = changed.concat(SC.applyRemote(db, parsed, st.known, { ...opts, skip, validate: SC.validateDoc, onReject }));
      const max = Math.max(st.lastRev, ...rows.map(r => Number(r.rev)));
      const done = rows.length < 1000 || max === st.lastRev;
      st.lastRev = max;
      if (done) break;
    }
    return [...new Set(changed)];
  }

  // all = true reenvia tudo (usado uma vez, para cifrar o que subiu antes da cifragem).
  // Sem cifragem ativada, os documentos sobem abertos, como nas versões anteriores.
  async function push({ all = false, keepalive = false } = {}) {
    const k = st.sealed ? await cryptoKey() : null;
    const docs = SC.explode(db, skip);
    const changes = all
      ? Object.entries(docs).map(([key, data]) => ({ key, data, deleted: false, hash: SC.hash(data) }))
      : SC.localChanges(docs, st.known);
    const size = keepalive ? 20 : 200; // keepalive aceita no máximo 64 KB por envio
    for (let i = 0; i < changes.length; i += size) {
      const batch = changes.slice(i, i + size);
      const rows = [];
      for (const c of batch) rows.push({ key: c.key, data: c.deleted ? null : k ? await SC.seal(k, c.key, c.data) : c.data, deleted: c.deleted });
      await sql(
        `INSERT INTO sync_docs (key, data, deleted, device)
         SELECT x->>'key', x->'data', (x->>'deleted')::boolean, $2 FROM jsonb_array_elements($1::jsonb) AS x
         ON CONFLICT (key) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, device = excluded.device,
           rev = nextval('sync_rev_seq'), updated_at = now()`,
        [JSON.stringify(rows), st.device], { keepalive });
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
      const repaired = await repairSealed();
      const changed = [...repaired, ...(await pull(opts))];
      if (changed.length) {
        writeLocal();
        refreshUI(changed);
      }
      // Recém-cifrado (por este aparelho ou por outro): reenvia tudo cifrado uma vez.
      if (st.sealed && !st.resealed) { await push({ all: true }); st.resealed = true; }
      await push();
      st.lastSyncAt = Date.now(); st.error = '';
      writeState();
      setStatus();
    } catch (err) {
      st.error = err.message;
      writeState();
      setStatus();
      if (err.auth) console.warn('[sync]', err.detail);
      else if (!err.offline) console.warn('[sync]', err);
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(sync, 300); }
    }
  }

  // Ao sair ou trocar de app: só envia, com keepalive, para o pedido sobreviver ao fechamento da página.
  async function pushNow() {
    if (!st.key || busy) return;
    busy = true;
    try { await push({ keepalive: true }); } catch {} finally {
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
      window.Board?.refresh();
      window.Applications?.refresh?.();
      window.Clareza?.refresh();
      window.applySections?.();
      window.renderBackupNudge?.();
    } catch (e) { console.warn('[sync] refresh', e); }
  }

  // Sincroniza alguns segundos depois de cada gravação local (saveDB avisa com este evento).
  let timer = null;
  const schedule = () => { if (!st.key) return; clearTimeout(timer); timer = setTimeout(sync, 2500); };
  window.addEventListener('stepbystep:saved', () => { if (!applying) schedule(); });
  setInterval(() => { if (!document.hidden) sync(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); pushNow(); } else sync();
  });
  window.addEventListener('online', () => sync());
  window.addEventListener('pagehide', () => { clearTimeout(timer); pushNow(); });

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
    $('syncSealBox').hidden = !st.key;
    $('syncSeal').hidden = !!st.sealed;
    if (st.sealed) $('syncSealText').textContent = 'Os dados sobem cifrados: quem abrir o banco vê só texto embaralhado.';
  }
  $('syncSeal').onclick = () => {
    st.sealed = true;
    st.resealed = false;
    writeState();
    sync();
  };

  let pendingKey = '';
  $('syncConnect').onclick = async () => {
    const k = $('syncKey').value.trim();
    if (!k) { $('syncKey').focus(); return; }
    setStatus('Conectando…');
    try {
      const [{ n }] = await sql('SELECT count(*)::int AS n FROM sync_docs WHERE NOT deleted', [], { keyOverride: k });
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
