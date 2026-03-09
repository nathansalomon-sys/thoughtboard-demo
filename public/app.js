/* ── Source metadata ─────────────────────────────────────────────── */
const SOURCE_META = {
  support_ticket: { icon: '🎫', label: 'Support' },
  github:         { icon: '🐙', label: 'GitHub' },
  discord:        { icon: '💬', label: 'Discord' },
  reddit:         { icon: '🔺', label: 'Reddit' },
  twitter:        { icon: '🐦', label: 'Twitter' },
};

/* ── Global state ───────────────────────────────────────────────── */
const state = {
  product:        'all',
  since:          null,   // null = all time | relative string
  sources:        [],     // [] = all | ['discord', ...]
  selectedTheme:  null,
  quoteSentiment: null,
  quoteSources:   [],
  quotesOffset:   0,
  quotesTotal:    0,
};

const QUOTES_PAGE = 20;

/* ── Chart instances ────────────────────────────────────────────── */
let trendChart  = null;
let volumeChart = null;

/* ── URL param builder ──────────────────────────────────────────── */
function buildParams(extras = {}) {
  const p = new URLSearchParams();
  if (state.product !== 'all') p.set('product', state.product);
  if (state.since) p.set('since', state.since);
  for (const s of state.sources) p.append('source', s);
  Object.entries(extras).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') p.set(k, v); });
  return p.toString();
}

function buildQuoteParams() {
  const p = new URLSearchParams();
  if (state.product !== 'all') p.set('product', state.product);
  if (state.since) p.set('since', state.since);
  for (const s of state.quoteSources) p.append('source', s);
  if (state.selectedTheme) p.set('theme', state.selectedTheme);
  if (state.quoteSentiment) p.set('sentiment', state.quoteSentiment);
  p.set('limit', QUOTES_PAGE);
  p.set('offset', state.quotesOffset);
  return p.toString();
}

