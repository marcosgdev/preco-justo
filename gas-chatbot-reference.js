// =============================================================
// GAS PRINCIPAL — Preço Justo TJPA
// Inclui: preços, catálogo, fornecedores + Assistente GPT-4o
// =============================================================

const ACOMP = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra';

// URL do seu deploy de fornecedores (mesmo valor de BACKEND_SUPPLIERS_URL no script.js)
const SUPPLIERS_URL = 'COLE_AQUI_URL_DO_DEPLOY_FORNECEDORES';

function doGet(e)  { return doPost(e); }

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const type   = (params.type   || '').toLowerCase().trim();
    const code   = (params.code   || '').trim();
    const action = (params.action || 'precos').toLowerCase().trim();

    if (action === 'catalogo')  return buscarCatalogo(params.q || '');
    if (action === 'chat')      return chatAssistente(params.messages || '[]');
    if (action === 'analise')   return getAnaliseEstatistica(type, code);
    if (!type || !code) return jsonResponse({ success: false, message: 'Informe um código e tipo válidos.' });
    if (action === 'fornecedores') return getFornecedores(type, code);
    return getPrecos(type, code);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Erro interno: ' + err.message });
  }
}

/* ── HELPERS ESTATÍSTICOS ── */
function safeNumber(v) { var n = parseFloat(String(v || '').replace(',','.')); return isNaN(n) ? null : n; }
function percentile(arr, p) { if (!arr.length) return 0; var idx=(p/100)*(arr.length-1),lo=Math.floor(idx),hi=Math.ceil(idx); return arr[lo]+(arr[hi]-arr[lo])*(idx-lo); }
function mean(arr) { return arr.length ? arr.reduce(function(s,v){return s+v;},0)/arr.length : 0; }
function std(arr, m) { if(arr.length<2)return 0; var avg=m!==undefined?m:mean(arr); return Math.sqrt(arr.reduce(function(s,v){return s+Math.pow(v-avg,2);},0)/arr.length); }

function buildPrecos(lista) {
  return lista.map(function(r) {
    var idCompra = r.idCompra || r.idcompra || '';
    var numItem  = r.numeroItemCompra || '';
    return {
      idCompra: idCompra, numeroItem: numItem,
      descricaoItem:  r.descricaoItem || r.descricaoltem || r.descricao || '',
      precoUnitario:  safeNumber(r.precoUnitario),
      quantidade:     safeNumber(r.quantidade),
      dataCompra:     r.dataCompra || r.dataCompraItem || '',
      nomeFornecedor: r.nomeFornecedor || r.fornecedor || '',
      codigoUasg:     r.codigoUasg || r.uasg || '',
      nomeUasg:       r.nomeUasg || r.nomeUASG || r.nomeUasgCompradora || '',
      estado:         r.estado || r.uf || '',
      unidade:        r.unidadeMedida || r.unidadeFornecimento || r.unidade || '',
      linkCompra: idCompra ? (numItem
        ? ACOMP + '/item/' + encodeURIComponent(numItem) + '?compra=' + encodeURIComponent(idCompra)
        : ACOMP + '?compra=' + encodeURIComponent(idCompra)) : ''
    };
  });
}

function processarPrecos(base) {
  if (!base.length) return { precos:[], stats:null, curves:null, curveStats:null, recommended:null, summary:'Sem resultados.' };
  var validos = base.map(function(i){return i.precoUnitario;}).filter(function(v){return v!==null&&v>0;}).sort(function(a,b){return a-b;});
  if (!validos.length) return { precos:base, stats:null, curves:null, curveStats:null, recommended:null, summary:'Sem preços válidos.' };

  var q1=percentile(validos,25), q3=percentile(validos,75), iqr=q3-q1;
  var limpos=validos.filter(function(v){return v>=q1-1.5*iqr&&v<=q3+1.5*iqr;});
  var fonte=limpos.length?limpos:validos;
  var mediaMed=mean(fonte), mediana=percentile(fonte,50), desvio=std(fonte,mediaMed);
  var cvGlobal=mediaMed>0?(desvio/mediaMed)*100:null;
  var t1=percentile(fonte,33), t2=percentile(fonte,66);

  function classifyCurva(p) { if(p===null)return 'N/D'; if(p<=t1)return 'A'; if(p<=t2)return 'B'; return 'C'; }
  var precos = base.map(function(item){ return Object.assign({}, item, {curva: classifyCurva(item.precoUnitario)}); });

  var curveStats = {};
  ['A','B','C'].forEach(function(c) {
    var vals = precos.filter(function(p){return p.curva===c&&p.precoUnitario!==null;}).map(function(p){return p.precoUnitario;});
    if (!vals.length) return;
    var m=mean(vals), s=std(vals,m);
    curveStats[c] = { n:vals.length, mean:m, median:percentile(vals.slice().sort(function(a,b){return a-b;}),50), std:s, cv:m>0?(s/m)*100:null };
  });

  var counts={A:0,B:0,C:0};
  precos.forEach(function(p){ if(counts[p.curva]!==undefined)counts[p.curva]++; });

  var recommended=null;
  var curvasList=['A','B','C'];
  for (var i=0;i<curvasList.length;i++) {
    var c=curvasList[i], cs=curveStats[c];
    if (cs&&cs.n>=3&&cs.cv!==null&&cs.cv<=25) {
      recommended={curve:c,stats:cs,reason:'CV '+cs.cv.toFixed(1)+'%, n='+cs.n,confidence:'alta'}; break;
    }
  }
  if (!recommended) {
    for (var i=0;i<curvasList.length;i++) {
      var c=curvasList[i], cs=curveStats[c];
      if (cs&&cs.n>=3&&cs.cv!==null&&cs.cv<=50) {
        recommended={curve:c,stats:cs,reason:'CV '+cs.cv.toFixed(1)+'%, n='+cs.n,confidence:'media'}; break;
      }
    }
  }
  if (!recommended) {
    var bestCv=Infinity, bestCurva=null;
    curvasList.forEach(function(c){
      var cs=curveStats[c];
      if (cs&&cs.n>=1&&cs.cv!==null&&cs.cv<bestCv){bestCv=cs.cv;bestCurva=c;}
    });
    if (bestCurva) recommended={curve:bestCurva,stats:curveStats[bestCurva],reason:'CV '+bestCv.toFixed(1)+'%, n='+curveStats[bestCurva].n,confidence:'baixa'};
  }

  var summary = precos.length+' registro(s). Média: R$ '
    +mediaMed.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
    +'. CV: '+(cvGlobal!==null?cvGlobal.toFixed(1)+'%':'N/D')+'.';

  return {
    precos: precos,
    stats: {mean:mediaMed,median:mediana,std:desvio,n:precos.length,outliersCount:validos.length-limpos.length},
    curves: {counts:counts,t1:t1,t2:t2},
    curveStats: curveStats,
    recommended: recommended,
    summary: summary
  };
}

