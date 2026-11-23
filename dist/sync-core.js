/* Sincronização: regras puras. Quebra o estado do app em documentos com chave estável,
   descobre o que mudou desde a última sincronização e aplica o que veio da nuvem.
   Ficam de fora (por aparelho): meta, focusPrefs, lixeira, sessão de estudo ativa e avisos. */
(root => {
  'use strict';

  // JSON com chaves ordenadas: o mesmo conteúdo sempre gera o mesmo texto (o jsonb reordena chaves).
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v ?? null);
  }
  // FNV-1a 32 bits: só para detectar mudança, não é segurança.
  function hash(v) {
    const s = stable(v);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }

  const ARRAYS = [
    ['study:subjects:', db => db.study?.subjects, (db, a) => { db.study.subjects = a; }],
    ['study:topics:', db => db.study?.topics, (db, a) => { db.study.topics = a; }],
    ['study:notes:', db => db.study?.notes, (db, a) => { db.study.notes = a; }],
    ['study:sessions:', db => db.study?.sessions, (db, a) => { db.study.sessions = a; }],
    ['app:', db => db.applications, (db, a) => { db.applications = a; }],
    ['clz:streaks:', db => db.clareza?.streaks, (db, a) => { db.clareza.streaks = a; }],
    ['clz:checkins:', db => db.clareza?.checkins, (db, a) => { db.clareza.checkins = a; }],
    ['clz:sos:', db => db.clareza?.sos, (db, a) => { db.clareza.sos = a; }],
    ['clz:plans:', db => db.clareza?.plans, (db, a) => { db.clareza.plans = a; }],
  ];

  // Estado do app → { chave: valor }
  function explode(db, skip) {
    const docs = {};
    for (const [d, v] of Object.entries(db.days || {})) docs['day:' + d] = v;
    if (db.planTemplate) docs.plan = db.planTemplate;
    if (db.music) docs.music = { items: db.music.items, selected: db.music.selected, auto: db.music.auto, volume: db.music.volume };
    if (db.prefs?.sections) docs.sections = db.prefs.sections;
    if (db.clareza) docs['clz:core'] = { start: db.clareza.start ?? null, reasons: db.clareza.reasons || '', env: db.clareza.env || {} };
    for (const [prefix, get] of ARRAYS) for (const v of get(db) || []) if (v && typeof v.id === 'string') docs[prefix + v.id] = v;
    if (skip) for (const k of Object.keys(docs)) if (skip(k, docs[k])) delete docs[k];
    return docs;
  }

  // Aplica um documento (ou remoção) no estado do app, mudando o objeto no lugar.
  function applyDoc(db, key, value, deleted) {
    if (key.startsWith('day:')) {
      const d = key.slice(4);
      db.days ??= {};
      if (deleted) delete db.days[d]; else db.days[d] = value;
      return;
    }
    if (key === 'plan') { if (!deleted && Array.isArray(value) && value.length) db.planTemplate = value; return; }
    if (key === 'music') { if (!deleted && value) db.music = { ...(db.music || {}), ...value }; return; }
    if (key === 'sections') { if (!deleted && value) { db.prefs ??= {}; db.prefs.sections = value; } return; }
    if (key === 'clz:core') {
      if (deleted || !value) return;
      db.clareza ??= {};
      Object.assign(db.clareza, { start: value.start ?? null, reasons: value.reasons || '', env: value.env || {} });
      return;
    }
    for (const [prefix, get, set] of ARRAYS) {
      if (!key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (prefix.startsWith('study:')) db.study ??= { version: 1, subjects: [], topics: [], notes: [], sessions: [] };
      if (prefix.startsWith('clz:')) { db.clareza ??= {}; db.clareza.streaks ??= []; db.clareza.checkins ??= []; db.clareza.sos ??= []; db.clareza.plans ??= []; }
      if (prefix === 'app:') db.applications ??= [];
      const list = [...(get(db) || [])], i = list.findIndex(v => v.id === id);
      if (deleted) { if (i >= 0) list.splice(i, 1); }
      else if (i >= 0) list[i] = value;
      else list.push(value);
      set(db, list);
      return;
    }
  }

  // O que este aparelho precisa enviar: novos/alterados e removidos desde a última sincronização.
  function localChanges(docs, known) {
    const changes = [];
    for (const [key, value] of Object.entries(docs)) {
      const h = hash(value);
      if (known[key] !== h) changes.push({ key, data: value, deleted: false, hash: h });
    }
    for (const key of Object.keys(known)) if (!(key in docs) && known[key] !== 'deleted') changes.push({ key, data: null, deleted: true, hash: 'deleted' });
    return changes;
  }

  // Aplica linhas vindas da nuvem. Documentos alterados aqui e ainda não enviados ganham
  // (a versão local é a mais recente e vai subir em seguida), exceto quando preferRemote = true.
  // skip: documentos que contam como inexistentes (ex.: dia vazio criado só por abrir o app).
  // validate: função (chave, valor) que lança erro para documento estragado. Documento rejeitado
  // não é aplicado nem marcado como conhecido; se mudar aqui depois, a versão local sobe normalmente.
  function applyRemote(db, rows, known, { preferRemote = false, skip, validate, onReject } = {}) {
    const docs = explode(db, skip);
    const changed = [];
    for (const r of rows) {
      if (validate && !r.deleted) {
        try { validate(r.key, r.data); } catch (err) { onReject?.(r.key, err); continue; }
      }
      const localDirty = r.key in docs ? known[r.key] !== hash(docs[r.key]) : r.key in known && known[r.key] !== 'deleted';
      const remoteHash = r.deleted ? 'deleted' : hash(r.data);
      if (localDirty && !preferRemote) continue;
      const localHash = r.key in docs ? hash(docs[r.key]) : 'deleted';
      known[r.key] = remoteHash;
      if (localHash === remoteHash) continue;
      if (r.deleted && !(r.key in docs) && !(r.key.startsWith('day:') && db.days?.[r.key.slice(4)])) continue;
      applyDoc(db, r.key, r.data, r.deleted);
      changed.push(r.key);
    }
    return changed;
  }

  // ---------- Validação do que vem da nuvem ----------
  // Confere só a forma que a interface precisa para não quebrar ao desenhar.
  const ID = /^[A-Za-z0-9_-]+$/;
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const strings = (v, ...ks) => ks.every(k => typeof v[k] === 'string');
  const optString = (v, k) => v[k] === undefined || v[k] === null || typeof v[k] === 'string';

  function validateDoc(key, v) {
    const fail = () => { throw Error('Documento inválido: ' + key); };
    if (key.startsWith('day:')) { root.DayCore.validateDay(key.slice(4), v); return; }
    if (key === 'plan') { root.DayCore.validatePlan(v); return; }
    if (key === 'music') { if (!isObj(v) || (v.items !== undefined && !Array.isArray(v.items))) fail(); return; }
    if (key === 'sections') { if (!isObj(v)) fail(); return; }
    if (key === 'clz:core') {
      if (!isObj(v) || typeof (v.reasons ?? '') !== 'string' || !isObj(v.env ?? {})) fail();
      root.ClarezaCore?.validate({ start: v.start });
      return;
    }
    const prefix = ARRAYS.map(a => a[0]).find(p => key.startsWith(p));
    const id = prefix && key.slice(prefix.length);
    if (!prefix || !ID.test(id) || !isObj(v) || v.id !== id) fail();
    switch (prefix) {
      case 'study:subjects:': if (!strings(v, 'name')) fail(); break;
      case 'study:topics:': if (!strings(v, 'name', 'subjectId') || !optString(v, 'parentId')) fail(); break;
      case 'study:notes:':
        if (!strings(v, 'subjectId', 'title', 'body') || !optString(v, 'topicId')) fail();
        if (v.questions !== undefined && !Array.isArray(v.questions)) fail();
        if (v.review && (!isObj(v.review) || !Array.isArray(v.review.history))) fail();
        break;
      case 'study:sessions:':
        if (!Number.isFinite(v.minutes) || v.minutes <= 0 || v.minutes > 1440 || !root.DayCore.validDate(v.date) || !strings(v, 'subjectName')) fail();
        break;
      case 'app:': root.ApplicationCore.validate([v]); break;
      case 'clz:streaks:': root.ClarezaCore.validate({ streaks: [v] }); break;
      case 'clz:checkins:': root.ClarezaCore.validate({ checkins: [v] }); break;
      case 'clz:sos:': root.ClarezaCore.validate({ sos: [v] }); break;
      case 'clz:plans:': root.ClarezaCore.validate({ plans: [v] }); break;
    }
  }

  // ---------- Cifragem (AES-GCM) ----------
  // A chave de cifra é derivada da chave de sincronização, que só existe nos seus aparelhos.
  // Assim, quem enxergar o banco (painel do Neon, backup do provedor) vê só texto embaralhado.
  // A chave do documento entra como "dado associado": um conteúdo não pode ser trocado de lugar.
  const SALT = 'stepbystep-sync-v1';
  const te = new TextEncoder(), td = new TextDecoder();
  const subtle = () => root.crypto.subtle;
  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(secret) {
    const base = await subtle().importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt: te.encode(SALT), iterations: 210000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const isSealed = d => isObj(d) && d.$enc === 1 && typeof d.iv === 'string' && typeof d.ct === 'string';

  async function seal(cryptoKey, key, value) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(key) }, cryptoKey, te.encode(JSON.stringify(value)));
    return { $enc: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  }
  // Documentos antigos (de antes da cifragem) vêm abertos e passam direto.
  async function unseal(cryptoKey, key, data) {
    if (!isSealed(data)) return data;
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(data.iv), additionalData: te.encode(key) }, cryptoKey, fromB64(data.ct));
    return JSON.parse(td.decode(pt));
  }

  root.SyncCore = { stable, hash, explode, applyDoc, localChanges, applyRemote, validateDoc, deriveKey, isSealed, seal, unseal };
})(typeof window === 'undefined' ? globalThis : window);
