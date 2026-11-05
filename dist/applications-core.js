/* Regras puras de candidaturas. */
(function(root){
  'use strict';
  const statuses=['A preparar','Enviada','Em análise','Entrevista','Teste técnico','Proposta','Contratado','Encerrada'];
  const active=s=>!['Contratado','Encerrada'].includes(s);
  const normalize=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function safeURL(value){
    if(!value.trim())return '';
    let url;try{url=new URL(value.trim())}catch{throw Error('Informe um link completo, começando com https://.')}
    if(!['http:','https:'].includes(url.protocol))throw Error('Use um link HTTP ou HTTPS.');
    return url.href;
  }
  function validate(items){
    if(!Array.isArray(items)||items.length>100000)throw Error('Candidaturas inválidas no backup.');
    const ids=new Set();
    for(const v of items){
      if(!v||typeof v.id!=='string'||!/^[A-Za-z0-9_-]+$/.test(v.id)||ids.has(v.id))throw Error('Identificador de candidatura inválido.');
      ids.add(v.id);
      for(const k of ['company','role','url','appliedOn','followUp','notes','location','nextAction','createdAt','updatedAt'])if(typeof v[k]!=='string')throw Error('Campo de candidatura inválido: '+k);
      if(!v.company.trim()||!v.role.trim()||!statuses.includes(v.status))throw Error('Empresa, vaga ou status inválido.');
      safeURL(v.url);
      for(const k of ['appliedOn','followUp'])if(v[k]&&!/^\d{4}-\d{2}-\d{2}$/.test(v[k]))throw Error('Data da candidatura inválida.');
      if(!Array.isArray(v.history)||v.history.some(h=>!statuses.includes(h.status)||typeof h.at!=='string'))throw Error('Histórico da candidatura inválido.');
    }
    return items;
  }
  function merge(local,incoming){validate(local);validate(incoming);const ids=new Set(local.map(v=>v.id));return [...local,...incoming.filter(v=>!ids.has(v.id))]}
  root.ApplicationCore={statuses,active,normalize,safeURL,validate,merge};
})(typeof window==='undefined'?globalThis:window);