/* ── CATÁLOGO ── */
function buscarCatalogo(q) {
  q = (q || '').trim();
  if (q.length < 2) return jsonResponse({ success:false, message:'Digite pelo menos 2 caracteres.' });
  var raw;
  try { raw = UrlFetchApp.fetch('https://cnbs.estaleiro.serpro.gov.br/cnbs-api/item/v1/hint?palavra='+encodeURIComponent(q),{muteHttpExceptions:true}).getContentText('UTF-8'); }
  catch(err) { return jsonResponse({ success:false, message:'Erro ao consultar catálogo: '+err.message }); }
  var json;
  try { json = JSON.parse(raw); } catch(_) { return jsonResponse({ success:false, message:'Resposta inválida do catálogo.' }); }
  var arr = Array.isArray(json)?json:(json.items||json.resultado||json.data||[]);
  var items = arr.map(function(item){ return {codigo:String(item.codigo||''),descricao:item.nome||item.descricao||'',unidade:''}; }).filter(function(i){return i.codigo&&i.descricao;});
  if (!items.length) return jsonResponse({ success:false, message:'Nenhum item encontrado para "'+q+'".' });
  try {
    UrlFetchApp.fetchAll(items.map(function(item){
      return {url:'https://cnbs.estaleiro.serpro.gov.br/cnbs-api/material/v1/unidadeFornecimentoPorCodigoPdm?codigo_pdm='+item.codigo,muteHttpExceptions:true};
    })).forEach(function(resp,i){
      try {
        var data=JSON.parse(resp.getContentText('UTF-8'));
        if (Array.isArray(data)&&data.length>0){var u=data[0];items[i].unidade=u.siglaUnidadeFornecimento+(u.capacidadeUnidadeMedida?' '+u.capacidadeUnidadeMedida+' '+u.siglaUnidadeMedida:'');}
      } catch(_){}
    });
  } catch(_){}
  return jsonResponse({ success:true, items:items });
}

/* ── RESOLVE PDM[] → { pdm: [catmat,...] } ── */
function resolverCatmatMap(pdmCodesArray) {
  var result = {};
  pdmCodesArray.forEach(function(pdm){ result[pdm]=[]; });
  try {
    UrlFetchApp.fetchAll(pdmCodesArray.map(function(pdm){
      return {url:'https://cnbs.estaleiro.serpro.gov.br/cnbs-api/material/v1/materialCaracteristcaValorporPDM?codigo_pdm='+encodeURIComponent(pdm),muteHttpExceptions:true};
    })).forEach(function(resp,i){
      var pdm=pdmCodesArray[i];
      try {
        var data=JSON.parse(resp.getContentText('UTF-8'));
        if (Array.isArray(data)&&data.length) {
          result[pdm]=data.filter(function(item){return item.statusItem&&!item.itemSuspenso&&item.codigoItem;}).map(function(item){return item.codigoItem;});
        }
      } catch(e){}
      if (!result[pdm].length) result[pdm]=[pdm];
    });
  } catch(e) { pdmCodesArray.forEach(function(pdm){if(!result[pdm].length)result[pdm]=[pdm];}); }
  return result;
}