/* ── API helpers ────────────────────────────────────────────────── */
async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error ${res.status} at ${path}`);
  return res.json();
}

/* ── Gauge rendering ────────────────────────────────────────────── */
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function initGauge() {
  const cx = 100, cy = 100, r = 52;
  // -180° = left (score=-1), 0° = top, +180° = right (score=+1)
  // Map score -1..+1 to angle -90°..+90° in SVG coordinate system
  // Segments: red -90 → -30, amber -30 → +30, green +30 → +90
  document.getElementById('gauge-red').setAttribute('d',   arcPath(cx, cy, r, 180, 240));
  document.getElementById('gauge-amber').setAttribute('d', arcPath(cx, cy, r, 240, 300));
  document.getElementById('gauge-green').setAttribute('d', arcPath(cx, cy, r, 300, 360));
}

function setGaugeScore(score) {
  const group = document.getElementById('gauge-needle-group');
  const text  = document.getElementById('gauge-score-text');
  if (score == null) {
    group.style.transform = 'rotate(0deg)';
    text.textContent = '—';
    return;
  }
  // score -1..+1 → rotation -90°..+90°
  const deg = score * 90;
  group.style.transform = `rotate(${deg}deg)`;
  text.textContent = score.toFixed(2);
}

/* ── Trend chart ────────────────────────────────────────────────── */
function renderTrendChart(data) {
  const ctx = document.getElementById('trend-chart').getContext('2d');
  if (trendChart) trendChart.destroy();

  const labels = data.map(d => d.date);
  const scores = data.map(d => d.score);

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Avg Sentiment',
        data: scores,
        borderColor: '#F48120',
        borderWidth: 2,
        pointRadius: data.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          grad.addColorStop(0, 'rgba(34,197,94,.25)');
          grad.addColorStop(0.5, 'rgba(244,129,32,.05)');
          grad.addColorStop(1, 'rgba(239,68,68,.2)');
          return grad;
        },
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: -1, max: 1,
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { color: '#94a3b8', font: { size: 11 } },
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            zeroLine: {
              type: 'line', yMin: 0, yMax: 0,
              borderColor: 'rgba(0,0,0,.2)',
              borderWidth: 1,
              borderDash: [4, 4],
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const d = data[item.dataIndex];
              return [`Score: ${d.score.toFixed(3)}`, `Count: ${d.count}`];
            },
          },
        },
      },
    },
  });
}

/* ── Volume chart ───────────────────────────────────────────────── */
function renderVolumeChart(data) {
  const ctx = document.getElementById('volume-chart').getContext('2d');
  if (volumeChart) volumeChart.destroy();

  volumeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        label: 'Feedback',
        data: data.map(d => d.count),
        backgroundColor: 'rgba(244,129,32,.6)',
        borderColor: '#F48120',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { color: '#94a3b8', font: { size: 11 } },
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `Count: ${item.raw}`,
          },
        },
      },
    },
  });
}

/* ── Themes list ────────────────────────────────────────────────── */
function renderThemes(themes) {
  const container = document.getElementById('themes-list');
  if (!themes.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px">No themes found</div>';
    return;
  }
  const maxCount = themes[0].count;
  container.innerHTML = themes.map((t, i) => {
    const pct = maxCount > 0 ? (t.count / maxCount) * 100 : 0;
    const barColor = t.dominant_sentiment === 'positive' ? '#22c55e' :
                     t.dominant_sentiment === 'negative' ? '#ef4444' : '#94a3b8';
    const active = state.selectedTheme === t.theme ? 'active' : '';
    return `
      <div class="theme-row ${active}" data-theme="${escHtml(t.theme)}">
        <span class="theme-rank">${i + 1}</span>
        <span class="theme-name" title="${escHtml(t.theme)}">${escHtml(t.theme)}</span>
        <div class="theme-bar-wrap">
          <div class="theme-bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span class="theme-count">${t.count}</span>
        <span class="sentiment-badge ${t.dominant_sentiment}">${t.dominant_sentiment}</span>
      </div>`;
  }).join('');

  container.querySelectorAll('.theme-row').forEach(row => {
    row.addEventListener('click', () => {
      const theme = row.dataset.theme;
      if (state.selectedTheme === theme) {
        clearTheme();
      } else {
        state.selectedTheme = theme;
        state.quotesOffset = 0;
        showQuoteBoard();
        loadQuotes(false);
        renderThemes(themes); // re-render to update active state
      }
    });
  });
}

/* ── Stats rendering ────────────────────────────────────────────── */
function renderStats(data) {
  // Total
  const totalEl = document.querySelector('#stat-total .stat-value');
  totalEl.classList.remove('skeleton');
  totalEl.textContent = data.total.toLocaleString();

  // Change %
  const changeEl = document.querySelector('#stat-change .stat-value');
  changeEl.classList.remove('skeleton');
  if (data.change_pct == null) {
    changeEl.textContent = '—';
    changeEl.className = 'stat-value';
  } else {
    const arrow = data.change_pct >= 0 ? '▲' : '▼';
    changeEl.textContent = `${arrow} ${Math.abs(data.change_pct)}%`;
    changeEl.className = `stat-value ${data.change_pct >= 0 ? 'stat-change-pos' : 'stat-change-neg'}`;
  }

  // Themes
  const themesEl = document.querySelector('#stat-themes .stat-value');
  themesEl.classList.remove('skeleton');
  themesEl.textContent = data.active_themes.toLocaleString();
}

/* ── Source filter ──────────────────────────────────────────────── */
function buildSourceCheckboxes(containerId, stateKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = Object.entries(SOURCE_META).map(([key, meta]) => `
    <label class="source-check">
      <input type="checkbox" value="${key}" />
      <span>${meta.icon}</span>
      <span>${meta.label}</span>
    </label>`).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = [...container.querySelectorAll('input:checked')].map(i => i.value);
      state[stateKey] = checked;
      if (stateKey === 'sources') {
        refresh();
      } else {
        state.quotesOffset = 0;
        loadQuotes(false);
      }
    });
  });
}

/* ── Quote board ────────────────────────────────────────────────── */
function showQuoteBoard() {
  document.getElementById('quotes-empty-state').classList.add('hidden');
  document.getElementById('quotes-board').classList.remove('hidden');
  document.getElementById('quotes-theme-label').textContent = state.selectedTheme;
}

function clearTheme() {
  state.selectedTheme = null;
  state.quotesOffset  = 0;
  document.getElementById('quotes-board').classList.add('hidden');
  document.getElementById('quotes-empty-state').classList.remove('hidden');
  // clear active state in themes list
  document.querySelectorAll('.theme-row.active').forEach(r => r.classList.remove('active'));
}

function renderQuoteCard(q) {
  const meta = SOURCE_META[q.source] || { icon: '📝', label: q.source };
  const urgencyClass = (q.urgency_label || 'low').toLowerCase();
  return `
    <div class="quote-card">
      <div class="quote-meta">
        <span class="source-icon">${meta.icon}</span>
        <span class="source-name">${meta.label}</span>
        <span>·</span>
        <span>@${escHtml(q.user_handle)}</span>
      </div>
      <div class="quote-text">"${escHtml(q.content)}"</div>
      <div class="quote-footer">
        <span class="quote-theme-tag">${escHtml(q.theme)}</span>
        <span class="urgency-badge ${urgencyClass}">${escHtml(q.urgency_label || 'low')}</span>
        <span class="sentiment-dot ${q.sentiment}" title="${q.sentiment}"></span>
      </div>
    </div>`;
}

async function loadQuotes(append = false) {
  if (!state.selectedTheme) return;

  const qs = buildQuoteParams();
  const data = await apiFetch(`/api/quotes?${qs}`);
  const list = document.getElementById('quotes-list');

  if (!append) {
    list.innerHTML = '';
  }

  if (!data.quotes.length && !append) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px">No quotes found</div>';
    document.getElementById('quotes-load-more-wrap').classList.add('hidden');
    return;
  }

  list.insertAdjacentHTML('beforeend', data.quotes.map(renderQuoteCard).join(''));
  state.quotesOffset += data.quotes.length;
  state.quotesTotal   = data.total;

  const loadMoreWrap = document.getElementById('quotes-load-more-wrap');
  if (state.quotesOffset < state.quotesTotal) {
    loadMoreWrap.classList.remove('hidden');
  } else {
    loadMoreWrap.classList.add('hidden');
  }
}

/* ── Main refresh ───────────────────────────────────────────────── */
async function refresh() {
  const qs = buildParams();

  // Reset stat skeletons
  ['#stat-total .stat-value', '#stat-change .stat-value', '#stat-themes .stat-value'].forEach(sel => {
    const el = document.querySelector(sel);
    el.textContent = '—';
    el.classList.add('skeleton');
  });

  const [statsData, sentimentData, volumeData, themesData] = await Promise.all([
    apiFetch(`/api/stats?${qs}`),
    apiFetch(`/api/sentiment?${qs}`),
    apiFetch(`/api/volume?${qs}`),
    apiFetch(`/api/themes?${qs}`),
  ]);

  renderStats(statsData);
  setGaugeScore(sentimentData.overall);
  renderTrendChart(sentimentData.trend);
  renderVolumeChart(volumeData.volume);
  renderThemes(themesData.themes);

  // If a theme is selected, reload quotes under new filters
  if (state.selectedTheme) {
    state.quotesOffset = 0;
    loadQuotes(false);
  }
}

/* ── Init ───────────────────────────────────────────────────────── */
async function init() {
  initGauge();
  buildSourceCheckboxes('source-checkboxes', 'sources');
  buildSourceCheckboxes('quote-source-checkboxes', 'quoteSources');

  // Load products for dropdown
  const { products } = await apiFetch('/api/products');
  const productSelect = document.getElementById('product-select');
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.product;
    opt.textContent = productLabel(p.product) + ` (${p.count})`;
    productSelect.appendChild(opt);
  });

  productSelect.addEventListener('change', () => {
    state.product = productSelect.value;
    state.selectedTheme = null;
    state.quotesOffset  = 0;
    document.getElementById('quotes-board').classList.add('hidden');
    document.getElementById('quotes-empty-state').classList.remove('hidden');
    refresh();
  });

  document.getElementById('time-select').addEventListener('change', (e) => {
    const val = e.target.value;
    state.since = val === 'all' ? null : val;
    state.quotesOffset = 0;
    refresh();
  });

  document.getElementById('quotes-clear-btn').addEventListener('click', clearTheme);

  document.getElementById('quote-sentiment-select').addEventListener('change', (e) => {
    state.quoteSentiment = e.target.value || null;
    state.quotesOffset   = 0;
    loadQuotes(false);
  });

  document.getElementById('quotes-load-more').addEventListener('click', () => {
    loadQuotes(true);
  });

  // Deep Dive
  const deepdiveBtn = document.getElementById('deepdive-btn');
  deepdiveBtn.addEventListener('click', runDeepDive);
  document.getElementById('deepdive-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runDeepDive();
  });

  await refresh();
}

/* ── Deep Dive ──────────────────────────────────────────────────── */
async function runDeepDive() {
  const query = document.getElementById('deepdive-query').value.trim();
  if (!query) return;

  const btn = document.getElementById('deepdive-btn');
  const responseEl = document.getElementById('deepdive-response');

  btn.disabled = true;
  btn.textContent = '…';
  responseEl.classList.remove('hidden');
  responseEl.innerHTML = '<div style="color:var(--text-muted)">Thinking…</div>';

  try {
    const res = await fetch('/api/deep-dive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        product: state.product !== 'all' ? state.product : undefined,
        since: state.since || undefined,
      }),
    });
    const data = await res.json();

    if (data.error) {
      responseEl.innerHTML = `<div style="color:var(--negative)">${escHtml(data.error)}</div>`;
    } else {
      const meta = data.context
        ? `<div class="response-meta">Based on ${data.context.total} feedback items · avg sentiment ${data.context.avg_score != null ? data.context.avg_score.toFixed(2) : '—'}</div>`
        : '';
      responseEl.innerHTML = meta + escHtml(data.response);
    }
  } catch (err) {
    responseEl.innerHTML = `<div style="color:var(--negative)">Error: ${escHtml(String(err))}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ask →';
  }
}

/* ── Helpers ────────────────────────────────────────────────────── */
function productLabel(slug) {
  return { 'workers-ai': 'Workers AI', 'd1': 'D1', 'workflows': 'Workflows' }[slug] || slug;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Boot ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
