/* =================================================================
   ASSISTENTE DE COTAÇÃO — chatbot.js
   Requer: um deploy GAS com action='chat' (ver gas-chatbot-reference.js)
   ================================================================= */

/* ── Configuração ── */
const CHAT_GAS_URL  = 'https://script.google.com/macros/s/AKfycbwfIbAXR2P0lwamsunl46dJR81Aw8jFMdZBLTjYGD6u2ZXfD9sMaWjaM9uiFaBwTeQk/exec';
const MAX_HISTORY   = 6; // últimas N mensagens enviadas (limite 30k tokens GPT-4o)

/* ── Estado ── */
const chatState = {
  messages:        [],   // { role: 'user'|'assistant', content: '' }
  loading:         false,
  lastCatmatCodes: []
};

/* =================================================================
   INICIALIZAÇÃO
   ================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  setupForm();
  showWelcome();
});

function setupForm() {
  const form    = document.getElementById('chat-form');
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || chatState.loading) return;
    input.value = '';
    autoResize(input);
    sendMessage(text);
  });

  // Enter envia; Shift+Enter quebra linha
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  input.addEventListener('input', () => autoResize(input));
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/* =================================================================
   BOAS-VINDAS
   ================================================================= */
function showWelcome() {
  appendMessage(
    'assistant',
    `Olá! Sou o **Assistente de Cotação** da Divisão de Compras. 👋\n\n` +
    `Posso ajudar você a:\n` +
    `- Pesquisar preços de referência no ComprasGov\n` +
    `- Identificar o item correto no catálogo CATMAT\n` +
    `- Consultar fornecedores com histórico de contratos\n\n` +
    `Como posso ajudar hoje?`
  );
  showSuggestions([
    '📦 Pesquisar preço de um material',
    '📄 Gerar Relatório SEI',
    '🏢 Encontrar fornecedores',
    '❓ Como funciona?'
  ]);
}

/* =================================================================
   SUGESTÕES RÁPIDAS
   ================================================================= */
function showSuggestions(items) {
  const el = document.getElementById('chat-suggestions');
  el.innerHTML = items
    .map(s => `<button type="button" class="chat-suggestion">${escHTML(s)}</button>`)
    .join('');
  el.querySelectorAll('.chat-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      hideSuggestions();
      sendMessage(btn.textContent);
    });
  });
  el.classList.remove('hidden');
}

function hideSuggestions() {
  document.getElementById('chat-suggestions').classList.add('hidden');
}

/* =================================================================
   ENVIO DE MENSAGEM
   ================================================================= */
