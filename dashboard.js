/* =========================================================
   INVERMAR – Dashboard Pronexo
   Conexión a Google Sheets públicas (CSV) + Charts + Filtros
   ========================================================= */

'use strict';

/* ---- CONFIG ---- */
const SHEET_ID   = '2PACX-1vTbbqo93xR1R3Oiiw1TiC4gNyaaoxoO8fdFXrjZ-31TVjmDdkKcQExDReaLC2d4b7ihilyNzwBoyrZp';
const SHEET_NAME = 'Pronexo';
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 min

/* GViz API: exporta CSV sin necesidad de API key */
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vTbbqo93xR1R3Oiiw1TiC4gNyaaoxoO8fdFXrjZ-31TVjmDdkKcQExDReaLC2d4b7ihiIyNzwBoyrZp/pub?gid=352306540&single=true&output=csv`;

/* ---- COLORES PALETA ---- */
const COLORS = {
  blue900: '#0a2342', blue800: '#1a3a5c', blue700: '#1e4f7a',
  blue600: '#1d6fa4', blue500: '#2196c8', blue400: '#38aede',
  blue300: '#7dcbee', blue100: '#dceffe',
  teal:    '#0e9ca0', indigo: '#4a5fbf',
  green:   '#1faa4c', red:    '#d7263d',
  orange:  '#e67e22'
};

const BAR_PALETTE = [
  COLORS.blue500, COLORS.blue700, COLORS.blue400, COLORS.teal,
  COLORS.indigo,  COLORS.blue800, COLORS.blue300, COLORS.blue600
];

/* ---- STATE ---- */
let allRows        = [];  // array de objetos con todas las filas
let filteredRows   = [];
let chartPersonas  = null;
let chartEmpresas  = null;
let chartAutorizados = null;
let refreshTimer   = null;

/* =========================================================
   UTILS
   ========================================================= */
function normStr(s) {
  return (s || '').toString().trim().toLowerCase();
}

function normalizeAccion(s) {
  return normStr(s).includes('autorizado') && !normStr(s).includes('no') ? 'Autorizado' : 'No Autorizado';
}

/** Extrae el RUT de empresa del campo "Datos de empresa" */
function extractEmpresaRut(datosEmpresa) {
  const str = (datosEmpresa || '').trim();
  // buscamos "Rut: XXXX" o extraemos todo si no encontramos
  const m = str.match(/Rut:\s*([\d.]+[-\dkK])/i);
  if (m) return m[1].toLowerCase().trim();
  // si no hay RUT, usamos el nombre de empresa como clave
  const m2 = str.match(/Empresa:\s*([^R]+)/i);
  if (m2) return m2[1].trim().toLowerCase();
  return str.toLowerCase();
}

/** Obtiene período YYYY-MM a partir del campo Fecha_Formato */
function getPeriodo(row) {
  // Fecha_Formato viene como "2024-01"
  const f = (row['Fecha_Formato'] || '').trim();
  if (/^\d{4}-\d{2}$/.test(f)) return f;
  // fallback: parsear Fecha (D/M/YYYY)
  const raw = (row['Fecha'] || '').trim();
  if (!raw) return '';
  const parts = raw.split('/');
  if (parts.length === 3) {
    const y = parts[2].padStart(4,'0');
    const m = parts[1].padStart(2,'0');
    return `${y}-${m}`;
  }
  // fallback ISO: YYYY-MM-DD
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return '';
}

/** Muestra/oculta overlay de carga */
function setLoading(on, msg = '') {
  const el = document.getElementById('loading-overlay');
  if (on) {
    el.classList.remove('hidden');
    if (msg) document.getElementById('loading-progress').textContent = msg;
  } else {
    el.classList.add('hidden');
  }
}

/** Muestra toast de error */
function showError(msg) {
  const toast = document.getElementById('error-toast');
  document.getElementById('error-msg').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 5000);
}

/** Formatea número con separadores de miles */
function fmt(n) {
  return n.toLocaleString('es-CL');
}

/* =========================================================
   FETCH & PARSE
   ========================================================= */
async function loadData() {
  setLoading(true, 'Conectando con Google Sheets…');
  try {
    setLoading(true, 'Descargando datos de la pestaña Pronexo…');
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    setLoading(true, 'Procesando registros…');
    // PapaParse parsea el CSV
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim()
    });

    if (parsed.errors.length && parsed.data.length === 0) {
      throw new Error('No se pudo parsear el CSV');
    }

    // Normalizar headers: crear mapa insensible a tildes/mayúsculas
    const headers = parsed.meta.fields || [];
    function getField(row, ...candidates) {
      for (const c of candidates) {
        if (row[c] !== undefined && row[c] !== null) return row[c];
      }
      // búsqueda fuzzy sin tildes
      const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      for (const h of headers) {
        for (const c of candidates) {
          if (normalize(h) === normalize(c)) return row[h];
        }
      }
      return '';
    }

    allRows = parsed.data.map(row => {
      const resp = getField(row, 'Respuesta de consulta', 'Respuesta de Consulta');
      // "Autorizado" si el campo resp contiene "autorizado" sin "no"
      const authNorm = normStr(resp);
      let auth;
      if (authNorm.includes('no autorizado') || authNorm === 'no autorizado') {
        auth = 'No Autorizado';
      } else if (authNorm.includes('autorizado')) {
        auth = 'Autorizado';
      } else {
        // fallback: campo vacío = otro, no lo clasificamos
        auth = 'No Autorizado';
      }

      const instalacion = getField(row, 'Instalación', 'Instalacion', 'Instalacion');

      return {
        fecha:            (getField(row, 'Fecha') || '').trim(),
        periodo:          getPeriodo(row),
        hora:             (getField(row, 'Hora') || '').trim(),
        rutPersona:       (getField(row, 'Rut consultado', 'Rut Consultado') || '').trim().toLowerCase(),
        nombreTrabajador: (getField(row, 'Nombre trabajador', 'Nombre Trabajador') || '').trim(),
        instalacion:      instalacion.trim(),
        empresaKey:       extractEmpresaRut(getField(row, 'Datos de empresa', 'Datos de Empresa')),
        empresaNombre:    (getField(row, 'Datos de empresa', 'Datos de Empresa') || '').trim(),
        autorizacion:     auth,
        accion:           (getField(row, 'Acción', 'Accion') || '').trim()
      };
    }).filter(r => r.periodo !== ''); // descartar sin fecha

    // Actualizar timestamp
    const now = new Date();
    document.getElementById('last-update').innerHTML =
      `<i class="fa-regular fa-clock"></i> Actualizado: ${now.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'})}`;

    // Popular filtros
    populateFilters();

    // Aplicar estado actual de filtros
    applyFilters();

    setLoading(false);

  } catch (err) {
    console.error(err);
    setLoading(false);
    showError('Error al cargar los datos. Verifique la conexión o los permisos de la hoja.');
  }
}