/* ── PREÇOS ── */
function getPrecos(type, code) {
  var pdmCodes = code.split(',').map(function(c){return c.trim();}).filter(Boolean);
  var pdmMap   = resolverCatmatMap(pdmCodes);

  var allRequests=[], requestPdm=[];
  pdmCodes.forEach(function(pdm){
    (pdmMap[pdm]||[pdm]).slice(0,20).forEach(function(catmat){
      allRequests.push({
        url:'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial?pagina=1&tamanhoPagina=200&codigoItemCatalogo='+encodeURIComponent(catmat)+'&dataResultado=true',
        muteHttpExceptions:true
      });
      requestPdm.push(pdm);
    });
  });

  if (!allRequests.length) return jsonResponse({ success:false, message:'Nenhum item CATMAT encontrado.' });

  var byPdm={};
  pdmCodes.forEach(function(pdm){byPdm[pdm]=[];});
  try {
    UrlFetchApp.fetchAll(allRequests).forEach(function(resp,i){
      try {
        var json=JSON.parse(resp.getContentText('UTF-8'));
        var items=(json.resultado&&Array.isArray(json.resultado))?json.resultado:(Array.isArray(json)?json:[]);
        byPdm[requestPdm[i]]=byPdm[requestPdm[i]].concat(items);
      } catch(e){}
    });
  } catch(err){ return jsonResponse({ success:false, message:'Erro ao consultar preços: '+err.message }); }

  var grupos=[], todosPrecos=[];
  pdmCodes.forEach(function(pdm){
    var res = processarPrecos(buildPrecos(byPdm[pdm]||[]));
    grupos.push(Object.assign({pdm:pdm}, res));
    todosPrecos = todosPrecos.concat(res.precos||[]);
  });

  if (!todosPrecos.length) return jsonResponse({ success:false, message:'Sem resultados para o código informado.' });

  var globalRes = processarPrecos(todosPrecos);
  return jsonResponse({
    success:true, message:'Resultados encontrados.',
    grupos:grupos, precos:globalRes.precos,
    stats:globalRes.stats, curves:globalRes.curves,
    curveStats:globalRes.curveStats, recommended:globalRes.recommended,
    summary:grupos.length===1?(grupos[0].summary||''):todosPrecos.length+' registro(s) no total.'
  });
}

