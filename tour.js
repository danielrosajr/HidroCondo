/** Mobile-first, non-destructive spotlight tour. Never programmatically clicks action buttons. */
export function tourSteps(mode){
  const S=(selector,title,body,tab)=>({selector,title,body,tab});
  const steps={
    manager:[
      S('#summary-grid','Resumo das medições','Aqui aparecem o consumo calculado entre duas leituras, a média diária e a evolução.','dashboard'),
      S('#limit-alert','Referência de consumo','Configure o limite semanal e acompanhe se o consumo está dentro da margem definida. Não é um diagnóstico de vazamento.','dashboard'),
      S('[data-tab="history"]','Histórico e documentos','Consulte medições anteriores, fotos e exporte CSV ou PDF.'),
      S('[data-tab="import"]','Históricos antigos','Importe datas e números anteriores. Os pedidos enviados pelo zelador aparecem aqui para aprovação.'),
      S('[data-tab="settings"]','Ajustes do condomínio','Gerencie convites de síndico(a) e zelador(a), limites de consumo e suporte temporário.'),
      S('#people-heading','Pessoas e acessos','Gere links de convite para adicionar pessoas ao condomínio. Só o proprietário pode convidar outros síndicos.','settings'),
      S('#condo-people-list','Gerenciar acessos','Confira os participantes e remova acessos quando necessário. Remover não apaga leituras antigas.','settings'),
      S('#meter-limit-form','Limite de 7 dias','Defina a referência em m³ para cada hidrômetro, por exemplo 80. O aplicativo compara intervalos de diferentes durações proporcionalmente.','settings')
    ],
    worker:[
      S('[data-tab="new"]','Registrar uma medição','Esta é a tela principal do zelador: informe os números e salve.'),
      S('.photo-choices','Foto do hidrômetro','Tire uma foto ou escolha da galeria. Confira se os dígitos estão legíveis.','new'),
      S('#whole-reading','Número inteiro','Digite a parte inteira da leitura acumulada em m³. Não use a vazão instantânea em m³/h.','new'),
      S('#save-reading','Salvar','Confira data, valor e foto antes de salvar. Você não precisa mexer nos gráficos.','new'),
      S('[data-tab="import"]','Históricos para aprovação','Preencha as leituras antigas, com fotos opcionais, e envie para o(a) síndico(a).'),
      S('#switch-condo','Trocar condomínio','Se você trabalha em mais de um local, troque por aqui sem sair da conta.')
    ],
    support:[
      S('#demos-button','Demonstrações','Crie um espaço com dados fictícios para visitantes experimentarem sem cadastro.'),
      S('#switch-condo','Acessos de suporte','Troque entre condomínios para os quais você recebeu autorização. Isso não concede acesso universal.')
    ],
    'support-onboard':[
      S('#demo-onboard-entry','Área de demonstrações','Entre aqui para gerar links sem cadastro para síndico(a) e zelador(a).'),
      S('#create-condo-form','Novo condomínio','Você pode criar um condomínio real apenas quando isso fizer parte do atendimento. Demonstrações ficam separadas.')
    ],
    'demo-admin':[
      S('#demo-admin-form','Criar demonstração','Escolha nome fictício, validade e número de visitantes por papel.'),
      S('#demo-admin-list','Links sempre disponíveis','Toque em “Ver links” para recuperar convites novos. Demonstrações antigas podem precisar de links regenerados.'),
      S('#demo-admin-new-links','Compartilhar','Envie um link de síndico(a) e outro de zelador(a). São convites de teste, nunca de acesso a dados reais.')
    ],
    'demo-manager':[
      S('.demo-banner','Ambiente fictício','Tudo aqui é teste. Não use dados verdadeiros e não conte com a permanência destas informações.'),
      S('[data-demo-tab="overview"]','Painel do(a) síndico(a)','Veja o gráfico e a evolução de 12 semanas de exemplo.'),
      S('#demo-limit-form','Limite semanal','Altere a referência de m³ por 7 dias para ver como os alertas funcionam.','overview'),
      S('[data-demo-tab="past"]','Históricos de demonstração','Aqui você aprova ou rejeita os históricos enviados pelo zelador de teste.'),
      S('[data-demo-tab="history"]','Histórico','Consulte números fictícios e exporte um relatório de demonstração.')
    ],
    'demo-worker':[
      S('.demo-banner','Este ambiente é fictício','As leituras são testes e as fotos não são salvas. Você pode perder acesso quando o período terminar.'),
      S('[data-demo-tab="new"]','Registrar teste','Digite uma leitura fictícia em data nova. Não use os números reais do seu condomínio.'),
      S('#demo-gallery','Escolher foto','Esta foto é uma prévia local: não será enviada ao servidor.','new'),
      S('#demo-whole','Informar o número','Digite a parte inteira e os decimais do visor fictício.','new'),
      S('[data-demo-tab="past"]','Solicitar histórico','O histórico fictício é enviado para aprovação pelo(a) síndico(a) da demonstração.')
    ]
  };
  return steps[mode]||[];
}
export function createGuidedTour({onTab,afterEnd}={}){
  let steps=[],index=0,active=false,focus=null,shade=null,panel=null,scrim=null,raf=0;
  function targetFor(step){return document.querySelector(step.selector);}
  function render(){
    if(!active)return;
    const step=steps[index];if(!step)return stop();
    onTab?.(step.tab);
    const target=targetFor(step);
    if(!target||target.hidden||!target.getClientRects().length){next();return;}
    focus=target;
    target.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'});
    const rect=target.getBoundingClientRect();const p=8;
    Object.assign(shade.style,{top:`${Math.max(2,rect.top-p)}px`,left:`${Math.max(2,rect.left-p)}px`,
      width:`${Math.min(innerWidth-4,rect.width+p*2)}px`,height:`${Math.min(innerHeight-4,rect.height+p*2)}px`});
    panel.querySelector('.tour-counter').textContent=`Passo ${index+1} de ${steps.length}`;
    panel.querySelector('h2').textContent=step.title;
    panel.querySelector('p').textContent=step.body;
    panel.querySelector('[data-tour-back]').disabled=index===0;
    panel.querySelector('[data-tour-next]').textContent=index===steps.length-1?'Concluir':'Próximo →';
    panel.style.bottom='auto';panel.style.top='auto';
    const panelH=Math.max(panel.offsetHeight,190);
    // Prefer above/below without covering the focus. Small screens fall back to bottom.
    if(innerWidth<640){panel.style.bottom='max(14px, env(safe-area-inset-bottom))';}
    else if(rect.bottom+panelH+22<innerHeight){panel.style.top=`${rect.bottom+16}px`;}
    else if(rect.top-panelH-22>0){panel.style.top=`${rect.top-panelH-16}px`;}
    else panel.style.bottom='18px';
    panel.querySelector('[data-tour-next]').focus({preventScroll:true});
  }
  function move(){if(!active)return;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!active||!focus)return;const r=focus.getBoundingClientRect(),p=8;Object.assign(shade.style,{top:`${r.top-p}px`,left:`${r.left-p}px`,width:`${r.width+2*p}px`,height:`${r.height+2*p}px`});});}
  function key(e){if(e.key==='Escape'){e.preventDefault();stop();}else if(e.key==='ArrowRight'){e.preventDefault();next();}else if(e.key==='ArrowLeft'){e.preventDefault();prev();}}
  function stop(){if(!active)return;active=false;shade.remove();panel.remove();scrim.remove();window.removeEventListener('scroll',move,true);window.removeEventListener('resize',move);document.removeEventListener('keydown',key);afterEnd?.();}
  function next(){index++;if(index>=steps.length)stop();else render();}
  function prev(){index=Math.max(0,index-1);render();}
  function start(mode){if(active)stop();steps=tourSteps(mode).filter(s=>targetFor(s));if(!steps.length)return false;
    index=0;active=true;
    scrim=document.createElement('div');scrim.className='tour-scrim';scrim.setAttribute('aria-hidden','true');
    shade=document.createElement('div');shade.className='tour-focus';shade.setAttribute('aria-hidden','true');
    panel=document.createElement('section');panel.className='tour-guide';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Tour guiado do HidroCondo');panel.setAttribute('aria-modal','true');
    panel.innerHTML='<span class="tour-counter"></span><h2></h2><p></p><div class="tour-actions"><button type="button" data-tour-exit class="btn btn-ghost btn-small">Pular tour</button><button type="button" data-tour-back class="btn btn-secondary btn-small">← Voltar</button><button type="button" data-tour-next class="btn btn-primary btn-small">Próximo →</button></div>';
    panel.querySelector('[data-tour-exit]').addEventListener('click',stop);
    panel.querySelector('[data-tour-back]').addEventListener('click',prev);
    panel.querySelector('[data-tour-next]').addEventListener('click',next);
    document.body.append(scrim,shade,panel);window.addEventListener('scroll',move,true);window.addEventListener('resize',move);document.addEventListener('keydown',key);
    render();return true;
  }
  return {start,stop,isActive:()=>active};
}
