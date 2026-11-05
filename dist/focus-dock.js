/* Timer/player persistentes: o DOM é montado uma vez, sem remontar o iframe ao navegar. */
(()=>{
  'use strict';
  const card=document.querySelector('.focus-card');
  const placeholder=document.createElement('div');
  placeholder.id='focusDockAnchor';
  card.before(placeholder);
  const dock=document.createElement('aside');
  dock.id='focusDock';
  dock.setAttribute('aria-label','Pomodoro e música');
  const bar=document.createElement('div');
  bar.className='focus-dock-bar';
  bar.innerHTML='<button type="button" id="focusDockHandle" aria-label="Mover janela de foco. Use as setas do teclado.">⠿ <span class="dock-caption">Foco</span><span id="focusDockMiniClock" aria-label="Tempo restante" role="timer">10:00</span></button><button type="button" id="focusDockToggle" aria-label="Minimizar Pomodoro" aria-expanded="true" aria-controls="focusDockContent">−</button><button type="button" id="focusDockHome" aria-label="Voltar ao painel diário">↗</button>';
  card.id='focusDockContent';
  dock.append(bar,card);
  document.body.append(dock);
  const bell=document.createElement('div');
  bell.className='focus-bell-controls';
  bell.innerHTML='<label><input type="checkbox" id="focusBellEnabled"> Sino ao terminar</label><button type="button" id="focusBellTest">Testar sino</button><span id="focusBellStatus" class="small" role="status"></span>';
  card.append(bell);
  db.focusPrefs??={bell:true};
  $('focusBellEnabled').checked=db.focusPrefs.bell!==false;
  let view='dashboard',position=null,drag=null,audio=null,minimized=db.focusPrefs.minimized!==false;
  function refreshCompact(){
    const compact=view!=='dashboard'&&minimized;
    dock.classList.toggle('minimized',compact);
    document.body.classList.toggle('focus-dock-minimized',compact);
    card.inert=compact;
    if(compact)card.setAttribute('aria-hidden','true');else card.removeAttribute('aria-hidden');
    $('focusDockMiniClock').textContent=$('clock').textContent;
    $('focusDockToggle').textContent=compact?'⤢':'−';
    $('focusDockToggle').setAttribute('aria-label',compact?'Expandir Pomodoro':'Minimizar Pomodoro');
    $('focusDockToggle').setAttribute('aria-expanded',String(!compact));
  }
  $('focusDockToggle').onclick=()=>{minimized=!minimized;db.focusPrefs.minimized=minimized;refreshCompact();persistPrefs();requestAnimationFrame(sync)};
  new MutationObserver(()=>$('focusDockMiniClock').textContent=$('clock').textContent).observe($('clock'),{childList:true,characterData:true,subtree:true});
  function persistPrefs(){try{localStorage.setItem(key,JSON.stringify(db))}catch{$('focusBellStatus').textContent='Não foi possível salvar a preferência.'}}
  function enableAudio(){
    try{
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context){$('focusBellStatus').textContent='Som indisponível neste navegador.';return null}
      audio??=new Context();
      if(audio.state==='suspended')audio.resume().catch(()=>$('focusBellStatus').textContent='Clique em Testar sino para liberar o áudio.');
      return audio;
    }catch{$('focusBellStatus').textContent='Não foi possível ativar o áudio.';return null}
  }
  // Harmônicos com decaimento exponencial produzem duas batidas suaves de sino.
  function ring(){
    if(!$('focusBellEnabled').checked)return false;
    const ctx=enableAudio();if(!ctx)return false;
    const play=()=>{
      const now=ctx.currentTime;
      for(const offset of [0,.7])for(const [frequency,gainValue] of [[880,.20],[1760,.08],[2376,.035]]){
        const oscillator=ctx.createOscillator(),gain=ctx.createGain();
        oscillator.type='sine';oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(.0001,now+offset);
        gain.gain.exponentialRampToValueAtTime(gainValue,now+offset+.012);
        gain.gain.exponentialRampToValueAtTime(.0001,now+offset+2.1);
        oscillator.connect(gain);gain.connect(ctx.destination);
        oscillator.start(now+offset);oscillator.stop(now+offset+2.2);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
      }
      $('focusBellStatus').textContent='Sino tocado.';
    };
    if(ctx.state==='running')play();else ctx.resume().then(play).catch(()=>$('focusBellStatus').textContent='Ative o áudio com Testar sino.');
    return true;
  }
  function clampPosition(x,y){
    const r=dock.getBoundingClientRect();
    return {x:Math.max(8,Math.min(window.innerWidth-r.width-8,x)),y:Math.max(8,Math.min(window.innerHeight-r.height-8,y))};
  }
  function sync(){
    if(view==='dashboard'){
      const r=placeholder.getBoundingClientRect();if(!r.width)return;
      dock.style.left=(r.left+window.scrollX)+'px';
      dock.style.top=(r.top+window.scrollY)+'px';
      dock.style.width=r.width+'px';dock.style.bottom='auto';dock.style.right='auto';
      const height=Math.ceil(card.getBoundingClientRect().height);
      if(placeholder.style.height!==height+'px')placeholder.style.height=height+'px';
    }else if(position){
      position=clampPosition(position.x,position.y);
      dock.style.left=position.x+'px';dock.style.top=position.y+'px';dock.style.right='auto';dock.style.bottom='auto';
    }
  }
  function setView(next){
    view=next;dock.classList.toggle('floating',view!=='dashboard');
    document.body.classList.toggle('has-floating-focus',view!=='dashboard');
    refreshCompact();
    $('focusMode').textContent=view==='dashboard'?'Expandir':'Voltar';
    if(view==='dashboard')sync();else{
      dock.style.width='';dock.style.left='';dock.style.top='';dock.style.right='';dock.style.bottom='';sync();
    }
  }
  $('focusDockHome').onclick=()=>document.querySelector('[data-study-view="dashboard"]').click();
  $('focusMode').addEventListener('click',e=>{
    if(view!=='dashboard'){
      e.stopImmediatePropagation();document.querySelector('[data-study-view="dashboard"]').click();
    }else requestAnimationFrame(sync);
  },true);
  $('focusBellTest').onclick=()=>{enableAudio();if($('focusBellEnabled').checked)ring();else $('focusBellStatus').textContent='Ative o sino para testar.'};
  $('focusBellEnabled').onchange=()=>{db.focusPrefs.bell=$('focusBellEnabled').checked;enableAudio();persistPrefs()};
  $('start').addEventListener('click',()=>{enableAudio();if(!running)$('focusBellStatus').textContent=''},true);
  const handle=$('focusDockHandle');
  handle.onpointerdown=e=>{
    if(view==='dashboard'||e.button!==0)return;
    const r=dock.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};
    handle.setPointerCapture(e.pointerId);e.preventDefault();
  };
  handle.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;position=clampPosition(e.clientX-drag.x,e.clientY-drag.y);sync()};
  handle.onpointerup=handle.onpointercancel=()=>{drag=null};
  handle.onkeydown=e=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();const r=dock.getBoundingClientRect(),step=e.shiftKey?40:15;
    position=clampPosition(r.left+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),r.top+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0));sync();
  };
  window.addEventListener('resize',sync);
  const observer=new ResizeObserver(()=>requestAnimationFrame(sync));observer.observe(card);observer.observe(placeholder.parentElement);
  window.FocusDock={setView,ring,refresh:()=>requestAnimationFrame(sync)};
  setView('dashboard');
})();
