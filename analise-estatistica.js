/* ================================================================
   DETALHAMENTO ESTATÍSTICO — analise-estatistica.js
   ================================================================ */

const AE_GAS_URL  = 'https://script.google.com/macros/s/AKfycbyWO7ROSqDk8YLP3prk20Gj4mGaiQAY3Dmg0l7CBknhf0gg2_UcHqaX6-HbmaCGkpew/exec';
const AE_PAGE_SIZE = 20;

/* ── Estado ── */
let aeState = {
  allRows:     [],
  filtered:    [],
  currentPage: 1,
  sortKey:     'dataCompra',
  sortAsc:     false
};

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const type   = params.get('type') || 'catmat';
  const code   = params.get('code') || '';
  const desc   = params.get('desc') || '';

  if (!code) { showAeError('Código não informado. Volte à cotação e tente novamente.'); return; }

  let loaded = false;

  try {
    const url = AE_GAS_URL + '?' + new URLSearchParams({ action: 'analise', type, code });
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Erro ao processar análise.');
    if (desc) data.item_pesquisado = desc;
    renderAll(data);
    loaded = true;
  } catch (_) {}

  // Fallback: usa dados em cache do localStorage (da busca de preços)
  if (!loaded) {
    const stored = _loadCachedPrecos(type, code);
    if (stored && stored.length) {
      const data = _analiseBrowser(stored, desc);
      renderAll(data);
      loaded = true;
    }
  }

  if (!loaded) {
    showAeError('Não foi possível carregar a análise. Faça uma busca de preços na cotação rápida antes de acessar esta página.');
  }

  document.getElementById('ae-loading').classList.add('hidden');
  document.getElementById('btn-export')?.addEventListener('click', exportPNG);
  document.getElementById('ae-filter')?.addEventListener('input', onFilter);
  setupSortHeaders();
});

/* ── Carrega preços do cache local (gravados por script.js) ── */
function _loadCachedPrecos(type, code) {
  const keys = [
    `ze-precos:last:${type}:${code}`,
    `ze-precos:last:catmat:${code}`
  ];
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const payload = JSON.parse(raw);
      const precos = payload?.data?.precos;
      if (Array.isArray(precos) && precos.length) return precos;
    } catch (_) {}
  }
  // Tenta sessionStorage genérico
  try {
    const raw = sessionStorage.getItem('ze-precos:last');
    if (raw) {
      const payload = JSON.parse(raw);
      if (String(payload?.code) === String(code)) {
        const precos = payload?.data?.precos;
        if (Array.isArray(precos) && precos.length) return precos;
      }
    }
  } catch (_) {}
  return null;
}

