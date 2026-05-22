/* ============ HELPERS GLOBAIS (essenciais) ============ */
function escapeHTML(str){
  if (str === null || str === undefined) return '';
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
  return String(str).replace(/[&<>"']/g, ch => map[ch]);
}
function formatCNPJ(cnpj){
  const v = (cnpj || '').replace(/\D+/g,'').padStart(14,'0').slice(-14);
  if (v.length !== 14) return cnpj || '';
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
function normalizeCNPJ(cnpj){
  // mantém zeros à esquerda; aceita entrada curta; remove máscara
  const v = String(cnpj || '').replace(/\D+/g, '');
  return v.padStart(14, '0').slice(-14);
}
function safeURL(url) {
  try {
    const u = new URL(url, location.origin);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost') return null;
    return u.href;
  } catch (_) { return null; }
}
function fmtBRL(n){
  if (typeof n !== 'number' || !isFinite(n)) return 'N/D';
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

/* ===== Datas: parser robusto + formatação BR ===== */
function parseToDate(x){
  if (!x && x !== 0) return null;
  if (x instanceof Date) return isNaN(+x) ? null : x;

  // timestamp numérico
  if (typeof x === 'number') {
    const d = new Date(x);
    return isNaN(+d) ? null : d;
  }

  const s = String(x).trim();
  if (!s) return null;

  // dd/mm/aaaa
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);

  // yyyymmdd
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3]);

  // ISO ou formato reconhecível pelo Date
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}
function fmtDateBR(value){
  const d = parseToDate(value);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

function scoreExplainerHTML(){
  return `
    <details class="score-note">
      <summary>Como calculamos o <b>Score</b>?</summary>
      <div class="note-body">
        <p>O <b>score</b> (0 a 1) é uma heurística para ordenar fornecedores e combina três fatores:</p>
        <ul>
          <li><b>50% • Evidência (wN):</b> <code>wN = min(amostras, 10) / 10</code></li>
          <li><b>30% • Estabilidade (wCV):</b> <code>wCV = 1 − min(CV, 0.5) / 0.5</code> &nbsp;
              <small>(onde <code>CV = desvio&nbsp;padrão / média</code>)</small></li>
          <li><b>20% • Abrangência (wUF):</b> <code>wUF = min(qtd_UFs, 5) / 5</code></li>
        </ul>
        <p><b>Fórmula final:</b> <code>score = 0.5·wN + 0.3·wCV + 0.2·wUF</code></p>
        <p><b>Exemplo:</b> amostras = 7 → <code>wN = 0,7</code>; CV = 0,12 → <code>wCV ≈ 0,76</code>;
           UFs = 3 → <code>wUF = 0,6</code> ⇒ <code>score ≈ 0,698</code>.</p>
        <p class="muted"><em>Obs.:</em> é um indicador heurístico para ordenar candidatos — não substitui análise jurídica/compliance.</p>
      </div>
    </details>
  `;
}

/* ====== SANÇÕES: índice unificado por CNPJ (aceita mapa ou lista) ====== */
function buildSanctionsIndex(payload){
  const byCnpj = Object.create(null);
  const ensure = (key) => (byCnpj[key] || (byCnpj[key] = { resumo:null, registros:[] }));

  // Mapas por CNPJ
  const mapCands = [
    payload && payload.sancoesByCnpj,
    payload && payload.penaltiesByCnpj,
    payload && payload.sanctionsByCnpj
  ].filter(Boolean);

  for (const m of mapCands){
    for (const [cnpjRaw, val] of Object.entries(m)){
      const key = normalizeCNPJ(cnpjRaw);
      if (!key) continue;
      const key8  = key.slice(0,8);
      const slot14 = ensure(key);
      const slot8  = ensure(key8);
      if (val && typeof val === 'object') {
        if (val.resumo || val.summary) { slot14.resumo = slot8.resumo = (val.resumo || val.summary); }
        if (Array.isArray(val.registros)) { slot14.registros.push(...val.registros); slot8.registros.push(...val.registros); }
        if (Array.isArray(val.records))   { slot14.registros.push(...val.records);   slot8.registros.push(...val.records); }
        if (Array.isArray(val))           { slot14.registros.push(...val);           slot8.registros.push(...val); }
      }
    }
  }

  // Listas soltas de sanções
  const listCands = [
    payload && payload.sancoes,
    payload && payload.penalties,
    payload && payload.sanctions
  ].filter(Boolean);

  for (const list of listCands){
    for (const item of (Array.isArray(list) ? list : [])){
      const key = normalizeCNPJ(item?.cnpj || item?.CNPJ || item?.cnpjRoot);
      if (!key) continue;
      const key8  = key.slice(0,8);
      const slot14 = ensure(key);
      const slot8  = ensure(key8);
      if (item.resumo || item.summary) { slot14.resumo = slot8.resumo = (item.resumo || item.summary); }
      slot14.registros.push(item);
      slot8.registros.push(item);
    }
  }
  return byCnpj;
}

function isRegistroAtivo(reg){
  if (reg?.ativo === true || reg?.active === true || reg?.status === 'ATIVA' || reg?.status === 'ACTIVE') return true;
  if (reg?.ativo === false || reg?.active === false || reg?.status === 'ENCERRADA' || reg?.status === 'ENDED' || reg?.status === 'INATIVA') return false;
  const now = new Date();
  const fim = reg?.dataFim || reg?.data_fim || reg?.endDate || reg?.validUntil || reg?.dtFim;
  if (fim){
    const df = new Date(fim);
    if (!Number.isNaN(+df)) return df >= now;
  }
  return !fim;
}

/* ===== Badge de status de sanções (mantido para compatibilidade, não usado na tabela) ===== */
function renderPenStatus(sancoesOrCnpj, sancIndex){
  let sancoes = null;
  if (typeof sancoesOrCnpj === 'string') {
    const k14 = normalizeCNPJ(sancoesOrCnpj);
    const k8  = k14.slice(0,8);
    sancoes = (sancIndex && (sancIndex[k14] || sancIndex[k8])) || null;
  } else {
    sancoes = sancoesOrCnpj || null;
  }
  if (sancoes && sancoes.resumo && typeof sancoes.resumo.temVigente === 'boolean') {
    const r = sancoes.resumo;
    if (r.temVigente) {
      const cats = (r.categoriasVigentes || []).join(', ');
      return `
        <span class="pen-badge pen-on">Penalidade vigente</span>
        <small class="pen-note">(${r.qtdeVigentes || 0} registro(s)${cats ? ' • ' + escapeHTML(cats) : ''})</small>
      `;
    }
    return `<span class="pen-badge pen-off">Sem penalidades vigentes</span>`;
  }
  const regs = Array.isArray(sancoes?.registros) ? sancoes.registros : [];
  if (regs.length) {
    const ativos = regs.filter(isRegistroAtivo);
    if (ativos.length > 0) {
      const cats = new Set();
      for (const r of ativos) {
        const cat = r?.descricaoResumida || r?.descricaoTipoSancao || r?.tipoSancao ||
                    r?.descricaoPortal || r?.penalidade || r?.descricao || r?.descricaoDetalhada || r?.categoria || '';
        if (cat) cats.add(String(cat));
      }
      return `
        <span class="pen-badge pen-on">Penalidade vigente</span>
        <small class="pen-note">(${ativos.length} registro(s)${cats.size ? ' • ' + escapeHTML([...cats].join(', ')) : ''})</small>
      `;
    }
    return `<span class="pen-badge pen-off">Sem penalidades vigentes</span>`;
  }
  return `<span class="pen-badge pen-unknown">Sem informações</span>`;
}


/* =================== APP =================== */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.price-form');
  const resultsContainer = document.getElementById('results-container');
  if (!form || !resultsContainer) return;

  const loadingMessage = document.createElement('div');
  loadingMessage.classList.add('loading-message', 'hidden');
  loadingMessage.textContent = 'Aguarde, sua pesquisa está sendo processada...';
  form.parentNode.insertBefore(loadingMessage, form.nextSibling);

  const ANALYSIS_URL = 'analise-mercado.html';
const ACOMP_BASE_URL = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra'; 

function compraUrl(id) {
  const clean = String(id || '').replace(/[^\d]/g, '');
  if (!clean) return safeURL(ACOMP_BASE_URL);
  const deep = `${ACOMP_BASE_URL}?compra=${encodeURIComponent(clean)}`;
  // tenta o deep link; se por algum motivo não for aceito, volta p/ base
  return safeURL(deep) || safeURL(ACOMP_BASE_URL);
}


  // Seus deploys GAS
  const BACKEND_PRICES_URL    = 'https://script.google.com/macros/s/AKfycbx6pV8wX3UBYl9rhs2W1IX5Hn3SxUTEEvL0o2wS9_TNZnjRuCBNpTLnbYpXZjIdsgFK/exec';
  const BACKEND_SUPPLIERS_URL = 'https://script.google.com/macros/s/AKfycbytIZagCuuzHmxOV3GSmFnPvcl8jtnMIR3BeMCFIjILmX-qLZVvotiNnlw1Kbpdqh0k/exec';

  const MAX_PAGINAS_PADRAO = 2;
  let inflightCtrl = null;

  /* ── Autocomplete de catálogo (multi-seleção até 10 itens) ── */
  (function initCatalogAutocomplete() {
    const searchInput  = document.getElementById('catalog_search');
    const dropdown     = document.getElementById('catalog-dropdown');
    const badgeEl      = document.getElementById('selected-catalog-item');
    const catmatHidden = document.getElementById('catmat_code');
    const catserHidden = document.getElementById('catser_code');
    const btnPesquisa  = document.getElementById('btn-pesquisa');
    if (!searchInput || !dropdown) return;

    const MAX_ITEMS = 10;
    let selectedItems = [];
    let debounceTimer = null;
    let activeIdx = -1;
    let currentItems = [];

    function renderChips() {
      catmatHidden.value = selectedItems.map(i => i.codigo).join(',');
      catserHidden.value = '';
      if (btnPesquisa) btnPesquisa.disabled = selectedItems.length === 0;
      if (!badgeEl) return;
      if (!selectedItems.length) { badgeEl.classList.add('hidden'); badgeEl.innerHTML = ''; return; }
      badgeEl.classList.remove('hidden');
      badgeEl.innerHTML =
        `<div class="sel-chips">${selectedItems.map((item, i) => {
          const tags = buildMetaTags(item);
          const metaHtml = tags.length
            ? `<span class="sel-meta">${escapeHTML(tags.slice(0, 3).map(t => t.label).join(' · '))}</span>`
            : '';
          return `<span class="sel-chip">
            <span class="sel-code">CATMAT ${escapeHTML(item.codigo)}</span>
            <span class="sel-desc">${escapeHTML(item.descricao)}${item.unidade ? ' — ' + escapeHTML(item.unidade) : ''}</span>
            ${metaHtml}
            <button type="button" class="sel-clear" data-idx="${i}" title="Remover">✕</button>
          </span>`;
        }).join('')}
        </div>
        <div class="sel-counter">${selectedItems.length}/${MAX_ITEMS} ${selectedItems.length === 1 ? 'item selecionado' : 'itens selecionados'}</div>`;
      badgeEl.querySelectorAll('.sel-clear').forEach(btn => {
        btn.addEventListener('click', () => { selectedItems.splice(+btn.dataset.idx, 1); renderChips(); });
      });
      window.__selectedItems = selectedItems.slice();
    }

    function selectItem(item) {
      if (selectedItems.some(i => i.codigo === item.codigo)) { closeDropdown(); searchInput.value = ''; return; }
      if (selectedItems.length >= MAX_ITEMS) return;
      selectedItems.push(item);
      renderChips();
      closeDropdown();
      searchInput.value = '';
      searchInput.focus();
    }

    function openDropdown()  { dropdown.classList.add('open'); }
    function closeDropdown() { dropdown.classList.remove('open'); activeIdx = -1; }

    function buildMetaTags(it) {
      const tags = [];
      // 1) Array genérico de características (qualquer tipo de material)
      const chars = it.caracteristicas || it.characteristics || it.atributos || null;
      if (Array.isArray(chars) && chars.length) {
        for (const c of chars) {
          const nome = c.nome || c.name || c.chave || c.key || '';
          const valor = c.valor || c.value || c.descricao || c.description || '';
          if (nome && valor) tags.push({ label: `${nome}: ${valor}` });
        }
      } else if (chars && typeof chars === 'object') {
        for (const [k, v] of Object.entries(chars)) {
          if (v) tags.push({ label: `${k}: ${v}` });
        }
      }
      // 2) Campos individuais nomeados (fallback / backward compat)
      if (!tags.length) {
        const pairs = [
          ['Composição',       it.composicao  || it.composição  || it.composition || ''],
          ['Concentração',     it.concentracao || it.concentração || it.concentration || ''],
          ['Forma Farmacêutica', it.formaFarmaceutica || it.forma_farmaceutica || ''],
          ['Adicional',        it.adicional   || it.additional || ''],
          ['Gramatura',        it.gramatura   || ''],
          ['Cor',              it.cor         || ''],
          ['Formato',          it.formato     || ''],
          ['Material',         it.material    || ''],
          ['Capacidade',       it.capacidade  || ''],
          ['Voltagem',         it.voltagem    || ''],
          ['NCM',              it.ncm         || ''],
        ];
        for (const [nome, valor] of pairs) {
          if (valor) tags.push({ label: `${nome}: ${valor}` });
        }
      }
      return tags;
    }

    function renderItems(items) {
      currentItems = items;
      activeIdx = -1;
      if (!items.length) {
        dropdown.innerHTML = '<div class="catalog-dropdown-msg">Nenhum item encontrado.</div>';
        openDropdown(); return;
      }
      dropdown.innerHTML = items.map((it, i) => {
        const tags = buildMetaTags(it);
        const metaHtml = tags.length
          ? `<div class="catalog-item__meta">${tags.map(t => `<span class="catalog-item__meta-tag">${escapeHTML(t.label)}</span>`).join('')}</div>`
          : '';
        return `
        <div class="catalog-item${selectedItems.some(s => s.codigo === it.codigo) ? ' already-selected' : ''}" data-idx="${i}">
          <div class="catalog-item__header">
            <span class="catalog-item__code">CATMAT ${escapeHTML(it.codigo)}</span>
            ${it.unidade ? `<span class="catalog-item__unit">${escapeHTML(it.unidade)}</span>` : ''}
          </div>
          <span class="catalog-item__desc">${escapeHTML(it.descricao)}</span>
          ${metaHtml}
        </div>`;
      }).join('');
      dropdown.querySelectorAll('.catalog-item').forEach(el => {
        el.addEventListener('mousedown', (e) => { e.preventDefault(); selectItem(currentItems[+el.dataset.idx]); });
      });
      openDropdown();
    }

    async function searchCatalog(q) {
      dropdown.innerHTML = '<div class="catalog-dropdown-msg">Buscando...</div>';
      openDropdown();
      try {
        const params = new URLSearchParams({ action: 'catalogo', q });
        const res  = await fetch(BACKEND_PRICES_URL + '?' + params.toString());
        const data = await res.json();
        if (data.success && data.items && data.items.length) {
          renderItems(data.items);
        } else {
          dropdown.innerHTML = `<div class="catalog-dropdown-msg">${escapeHTML(data.message || 'Nenhum resultado.')}</div>`;
        }
      } catch (_) {
        dropdown.innerHTML = '<div class="catalog-dropdown-msg">Erro ao buscar. Tente novamente.</div>';
      }
    }

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < 3) { closeDropdown(); return; }
      debounceTimer = setTimeout(() => searchCatalog(q), 350);
    });

    searchInput.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.catalog-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
      else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectItem(currentItems[activeIdx]); return; }
      else if (e.key === 'Escape') { closeDropdown(); return; }
      items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
      if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== searchInput) closeDropdown();
    });
  })();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (inflightCtrl) inflightCtrl.abort();
    inflightCtrl = new AbortController();

    clearMessages();
    clearErrors();
    resultsContainer.innerHTML = '';

    window.__lastSummary  = '';
    window.__curveMeta    = null;
    window.__lastData     = null;
    window.__curveStats   = null;
    window.__recommended  = null;

    removeGoToAnalysisButton();

    const btnSubmit = form.querySelector('[type="submit"]');
    if (btnSubmit) btnSubmit.disabled = true;

    const catmatCode = document.getElementById('catmat_code')?.value.trim() || '';
    const catserCode = document.getElementById('catser_code')?.value.trim() || '';

    let isValid = true;
    if (catmatCode && catserCode) {
      showError('Preencha somente um dos campos (CATMAT ou CATSER).', document.getElementById('catmat_code')?.parentNode);
      showError('Preencha somente um dos campos (CATSER).', document.getElementById('catser_code')?.parentNode);
      isValid = false;
    }
    if (!catmatCode && !catserCode) {
      showError('Preencha pelo menos um dos campos (CATMAT ou CATSER).', document.getElementById('catmat_code')?.parentNode);
      isValid = false;
    }
    if (!isValid) { if (btnSubmit) btnSubmit.disabled = false; return; }

    const type = catmatCode ? 'catmat' : 'catser';
    const code = catmatCode || catserCode;

    const formData = new URLSearchParams();
    formData.append('type', type);
    formData.append('code', code);

    loadingMessage.classList.remove('hidden');

    try {
      // 1) preços
      const response = await fetch(BACKEND_PRICES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: formData,
        signal: inflightCtrl.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      window.__lastData    = data;
      window.__lastSummary = data.summary || '';
      window.__curveMeta   = data.curves || null;
      window.__curveStats  = data.curveStats || null;
      window.__recommended = data.recommended || null;

      // DEBUG: sempre loga a resposta completa do GAS
      console.log('[DEBUG resposta GAS]', JSON.stringify({ success: data.success, message: data.message, totalPrecos: data.precos?.length, primeiroItem: data.precos?.[0] }));

      if (data.success && Array.isArray(data.precos) && data.precos.length > 0) {
        displayResults(data.precos);

        const payload = { ts: Date.now(), type, code, data };
        const storeKey = `ze-precos:last:${type}:${code}`;
        sessionStorage.setItem('ze-precos:last', JSON.stringify(payload));
        try { localStorage.setItem(storeKey, JSON.stringify(payload)); } catch (_) {}

        renderMarketAnalysisCard(data);
        renderActionsRow({ type, code, storeKey });

        // 2) fornecedores (com possível fallback JSONP)
        showSuppliersLoading();
        try {
          const filtros = Object.assign({}, coletarFiltrosUI(), { maxPaginas: MAX_PAGINAS_PADRAO });
          const { lista: fornecedores, sancIndex } = await buscarFornecedores({ type, code, filtros });

          // DIAGNÓSTICO
          console.log('[fornecedores] total:', fornecedores?.length || 0);
          console.log('[sanctionsIndex] chaves (amostra):', Object.keys(sancIndex || {}).slice(0,10));

          renderListaFornecedores(fornecedores, ensureSuppliersSection(), sancIndex);
        } catch (e2) {
          renderSuppliersError('Não foi possível listar fornecedores potenciais agora. Tente novamente mais tarde.');
          console.error(e2);
        } finally {
          hideSuppliersLoading();
        }
      } else {
        showError(data.message || 'Sem resultados.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Erro ao enviar o formulário:', err);
        showError('Ocorreu um erro ao conectar com o servidor. Tente novamente mais tarde.');
      }
    } finally {
      loadingMessage.classList.add('hidden');
      if (btnSubmit) btnSubmit.disabled = false;
      inflightCtrl = null;
    }
  });

  /* ---------- helper: monta tabela HTML ---------- */
  function buildTable(rows) {
    const LIMIT = 15;
    if (!rows || !rows.length) return '<p style="padding:12px;color:#666">Nenhum registro.</p>';

    function buildRow(item) {
      const precoTxt = typeof item.precoUnitario === 'number'
        ? item.precoUnitario.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
        : (item.precoUnitario || 'N/A');
      const dataTxt = item.dataCompra ? new Date(item.dataCompra).toLocaleDateString('pt-BR') : 'N/A';
      const isOut = !!item.isOutlier;
      const idCompraVal = (item.idCompra ?? '').toString().trim();
      const href = item.linkCompra ? safeURL(item.linkCompra) : compraUrl(idCompraVal);
      const idContent = idCompraVal
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHTML(idCompraVal)}</a>`
        : 'N/A';
      const accessBtn = href && idCompraVal
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer" class="btn-access-item">↗ Acessar</a>`
        : '—';
      return `<tr${isOut ? ' class="outlier-row"' : ''}>
        <td>${idContent}<span class="tag-curve">${escapeHTML(item.curva||'N/D')}</span></td>
        <td>${escapeHTML(item.descricaoItem||'N/A')}${isOut?' <span class="tag-outlier">🚩 Outlier</span>':''}</td>
        <td>${precoTxt}</td><td>${item.quantidade??'N/A'}</td><td>${dataTxt}</td>
        <td>${escapeHTML(item.nomeFornecedor||'N/A')}</td>
        <td>${escapeHTML(item.codigoUasg||'N/A')} ${escapeHTML(item.nomeUasg||'')}</td>
        <td>${escapeHTML(item.estado||'N/A')}</td>
        <td class="td-access">${accessBtn}</td>
      </tr>`;
    }

    const visible = rows.slice(0, LIMIT);
    const extra   = rows.slice(LIMIT);

    const thead = `<thead><tr>
      <th>ID Compra</th><th>Descrição do Item</th><th>Preço Unitário</th>
      <th>Qtd</th><th>Data</th><th>Fornecedor</th><th>UASG</th><th>UF</th><th>Acessar</th>
    </tr></thead>`;

    let t = `<div class="table-wrap">`;
    t += `<div class="table-count">Exibindo ${visible.length} de ${rows.length} registros</div>`;
    t += `<div class="table-scroll"><table class="results-table">${thead}<tbody>`;
    t += visible.map(buildRow).join('');
    t += '</tbody>';
    if (extra.length) {
      t += `<tbody class="rows-extra" hidden>${extra.map(buildRow).join('')}</tbody>`;
    }
    t += '</table></div>';
    if (extra.length) {
      t += `<button type="button" class="btn-show-more">Mostrar todos os ${rows.length} registros ▾</button>`;
    }
    t += '</div>';
    return t;
  }

  /* ---------- tabela (preços) ---------- */
  function displayResults(precos) {
    if (!precos || precos.length === 0) {
      resultsContainer.innerHTML = '<p>Nenhum resultado encontrado.</p>';
      return;
    }

    const data   = window.__lastData;
    const grupos = data && Array.isArray(data.grupos) && data.grupos.length ? data.grupos : null;
    let html = '';

    if (grupos) {
      /* ── Card por material ── */
      grupos.forEach(grupo => {
        const rec  = grupo.recommended;
        const cs   = rec && grupo.curveStats ? grupo.curveStats[rec.curve] : null;
        const refPrice   = cs ? cs.median : null;
        const refPriceTxt = refPrice != null
          ? refPrice.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) : 'N/D';
        const cvTxt = cs?.cv != null ? `${Number(cs.cv).toFixed(1)}%` : 'N/D';

        const selItem   = (window.__selectedItems || []).find(s => s.codigo === String(grupo.pdm));
        const nomeMat   = selItem ? selItem.descricao : `PDM ${grupo.pdm}`;
        const unidadeTxt = selItem?.unidade ? ` — ${selItem.unidade}` : '';

        html += `<div class="material-card">
          <div class="material-card-header">
            <span class="material-name">${escapeHTML(nomeMat)}${escapeHTML(unidadeTxt)}</span>
            <span class="material-total">${grupo.precos.length} registro(s)</span>
          </div>`;

        if (rec && refPrice != null) {
          const conf = rec.confidence || 'alta';
          const confLabels = { alta: '✔ Alta confiança', media: '⚠ Confiança média', baixa: '⚠ Confiança baixa' };
          const confHints  = { alta: '', media: ' — CV acima de 25%, use como referência inicial', baixa: ' — alta dispersão de preços, pesquise especificações mais detalhadas' };
          html += `<div class="ref-price-banner conf-${escapeHTML(conf)}">
            <div class="ref-price-left">
              <div class="ref-price-label">
                Preço de Referência — Curva ${escapeHTML(rec.curve)}
                <span class="confidence-badge">${confLabels[conf]}</span>
              </div>
              <div class="ref-price-meta">Mediana • CV ${cvTxt} • ${cs.n} contratação(ões)${confHints[conf]}</div>
            </div>
            <div class="ref-price-value">${refPriceTxt}</div>
          </div>`;
        } else {
          html += `<div class="ref-price-banner ref-price-no-rec">
            ⚠ Dados insuficientes para recomendação (CV &gt; 25% ou menos de 3 registros por curva)
          </div>`;
        }

        if (rec) {
          const recRows = grupo.precos.filter(p => p.curva === rec.curve);
          if (recRows.length) {
            html += `<details class="material-details" open>
              <summary>Curva ${escapeHTML(rec.curve)} — ${recRows.length} registro(s) — Recomendada</summary>
              ${buildTable(recRows)}
            </details>`;
          }
        }

        const otherRows = grupo.precos.filter(p => !rec || p.curva !== rec.curve);
        if (otherRows.length) {
          html += `<details class="material-details">
            <summary>Demais registros (${otherRows.length})</summary>
            ${buildTable(otherRows)}
          </details>`;
        }

        html += '</div>';
      });

    } else {
      /* ── Layout legado (item único / GAS antigo) ── */
      const groups = { A:[], B:[], C:[], 'N/D':[] };
      precos.forEach(p => {
        const k = (p && typeof p.curva === 'string' && ['A','B','C'].includes(p.curva)) ? p.curva : 'N/D';
        groups[k].push(p);
      });

      if (window.__lastSummary) {
        html += `<div class="results-summary" aria-live="polite"><strong>Resumo:</strong> ${escapeHTML(window.__lastSummary)}</div>`;
      }

      if (window.__recommended?.curve) {
        const rec   = window.__recommended;
        const cvTxt = rec.stats?.cv != null ? `${Number(rec.stats.cv).toFixed(1)}%` : 'N/D';
        html += `<div class="recommendation-card">
          <div class="recommendation-icon">★</div>
          <div class="recommendation-content">
            <strong>Curva recomendada:</strong> Curva <b>${escapeHTML(rec.curve)}</b>
            <span class="recommendation-badge">Recomendada</span>
            <div class="recommendation-meta">
              <span><b>Critérios:</b> CV ≤ 25% e ≥ 3 contratações</span>
              <span class="dot">•</span>
              <span><b>Métricas:</b> CV ${cvTxt}, n=${rec.stats?.n ?? 'N/D'}</span>
            </div>
          </div>
        </div>`;
      }

      const meta = window.__curveMeta;
      if (meta?.t1 != null) {
        const t1 = meta.t1.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        const t2 = meta.t2.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        html += `<div class="curve-meta">
          <span><strong>Curva A</strong>: ≤ ${t1}</span>
          <span><strong>Curva B</strong>: entre ${t1} e ${t2}</span>
          <span><strong>Curva C</strong>: > ${t2}</span>
        </div>`;
      }

      ['A','B','C','N/D'].forEach(curva => {
        const arr = groups[curva];
        if (!arr?.length) return;
        const isRec = window.__recommended?.curve === curva;
        const title = curva === 'N/D' ? 'Sem Curva (valor inválido)' : `Curva ${curva}`;
        html += `<h4 class="curve-header">${title} <span class="badge">${arr.length}</span>${isRec?' <span class="recommendation-badge">Recomendada</span>':''}</h4>`;
        html += buildTable(arr);
      });
    }

    resultsContainer.innerHTML = html;

    resultsContainer.querySelectorAll('.btn-show-more').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.table-wrap').querySelectorAll('.rows-extra').forEach(el => { el.hidden = false; });
        const total = btn.closest('.table-wrap').querySelectorAll('tr').length - 1; // minus thead
        btn.closest('.table-wrap').querySelector('.table-count').textContent = `Exibindo ${total} de ${total} registros`;
        btn.remove();
      });
    });

    ensureSuppliersSection();
  }

  /* ---------- card de análise ---------- */
  function renderMarketAnalysisCard(data){
    const el = document.querySelector('#card-analise-mercado');
    if (!el) return;

    if (data.marketAnalysisHtml){
      el.innerHTML = sanitizeHTML(data.marketAnalysisHtml);
      return;
    }

    const stats = data.stats || {};
    const rec   = data.recommended || null;
    const curves= data.curves || { counts: {} };
    const cv = (stats.mean && stats.std) ? ((stats.std / stats.mean) * 100) : null;

    const recHtml = rec?.curve ? `
      <div class="recommendation-inline">
        <span class="recommendation-badge">Recomendada: Curva ${escapeHTML(rec.curve)}</span>
        ${rec.reason ? `<small class="muted">(${escapeHTML(rec.reason)})</small>` : ''}
      </div>` : '';

    el.innerHTML = `
      <div class="analysis-card">
        <div class="analysis-card__title">Análise de Mercado</div>
        ${recHtml}
        <ul class="analysis-kpis">
          <li><span>Média</span><strong>${fmtBRL(stats.mean)}</strong></li>
          <li><span>Mediana</span><strong>${fmtBRL(stats.median)}</strong></li>
          <li><span>CV%</span><strong>${cv!=null ? cv.toFixed(1)+'%' : 'N/D'}</strong></li>
          <li><span>Registros</span><strong>${stats.n ?? 'N/D'}</strong></li>
          <li><span>Outliers</span><strong>${stats.outliersCount ?? 'N/D'}</strong></li>
        </ul>
        <div class="analysis-curves">
          <span>Curvas (A/B/C):</span>
          <strong>${(curves.counts?.A || 0)} / ${(curves.counts?.B || 0)} / ${(curves.counts?.C || 0)}</strong>
        </div>
        ${data.summary ? `<p class="analysis-summary">${escapeHTML(data.summary)}</p>` : ''}
      </div>`;
  }

  /* ---------- ações ---------- */
  function renderActionsRow({ type, code, storeKey }){
    removeGoToAnalysisButton();

    const wrap = document.createElement('div');
    wrap.className = 'actions-row';

    const btnExport = document.createElement('button');
    btnExport.type = 'button';
    btnExport.className = 'submit-button btn-export-xlsx';
    btnExport.textContent = 'Exportar XLSX';
    btnExport.addEventListener('click', async () => {
      try { await ensureXlsxLoaded(); exportXlsx(); } catch (e) { console.error(e); }
    });

    const q = new URLSearchParams({ type, code, storeKey: storeKey || '' });
    const btnAnalyze = document.createElement('a');
    btnAnalyze.className = 'submit-button btn-go-analysis';
    btnAnalyze.href = `${ANALYSIS_URL}?${q.toString()}`;
    btnAnalyze.target = '_self';
    btnAnalyze.rel = 'noopener';
    btnAnalyze.textContent = 'Ir para Análise de Mercado';

    const selItem = (window.__selectedItems || []).find(s => s.codigo === String(code)) || (window.__selectedItems || [])[0];
    const descItem = selItem ? selItem.descricao : '';
    const qEst = new URLSearchParams({ type, code });
    if (descItem) qEst.set('desc', descItem);
    const btnEstat = document.createElement('a');
    btnEstat.className = 'submit-button btn-go-estatistica';
    btnEstat.href = `analise-estatistica.html?${qEst.toString()}`;
    btnEstat.target = '_self';
    btnEstat.rel = 'noopener';
    btnEstat.textContent = 'Detalhamento Estatístico';

    wrap.appendChild(btnExport);
    wrap.appendChild(btnAnalyze);
    wrap.appendChild(btnEstat);
    resultsContainer.appendChild(wrap);
  }
  function removeGoToAnalysisButton(){
    const oldRow = document.querySelector('.actions-row');
    if (oldRow && oldRow.parentNode) oldRow.parentNode.removeChild(oldRow);
    const old = document.querySelector('.go-analysis-wrap');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  /* ---------- filtros opcionais ---------- */
  function coletarFiltrosUI(){
    const uf = document.getElementById('filtro_uf')?.value?.trim();
    const codigoUasg = document.getElementById('filtro_uasg')?.value?.trim();
    const codigoMunicipio = document.getElementById('filtro_municipio')?.value?.trim();
    const filtros = {};
    if (uf) filtros.uf = uf;
    if (codigoUasg) filtros.codigoUasg = codigoUasg;
    if (codigoMunicipio) filtros.codigoMunicipio = codigoMunicipio;
    return filtros;
  }

  /* ---------- seção de fornecedores ---------- */
  function ensureSuppliersSection(){
    let sec = document.getElementById('bloco-fornecedores');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'bloco-fornecedores';
      sec.className = 'suppliers-section';
      sec.innerHTML = `
        <h3 class="suppliers-title">Fornecedores Potenciais</h3>
        <div id="suppliers-loading" class="suppliers-loading hidden">Carregando fornecedores…</div>
        <div id="suppliers-error" class="suppliers-error"></div>
        <div id="suppliers-table"></div>
      `;
      resultsContainer.insertAdjacentElement('afterend', sec);
    }
    return sec.querySelector('#suppliers-table');
  }
  function showSuppliersLoading(){
    const el = document.getElementById('suppliers-loading');
    if (el) el.classList.remove('hidden');
    const er = document.getElementById('suppliers-error');
    if (er) er.textContent = '';
  }
  function hideSuppliersLoading(){
    const el = document.getElementById('suppliers-loading');
    el && el.classList.add('hidden');
  }
  function renderSuppliersError(msg){
    const er = document.getElementById('suppliers-error');
    if (er) er.textContent = msg || 'Erro ao carregar fornecedores.';
  }

  /* ---------- fornecedores (POST + fallback JSONP) ---------- */
  async function buscarFornecedores({ type, code, filtros = {} }) {
    const body = new URLSearchParams({
      action: 'fornecedoresPorCatalogo',
      type, code,
      includeSanctions: '1',
      filtros: JSON.stringify(filtros || {})
    });

    const normalizeReturn = (data) => {
      const lista = Array.isArray(data) ? data
                 : Array.isArray(data?.lista) ? data.lista
                 : (data?.suppliers || data?.items || []);
      const sancIndex = buildSanctionsIndex(data || {}); // não usamos, mas mantido

      // DIAGNÓSTICO
      console.log('[diag] fornecedores:', Array.isArray(lista) ? lista.length : 0);
      console.log('[diag] sancIndex keys:', Object.keys(sancIndex));

      return { lista, sancIndex };
    };

    try {
      const res = await fetch(BACKEND_SUPPLIERS_URL || BACKEND_PRICES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erro buscando fornecedores');
      return normalizeReturn(json.data);
    } catch (err) {
      console.warn('POST falhou (possível CORS). Tentando JSONP…', err);
      const data = await jsonpCall('fornecedoresPorCatalogo', { type, code, filtros, includeSanctions:'1' });
      return normalizeReturn(data);
    }
  }

  // JSONP util genérico (mantido apenas para fornecedores)
  function jsonpCall(action, params) {
    return new Promise((resolve, reject) => {
      const cbName = `__jsonp_cb_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
      const base   = normalizeExecURL(BACKEND_SUPPLIERS_URL || BACKEND_PRICES_URL);
      const search = new URLSearchParams({ action, callback: cbName, _: Date.now() });
      if (params) {
        Object.entries(params).forEach(([k,v]) => {
          search.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        });
      }
      const src = `${base}?${search.toString()}`;

      const script = document.createElement('script');
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout JSONP')); }, 25000);

      function cleanup(){
        clearTimeout(timeout);
        try { delete window[cbName]; } catch(_) { window[cbName] = undefined; }
        script.remove();
      }
      window[cbName] = (resp) => {
        cleanup();
        if (resp && resp.ok) resolve(resp.data);
        else reject(new Error(resp?.error || 'Falha JSONP'));
      };
      script.onerror = () => { cleanup(); reject(new Error('Erro de rede JSONP')); };
      script.src = src;
      document.head.appendChild(script);
    });
  }
  function normalizeExecURL(url) { return url.replace(/\?.*$/,'').replace(/\/exec\/?$/, '/exec'); }

  /* ---------- Tabela de Fornecedores (agora com "Última venda") ---------- */
  function renderListaFornecedores(lista, container, sancIndex) {
    if (!container) return;
    container.onclick = null;

    if (!Array.isArray(lista) || lista.length === 0) {
      container.innerHTML = `<p>Nenhum fornecedor potencial encontrado para este item.</p>`;
      return;
    }

    const rows = lista.map((f) => {
      const nome = (f && f.nome) ? f.nome : '—';
      const cnpjFmt = formatCNPJ(f && f.cnpj) || '—';

      const precoMedio = (typeof f.precoMedio === 'number')
        ? f.precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';

      const cvTxt  = (typeof f.cv === 'number') ? (f.cv * 100).toFixed(1) + '%' : '—';
      const ufs    = (Array.isArray(f.ufs) && f.ufs.length) ? f.ufs.join(', ') : '—';
      const marcas = (Array.isArray(f.marcas) && f.marcas.length) ? f.marcas.join(', ') : '—';
      const score  = (typeof f.score === 'number') ? f.score.toFixed(3) : '—';

      // Coleta robusta para o campo de última venda
      const lastVendaRaw =
        f.lastVenda ?? f.last_venda ?? f.ultimaVenda ?? f.ultima_venda ??
        f.lastSaleDate ?? f.last_sale_date ?? f.lastDate ?? f.last_date ??
        f.lastCompra ?? f.ultimaCompra ?? f.dataUltimaVenda ?? f.data_ultima_venda ?? null;

      const lastVendaTxt = fmtDateBR(lastVendaRaw);

      // UF e ID da compra (se vierem)
      const lastUF = f.lastVendaUF ?? f.last_venda_uf ?? null;
      const lastCompraId = f.lastVendaIdCompra ?? f.last_venda_id_compra ?? f.idUltimaCompra ?? null;

     let ultimaHtml = fmtDateBR(lastVendaRaw);

if (lastCompraId && ultimaHtml !== '—') {
  const idStr = String(lastCompraId).trim();
  const href  = compraUrl(idStr); // deep link ?compra=<id> (com fallback)

  ultimaHtml = `
    <div class="ultima-venda-cell">
      <span>${ultimaHtml}</span>
      <button type="button" class="btn-copy-id"
              data-copy="${escapeHTML(idStr)}"
              title="Copiar ID da compra">📋</button>
      ${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer"
                  title="Abrir acompanhamento desta compra">Abrir</a>` : ''}
    </div>
  `;
}

      const tip = [];
      if (lastUF) tip.push(`UF: ${lastUF}`);
      if (lastCompraId) tip.push(`Compra: ${lastCompraId}`);
      const tipAttr = tip.length ? ` title="${escapeHTML(tip.join(' • '))}"` : '';

      return `
        <tr>
          <td>${escapeHTML(nome)}</td>
          <td>${cnpjFmt}</td>
          <td>${f.amostras ?? 0}</td>
          <td>${precoMedio}</td>
          <td>${cvTxt}</td>
          <td>${ufs}</td>
          <td>${marcas}</td>
          <td><span${tipAttr}>${ultimaHtml}</span></td>
          <td>${score}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="results-table suppliers-table">
        <thead>
          <tr>
            <th>Fornecedor</th><th>CNPJ</th><th>Amostras</th><th>Preço médio</th>
            <th>CV</th><th>UFs</th><th>Marcas</th><th>Última venda</th><th>Score</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Nota explicativa do Score (opcional)
    container.insertAdjacentHTML('beforeend', scoreExplainerHTML());
  }

  /* ---------- utilidades de UI ---------- */
  function clearMessages() {
    const messages = document.querySelectorAll('.success-message, .warning-message, .error-message-global');
    messages.forEach(msg => msg.remove());
  }
  function clearErrors() {
    const errorDivs = document.querySelectorAll('.form-group.error');
    errorDivs.forEach(div => div.classList.remove('error'));
    const errorMessages = document.querySelectorAll('.form-group .error-message');
    errorMessages.forEach(msg => msg.remove());
  }
  function showError(message, element) {
    if (element) {
      element.classList.add('error');
      const errorMsg = document.createElement('small');
      errorMsg.classList.add('error-message');
      errorMsg.textContent = message;
      element.appendChild(errorMsg);
    } else {
      const errorMsg = document.createElement('div');
      errorMsg.classList.add('error-message-global');
      errorMsg.textContent = message;
      form.parentNode.insertBefore(errorMsg, form.nextSibling);
    }
  }
  function sanitizeHTML(html) {
    const t = document.createElement('template');
    t.innerHTML = html || '';
    t.content.querySelectorAll('script').forEach(s => s.remove());
    t.content.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A' && el.hasAttribute('href')) {
        const h = safeURL(el.getAttribute('href'));
        if (h) { el.setAttribute('href', h); el.setAttribute('rel','noopener noreferrer'); el.setAttribute('target','_blank'); }
        else { el.removeAttribute('href'); }
      }
    });
    return t.innerHTML;
  }

// Handler global para botões "copiar ID"
function installCopyHandler(root = document) {
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.btn-copy-id');
    if (!btn) return;
    const txt = btn.getAttribute('data-copy') || '';
    if (!txt) return;

    const ok = () =>
      (btn.textContent = '✔', setTimeout(() => (btn.textContent = '📋'), 1200));

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok).catch(() => {});
    } else {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
      ok();
    }
  });
}
installCopyHandler(document);


  /* ---------- exportação XLSX ---------- */
  function ensureXlsxLoaded(){
    return new Promise((resolve, reject) => {
      if (typeof XLSX !== 'undefined') return resolve();
      const src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => { showError('Não foi possível carregar a biblioteca XLSX. Verifique sua conexão.'); reject(new Error('Falha ao carregar XLSX')); };
      document.head.appendChild(s);
    });
  }
  function exportXlsx(){
    const d = window.__lastData;
    if (!d || !Array.isArray(d.precos) || d.precos.length === 0) { alert('Faça uma pesquisa primeiro para exportar os resultados.'); return; }
    if (typeof XLSX === 'undefined') { alert('Biblioteca XLSX não encontrada.'); return; }

    const wb = XLSX.utils.book_new();
    const stats = d.stats || {};
    const curves = d.curves || { counts: {} };
    const rec = d.recommended || null;

    const resumo = [
      ['Resumo', window.__lastSummary || ''],
      ['Curva recomendada', rec?.curve || 'Nenhuma'],
      ['Motivo', rec?.reason || '—'],
      ['Registros analisados', stats.n ?? 'N/D'],
      ['Média', stats.mean != null ? stats.mean : 'N/D'],
      ['Mediana', stats.median != null ? stats.median : 'N/D'],
      ['P5', stats.p05 != null ? stats.p05 : 'N/D'],
      ['P95', stats.p95 != null ? stats.p95 : 'N/D'],
      ['Outliers', stats.outliersCount ?? 'N/D'],
      ['Curvas (A/B/C)', `${curves.counts?.A || 0}/${curves.counts?.B || 0}/${curves.counts?.C || 0}`]
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    if (d.curveStats) {
      const s = d.curveStats;
      const statsHeader = ['Curva','n','Média','Mediana','Desvio Padrão','CV%'];
      const cvFix = v => (typeof v === 'number' ? Number(v.toFixed(2)) : v);
      const statsRows = [
        ['A', s.A?.n ?? 0, s.A?.mean ?? null, s.A?.median ?? null, s.A?.std ?? null, cvFix(s.A?.cv ?? null) ],
        ['B', s.B?.n ?? 0, s.B?.mean ?? null, s.B?.median ?? null, s.B?.std ?? null, cvFix(s.B?.cv ?? null) ],
        ['C', s.C?.n ?? 0, s.C?.mean ?? null, s.C?.median ?? null, s.C?.std ?? null, cvFix(s.C?.cv ?? null) ],
      ];
      const wsCS = XLSX.utils.aoa_to_sheet([statsHeader, ...statsRows]);
      XLSX.utils.book_append_sheet(wb, wsCS, 'Curvas-Stats');
    }

    const excelDate = iso => { if (!iso) return null; const d = new Date(iso); return isNaN(+d) ? null : d; };
    const header = ['ID Compra','Descrição do Item','Preço Unitário','Quantidade','Data da Compra','Fornecedor','Código UASG','Nome da UASG','Estado','Outlier','Curva','Link Compra'];
    const toRows = arr => arr.map(it => ([ 
      it.idCompra || '', it.descricaoItem || '',
      (typeof it.precoUnitario === 'number' ? it.precoUnitario : null),
      (it.quantidade ?? null), excelDate(it.dataCompra),
      it.nomeFornecedor || '', it.codigoUasg || '', it.nomeUasg || '', it.estado || '',
      it.isOutlier ? 'Sim' : 'Não', it.curva || '', safeURL(it.linkCompra) || ''
    ]));

    const wsAll = XLSX.utils.aoa_to_sheet([header, ...toRows(d.precos)]);
    wsAll['!cols'] = [{wch:12},{wch:60},{wch:14},{wch:12},{wch:14},{wch:32},{wch:12},{wch:28},{wch:10},{wch:10},{wch:8},{wch:24}];
    XLSX.utils.book_append_sheet(wb, wsAll, 'Resultados');

    const groups = { A: [], B: [], C: [], 'N/D': [] };
    d.precos.forEach(p => { const k = (p && typeof p.curva === 'string' && ['A','B','C'].includes(p.curva)) ? p.curva : 'N/D'; groups[k].push(p); });
    ['A','B','C'].forEach(curva => { const arr = groups[curva]; if (!arr || arr.length === 0) return;
      const ws = XLSX.utils.aoa_to_sheet([header, ...toRows(arr)]); ws['!cols'] = wsAll['!cols']; XLSX.utils.book_append_sheet(wb, ws, `Curva ${curva}`); });
    if (groups['N/D'] && groups['N/D'].length) { const wsND = XLSX.utils.aoa_to_sheet([header, ...toRows(groups['N/D'])]); wsND['!cols'] = wsAll['!cols']; XLSX.utils.book_append_sheet(wb, wsND, 'Curva ND'); }

    const ts = new Date(); const yyyy = ts.getFullYear(); const mm = String(ts.getMonth()+1).padStart(2,'0'); const dd = String(ts.getDate()).padStart(2,'0'); const hh = String(ts.getHours()).padStart(2,'0'); const mi = String(ts.getMinutes()).padStart(2,'0');
    const filename = `ZePrecos_${yyyy}${mm}${dd}_${hh}${mi}.xlsx`;
    XLSX.writeFile(wb, filename);
  }
});