async function sendMessage(text) {
  if (!text.trim() || chatState.loading) return;

  hideSuggestions();
  appendMessage('user', text);
  chatState.messages.push({ role: 'user', content: text });

  setLoading(true);
  showTyping();

  try {
    const body = new URLSearchParams({
      action:   'chat',
      messages: JSON.stringify(chatState.messages.slice(-MAX_HISTORY))
    });

    const res = await fetch(CHAT_GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // GAS pode retornar { ok:false, error:'...' } (chatAssistente)
    // ou { success:false, message:'...' } (doPost outer catch)
    if (!data.ok) {
      const serverMsg = data.error || data.message || 'Erro desconhecido no servidor';
      throw new Error(serverMsg);
    }

    hideTyping();

    const reply = data.message || '';
    chatState.messages.push({ role: 'assistant', content: reply });

    if (data.catmat_codes?.length) chatState.lastCatmatCodes = data.catmat_codes;

    appendMessage('assistant', reply, buildActions(data));
    if (data.priceData) renderPriceCardInChat(data.priceData);

  } catch (err) {
    hideTyping();
    const msg = err.message || '';
    const isKeyErr = msg.toLowerCase().includes('openai_api_key') || msg.toLowerCase().includes('não configurada');
    appendMessage('assistant',
      isKeyErr
        ? '⚙️ O assistente ainda não está configurado.\n\nAdicione a propriedade **OPENAI_API_KEY** nas _Propriedades do Script_ no Google Apps Script e tente novamente.'
        : `⚠️ Não foi possível processar: **${msg}**\n\nVerifique a conexão e o deploy do GAS.`
    );
    console.error('[chat]', err);
  } finally {
    setLoading(false);
  }
}

/* =================================================================
   BOTÕES DE AÇÃO PÓS-RESPOSTA
   ================================================================= */
function buildActions(data) {
  const actions = [];
  const codes   = data.catmat_codes?.length ? data.catmat_codes : chatState.lastCatmatCodes;

  if (codes.length) {
    const param    = encodeURIComponent(codes.join(','));
    const descParam = data.priceData?.item_pesquisado
      ? '&desc=' + encodeURIComponent(data.priceData.item_pesquisado) : '';
    actions.push({ label: '🔍 Ver cotação completa',    href: `cotacao-rapida.html?catmat=${param}` });
    actions.push({ label: '📄 Relatório SEI (PDF)',     href: `cotacao-rapida.html?catmat=${param}&pdf=auto` });
    actions.push({ label: '📊 Análise de mercado',      href: `analise-mercado.html?type=catmat&code=${param}` });
    actions.push({ label: '📈 Detalhamento Estatístico', href: `analise-estatistica.html?type=catmat&code=${param}${descParam}` });
  }

  if (Array.isArray(data.actions)) actions.push(...data.actions);
  return actions;
}

/* =================================================================
   RENDERIZAÇÃO DE MENSAGENS
   ================================================================= */
function appendMessage(role, content, actions = []) {
  const container = document.getElementById('chat-messages');

  const wrap   = document.createElement('div');
  wrap.className = `chat-message chat-message--${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = parseMarkdown(content);
  wrap.appendChild(bubble);

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'chat-actions';
    for (const a of actions) {
      const btn = document.createElement('a');
      btn.className   = 'chat-action-btn';
      btn.href        = a.href || '#';
      btn.textContent = a.label;
      if ((a.href || '').startsWith('http')) {
        btn.target = '_blank';
        btn.rel    = 'noopener noreferrer';
      }
      row.appendChild(btn);
    }
    wrap.appendChild(row);
  }

  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

/* =================================================================
   TYPING INDICATOR
   ================================================================= */
function showTyping() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.id        = 'chat-typing';
  el.className = 'chat-message chat-message--assistant';
  el.innerHTML = `<div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  document.getElementById('chat-typing')?.remove();
}

/* =================================================================
   CONTROLE DE LOADING
   ================================================================= */
function setLoading(on) {
  chatState.loading = on;
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  input.disabled   = on;
  sendBtn.disabled = on;
  if (!on) input.focus();
}

/* =================================================================
   MARKDOWN SIMPLES
   ================================================================= */
function parseMarkdown(raw) {
  const lines  = String(raw || '').split('\n');
  let   html   = '';
  let   inList = false;

  for (const line of lines) {
    const t = line.trim();
    if (/^[-•*] /.test(t)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineMd(t.replace(/^[-•*] /, ''))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (t === '') {
        html += '<br>';
      } else {
        html += `<p>${inlineMd(t)}</p>`;
      }
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function inlineMd(s) {
  return escHTML(s)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g,     '<strong>$1</strong>')
    .replace(/`([^`]+)`/g,     '<code>$1</code>');
}

/* =================================================================
   CARD DE ANÁLISE ESTATÍSTICA NO CHAT
   ================================================================= */
const CSC_PAGE = 5;

function renderPriceCardInChat(priceData) {
  if (!priceData) return;
  // Legacy fallback (estrutura antiga sem metricas)
  if (!priceData.metricas) { _renderPriceCardLegacy(priceData); return; }

  const container = document.getElementById('chat-messages');
  const m  = priceData.metricas;
  const vl = priceData.compras_validas    || [];
  const dc = priceData.compras_descartadas || [];
  const p  = priceData.periodo || {};

  const fBRL  = n => typeof n === 'number' && isFinite(n)
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
  const fDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fN    = n => typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n ?? '—');
  const esc   = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const periodoTxt = p.inicio && p.fim ? `${fDate(p.inicio)} a ${fDate(p.fim)}` : '—';
  const cvCls = m.cv != null && m.cv <= 25 ? 'csc-m-yellow--ok' : 'csc-m-yellow';
  const anaUrl = `analise-estatistica.html?type=catmat&code=${encodeURIComponent(priceData.code||'')}&desc=${encodeURIComponent(priceData.item_pesquisado||'')}`;

  const wrap = document.createElement('div');
  wrap.className = 'chat-message chat-message--assistant';
  wrap.innerHTML = `
  <div class="csc-card">
    <div class="csc-header">
      <div class="csc-header-left">
        <div class="csc-badge-title">🔬 Detalhamento Estatístico</div>
        <div class="csc-item-name">${esc(priceData.item_pesquisado || '—')}</div>
        <div class="csc-item-meta">
          <span class="csc-code-tag">CATMAT: ${esc(priceData.code || '—')}</span>
          ${periodoTxt !== '—' ? `<span class="csc-period-tag">📅 ${esc(periodoTxt)}</span>` : ''}
        </div>
      </div>
      <a href="${esc(anaUrl)}" class="csc-full-link" target="_self">Análise completa →</a>
    </div>

    <div class="csc-section-hd"><span class="csc-step">1</span> DADOS BRUTOS OBTIDOS</div>
    <div class="csc-counters">
      <div class="csc-count">
        <div class="csc-count-val">${fN(m.total_encontrado)}</div>
        <div class="csc-count-lbl">TOTAL DE REGISTROS</div>
      </div>
      <div class="csc-count">
        <div class="csc-count-val csc-count-val--sm">${esc(periodoTxt)}</div>
        <div class="csc-count-lbl">PERÍODO</div>
      </div>
      <div class="csc-count csc-count--green">
        <div class="csc-count-val">${fN(m.amostra_valida_N)}</div>
        <div class="csc-count-lbl">REGISTROS SANEADOS</div>
      </div>
      <div class="csc-count csc-count--red">
        <div class="csc-count-val">${fN(m.total_descartado)}</div>
        <div class="csc-count-lbl">OUTLIERS REMOVIDOS</div>
      </div>
    </div>

    ${dc.length ? `
    <div class="csc-section-hd csc-section-hd--red">
      🚫 OUTLIERS REMOVIDOS (${dc.length} registros)
    </div>
    <div class="csc-table-zone" data-type="outlier"></div>
    ` : ''}

    <div class="csc-section-hd csc-section-hd--green">
      ✅ DADOS SANEADOS (${m.amostra_valida_N || 0} registros)
    </div>
    <div class="csc-table-zone" data-type="valid"></div>

    <div class="csc-section-hd"><span class="csc-step">4</span> ESTATÍSTICAS DESCRITIVAS (DADOS SANEADOS)</div>
    <div class="csc-metrics-grid">
      <div class="csc-metric"><div class="csc-m-lbl">Média Saneada</div><div class="csc-m-val csc-m-blue">${fBRL(m.media)}</div></div>
      <div class="csc-metric"><div class="csc-m-lbl">Mediana Saneada (Q2)</div><div class="csc-m-val csc-m-blue">${fBRL(m.mediana)}</div></div>
      <div class="csc-metric"><div class="csc-m-lbl">Mínimo Saneado</div><div class="csc-m-val csc-m-green">${fBRL(m.minimo)}</div></div>
      <div class="csc-metric"><div class="csc-m-lbl">Máximo Saneado</div><div class="csc-m-val csc-m-red">${fBRL(m.maximo)}</div></div>
      <div class="csc-metric"><div class="csc-m-lbl">Amplitude Saneada</div><div class="csc-m-val">${fBRL(m.amplitude)}</div></div>
      <div class="csc-metric"><div class="csc-m-lbl">Desvio Padrão</div><div class="csc-m-val">${fBRL(m.desvio_padrao)}</div></div>
      <div class="csc-metric"><div class="csc-m-lbl">Coeficiente de Variação</div><div class="csc-m-val ${cvCls}">${m.cv != null ? m.cv.toFixed(2) + '%' : '—'}</div></div>
      <div class="csc-metric"><div class="csc-m-lbl">Unidade Predominante</div><div class="csc-m-val">${esc(m.unidade_predominante || '—')}</div></div>
    </div>
  </div>`;

  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;

  // Attach paginated tables after DOM insertion
  const zones = wrap.querySelectorAll('.csc-table-zone');
  let zi = 0;
  if (dc.length) cscRenderPage(zones[zi++], dc,  0, 'outlier');
  if (zones[zi]) cscRenderPage(zones[zi],  vl,  0, 'valid');
}

function cscRenderPage(zone, rows, page, type) {
  if (!zone) return;
  const total  = rows.length;
  const pages  = Math.ceil(total / CSC_PAGE);
  const start  = page * CSC_PAGE;
  const slice  = rows.slice(start, start + CSC_PAGE);
  const isOut  = type === 'outlier';

  const esc   = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fBRL  = n => typeof n === 'number' && isFinite(n)
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
  const fDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  const rowsHtml = slice.map((r, i) => {
    const num    = start + i + 1;
    const preco  = fBRL(r.precoUnitario);
    const data   = fDate(r.dataCompra);
    const qtd    = typeof r.quantidade === 'number' ? r.quantidade.toLocaleString('pt-BR') : (r.quantidade ?? '—');
    const unid   = r.unidade || '—';
    const uf     = r.estado || '—';
    const orgao  = r.nomeUasg || r.codigoUasg || '—';
    const link   = r.linkCompra || '';
    const motivo = r._motivo_descarte || '—';
    return `<tr>
      <td class="csc-td-n">${num}</td>
      <td>${esc(data)}</td>
      <td class="${isOut ? 'csc-td-pr' : 'csc-td-pn'}">${esc(preco)}</td>
      <td class="csc-td-n">${esc(String(qtd))}</td>
      <td>${esc(unid)}</td>
      <td><span class="csc-uf">${esc(uf)}</span></td>
      <td class="csc-td-org" title="${esc(orgao)}">${esc(orgao)}</td>
      ${isOut ? `<td class="csc-td-mot">${esc(motivo)}</td>` : ''}
      <td>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="csc-link">Ver Item</a>` : '—'}</td>
    </tr>`;
  }).join('');

  const thMot = isOut ? '<th>Motivo</th>' : '';
  const from  = start + 1;
  const to    = Math.min(start + CSC_PAGE, total);

  let pagHtml = '';
  if (pages > 1) {
    const range = [];
    const pad = 2;
    for (let i = 0; i < pages; i++) {
      if (i === 0 || i === pages - 1 || (i >= page - pad && i <= page + pad)) range.push(i);
      else if (range[range.length - 1] !== '…') range.push('…');
    }
    const btns = range.map(i => i === '…'
      ? `<span class="csc-pag-dots">…</span>`
      : `<button class="csc-pag-btn${i === page ? ' active' : ''}" data-p="${i}">${i + 1}</button>`
    ).join('');
    pagHtml = `<div class="csc-pag">
      <button class="csc-pag-btn" data-p="${page - 1}" ${page === 0 ? 'disabled' : ''}>‹</button>
      ${btns}
      <button class="csc-pag-btn" data-p="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''}>›</button>
      <span class="csc-pag-info">Mostrando ${from}–${to} de ${total} registros</span>
    </div>`;
  } else {
    pagHtml = `<div class="csc-pag"><span class="csc-pag-info">${total} registro(s)</span></div>`;
  }

  zone.innerHTML = `
    <div class="csc-tscroll">
      <table class="csc-table">
        <thead><tr><th>#</th><th>Data</th><th>Valor</th><th>Qtd</th><th>Unidade</th><th>UF</th><th>Órgão</th>${thMot}<th>Acesso</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${pagHtml}`;

  zone.querySelectorAll('.csc-pag-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => cscRenderPage(zone, rows, +btn.dataset.p, type));
  });
}