/* ── FORNECEDORES ── */
function getFornecedores(type, code) {
  var pdmCodes  = code.split(',').map(function(c){return c.trim();}).filter(Boolean);
  var pdmMap    = resolverCatmatMap(pdmCodes);
  var allRequests=[];
  pdmCodes.forEach(function(pdm){
    (pdmMap[pdm]||[pdm]).slice(0,20).forEach(function(catmat){
      allRequests.push({url:'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial?pagina=1&tamanhoPagina=200&codigoItemCatalogo='+encodeURIComponent(catmat)+'&dataResultado=true',muteHttpExceptions:true});
    });
  });
  var lista=[];
  try {
    UrlFetchApp.fetchAll(allRequests).forEach(function(resp){
      try{var json=JSON.parse(resp.getContentText('UTF-8'));var items=(json.resultado&&Array.isArray(json.resultado))?json.resultado:(Array.isArray(json)?json:[]);lista=lista.concat(items);}catch(e){}
    });
  } catch(err){ return jsonResponse({ success:false, message:'Erro ao consultar API: '+err.message }); }
  if (!lista.length) return jsonResponse({ success:false, message:'Sem fornecedores para o código informado.' });

  var mapa={};
  lista.forEach(function(r){
    var cnpj=r.niFornecedor||'',nome=r.nomeFornecedor||r.fornecedor||'',preco=safeNumber(r.precoUnitario),uf=r.estado||r.uf||'',key=cnpj||nome;
    if(!key)return;
    if(!mapa[key])mapa[key]={cnpj,nome,precos:[],ufs:new Set()};
    if(preco!==null)mapa[key].precos.push(preco);
    if(uf)mapa[key].ufs.add(uf);
  });
  var fornecedores=Object.values(mapa).map(function(f){
    var n=f.precos.length,media=n?f.precos.reduce(function(a,b){return a+b;},0)/n:null;
    var desv=n>1?Math.sqrt(f.precos.reduce(function(s,p){return s+Math.pow(p-media,2);},0)/n):0;
    var cv=media?desv/media:0,ufs=f.ufs.size;
    return {cnpj:f.cnpj,nome:f.nome,amostras:n,media,desvio:desv,cv,ufs,score:0.5*Math.min(n,10)/10+0.3*(1-Math.min(cv,0.5)/0.5)+0.2*Math.min(ufs,5)/5};
  }).sort(function(a,b){return b.score-a.score;});
  return jsonResponse({ success:true, message:'Fornecedores encontrados.', fornecedores });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// =============================================================
// ANÁLISE ESTATÍSTICA COMPLETA — IN 65/2021
// =============================================================

/* ── Algoritmo iterativo de saneamento por Z-Score ── */
function saneamentoEstatistico(precos) {
  var validos     = precos.filter(function(p) { return p.precoUnitario !== null && p.precoUnitario > 0; });
  var descartados = [];
  var MAX_ITER    = 150;

  for (var iter = 0; iter < MAX_ITER; iter++) {
    if (validos.length < 3) break;

    var valores = validos.map(function(p) { return p.precoUnitario; });
    var mu      = mean(valores);
    var sigma   = std(valores, mu);
    var cv      = mu > 0 ? (sigma / mu) * 100 : 0;

    if (cv <= 25) break;

    // Identifica o outlier de maior Z-score absoluto
    var maxZ = -1, maxIdx = -1;
    for (var i = 0; i < validos.length; i++) {
      var z = sigma > 0 ? Math.abs((validos[i].precoUnitario - mu) / sigma) : 0;
      if (z > maxZ) { maxZ = z; maxIdx = i; }
    }
    if (maxIdx < 0) break;

    var removed              = validos.splice(maxIdx, 1)[0];
    removed._z_score         = Math.round(maxZ * 100) / 100;
    removed._iteracao        = iter + 1;
    removed._cv_antes        = Math.round(cv * 10) / 10;
    removed._media_antes     = Math.round(mu * 10000) / 10000;
    removed._motivo_descarte = removed.precoUnitario > mu
      ? 'Outlier superior (Z-Score ' + removed._z_score + ')'
      : 'Outlier inferior (Z-Score ' + removed._z_score + ')';
    descartados.push(removed);
  }

  return { validos: validos, descartados: descartados };
}

/* ── Endpoint principal de análise estatística ── */
function getAnaliseEstatistica(type, code) {
  var pdmCodes    = code.split(',').map(function(c) { return c.trim(); }).filter(Boolean);
  var pdmMap      = resolverCatmatMap(pdmCodes);
  var allRequests = [], requestPdm = [];

  pdmCodes.forEach(function(pdm) {
    (pdmMap[pdm] || [pdm]).slice(0, 20).forEach(function(catmat) {
      allRequests.push({
        url: 'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial?pagina=1&tamanhoPagina=500&codigoItemCatalogo=' + encodeURIComponent(catmat) + '&dataResultado=true',
        muteHttpExceptions: true
      });
      requestPdm.push(pdm);
    });
  });

  if (!allRequests.length) return jsonResponse({ success: false, message: 'Nenhum item CATMAT encontrado.' });

  var lista = [];
  try {
    UrlFetchApp.fetchAll(allRequests).forEach(function(resp) {
      try {
        var json  = JSON.parse(resp.getContentText('UTF-8'));
        var items = (json.resultado && Array.isArray(json.resultado)) ? json.resultado : (Array.isArray(json) ? json : []);
        lista = lista.concat(items);
      } catch(e) {}
    });
  } catch(err) {
    return jsonResponse({ success: false, message: 'Erro ao consultar preços: ' + err.message });
  }

  if (!lista.length) return jsonResponse({ success: false, message: 'Sem resultados para o código informado.' });

  var precosBase       = buildPrecos(lista);
  var total_encontrado = precosBase.length;
  var resultado        = saneamentoEstatistico(precosBase);

  var valoresFinais = resultado.validos.map(function(p) { return p.precoUnitario; });
  var mu            = mean(valoresFinais);
  var sigma         = std(valoresFinais, mu);
  var cv            = mu > 0 ? (sigma / mu) * 100 : 0;
  var mediana       = valoresFinais.length ? percentile(valoresFinais.slice().sort(function(a,b){return a-b;}), 50) : 0;

  // Descrição do item a partir dos registros
  var descricao = (lista[0] && (lista[0].descricaoItem || lista[0].descricaoltem || lista[0].descricao)) || ('PDM ' + code);

  // Mapa de distribuição para histograma
  var histData = _buildHistogram(valoresFinais, 10);

  return jsonResponse({
    success:                   true,
    item_pesquisado:           descricao,
    preco_referencia_estimado: Math.round(mediana * 10000) / 10000,
    metricas_consolidadas: {
      total_encontrado:          total_encontrado,
      total_descartado:          resultado.descartados.length,
      amostra_valida_N:          resultado.validos.length,
      coeficiente_variacao_final: Math.round(cv * 10) / 10,
      media:                     Math.round(mu * 10000) / 10000,
      mediana:                   Math.round(mediana * 10000) / 10000,
      desvio_padrao:             Math.round(sigma * 10000) / 10000
    },
    justificativa_algoritmo:
      'O sistema aplicou o método iterativo de Z-Score para remover ' + resultado.descartados.length +
      ' registro(s) e atingir um Coeficiente de Variação (CV) de ' + Math.round(cv * 10) / 10 +
      '% (limite legal: 25%, conforme IN 65/2021 e boas práticas de compras públicas). ' +
      'O preço de referência de R$ ' + mediana.toFixed(4) + ' representa a mediana da amostra saneada.',
    histograma:        histData,
    compras_validas:   resultado.validos,
    compras_descartadas: resultado.descartados
  });
}

function _buildHistogram(valores, numBins) {
  if (!valores.length) return [];
  var sorted = valores.slice().sort(function(a, b) { return a - b; });
  var min = sorted[0], max = sorted[sorted.length - 1];
  if (min === max) return [{ min: min, max: max, count: valores.length, label: 'R$ ' + min.toFixed(2) }];

  var binSize = (max - min) / numBins;
  var bins    = [];
  for (var i = 0; i < numBins; i++) {
    var lo = min + i * binSize;
    var hi = lo + binSize;
    bins.push({ min: lo, max: hi, count: 0, label: 'R$ ' + lo.toFixed(2) + ' – R$ ' + hi.toFixed(2) });
  }
  valores.forEach(function(v) {
    var idx = Math.min(Math.floor((v - min) / binSize), numBins - 1);
    bins[idx].count++;
  });
  return bins;
}


// =============================================================
// ASSISTENTE DE COTAÇÃO — GPT-4o com tool use
// Configuração: adicione OPENAI_API_KEY nas Propriedades do script
// =============================================================

var CHAT_SYSTEM_PROMPT = [
  'Você é o Assistente de Cotação da Divisão de Compras do TJPA (Tribunal de Justiça do Estado do Pará).',
  'Ajuda servidores públicos a pesquisar preços de referência para compras públicas via ComprasGov/CATMAT.',
  'Os usuários têm pouca familiaridade com sistemas — seja guiado e didático.',
  '',
  'FERRAMENTAS:',
  '- buscar_catmat: localiza itens no catálogo pelo nome. USE SEMPRE antes de consultar preços.',
  '- detalhar_item: busca TODAS as características de um PDM específico. Use quando o usuário',
  '  pedir mais detalhes, quando houver muitas variações do item, ou para confirmar a escolha certa.',
  '- consultar_precos: retorna preços de referência por código CATMAT (PDM).',
  '- buscar_fornecedores: lista fornecedores com histórico de contratos.',
  '',
  'FLUXO:',
  '1. Entenda a necessidade do usuário.',
  '2. Use buscar_catmat e apresente as opções encontradas (máx. 5), destacando as diferenças.',
  '3. Confirme com o usuário qual item usar.',
  '4. Use consultar_precos e apresente o resumo de forma clara.',
  '5. Ofereça próximo passo: fornecedores, exportar XLSX, análise completa.',
  '',
  'GLOSSÁRIO (explique se perguntado):',
  '- Curva A = faixa de preços mais baixos e frequentes (mais confiável)',
  '- Curva B = faixa intermediária',
  '- Curva C = faixa mais cara',
  '- CV = coeficiente de variação; acima de 25% o preço é instável — pesquise mais',
  '- Outlier = preço anômalo removido da análise',
  '- PDM = código do grupo de material no catálogo CATMAT',
  '- UASG = unidade compradora do governo federal',
  '',
  'FORMATAÇÃO: use **negrito** para valores, listas com - para opções múltiplas,',
  'emojis com moderação (📊 dados, ⚠️ alertas, ✅ ok, 💰 preços).',
  'Seja objetivo. Responda em português formal e acessível.'
].join('\n');

var CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_catmat',
      description: 'Busca itens no catálogo CATMAT pelo nome ou descrição. Retorna lista com código PDM, descrição, unidade e características de cada item.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca (ex: "dipirona 500mg", "papel A4", "caneta esferográfica")' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detalhar_item',
      description: 'Busca descrição completa e TODAS as características de todos os itens CATMAT de um PDM específico. Use para dar ao usuário informações detalhadas antes de confirmar a escolha, ou quando o usuário pedir mais detalhes sobre um item.',
      parameters: {
        type: 'object',
        properties: {
          codigo_pdm: { type: 'string', description: 'Código PDM retornado pelo buscar_catmat (ex: "17708")' }
        },
        required: ['codigo_pdm']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_precos',
      description: 'Consulta preços de referência do ComprasGov para um código PDM/CATMAT. Retorna mediana, CV, curva recomendada e amostras recentes.',
      parameters: {
        type: 'object',
        properties: {
          codigo_pdm: { type: 'string', description: 'Código PDM retornado pela busca_catmat (ex: "17708"). Para múltiplos, separe por vírgula.' }
        },
        required: ['codigo_pdm']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_fornecedores',
      description: 'Lista fornecedores potenciais com histórico de contratos para um código PDM. Retorna nome, preço médio, número de contratos e estados.',
      parameters: {
        type: 'object',
        properties: {
          codigo_pdm: { type: 'string', description: 'Código PDM (ex: "17708")' }
        },
        required: ['codigo_pdm']
      }
    }
  }
];