/* ── Algoritmo Z-Score no browser (idêntico ao GAS) ── */
function _analiseBrowser(precos, desc) {
  const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const _std  = (a, m) => {
    if (a.length < 2) return 0;
    const avg = m ?? _mean(a);
    return Math.sqrt(a.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / a.length);
  };
  const _pct = (a, p) => {
    if (!a.length) return 0;
    const idx = (p / 100) * (a.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  };

  let validos = precos.filter(p => typeof p.precoUnitario === 'number' && p.precoUnitario > 0);
  const descartados = [];

  for (let iter = 0; iter < 150; iter++) {
    if (validos.length < 3) break;
    const vals  = validos.map(p => p.precoUnitario);
    const mu    = _mean(vals);
    const sigma = _std(vals, mu);
    const cv    = mu > 0 ? (sigma / mu) * 100 : 0;
    if (cv <= 25) break;
    let maxZ = -1, maxIdx = -1;
    for (let i = 0; i < validos.length; i++) {
      const z = sigma > 0 ? Math.abs((validos[i].precoUnitario - mu) / sigma) : 0;
      if (z > maxZ) { maxZ = z; maxIdx = i; }
    }
    if (maxIdx < 0) break;
    const rem = validos.splice(maxIdx, 1)[0];
    rem._z_score = Math.round(maxZ * 100) / 100;
    rem._iteracao = iter + 1;
    rem._cv_antes = Math.round(cv * 10) / 10;
    rem._motivo_descarte = rem.precoUnitario > mu
      ? `Outlier superior (Z-Score ${rem._z_score})`
      : `Outlier inferior (Z-Score ${rem._z_score})`;
    descartados.push(rem);
  }

  const vals   = validos.map(p => p.precoUnitario).sort((a, b) => a - b);
  const mu     = _mean(vals);
  const sigma  = _std(vals, mu);
  const cv     = mu > 0 ? (sigma / mu) * 100 : 0;
  const mediana = vals.length ? _pct(vals, 50) : 0;

  // Histograma
  const histograma = (() => {
    if (!vals.length) return [];
    const min = vals[0], max = vals[vals.length - 1];
    if (min === max) return [{ min, max, count: vals.length, label: fmtBRL(min) }];
    const n = 10, step = (max - min) / n;
    const bins = Array.from({ length: n }, (_, i) => ({
      min: min + i * step, max: min + (i + 1) * step, count: 0,
      label: fmtBRL(min + i * step) + ' – ' + fmtBRL(min + (i + 1) * step)
    }));
    vals.forEach(v => { bins[Math.min(Math.floor((v - min) / step), n - 1)].count++; });
    return bins;
  })();

  const itemDesc = desc || (precos[0] && precos[0].descricaoItem) || 'Item pesquisado';

  return {
    success: true,
    item_pesquisado: itemDesc,
    preco_referencia_estimado: mediana,
    metricas_consolidadas: {
      total_encontrado:          precos.length,
      total_descartado:          descartados.length,
      amostra_valida_N:          validos.length,
      coeficiente_variacao_final: Math.round(cv * 10) / 10,
      media:    mu,
      mediana:  mediana,
      desvio_padrao: sigma
    },
    justificativa_algoritmo:
      `Algoritmo Z-Score iterativo (dados em cache). Removidos ${descartados.length} registro(s). ` +
      `CV final: ${Math.round(cv * 10) / 10}% (limite legal 25%, IN 65/2021).`,
    histograma,
    compras_validas:     validos,
    compras_descartadas: descartados
  };
}

/* ================================================================
   RENDER PRINCIPAL
   ================================================================ */
function renderAll(data) {
  renderCard(data);
  renderHistogram(data.histograma || [], data.metricas_consolidadas);

  aeState.allRows  = data.compras_validas  || [];
  aeState.filtered = aeState.allRows.slice();
  renderTable();

  if ((data.compras_descartadas || []).length) {
    renderDiscarded(data.compras_descartadas);
    document.getElementById('ae-discarded-section').classList.remove('hidden');
  }

  document.getElementById('summary-card').classList.remove('hidden');
  document.getElementById('ae-table-section').classList.remove('hidden');
}

/* ================================================================
   CARD DE RESUMO
   ================================================================ */
function renderCard(data) {
  const m   = data.metricas_consolidadas || {};
  const fBR = (n) => typeof n === 'number' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
  const fN  = (n) => typeof n === 'number' ? n.toLocaleString('pt-BR') : '—';

  setText('ae-item-name',  data.item_pesquisado || '—');
  setText('ae-price-ref',  fBR(data.preco_referencia_estimado));
  setText('cnt-total',     fN(m.total_encontrado));
  setText('cnt-discarded', fN(m.total_descartado));
  setText('cnt-valid',     fN(m.amostra_valida_N));
  setText('cnt-cv',        m.coeficiente_variacao_final != null ? m.coeficiente_variacao_final.toFixed(1) + '%' : '—');
  setText('met-media',     fBR(m.media));
  setText('met-mediana',   fBR(m.mediana));
  setText('met-desvio',    fBR(m.desvio_padrao));

  // Barra de CV
  const cv   = m.coeficiente_variacao_final ?? 0;
  const fill = document.getElementById('ae-cv-fill');
  if (fill) {
    const pct = Math.min(cv / 50 * 100, 100);
    fill.style.width = pct + '%';
    fill.className   = 'ae-cv-fill ' + (cv <= 25 ? 'ae-cv-fill--ok' : 'ae-cv-fill--warn');
  }

  // Justificativa
  const justEl = document.getElementById('ae-justification');
  if (justEl && data.justificativa_algoritmo) {
    justEl.innerHTML =
      `<span class="ae-just-icon">⚖️</span>` +
      `<strong>Justificativa do Algoritmo:</strong> ` +
      escAe(data.justificativa_algoritmo);
  }
}

/* ================================================================
   HISTOGRAMA DE BARRAS (CSS)
   ================================================================ */
function renderHistogram(bins, metricas) {
  const container = document.getElementById('ae-histogram');
  const axisEl    = document.getElementById('ae-histogram-axis');
  if (!container || !bins.length) return;

  const maxCount = Math.max(...bins.map(b => b.count), 1);

  container.innerHTML = bins.map((b, i) => {
    const pct = Math.round((b.count / maxCount) * 100);
    const tip = `${b.label}: ${b.count} registro(s)`;
    return `
      <div class="ae-hist-bar-wrap" title="${escAe(tip)}">
        <div class="ae-hist-bar" style="height:${pct}%" aria-label="${escAe(tip)}">
          ${b.count > 0 ? `<span class="ae-hist-count">${b.count}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  // Eixo x: primeiro, meio e último valor
  if (axisEl && bins.length >= 2) {
    const first = bins[0];
    const last  = bins[bins.length - 1];
    const mid   = bins[Math.floor(bins.length / 2)];
    axisEl.innerHTML =
      `<span>${fmtBRL(first.min)}</span>` +
      `<span>${fmtBRL(mid.min)}</span>` +
      `<span>${fmtBRL(last.max)}</span>`;
  }
}

/* ================================================================
   TABELA PRINCIPAL
   ================================================================ */
function renderTable() {
  const sorted = sortRows(aeState.filtered, aeState.sortKey, aeState.sortAsc);
  const total  = sorted.length;
  const start  = (aeState.currentPage - 1) * AE_PAGE_SIZE;
  const page   = sorted.slice(start, start + AE_PAGE_SIZE);

  const tbody = document.getElementById('ae-table-body');
  if (!tbody) return;

  tbody.innerHTML = page.map(r => {
    const preco = fmtBRL(r.precoUnitario);
    const data  = fmtDate(r.dataCompra);
    const qtd   = typeof r.quantidade === 'number' ? r.quantidade.toLocaleString('pt-BR') : (r.quantidade ?? '—');
    const uf    = r.estado || r.uf || '—';
    const orgao = r.nomeUasg || r.orgao || r.codigoUasg || '—';
    const href  = r.linkCompra || '';

    return `<tr>
      <td class="ae-td-price">${escAe(preco)}</td>
      <td>${escAe(data)}</td>
      <td class="ae-td-num">${escAe(String(qtd))}</td>
      <td>${escAe(r.unidade || r.descricaoItem?.split(' ')[0] || '—')}</td>
      <td><span class="ae-uf-badge">${escAe(uf)}</span></td>
      <td class="ae-td-orgao" title="${escAe(orgao)}">${escAe(orgao)}</td>
      <td class="ae-td-link">${href ? `<a href="${escAe(href)}" target="_blank" rel="noopener noreferrer" class="ae-link-btn" title="Abrir no portal de origem">↗ Acessar</a>` : '—'}</td>
    </tr>`;
  }).join('');

  setText('ae-table-count', `${total.toLocaleString('pt-BR')} registros`);
  renderPagination(total);
  updateSortIcons();
}

function setupSortHeaders() {
  document.querySelectorAll('.ae-data-table th.sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (aeState.sortKey === key) {
        aeState.sortAsc = !aeState.sortAsc;
      } else {
        aeState.sortKey = key;
        aeState.sortAsc = key !== 'precoUnitario'; // preço: desc por padrão
      }
      aeState.currentPage = 1;
      renderTable();
    });
  });
}