/* Legacy: estrutura antiga de priceData (sem metricas) */
function _renderPriceCardLegacy(priceData) {
  if (!Array.isArray(priceData.precos) || !priceData.precos.length) return;
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = 'chat-message chat-message--assistant chat-message--card';
  const rec   = priceData.recommended || null;
  const stats = priceData.stats || {};
  const cs    = rec && priceData.curveStats ? priceData.curveStats[rec.curve] : null;
  const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let bannerHtml = '';
  if (rec && stats.median != null) {
    const conf      = rec.confidence || 'alta';
    const confLabel = { alta: '✔ Alta confiança', media: '⚠ Confiança média', baixa: '⚠ Confiança baixa' }[conf] || '';
    const cvTxt     = cs?.cv != null ? `CV ${Number(cs.cv).toFixed(1)}%` : (stats.cv != null ? `CV ${Number(stats.cv).toFixed(1)}%` : '');
    const medianaTxt = Number(stats.median).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    bannerHtml = `<div class="ref-price-banner conf-${esc(conf)}">
      <div class="ref-price-left">
        <div class="ref-price-label">Preço de Referência — Curva ${esc(rec.curve)} <span class="confidence-badge">${esc(confLabel)}</span></div>
        <div class="ref-price-meta">Mediana • ${esc(cvTxt)} • ${cs?.n ?? stats.n ?? 0} contratação(ões)</div>
      </div>
      <div class="ref-price-value">${medianaTxt}</div>
    </div>`;
  }
  const rows    = rec ? priceData.precos.filter(p => p.curva === rec.curve) : priceData.precos;
  const visible = rows.slice(0, 15);
  const extra   = rows.length - visible.length;
  const tbody   = visible.map(r => {
    const preco = typeof r.precoUnitario === 'number' ? r.precoUnitario.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) : 'N/A';
    const data  = r.dataCompra ? new Date(r.dataCompra).toLocaleDateString('pt-BR') : 'N/A';
    return `<tr><td><strong>${esc(preco)}</strong></td><td>${esc(r.descricaoItem||'N/A')}</td><td>${r.quantidade??'N/A'}</td><td>${esc(data)}</td><td>${esc(r.nomeFornecedor||'N/A')}</td><td>${esc(r.estado||'N/A')}</td><td><a href="${esc(r.linkCompra||'#')}" target="_blank" rel="noopener noreferrer" class="btn-access-item">↗</a></td></tr>`;
  }).join('');
  wrap.innerHTML = bannerHtml + `<div class="chat-price-table"><div class="table-scroll"><table class="results-table"><thead><tr><th>Preço</th><th>Descrição</th><th>Qtd</th><th>Data</th><th>Fornecedor</th><th>UF</th><th></th></tr></thead><tbody>${tbody}</tbody></table></div><div class="chat-price-footer">${extra > 0 ? `Exibindo ${visible.length} de ${rows.length} registros da Curva ${rec?.curve??''}` : `${rows.length} registro(s)`}</div></div>`;
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function escHTML(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