/* ── Função principal do chat ── */
function chatAssistente(messagesJson) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'Propriedade OPENAI_API_KEY não configurada no projeto GAS.' });

  var clientMsgs;
  try { clientMsgs = JSON.parse(messagesJson); } catch(_) { clientMsgs = []; }
  if (!Array.isArray(clientMsgs) || !clientMsgs.length) {
    return jsonResponse({ ok: false, error: 'Nenhuma mensagem recebida.' });
  }

  var messages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }].concat(clientMsgs);
  var pdmCodesFound  = [];
  var capturedPriceData = null; // dados completos para renderização no frontend

  for (var round = 0; round < 7; round++) {
    var resp   = _chatOpenAI(apiKey, messages);
    var choice = resp.choices && resp.choices[0];
    if (!choice) return jsonResponse({ ok: false, error: 'Resposta inesperada da OpenAI.' });

    var msg = choice.message;

    // Resposta final de texto
    if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') {
      return jsonResponse({ ok: true, message: msg.content || '', catmat_codes: pdmCodesFound, priceData: capturedPriceData });
    }

    // Modelo quer executar ferramentas
    if (choice.finish_reason === 'tool_calls' && Array.isArray(msg.tool_calls)) {
      messages.push(msg);

      for (var t = 0; t < msg.tool_calls.length; t++) {
        var call = msg.tool_calls[t];
        var args;
        try { args = JSON.parse(call.function.arguments); } catch(_) { args = {}; }

        var toolResult;
        try {
          if (call.function.name === 'buscar_catmat') {
            toolResult = _chatToolCatalog(args.query || '');
          } else if (call.function.name === 'detalhar_item') {
            toolResult = _chatToolDetalhar(args.codigo_pdm || '');
          } else if (call.function.name === 'consultar_precos') {
            var precosResult = _chatToolPrecos(args.codigo_pdm || '');
            toolResult = precosResult.resumo;           // resumo compacto → GPT
            capturedPriceData = precosResult.fullData;  // dados completos → frontend
            (args.codigo_pdm || '').split(',').forEach(function(c) {
              var t = c.trim(); if (t && pdmCodesFound.indexOf(t) === -1) pdmCodesFound.push(t);
            });
          } else if (call.function.name === 'buscar_fornecedores') {
            toolResult = _chatToolFornecedores(args.codigo_pdm || '');
          } else {
            toolResult = { erro: 'Ferramenta desconhecida: ' + call.function.name };
          }
        } catch (e) {
          toolResult = { erro: e.message || String(e) };
        }

        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
      }
      continue;
    }

    break; // finish_reason inesperado
  }

  return jsonResponse({ ok: false, error: 'Assistente não conseguiu completar a solicitação.' });
}