function updateSortIcons() {
  document.querySelectorAll('.ae-data-table th.sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.key === aeState.sortKey) {
      icon.textContent = aeState.sortAsc ? '↑' : '↓';
      th.classList.add('sorted');
    } else {
      icon.textContent = '↕';
      th.classList.remove('sorted');
    }
  });
}

function sortRows(rows, key, asc) {
  return rows.slice().sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'dataCompra') { va = va || ''; vb = vb || ''; }
    if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
    va = String(va ?? '').toLowerCase();
    vb = String(vb ?? '').toLowerCase();
    return asc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

/* ── Paginação ── */
function renderPagination(total) {
  const pages   = Math.ceil(total / AE_PAGE_SIZE);
  const current = aeState.currentPage;
  const el      = document.getElementById('ae-pagination');
  if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }

  const mkBtn = (label, page, disabled, active) =>
    `<button class="ae-page-btn${active ? ' active' : ''}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;

  let html = mkBtn('«', 1, current === 1, false);
  html    += mkBtn('‹', current - 1, current === 1, false);

  const range = pageRange(current, pages);
  range.forEach(p => {
    if (p === '…') html += `<span class="ae-page-ellipsis">…</span>`;
    else html += mkBtn(p, p, false, p === current);
  });

  html += mkBtn('›', current + 1, current === pages, false);
  html += mkBtn('»', pages, current === pages, false);
  html += `<span class="ae-page-info">Página ${current} de ${pages}</span>`;

  el.innerHTML = html;
  el.querySelectorAll('.ae-page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      aeState.currentPage = +btn.dataset.page;
      renderTable();
      document.getElementById('ae-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function pageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

/* ── Filtro por texto ── */
function onFilter(e) {
  const q = (e.target.value || '').toLowerCase().trim();
  aeState.filtered = q
    ? aeState.allRows.filter(r =>
        (r.nomeUasg || '').toLowerCase().includes(q) ||
        (r.estado   || '').toLowerCase().includes(q) ||
        (r.descricaoItem || '').toLowerCase().includes(q) ||
        (r.codigoUasg || '').toLowerCase().includes(q)
      )
    : aeState.allRows.slice();
  aeState.currentPage = 1;
  renderTable();
}

/* ================================================================
   TABELA DE DESCARTADOS
   ================================================================ */
function renderDiscarded(rows) {
  const tbody = document.getElementById('ae-discarded-body');
  const badge = document.getElementById('ae-discarded-count');
  if (!tbody) return;

  if (badge) badge.textContent = rows.length.toLocaleString('pt-BR');

  tbody.innerHTML = rows.map(r => {
    const orgao = r.nomeUasg || r.orgao || r.codigoUasg || '—';
    return `<tr class="ae-row-discarded">
      <td class="ae-td-price">${escAe(fmtBRL(r.precoUnitario))}</td>
      <td>${escAe(fmtDate(r.dataCompra))}</td>
      <td><span class="ae-uf-badge ae-uf-badge--grey">${escAe(r.estado || '—')}</span></td>
      <td class="ae-td-orgao" title="${escAe(orgao)}">${escAe(orgao)}</td>
      <td class="ae-td-motivo">${escAe(r._motivo_descarte || '—')}</td>
      <td class="ae-td-iter">${r._iteracao ?? '—'}</td>
    </tr>`;
  }).join('');
}

/* ================================================================
   EXPORTAR PNG (html2canvas)
   ================================================================ */
async function exportPNG() {
  const btn = document.getElementById('btn-export');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando imagem…'; }

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    const card   = document.getElementById('summary-card');
    const canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const link   = document.createElement('a');
    link.download = `analise-estatistica-${Date.now()}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('Não foi possível gerar a imagem: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 Exportar Painel (PNG)'; }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s    = document.createElement('script');
    s.src      = src;
    s.onload   = resolve;
    s.onerror  = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

/* ================================================================
   HELPERS
   ================================================================ */
function fmtBRL(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch (_) { return String(d); }
}

function escAe(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showAeError(msg) {
  document.getElementById('ae-loading')?.classList.add('hidden');
  const el = document.getElementById('ae-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
