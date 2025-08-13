document.addEventListener('DOMContentLoaded', () => { 
  const form = document.querySelector('.price-form');
  const resultsContainer = document.getElementById('results-container');

  const loadingMessage = document.createElement('div');
  loadingMessage.classList.add('loading-message', 'hidden');
  loadingMessage.textContent = 'Aguarde, sua pesquisa está sendo processada...';
  form.parentNode.insertBefore(loadingMessage, form.nextSibling);

  // Botão Exportar XLSX (se existir no HTML)
  const exportBtn = document.getElementById('export-xlsx');
  if (exportBtn) exportBtn.addEventListener('click', exportXlsx);

  // Seu endpoint atual
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxGKxAHwAoy2w5WTd4viQ0SE-JF4amzsW3IPrKg2Zgox6cSv7i-rLmApD2OQ65rogND/exec';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    clearErrors();
    resultsContainer.innerHTML = '';
    window.__lastSummary  = '';
    window.__curveMeta    = null;
    window.__lastData     = null;
    window.__curveStats   = null;
    window.__recommended  = null;

    const catmatCode = document.getElementById('catmat_code').value.trim();
    const catserCode = document.getElementById('catser_code').value.trim();
    
    let isValid = true;
    if (catmatCode.length > 0 && catserCode.length > 0) {
      showError('Preencha somente um dos campos (CATMAT ou CATSER).', document.getElementById('catmat_code').parentNode);
      showError('Preencha somente um dos campos (CATSER).', document.getElementById('catser_code').parentNode);
      isValid = false;
    }
    if (catmatCode.length === 0 && catserCode.length === 0) {
      showError('Preencha pelo menos um dos campos (CATMAT ou CATSER).', document.getElementById('catmat_code').parentNode);
      isValid = false;
    }
    if (!isValid) return;

    const formData = new URLSearchParams();
    if (catmatCode.length > 0) {
      formData.append('catmat_code', catmatCode);
    } else {
      formData.append('catser_code', catserCode);
    }

    loadingMessage.classList.remove('hidden');

    try {
      const response = await fetch(BACKEND_URL, { method: 'POST', body: formData });
      const data = await response.json();

      // Guarda tudo para exportação e render
      window.__lastData    = data;
      window.__lastSummary = data.summary || '';
      window.__curveMeta   = data.curves || null;
      window.__curveStats  = data.curveStats || null;
      window.__recommended = data.recommended || null;

      if (data.success && Array.isArray(data.precos)) {
        displayResults(data.precos);
      } else {
        showError(data.message || 'Sem resultados.');
      }
    } catch (error) {
      console.error('Erro ao enviar o formulário:', error);
      showError('Ocorreu um erro ao conectar com o servidor. Tente novamente mais tarde.');
    } finally {
      loadingMessage.classList.add('hidden');
    }
  });

  // --- Renderização ---
  function displayResults(precos) {
    if (!precos || precos.length === 0) {
      resultsContainer.innerHTML = '<p>Nenhum resultado encontrado.</p>';
      return;
    }

    // Agrupar por curva
    const groups = { A: [], B: [], C: [], 'N/D': [] };
    precos.forEach(p => { groups[p.curva || 'N/D'].push(p); });

    let html = '';

    // Cartão de resumo (se houver)
    if (window.__lastSummary) {
      html += `
        <div class="results-summary">
          <strong>Resumo:</strong> ${escapeHTML(window.__lastSummary)}
        </div>
      `;
    }

    // Cartão de recomendação (se houver)
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

    // Cabeçalho de curvas (metadados)
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

    // Render de cada curva na ordem A, B, C, N/D
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

        const idContent = item.idCompra
          ? (item.linkCompra
              ? `<a href="${item.linkCompra}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.idCompra.toString())}</a>`
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

  // --- Utilidades ---
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

  // Sanitização simples para campos de texto inseridos no HTML
  function escapeHTML(str){
    if (str === null || str === undefined) return '';
    return String(str)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  /* ================== EXPORTAÇÃO XLSX ================== */
  function exportXlsx(){
    const d = window.__lastData;
    if (!d || !Array.isArray(d.precos) || d.precos.length === 0) {
      alert('Faça uma pesquisa primeiro para exportar os resultados.');
      return;
    }
    if (typeof XLSX === 'undefined') {
      alert('Biblioteca XLSX não encontrada. Inclua <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script> no HTML.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet Resumo (+ recomendação)
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

    // Aba de estatísticas por curva (se vier do backend)
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

    const fmtBRL = n => (typeof n === 'number') ? n : (n || null);
    const fmtDate = iso => {
      if (!iso) return null;
      const dt = new Date(iso);
      if (isNaN(+dt)) return iso;
      return dt.toLocaleDateString('pt-BR');
    };

    const header = [
      'ID Compra',
      'Descrição do Item',
      'Preço Unitário',
      'Quantidade',
      'Data da Compra',
      'Fornecedor',
      'Código UASG',
      'Nome da UASG',
      'Estado',
      'Outlier',
      'Curva',
      'Link Compra'
    ];

    const toRows = arr => arr.map(it => ([
      it.idCompra || '',
      it.descricaoItem || '',
      fmtBRL(it.precoUnitario),
      (it.quantidade ?? ''),
      fmtDate(it.dataCompra),
      it.nomeFornecedor || '',
      it.codigoUasg || '',
      it.nomeUasg || '',
      it.estado || '',
      it.isOutlier ? 'Sim' : 'Não',
      it.curva || '',
      it.linkCompra || ''
    ]));

    // Todos os resultados
    const wsAll = XLSX.utils.aoa_to_sheet([header, ...toRows(d.precos)]);
    XLSX.utils.book_append_sheet(wb, wsAll, 'Resultados');

    // Abas por Curva
    const groups = { A: [], B: [], C: [], 'N/D': [] };
    d.precos.forEach(p => groups[p.curva || 'N/D'].push(p));
    ['A','B','C'].forEach(curva => {
      const arr = groups[curva];
      if (!arr || arr.length === 0) return;
      const ws = XLSX.utils.aoa_to_sheet([header, ...toRows(arr)]);
      XLSX.utils.book_append_sheet(wb, ws, `Curva ${curva}`);
    });
    if (groups['N/D'] && groups['N/D'].length) {
      const wsND = XLSX.utils.aoa_to_sheet([header, ...toRows(groups['N/D'])]);
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