/* ── Chamada à API OpenAI ── */
function _chatOpenAI(apiKey, messages) {
  var resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method:             'post',
    contentType:        'application/json',
    headers:            { Authorization: 'Bearer ' + apiKey },
    payload:            JSON.stringify({
      model:       'gpt-4o',
      messages:    messages,
      tools:       CHAT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens:  1024
    }),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code !== 200) throw new Error('OpenAI HTTP ' + code + ': ' + text.slice(0, 300));
  return JSON.parse(text);
}

/* ── Tool: buscar no catálogo + enriquecer com características ── */
function _chatToolCatalog(query) {
  // 1) Busca PDMs pelo nome (hint API)
  var catResult = JSON.parse(buscarCatalogo(query).getContent());
  if (!catResult.success || !catResult.items || !catResult.items.length) {
    return { itens: [], mensagem: catResult.message || 'Nenhum item encontrado.' };
  }

  var pdmItems = catResult.items.slice(0, 6); // até 6 PDMs

  // 2) Para cada PDM, busca os itens CATMAT com características
  var enriched = [];
  try {
    var respostas = UrlFetchApp.fetchAll(pdmItems.map(function(item) {
      return {
        url: 'https://cnbs.estaleiro.serpro.gov.br/cnbs-api/material/v1/materialCaracteristcaValorporPDM?codigo_pdm=' + encodeURIComponent(item.codigo),
        muteHttpExceptions: true
      };
    }));

    respostas.forEach(function(resp, i) {
      var pdm = pdmItems[i];
      var catmatItens = [];
      try {
        var data = JSON.parse(resp.getContentText('UTF-8'));
        if (Array.isArray(data)) {
          catmatItens = data
            .filter(function(d) { return d.statusItem && !d.itemSuspenso && d.codigoItem; })
            .slice(0, 8)
            .map(function(d) {
              // Extrai características dinamicamente (qualquer tipo de material)
              var chars = [];
              if (Array.isArray(d.caracteristicas)) {
                d.caracteristicas.forEach(function(c) {
                  var nome  = c.nomeCaracteristica  || c.nome  || c.name  || c.chave || '';
                  var valor = c.valorCaracteristica || c.valor || c.value || '';
                  if (nome && valor) chars.push(nome + ': ' + valor);
                });
              }
              // Fallback: campos diretos
              if (!chars.length) {
                var campos = [
                  ['Composição', d.composicao || d.composição || ''],
                  ['Concentração', d.concentracao || d.concentração || ''],
                  ['Forma Farmacêutica', d.formaFarmaceutica || d.forma_farmaceutica || ''],
                  ['Adicional', d.adicional || ''],
                  ['Gramatura', d.gramatura || ''],
                  ['Cor', d.cor || ''],
                  ['Formato', d.formato || ''],
                  ['Material', d.material || ''],
                  ['NCM', d.ncm || d.codigoNcm || '']
                ];
                campos.forEach(function(p) { if (p[1]) chars.push(p[0] + ': ' + p[1]); });
              }
              return {
                codigo_catmat: String(d.codigoItem),
                codigo_pdm:    String(pdm.codigo),
                descricao:     d.nomeItem || d.descricao || pdm.descricao,
                unidade:       pdm.unidade || '',
                caracteristicas: chars
              };
            });
        }
      } catch(_) {}

      if (catmatItens.length) {
        enriched.push({
          codigo_pdm:  pdm.codigo,
          descricao:   pdm.descricao,
          unidade:     pdm.unidade,
          total_itens: catmatItens.length,
          itens_catmat: catmatItens
        });
      } else {
        // Sem enriquecimento — retorna o PDM simples
        enriched.push({
          codigo_pdm: pdm.codigo,
          descricao:  pdm.descricao,
          unidade:    pdm.unidade,
          total_itens: 1,
          itens_catmat: []
        });
      }
    });
  } catch(_) {
    // Falha no enriquecimento — retorna lista simples
    pdmItems.forEach(function(item) {
      enriched.push({ codigo_pdm: item.codigo, descricao: item.descricao, unidade: item.unidade });
    });
  }

  return {
    total_pdms: catResult.items.length,
    resultados: enriched
  };
}

