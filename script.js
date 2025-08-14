document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.price-form');
  const resultsContainer = document.getElementById('results-container');

  if (!form || !resultsContainer) {
    console.error('Form (.price-form) ou #results-container não encontrados.');
    return;
  }

  const loadingMessage = document.createElement('div');
  loadingMessage.classList.add('loading-message', 'hidden');
  loadingMessage.textContent = 'Aguarde, sua pesquisa está sendo processada...';
  form.parentNode.insertBefore(loadingMessage, form.nextSibling);

  // URL da sua página de Análise de Mercado
  const ANALYSIS_URL = 'analise-mercado.html';

  // Endpoint do GAS
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxGKxAHwAoy2w5WTd4viQ0SE-JF4amzsW3IPrKg2Zgox6cSv7i-rLmApD2OQ65rogND/exec';

  // Controle para cancelar requisições em voo
  let inflightCtrl = null;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Cancela chamada anterior (se houver)
    if (inflightCtrl) inflightCtrl.abort();
    inflightCtrl = new AbortController();

    clearMessages();
    clearErrors();
    resultsContainer.innerHTML = '';

    // limpa estados
    window.__lastSummary  = '';
    window.__curveMeta    = null;
    window.__lastData     = null;
    window.__curveStats   = null;
    window.__recommended  = null;

    // remove botões anteriores (análise + export)
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
    if (!isValid) {
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }

    const formData = new URLSearchParams();
    const type = catmatCode ? 'catmat' : 'catser';
    const code = catmatCode || catserCode;

    if (type === 'catmat') formData.append('catmat_code', code);
    else formData.append('catser_code', code);

    loadingMessage.classList.remove('hidden');

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: formData,
        signal: inflightCtrl.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Guarda tudo para exportação e render
      window.__lastData    = data;
      window.__lastSummary = data.summary || '';
      window.__curveMeta   = data.curves || null;
      window.__curveStats  = data.curveStats || null;
      window.__recommended = data.recommended || null;

      // sucesso somente com pelo menos um registro (tabela visível)
      if (data.success && Array.isArray(data.precos) && data.precos.length > 0) {
        displayResults(data.precos);

        // salva contexto da última pesquisa em sessionStorage e localStorage (compartilha entre abas)
        const payload = { ts: Date.now(), type, code, data };
        const storeKey = `ze-precos:last:${type}:${code}`;
        sessionStorage.setItem('ze-precos:last', JSON.stringify(payload));
        try { localStorage.setItem(storeKey, JSON.stringify(payload)); } catch (_) {}

        // Atualiza card de análise (mesma página), se existir
        renderMarketAnalysisCard(data);

        // Cria os botões (Exportar XLSX + Ir para Análise) ao final da tabela
        renderActionsRow({ type, code, storeKey });
      } else {
        showError(data.message || 'Sem resultados.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Erro ao enviar o formulário:', error);
        showError('Ocorreu um erro ao conectar com o servidor. Tente novamente mais tarde.');
      }
    } finally {
      loadingMessage.classList.add('hidden');
      if (btnSubmit) btnSubmit.disabled = false;
      inflightCtrl = null;
    }
  });

  // ---------- Render tabela ----------
  function displayResults(precos) {
    if (!precos || precos.length === 0) {
      resultsContainer.innerHTML = '<p>Nenhum resultado encontrado.</p>';
      return;
    }

    const groups = { A: [], B: [], C: [], 'N/D': [] };
    precos.forEach(p => {
      const k = (p && typeof p.curva === 'string' && ['A','B','C'].includes(p.curva)) ? p.curva : 'N/D';
      groups[k].push(p);
    });

    let html = '';

    if (window.__lastSummary) {
      html += `
        <div class="results-summary" aria-live="polite">
          <strong>Resumo:</strong> ${escapeHTML(window.__lastSummary)}
        </div>
      `;
    }

    if (window.__recommended && window.__recommended.curve) {
      const rec = window.__recommended;
      const cvTxt = (rec.stats?.cv != null) ? `${Number(rec.stats.cv).toFixed(1)}%` : 'N/D';
      const nTxt  = (rec.stats?.n  != null) ? rec.stats.n : 'N/D';

      html += `
        <div class="recommendation-card">
          <div class="recommendation-icon">★</div>
          <div class="recommendation-content">
            <strong>Curva recomendada:</strong> Curva <b>${escapeHTML(rec.curve)}</b>
            <span class="recommendation-badge">Recomendada</span>
            <div class="recommendation-meta">
              <span><b>Critérios:</b> CV ≤ 25% e ≥ 3 contratações</span>
              <span class="dot">•</span>
              <span><b>Métricas:</b> CV ${cvTxt}, n=${nTxt}</span>
              ${rec.reason ? `<span class="dot">•</span><span><b>Motivo:</b> ${escapeHTML(rec.reason)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    const meta = window.__curveMeta;
    if (meta && typeof meta.t1 === 'number' && typeof meta.t2 === 'number') {
      const t1 = meta.t1.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
      const t2 = meta.t2.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
      html += `
        <div class="curve-meta">
          <span><strong>Curva A</strong>: ≤ ${t1}</span>
          <span><strong>Curva B</strong>: entre ${t1} e ${t2}</span>
          <span><strong>Curva C</strong>: > ${t2}</span>
        </div>
      `;
    }

    ['A','B','C','N/D'].forEach(curva => {
      const arr = groups[curva];
      if (!arr || arr.length === 0) return;

      const isRec = window.__recommended && window.__recommended.curve === curva;
      const title = curva === 'N/D' ? 'Sem Curva (valor inválido)' : `Curva ${curva}`;
      html += `<h4 class="curve-header">${title} <span class="badge">${arr.length}</span>${isRec ? ' <span class="recommendation-badge">Recomendada</span>' : ''}</h4>`;

      html += `
        <table class="results-table">
          <thead>
            <tr>
              <th>ID Compra</th>
              <th>Descrição do Item</th>
              <th>Preço Unitário</th>
              <th>Quantidade</th>
              <th>Data da Compra</th>
              <th>Fornecedor</th>
              <th>Código UASG</th>
              <th>Nome da UASG</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
      `;

      arr.forEach(item => {
        const precoUnitario = (typeof item.precoUnitario === 'number')
          ? item.precoUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : (item.precoUnitario || 'N/A');

        const dataCompra = item.dataCompra
          ? new Date(item.dataCompra).toLocaleDateString('pt-BR')
          : 'N/A';

        const isOut = !!item.isOutlier;
        const trClass = isOut ? ' class="outlier-row"' : '';
        const titleRow = isOut ? ' title="Valor fora do padrão (outlier)"' : '';

        const href = item.linkCompra ? safeURL(item.linkCompra) : null;
        const idContent = item.idCompra
          ? (href
              ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.idCompra.toString())}</a>`
              : `${escapeHTML(item.idCompra.toString())}`)
          : 'N/A';

        html += `<tr${trClass}${titleRow}>`;
        html += `<td>${idContent}<span class="tag-curve">${escapeHTML(item.curva || 'N/D')}</span></td>`;
        html += `<td>${escapeHTML(item.descricaoItem || 'N/A')}${isOut ? ' <span class="tag-outlier">🚩 Outlier</span>' : ''}</td>`;
        html += `<td>${precoUnitario}</td>`;
        html += `<td>${(item.quantidade ?? 'N/A')}</td>`;
        html += `<td>${dataCompra}</td>`;
        html += `<td>${escapeHTML(item.nomeFornecedor || 'N/A')}</td>`;
        html += `<td>${escapeHTML(item.codigoUasg || 'N/A')}</td>`;
        html += `<td>${escapeHTML(item.nomeUasg || 'N/A')}</td>`;
        html += `<td>${escapeHTML(item.estado || 'N/A')}</td>`;
        html += `</tr>`;
      });

      html += `</tbody></table>`;
    });

    resultsContainer.innerHTML = html;
  }

  // ---------- Card "Análise de Mercado" (na mesma página, se existir) ----------
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
      </div>
    `;
  }

  // ---------- Botões (Exportar + Análise) ----------
  function renderActionsRow({ type, code, storeKey }){
    removeGoToAnalysisButton(); // evita duplicar

    const wrap = document.createElement('div');
    wrap.className = 'actions-row';

    // Botão Exportar XLSX (herda estilo do seu botão base; ajuste classe se quiser)
    const btnExport = document.createElement('button');
    btnExport.type = 'button';
    btnExport.className = 'submit-button btn-export-xlsx';
    btnExport.textContent = 'Exportar XLSX';
    btnExport.addEventListener('click', async () => {
      try {
        await ensureXlsxLoaded();
        exportXlsx();
      } catch (e) {
        console.error(e);
      }
    });

    // Botão Ir para Análise
    const q = new URLSearchParams({ type, code, storeKey: storeKey || '' });
    const btnAnalyze = document.createElement('a');
    btnAnalyze.className = 'submit-button btn-go-analysis';
    btnAnalyze.href = `${ANALYSIS_URL}?${q.toString()}`;
    btnAnalyze.target = '_self';
    btnAnalyze.rel = 'noopener';
    btnAnalyze.textContent = 'Ir para Análise de Mercado';

    // ordem: Exportar | Análise (ajuste se preferir)
    wrap.appendChild(btnExport);
    wrap.appendChild(btnAnalyze);
    resultsContainer.appendChild(wrap);
  }

  // remove antigo container (compatível com versões anteriores)
  function removeGoToAnalysisButton(){
    const oldRow = document.querySelector('.actions-row');
    if (oldRow && oldRow.parentNode) oldRow.parentNode.removeChild(oldRow);
    const old = document.querySelector('.go-analysis-wrap');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  // ---------- Utilidades ----------
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

  function escapeHTML(str){
    if (str === null || str === undefined) return '';
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
    return String(str).replace(/[&<>"']/g, ch => map[ch]);
  }

  function fmtBRL(n){
    if (typeof n !== 'number' || !isFinite(n)) return 'N/D';
    return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
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
        if (h) {
          el.setAttribute('href', h);
          el.setAttribute('rel','noopener noreferrer');
          el.setAttribute('target','_blank');
        } else {
          el.removeAttribute('href');
        }
      }
      if (el.tagName === 'IMG' && el.hasAttribute('src')) {
        const src = el.getAttribute('src');
        const ok = /^https?:/i.test(src) || src.startsWith('/') || src.startsWith('./');
        if (!ok) el.removeAttribute('src');
        el.setAttribute('loading','lazy');
        el.setAttribute('decoding','async');
      }
    });
    return t.innerHTML;
  }

  // Carrega SheetJS caso não esteja presente
  function ensureXlsxLoaded(){
    return new Promise((resolve, reject) => {
      if (typeof XLSX !== 'undefined') return resolve();
      const src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => {
        showError('Não foi possível carregar a biblioteca XLSX. Verifique sua conexão.');
        reject(new Error('Falha ao carregar XLSX'));
      };
      document.head.appendChild(s);
    });
  }

  /* ================== EXPORTAÇÃO XLSX ================== */
  function exportXlsx(){
    const d = window.__lastData;
    if (!d || !Array.isArray(d.precos) || d.precos.length === 0) {
      alert('Faça uma pesquisa primeiro para exportar os resultados.');
      return;
    }
    if (typeof XLSX === 'undefined') {
      alert('Biblioteca XLSX não encontrada.');
      return;
    }

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
        ['A', s.A?.n ?? 0, s.A?.mean ?? null, s.A?.median ?? null, s.A?.std ?? null, cvFix(s.A?.cv ?? null)],
        ['B', s.B?.n ?? 0, s.B?.mean ?? null, s.B?.median ?? null, s.B?.std ?? null, cvFix(s.B?.cv ?? null)],
        ['C', s.C?.n ?? 0, s.C?.mean ?? null, s.C?.median ?? null, s.C?.std ?? null, cvFix(s.C?.cv ?? null)],
      ];
      const wsCS = XLSX.utils.aoa_to_sheet([statsHeader, ...statsRows]);
      XLSX.utils.book_append_sheet(wb, wsCS, 'Curvas-Stats');
    }

    // datas/números em tipos nativos
    const excelDate = iso => {
      if (!iso) return null;
      const d = new Date(iso);
      return isNaN(+d) ? null : d;
    };

    const header = [
      'ID Compra','Descrição do Item','Preço Unitário','Quantidade','Data da Compra',
      'Fornecedor','Código UASG','Nome da UASG','Estado','Outlier','Curva','Link Compra'
    ];

    const toRows = arr => arr.map(it => ([
      it.idCompra || '',
      it.descricaoItem || '',
      (typeof it.precoUnitario === 'number' ? it.precoUnitario : null),
      (it.quantidade ?? null),
      excelDate(it.dataCompra),
      it.nomeFornecedor || '',
      it.codigoUasg || '',
      it.nomeUasg || '',
      it.estado || '',
      it.isOutlier ? 'Sim' : 'Não',
      it.curva || '',
      safeURL(it.linkCompra) || ''
    ]));

    const wsAll = XLSX.utils.aoa_to_sheet([header, ...toRows(d.precos)]);
    wsAll['!cols'] = [
      {wch:12},{wch:60},{wch:14},{wch:12},{wch:14},
      {wch:32},{wch:12},{wch:28},{wch:10},{wch:10},{wch:8},{wch:24}
    ];
    XLSX.utils.book_append_sheet(wb, wsAll, 'Resultados');

    const groups = { A: [], B: [], C: [], 'N/D': [] };
    d.precos.forEach(p => {
      const k = (p && typeof p.curva === 'string' && ['A','B','C'].includes(p.curva)) ? p.curva : 'N/D';
      groups[k].push(p);
    });

    ['A','B','C'].forEach(curva => {
      const arr = groups[curva];
      if (!arr || arr.length === 0) return;
      const ws = XLSX.utils.aoa_to_sheet([header, ...toRows(arr)]);
      ws['!cols'] = wsAll['!cols'];
      XLSX.utils.book_append_sheet(wb, ws, `Curva ${curva}`);
    });

    if (groups['N/D'] && groups['N/D'].length) {
      const wsND = XLSX.utils.aoa_to_sheet([header, ...toRows(groups['N/D'])]);
      wsND['!cols'] = wsAll['!cols'];
      XLSX.utils.book_append_sheet(wb, wsND, 'Curva ND');
    }

    const ts = new Date();
    const yyyy = ts.getFullYear();
    const mm = String(ts.getMonth()+1).padStart(2,'0');
    const dd = String(ts.getDate()).padStart(2,'0');
    const hh = String(ts.getHours()).padStart(2,'0');
    const mi = String(ts.getMinutes()).padStart(2,'0');
    const filename = `ZePrecos_${yyyy}${mm}${dd}_${hh}${mi}.xlsx`;

    XLSX.writeFile(wb, filename);
  }
});