/* =========================================================
   FILTROS
   ========================================================= */
function populateFilters() {
  const sel = document.getElementById('filter-instalacion');
  const current = sel.value;

  // Instalaciones únicas ordenadas
  const instals = [...new Set(allRows.map(r => r.instalacion).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas las instalaciones</option>';
  instals.forEach(ins => {
    const opt = document.createElement('option');
    opt.value = ins;
    opt.textContent = ins;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;

  // Rango de fechas
  const periodos = allRows.map(r => r.periodo).filter(Boolean).sort();
  const minP = periodos[0] || '';
  const maxP = periodos[periodos.length - 1] || '';

  const desde = document.getElementById('filter-fecha-desde');
  const hasta  = document.getElementById('filter-fecha-hasta');
  if (!desde.value && minP) desde.value = minP;
  if (!hasta.value  && maxP) hasta.value = maxP;
  desde.min = minP; desde.max = maxP;
  hasta.min = minP; hasta.max = maxP;
}

function applyFilters() {
  const instal = document.getElementById('filter-instalacion').value;
  const desde  = document.getElementById('filter-fecha-desde').value;
  const hasta   = document.getElementById('filter-fecha-hasta').value;

  filteredRows = allRows.filter(r => {
    if (instal && r.instalacion !== instal) return false;
    if (desde  && r.periodo < desde)       return false;
    if (hasta  && r.periodo > hasta)        return false;
    return true;
  });

  updateKPIs();
  updateCharts();
  updateTable();
}

/* =========================================================
   KPIs
   ========================================================= */
function updateKPIs() {
  const totalReg     = filteredRows.length;
  const personasUnicas = new Set(filteredRows.map(r => r.rutPersona).filter(Boolean)).size;
  const empresasUnicas = new Set(filteredRows.map(r => r.empresaKey).filter(Boolean)).size;
  const autorizados  = filteredRows.filter(r => r.autorizacion === 'Autorizado').length;
  const noAutorizados = filteredRows.filter(r => r.autorizacion === 'No Autorizado').length;

  document.getElementById('kpi-val-registros').textContent    = fmt(totalReg);
  document.getElementById('kpi-val-personas').textContent     = fmt(personasUnicas);
  document.getElementById('kpi-val-empresas').textContent     = fmt(empresasUnicas);
  document.getElementById('kpi-val-autorizados').textContent  = fmt(autorizados);
  document.getElementById('kpi-val-no-autorizados').textContent = fmt(noAutorizados);
}

/* =========================================================
   PREPARACIÓN DE DATOS POR MES
   ========================================================= */

/** Agrupa: por cada mes calcula el N° de RUTs únicos (personas únicas) */
function getPersonasPorMes() {
  // { "2024-01": Set<rutPersona> }
  const byMonth = {};
  filteredRows.forEach(r => {
    if (!r.periodo || !r.rutPersona) return;
    if (!byMonth[r.periodo]) byMonth[r.periodo] = new Set();
    byMonth[r.periodo].add(r.rutPersona);
  });
  const meses   = Object.keys(byMonth).sort();
  const valores  = meses.map(m => byMonth[m].size);
  return { meses, valores };
}

/** Agrupa: por cada mes calcula el N° de empresas únicas */
function getEmpresasPorMes() {
  const byMonth = {};
  filteredRows.forEach(r => {
    if (!r.periodo || !r.empresaKey) return;
    if (!byMonth[r.periodo]) byMonth[r.periodo] = new Set();
    byMonth[r.periodo].add(r.empresaKey);
  });
  const meses  = Object.keys(byMonth).sort();
  const valores = meses.map(m => byMonth[m].size);
  return { meses, valores };
}

/** Formatea etiqueta de mes a "Ene 2024" */
function formatMes(periodo) {
  const [y, m] = periodo.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
    .replace('.', '')
    .replace(/^\w/, c => c.toUpperCase());
}

/* =========================================================
   GRÁFICOS
   ========================================================= */

const CHART_DEFAULTS = {
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(10,35,66,.92)',
      titleFont: { family: 'Inter', size: 13, weight: '600' },
      bodyFont:  { family: 'Inter', size: 12 },
      padding: 10,
      cornerRadius: 8
    }
  },
  scales: {
    x: {
      ticks: { font: { family: 'Inter', size: 11 }, color: '#475569' },
      grid:  { display: false }
    },
    y: {
      ticks: { font: { family: 'Inter', size: 11 }, color: '#475569' },
      grid:  { color: '#f1f5f9' },
      beginAtZero: true
    }
  }
};

function buildBarDataLabelsPlugin(color) {
  return {
    id: 'customDataLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, idx) => {
          const val = dataset.data[idx];
          if (val === 0 || val === undefined) return;
          ctx.save();
          ctx.fillStyle = color || '#1a3a5c';
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(val, bar.x, bar.y - 4);
          ctx.restore();
        });
      });
    }
  };
}