/* ── Tool: detalhar item — retorna objeto completo da API CNBS ── */
function _chatToolDetalhar(codigoPdm) {
  try {
    var resp = UrlFetchApp.fetch(
      'https://cnbs.estaleiro.serpro.gov.br/cnbs-api/material/v1/materialCaracteristcaValorporPDM?codigo_pdm=' + encodeURIComponent(codigoPdm),
      { muteHttpExceptions: true }
    );
    var data = JSON.parse(resp.getContentText('UTF-8'));
    if (!Array.isArray(data) || !data.length) {
      return { erro: 'Nenhum detalhe encontrado para PDM ' + codigoPdm };
    }

    var IGNORAR = { statusItem:1, itemSuspenso:1, codigoItem:1 };

    var itens = data
      .filter(function(d) { return d.statusItem && !d.itemSuspenso && d.codigoItem; })
      .map(function(d) {
        // Extrai características estruturadas (array)
        var chars = {};
        if (Array.isArray(d.caracteristicas)) {
          d.caracteristicas.forEach(function(c) {
            var nome  = c.nomeCaracteristica  || c.nome  || c.name  || c.chave || '';
            var valor = c.valorCaracteristica || c.valor || c.value || '';
            if (nome && valor) chars[nome] = valor;
          });
        }

        // Captura TODOS os campos diretos do objeto (qualquer material)
        var camposDiretos = {};
        Object.keys(d).forEach(function(k) {
          if (!IGNORAR[k] && k !== 'caracteristicas') {
            var v = d[k];
            if (v !== null && v !== undefined && v !== '') camposDiretos[k] = v;
          }
        });

        return {
          codigo_catmat:    String(d.codigoItem),
          nome:             d.nomeItem || d.descricao || d.nome || '',
          caracteristicas:  Object.keys(chars).length ? chars : null,
          campos_adicionais: Object.keys(camposDiretos).length ? camposDiretos : null
        };
      });

    return { codigo_pdm: codigoPdm, total_variações: itens.length, itens: itens };
  } catch(e) {
    return { erro: e.message };
  }
}