function initChartPersonas() {
  const ctx = document.getElementById('chart-personas').getContext('2d');
  chartPersonas = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 6, borderSkipped: false }] },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            title: items => items[0].label,
            label: item => ` ${item.raw} persona${item.raw !== 1 ? 's' : ''} únicas`
          }
        }
      },
      responsive: true,
      maintainAspectRatio: false
    },
    plugins: [buildBarDataLabelsPlugin('#0a2342')]
  });
}

function initChartEmpresas() {
  const ctx = document.getElementById('chart-empresas').getContext('2d');
  chartEmpresas = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 6, borderSkipped: false }] },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            title: items => items[0].label,
            label: item => ` ${item.raw} empresa${item.raw !== 1 ? 's' : ''} únicas`
          }
        }
      },
      responsive: true,
      maintainAspectRatio: false
    },
    plugins: [buildBarDataLabelsPlugin('#1a3a5c')]
  });
}

function initChartAutorizados() {
  const ctx = document.getElementById('chart-autorizados').getContext('2d');

  // Plugin de etiquetas personalizadas para doughnut (valor + porcentaje dentro de cada arco)
  const doughnutLabels = {
    id: 'doughnutLabels',
    afterDatasetsDraw(chart) {
      const { ctx, data } = chart;
      const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
      chart.getDatasetMeta(0).data.forEach((arc, idx) => {
        const val = data.datasets[0].data[idx];
        if (!val || val === 0) return;
        const pct = total ? Math.round((val / total) * 100) : 0;
        // Posición del centroide del arco
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const r = (arc.innerRadius + arc.outerRadius) / 2;
        const x = arc.x + Math.cos(angle) * r;
        const y = arc.y + Math.sin(angle) * r;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmt(val), x, y - 9);
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillText(`${pct}%`, x, y + 9);
        ctx.restore();
      });
    }
  };

  chartAutorizados = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Autorizados', 'No Autorizados'],
      datasets: [{
        data: [0, 0],
        backgroundColor: [COLORS.blue500, COLORS.red],
        borderColor: ['#fff', '#fff'],
        borderWidth: 3,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 12 },
            padding: 20,
            usePointStyle: true,
            pointStyleWidth: 12,
            color: '#475569'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10,35,66,.92)',
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont:  { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: item => {
              const total = item.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((item.raw / total) * 100) : 0;
              return ` ${fmt(item.raw)} registros (${pct}%)`;
            }
          }
        }
      }
    },
    plugins: [doughnutLabels]
  });
}