/* ── Tool: consultar preços ── */
function _chatToolPrecos(codigoPdm) {
  var data = JSON.parse(getPrecos('catmat', codigoPdm).getContent());

  if (!data.success) return { resumo: { erro: data.message || 'Sem resultados.' }, fullData: null };

  var stats  = data.stats    || {};
  var curves = data.curves   || { counts: {} };
  var rec    = data.recommended || null;

  // Resumo compacto para o GPT (não estoura contexto)
  var resumo = {
    total_registros:    stats.n || 0,
    media:              stats.mean   != null ? 'R$ ' + Number(stats.mean).toFixed(2)   : null,
    mediana:            stats.median != null ? 'R$ ' + Number(stats.median).toFixed(2) : null,
    cv_percentual:      stats.cv     != null ? Number(stats.cv).toFixed(1) + '%'       : null,
    outliers_removidos: stats.outliersCount || 0,
    curva_recomendada:  rec ? rec.curve      : null,
    confianca:          rec ? rec.confidence : null,
    curvas: { A: curves.counts.A || 0, B: curves.counts.B || 0, C: curves.counts.C || 0 }
  };

  if (Array.isArray(data.grupos) && data.grupos.length > 1) {
    resumo.por_grupo = data.grupos.map(function(g) {
      var cs = g.recommended && g.curveStats ? g.curveStats[g.recommended.curve] : null;
      return {
        pdm: g.pdm, registros: (g.precos || []).length,
        mediana: cs && cs.median != null ? 'R$ ' + Number(cs.median).toFixed(2) : null,
        curva:   g.recommended ? g.recommended.curve : null
      };
    });
  }

  if (rec && Array.isArray(data.precos)) {
    resumo.amostras_recentes = data.precos
      .filter(function(p) { return p.curva === rec.curve; }).slice(0, 5)
      .map(function(p) {
        return {
          preco: typeof p.precoUnitario === 'number' ? 'R$ ' + p.precoUnitario.toFixed(2) : null,
          data:  p.dataCompra ? new Date(p.dataCompra).toLocaleDateString('pt-BR') : null,
          uf:    p.estado || null
        };
      });
  }

  // Análise estatística completa (Z-Score iterativo) para o card no frontend
  var precosBase = Array.isArray(data.precos) ? data.precos : [];
  var resultado  = saneamentoEstatistico(precosBase);

  var valoresFinais = resultado.validos.map(function(p) { return p.precoUnitario; });
  var mu     = mean(valoresFinais);
  var sigma  = std(valoresFinais, mu);
  var cv     = mu > 0 ? (sigma / mu) * 100 : 0;
  var sorted = valoresFinais.slice().sort(function(a, b) { return a - b; });
  var mediana = sorted.length ? percentile(sorted, 50) : 0;
  var minimo  = sorted.length ? sorted[0] : 0;
  var maximo  = sorted.length ? sorted[sorted.length - 1] : 0;

  // Período (menor e maior data do conjunto completo)
  var datas = precosBase.map(function(p) { return p.dataCompra; }).filter(Boolean).sort();
  var periodo = { inicio: datas[0] || null, fim: datas[datas.length - 1] || null };

  // Unidade predominante
  var uCounts = {};
  precosBase.forEach(function(p) {
    var u = p.unidade || (p.descricaoItem || '').split(' ').pop() || '';
    if (u) uCounts[u] = (uCounts[u] || 0) + 1;
  });
  var unidadePred = Object.keys(uCounts).sort(function(a, b) { return uCounts[b] - uCounts[a]; })[0] || '—';

  // Descrição do item
  var descricao = (precosBase[0] && precosBase[0].descricaoItem) || ('PDM ' + codigoPdm);

  var fullData = {
    item_pesquisado:  descricao,
    code:             codigoPdm,
    periodo:          periodo,
    metricas: {
      total_encontrado:    precosBase.length,
      total_descartado:    resultado.descartados.length,
      amostra_valida_N:    resultado.validos.length,
      cv:                  Math.round(cv * 100) / 100,
      media:               Math.round(mu * 10000) / 10000,
      mediana:             Math.round(mediana * 10000) / 10000,
      desvio_padrao:       Math.round(sigma * 10000) / 10000,
      minimo:              Math.round(minimo * 10000) / 10000,
      maximo:              Math.round(maximo * 10000) / 10000,
      amplitude:           Math.round((maximo - minimo) * 10000) / 10000,
      unidade_predominante: unidadePred
    },
    compras_validas:     resultado.validos.slice(0, 200),
    compras_descartadas: resultado.descartados
  };

  return { resumo: resumo, fullData: fullData };
}

/* ── Tool: buscar fornecedores ── */
function _chatToolFornecedores(codigoPdm) {
  // Chama o deploy de fornecedores (SUPPLIERS_URL) via HTTP
  // pois a lógica de fornecedores pode estar em outro deploy GAS
  if (!SUPPLIERS_URL || SUPPLIERS_URL.indexOf('COLE_AQUI') !== -1) {
    // Fallback: usa a função local getFornecedores
    var data = JSON.parse(getFornecedores('catmat', codigoPdm).getContent());
    if (!data.success) return { erro: data.message || 'Sem fornecedores.' };
    var lista = (data.fornecedores || []).slice(0, 6).map(function(f) {
      return {
        nome:        f.nome,
        amostras:    f.amostras,
        preco_medio: f.media != null ? 'R$ ' + Number(f.media).toFixed(2) : '—',
        cv:          f.cv != null ? (Number(f.cv) * 100).toFixed(1) + '%' : '—',
        estados:     f.ufs || 0,
        score:       f.score != null ? Number(f.score).toFixed(3) : '—'
      };
    });
    return { total: (data.fornecedores || []).length, fornecedores: lista };
  }

  // Deploy externo de fornecedores
  try {
    var body = 'action=fornecedoresPorCatalogo&type=catmat&code=' + encodeURIComponent(codigoPdm) + '&includeSanctions=0&filtros={}';
    var resp = UrlFetchApp.fetch(SUPPLIERS_URL, {
      method: 'post', contentType: 'application/x-www-form-urlencoded',
      payload: body, muteHttpExceptions: true
    });
    var json = JSON.parse(resp.getContentText());
    var lista = Array.isArray(json.data) ? json.data : (Array.isArray(json.lista) ? json.lista : []);
    var top = lista.slice(0, 6).map(function(f) {
      return {
        nome:        f.nome || '—',
        amostras:    f.amostras || 0,
        preco_medio: f.precoMedio != null ? 'R$ ' + Number(f.precoMedio).toFixed(2) : '—',
        cv:          f.cv != null ? (Number(f.cv) * 100).toFixed(1) + '%' : '—',
        estados:     Array.isArray(f.ufs) ? f.ufs.join(', ') : '—',
        score:       f.score != null ? Number(f.score).toFixed(3) : '—'
      };
    });
    return { total: lista.length, fornecedores: top };
  } catch(e) {
    return { erro: e.message };
  }
}