/* ---- UPDATE CHARTS ---- */
function updateCharts() {
  updateChartPersonas();
  updateChartEmpresas();
  updateChartAutorizados();
}

function updateChartPersonas() {
  const { meses, valores } = getPersonasPorMes();
  const labels = meses.map(formatMes);
  const colors = meses.map((_, i) => BAR_PALETTE[i % BAR_PALETTE.length]);

  chartPersonas.data.labels            = labels;
  chartPersonas.data.datasets[0].data  = valores;
  chartPersonas.data.datasets[0].backgroundColor = colors;
  chartPersonas.update();
}

function updateChartEmpresas() {
  const { meses, valores } = getEmpresasPorMes();
  const labels = meses.map(formatMes);
  // Degradado de azul más claro al más oscuro
  const colors = meses.map((_, i) => {
    const palette2 = [COLORS.teal, COLORS.blue600, COLORS.indigo, COLORS.blue800,
                      COLORS.blue400, COLORS.blue700, COLORS.blue300, COLORS.blue500];
    return palette2[i % palette2.length];
  });

  chartEmpresas.data.labels            = labels;
  chartEmpresas.data.datasets[0].data  = valores;
  chartEmpresas.data.datasets[0].backgroundColor = colors;
  chartEmpresas.update();
}

function updateChartAutorizados() {
  const autorizados   = filteredRows.filter(r => r.autorizacion === 'Autorizado').length;
  const noAutorizados = filteredRows.filter(r => r.autorizacion === 'No Autorizado').length;

  chartAutorizados.data.datasets[0].data = [autorizados, noAutorizados];
  chartAutorizados.update();
}

/* =========================================================
   TABLA RESUMEN POR INSTALACIÓN
   ========================================================= */
function updateTable() {
  const tbody = document.getElementById('table-instalaciones-body');

  // Agrupar por instalación
  const byInstal = {};
  filteredRows.forEach(r => {
    const ins = r.instalacion || '(Sin instalación)';
    if (!byInstal[ins]) byInstal[ins] = { registros: 0, personas: new Set(), empresas: new Set() };
    byInstal[ins].registros++;
    if (r.rutPersona) byInstal[ins].personas.add(r.rutPersona);
    if (r.empresaKey) byInstal[ins].empresas.add(r.empresaKey);
  });

  const instals = Object.keys(byInstal).sort();
  if (instals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">Sin datos para los filtros aplicados</td></tr>';
    return;
  }

  tbody.innerHTML = instals.map(ins => {
    const d = byInstal[ins];
    return `<tr>
      <td title="${ins}">${ins}</td>
      <td>${fmt(d.registros)}</td>
      <td>${fmt(d.personas.size)}</td>
      <td>${fmt(d.empresas.size)}</td>
    </tr>`;
  }).join('');
}

/* =========================================================
   EVENTOS
   ========================================================= */
function onRefresh() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  loadData().finally(() => btn.classList.remove('spinning'));
}

function onApplyFilters() {
  applyFilters();
}

function onClearFilters() {
  document.getElementById('filter-instalacion').value = '';
  // reset fechas a rango completo
  const periodos = allRows.map(r => r.periodo).filter(Boolean).sort();
  document.getElementById('filter-fecha-desde').value = periodos[0] || '';
  document.getElementById('filter-fecha-hasta').value  = periodos[periodos.length - 1] || '';
  applyFilters();
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar gráficos (vacíos)
  initChartPersonas();
  initChartEmpresas();
  initChartAutorizados();

  // Cargar datos
  loadData();

  // Auto-refresh
  refreshTimer = setInterval(onRefresh, AUTO_REFRESH_MS);

  // Eventos
  document.getElementById('btn-refresh').addEventListener('click', onRefresh);
  document.getElementById('btn-apply').addEventListener('click', onApplyFilters);
  document.getElementById('btn-clear').addEventListener('click', onClearFilters);

  // Aplicar filtros al presionar Enter en selects/inputs
  ['filter-instalacion', 'filter-fecha-desde', 'filter-fecha-hasta'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      // solo re-aplica si ya hay datos
      if (allRows.length > 0) applyFilters();
    });
  });
});
