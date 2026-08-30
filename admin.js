/**
 * admin.js — Neuquén Escucha
 * Lógica exclusiva de admin.html (panel gerencial). Usa shared.js: SUPABASE_*,
 * supabaseClient, barriosNeuquen, subcategoriasDict, showToast,
 * populateBarrioSelect, populateProblematicaSelect.
 *
 * Modo prototipo: si no configuraste Supabase todavía (ver shared.js), este panel
 * muestra datos de ejemplo (DEMO_DATA más abajo) y el login acepta cualquier
 * usuario/contraseña — solo para poder mostrar y probar el diseño. Configurá
 * Supabase para usarlo en producción con datos reales y login seguro
 * (ver supabase-schema.sql y el README del repositorio).
 */

// Datos de ejemplo que se muestran SOLO si Supabase no está configurado.
const DEMO_DATA = [
    { id: 1, estado: "valid", tipoPerfil: "Comerciante / Dueño de Negocio", nombre: "Mariano Costa", sexo: "Masculino", edad: 46, barrio: "Área Centro Este", contacto: "2994112233", problematica: "Comercio, Obras Municipales Arbitrarias y Tasas", subproblematica: "Caída drástica de ventas por obras de Bicisendas", nombreComercio: "Calzados Neuquén", impactoObra: "Implementación de Bicisenda sin consulta", detalle: "Perdí el 60% de mis ventas diarias por la bicisenda.", lat: -38.9516, lng: -68.0591 },
    { id: 2, estado: "valid", tipoPerfil: "Propuesta / Idea Vecinal", nombre: "Dra. Elena Gómez", sexo: "Femenino", edad: 39, barrio: "San Lorenzo Norte", contacto: "2994000099", problematica: "Propuesta de Proyecto Vecinal", subproblematica: "Infraestructura y Obras para el Barrio", tituloProyecto: "Paseo Deportivo Necochea", detalle: "Pavimentación con drenaje pluvial, senda peatonal y luces LED.", lat: -38.9431, lng: -68.1095 },
    { id: 3, estado: "valid", tipoPerfil: "Aporte Positivo Vecinal", nombre: "Camila Peralta", sexo: "Femenino", edad: 28, barrio: "Alta Balsa", contacto: "2994881122", problematica: "Valoración Positiva de la Ciudad", subproblematica: "Apoyo a Obras y Espacios Públicos", aspectosPositivos: ["Paseo Costero y Desarrollo de Riberas", "Oferta Cultural, Fiestas y Eventos"], detalle: "Excelente el Paseo Costero.", lat: -38.9350, lng: -68.0800 },
    { id: 4, estado: "valid", tipoPerfil: "Vecino / Ciudadano", nombre: "Juan Pérez", sexo: "Masculino", edad: 38, barrio: "San Lorenzo Norte", contacto: "2994223344", problematica: "Calles, Tránsito y Obras Civiles", subproblematica: "Baches profundos / Asfalto deteriorado", detalle: "Calle Necochea destruida.", lat: -38.9431, lng: -68.1095 },
    { id: 5, estado: "valid", tipoPerfil: "Joven (16 a 30 años)", nombre: "Lucas Varela", sexo: "Masculino", edad: 22, barrio: "Cuenca XV", contacto: "2994778899", problematica: "Educación y Juventud", subproblematica: "Falta de espacios y centros de capacitación juvenil municipal", detalle: "No hay talleres de oficios digitales en la zona oeste.", lat: -38.9320, lng: -68.1250 }
];

let dataStore = [];
let analyticsMap = null, heatmapLayer = null, analyticsMarkersGroup = null;
let chartCatInstance = null, chartPositivosInstance = null, chartMerchantInstance = null, chartDemoInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    try { populateBarrioSelect('filterBarrio', false); } catch (err) { console.error(err); }
    try { populateProblematicaSelect('filterProblematica', false); } catch (err) { console.error(err); }
    try { initAdminEventListeners(); } catch (err) { console.error('Error conectando botones:', err); }
    checkExistingSession();
});

function initAdminEventListeners() {
    const on = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(evt, fn);
    };

    on('btnExportPdf', 'click', exportPDFReport);
    on('btnExportPptx', 'click', exportPPTXReport);
    on('btnLogout', 'click', logoutAdmin);

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

    ['filterEstado', 'filterPerfil', 'filterBarrio', 'filterProblematica', 'filterSexo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyAnalyticsFilters);
    });

    const auditBody = document.getElementById('auditTableBody');
    if (auditBody) {
        auditBody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const id = parseInt(btn.dataset.id, 10);
            changeRecordStatus(id, btn.dataset.action === 'validar' ? 'valid' : 'spam');
        });
    }
}

/* ============ LOGIN ============ */
// Si ya hay una sesión de Supabase activa (o modo prototipo ya validado), entra
// directo al panel sin pedir login de nuevo.
async function checkExistingSession() {
    if (supabaseClient) {
        const { data } = await supabaseClient.auth.getSession();
        if (data && data.session) {
            showDashboard();
            return;
        }
    } else if (sessionStorage.getItem('user_role')) {
        showDashboard();
        return;
    }
    document.getElementById('adminLoginView').style.display = 'flex';
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const errBox = document.getElementById('loginErrorMsg');
    const btn = document.getElementById('btnLoginSubmit');
    errBox.style.display = 'none';
    btn.disabled = true;

    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                errBox.innerText = "Error de autenticación: " + error.message;
                errBox.style.display = 'block';
                return;
            }
            // La tabla "profiles" (ver supabase-schema.sql) guarda el rol de cada
            // usuario. Solo entran quienes tengan un rol autorizado.
            const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', data.user.id).single();
            if (!profile || !['super_admin', 'admin', 'visor'].includes(profile.role)) {
                await supabaseClient.auth.signOut();
                errBox.innerText = "Acceso denegado. Tu usuario no tiene permisos de administración.";
                errBox.style.display = 'block';
                return;
            }
            sessionStorage.setItem('user_role', profile.role);
        } else {
            // Modo prototipo (sin Supabase configurado todavía): cualquier dato entra.
            sessionStorage.setItem('user_role', 'admin');
        }
        showToast("Sesión iniciada correctamente", "success");
        showDashboard();
    } catch (err) {
        errBox.innerText = "Ocurrió un error inesperado al iniciar sesión. Intentá nuevamente.";
        errBox.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
}

async function logoutAdmin() {
    if (supabaseClient) { try { await supabaseClient.auth.signOut(); } catch (err) { /* noop */ } }
    sessionStorage.removeItem('user_role');
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('adminLoginView').style.display = 'flex';
}

function showDashboard() {
    document.getElementById('adminLoginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
    if (!SUPABASE_CONFIGURED) {
        showToast("Modo prototipo: configurá Supabase para usar datos reales.", "info");
    }
    setTimeout(initDashboardAnalytics, 150);
}

/* ============ CARGA DE DATOS ============ */
// Convierte una fila de la tabla de Supabase (columnas en snake_case) al formato
// camelCase que usa el resto del panel.
function mapDbRowToRecord(row) {
    return {
        id: row.id,
        estado: row.estado || 'valid',
        tipoPerfil: row.tipo_perfil,
        nombre: row.nombre,
        sexo: row.sexo,
        edad: row.edad,
        barrio: row.barrio,
        contacto: row.contacto,
        problematica: row.problematica,
        subproblematica: row.subproblematica,
        aspectosPositivos: row.aspectos_positivos || [],
        nombreComercio: row.nombre_comercio,
        ubicacionComercio: row.ubicacion_comercio,
        impactoObra: row.impacto_obra,
        consecuenciaComercial: row.consecuencia_comercial,
        tituloProyecto: row.titulo_proyecto,
        ejeIdea: row.eje_idea,
        porQueProyecto: row.por_que_proyecto,
        detalle: row.detalle,
        lat: row.lat,
        lng: row.lng
    };
}

async function loadDataStore() {
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('registros_vecinales').select('*').order('id');
            if (error) throw error;
            dataStore = (data || []).map(mapDbRowToRecord);
            return;
        } catch (err) {
            console.error('Error cargando datos de Supabase, se muestran datos de ejemplo:', err);
            showToast("No se pudieron cargar los datos reales; mostrando ejemplo.", "error");
        }
    }
    dataStore = DEMO_DATA.slice();
}

async function changeRecordStatus(id, newStatus) {
    const item = dataStore.find(i => i.id === id);
    if (!item) return;
    item.estado = newStatus;

    if (supabaseClient) {
        try {
            await supabaseClient.from('registros_vecinales').update({ estado: newStatus }).eq('id', id);
        } catch (err) {
            console.error('Error actualizando el estado en Supabase:', err);
        }
    }

    applyAnalyticsFilters();
    showToast(newStatus === 'valid' ? `Registro #${id} validado` : `Registro #${id} descartado`, newStatus === 'valid' ? 'success' : 'error');
}

/* ============ MAPA Y GRÁFICOS ============ */
async function initDashboardAnalytics() {
    await loadDataStore();

    if (!analyticsMap) {
        try {
            analyticsMap = L.map('analyticsMapContainer').setView([-38.9516, -68.0591], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(analyticsMap);

            try {
                heatmapLayer = new HeatmapOverlay({ radius: 0.020, maxOpacity: .85, scaleRadius: true, useLocalExtrema: true, latField: 'lat', lngField: 'lng', valueField: 'count' });
                heatmapLayer.addTo(analyticsMap);
            } catch (err) {
                console.error("No se pudo cargar el mapa de calor:", err);
                heatmapLayer = null;
            }
            analyticsMarkersGroup = L.layerGroup().addTo(analyticsMap);
        } catch (err) {
            console.error("No se pudo inicializar el mapa del panel:", err);
            analyticsMap = null; heatmapLayer = null; analyticsMarkersGroup = null;
            const el = document.getElementById('analyticsMapContainer');
            if (el) el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:180px;background:#f1f5f9;color:#64748b;font-size:0.85rem;text-align:center;padding:1rem;">No se pudo cargar el mapa.</div>';
        }
    }
    if (analyticsMap) {
        [100, 350, 800].forEach(ms => setTimeout(() => { if (analyticsMap) analyticsMap.invalidateSize(); }, ms));
    }
    applyAnalyticsFilters();
}

function applyAnalyticsFilters() {
    const fEstado = document.getElementById('filterEstado').value;
    const fPerfil = document.getElementById('filterPerfil').value;
    const fBarrio = document.getElementById('filterBarrio').value;
    const fProblematica = document.getElementById('filterProblematica').value;
    const fSexo = document.getElementById('filterSexo').value;

    let filtered = dataStore.filter(item => {
        if (fEstado !== "TODOS" && item.estado !== fEstado) return false;
        if (fPerfil !== "TODOS" && item.tipoPerfil !== fPerfil) return false;
        if (fBarrio !== "TODOS" && item.barrio !== fBarrio) return false;
        if (fProblematica !== "TODAS" && item.problematica !== fProblematica) return false;
        if (fSexo !== "TODOS" && item.sexo !== fSexo) return false;
        return true;
    });

    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = "";
    const recentRecords = dataStore.slice(-8).reverse();
    if (recentRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Todavía no hay registros cargados.</td></tr>`;
    } else {
        recentRecords.forEach(item => {
            const tr = document.createElement('tr');
            let subContent = item.tituloProyecto || item.problematica;
            if (item.aspectosPositivos && item.aspectosPositivos.length > 0) {
                subContent = "<b>Positivo:</b> " + item.aspectosPositivos.join(", ");
            }
            tr.innerHTML = `
                <td>#${item.id}</td>
                <td><strong>${item.nombre}</strong><br><small>${item.tipoPerfil}</small></td>
                <td>${item.barrio}<br><small>${item.contacto}</small></td>
                <td>${subContent}</td>
                <td><span class="status-badge ${item.estado === 'valid' ? 'status-valid' : 'status-spam'}">${item.estado.toUpperCase()}</span></td>
                <td>
                    <button class="btn-action-sm btn-approve" data-action="validar" data-id="${item.id}">Validar</button>
                    <button class="btn-action-sm btn-discard" data-action="descartar" data-id="${item.id}">Descartar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    const totalCount = filtered.length;
    document.getElementById('kpiTotal').innerText = totalCount;

    const merchants = filtered.filter(i => i.tipoPerfil === "Comerciante / Dueño de Negocio");
    const merchantSeverityRatio = totalCount > 0 ? Math.round((merchants.length / totalCount) * 100) : 0;
    document.getElementById('kpiCommercialSeverity').innerText = merchantSeverityRatio + "%";
    document.getElementById('kpiMerchantsCount').innerText = `${merchants.length} comercios afectados`;

    const ideas = filtered.filter(i => i.tipoPerfil === "Propuesta / Idea Vecinal");
    const ideasRatio = totalCount > 0 ? Math.round((ideas.length / totalCount) * 100) : 0;
    document.getElementById('kpiIdeas').innerText = ideas.length;
    document.getElementById('kpiIdeasRatio').innerText = `${ideasRatio}% del total de aportes`;

    const positivos = filtered.filter(i => i.tipoPerfil === "Aporte Positivo Vecinal");
    const positivosRatio = totalCount > 0 ? Math.round((positivos.length / totalCount) * 100) : 0;
    document.getElementById('kpiPositivos').innerText = positivos.length;
    document.getElementById('kpiPositivosRatio').innerText = `${positivosRatio}% valoraciones positivas`;

    let topBarrio = "-";
    if (totalCount > 0) {
        const bCount = {};
        filtered.forEach(i => bCount[i.barrio] = (bCount[i.barrio] || 0) + 1);
        topBarrio = Object.keys(bCount).reduce((a, b) => bCount[a] > bCount[b] ? a : b);
        document.getElementById('kpiBarrioTop').innerText = topBarrio;
        document.getElementById('kpiBarrioTopCount').innerText = `${bCount[topBarrio]} incidentes en zona`;
    } else {
        document.getElementById('kpiBarrioTop').innerText = "-";
        document.getElementById('kpiBarrioTopCount').innerText = "0 incidentes";
    }

    document.getElementById('iaTextContainer').innerText = totalCount > 0
        ? `Diagnóstico Neuquén IA: Se observa concentración crítica de reclamos en ${topBarrio}. La afectación comercial asciende al ${merchantSeverityRatio}%. Se recomienda planificar mesas de diálogo con frentistas e intensificar obras de pavimentación e iluminación LED prioritariamente en esta zona.`
        : `Diagnóstico Neuquén IA: No hay registros que coincidan con los filtros seleccionados. Ajustá los filtros para ver el diagnóstico estratégico.`;

    const heatPoints = filtered.map(item => ({ lat: item.lat, lng: item.lng, count: 1 }));
    if (heatmapLayer) {
        try { heatmapLayer.setData({ max: 3, data: heatPoints }); }
        catch (err) { console.error("Error actualizando el mapa de calor:", err); }
    }

    analyticsMarkersGroup && analyticsMarkersGroup.clearLayers();
    if (analyticsMarkersGroup) {
        filtered.forEach(item => {
            let colorPin = '#134074';
            if (item.tipoPerfil.includes('Comerciante')) colorPin = '#d90429';
            if (item.tipoPerfil.includes('Idea')) colorPin = '#d97706';
            if (item.tipoPerfil.includes('Positivo')) colorPin = '#16a34a';

            const marker = L.circleMarker([item.lat, item.lng], {
                radius: item.tipoPerfil.includes('Idea') || item.tipoPerfil.includes('Positivo') ? 9 : 7,
                fillColor: colorPin, color: '#fff', weight: 2, fillOpacity: 0.95
            });

            let popup = `<b>${item.nombre}</b> (${item.tipoPerfil})<br><b>Barrio:</b> ${item.barrio}<br>`;
            if (item.tipoPerfil.includes('Idea')) {
                popup += `<b>Proyecto:</b> ${item.tituloProyecto}<br><b>Propuesta:</b> ${item.detalle}`;
            } else if (item.tipoPerfil.includes('Positivo')) {
                popup += `<b>Aspectos que le gustan:</b> ${(item.aspectosPositivos || []).join(', ')}<br><b>Comentario:</b> ${item.detalle}`;
            } else {
                popup += `<b>Área:</b> ${item.problematica}<br><b>Detalle:</b> ${item.detalle}`;
            }
            marker.bindPopup(popup);
            analyticsMarkersGroup.addLayer(marker);
        });
    }

    try { renderCategoryChart(filtered); } catch (err) { console.error("Error en gráfico de categorías:", err); }
    try { renderPositivosChart(filtered); } catch (err) { console.error("Error en gráfico de positivos:", err); }
    try { renderMerchantChart(filtered); } catch (err) { console.error("Error en gráfico de comercios:", err); }
    try { renderDemographicsChart(filtered); } catch (err) { console.error("Error en gráfico de demografía:", err); }
}

function renderCategoryChart(data) {
    const ctx = document.getElementById('chartCategories').getContext('2d');
    const categories = Object.keys(subcategoriasDict);
    const counts = categories.map(cat => data.filter(item => item.problematica === cat).length);
    const ideasCount = data.filter(item => item.tipoPerfil === "Propuesta / Idea Vecinal").length;

    if (chartCatInstance) chartCatInstance.destroy();
    chartCatInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ["Calles", "Comercio", "Plazas", "Seguridad", "Servicios", "Transporte", "Educación", "Limpieza", "Proyectos Ideas"],
            datasets: [{ data: [...counts, ideasCount], backgroundColor: ['#134074','#134074','#134074','#134074','#134074','#134074','#134074','#134074','#d97706'], borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderPositivosChart(data) {
    const ctx = document.getElementById('chartPositivos').getContext('2d');
    const posData = data.filter(i => i.tipoPerfil === "Aporte Positivo Vecinal");
    const posCounts = {};
    posData.forEach(item => (item.aspectosPositivos || []).forEach(asp => posCounts[asp] = (posCounts[asp] || 0) + 1));
    const labels = Object.keys(posCounts);
    const counts = Object.values(posCounts);

    if (chartPositivosInstance) chartPositivosInstance.destroy();
    chartPositivosInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels.length > 0 ? labels : ["Sin datos aún"], datasets: [{ label: 'Votos Positivos', data: counts.length > 0 ? counts : [0], backgroundColor: '#16a34a', borderRadius: 6 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderMerchantChart(data) {
    const ctx = document.getElementById('chartMerchants').getContext('2d');
    const merchantsData = data.filter(i => i.tipoPerfil === "Comerciante / Dueño de Negocio");
    const causes = ["Implementación de Bicisenda sin consulta", "Cambio de sentido de circulación de calle", "Cierre / Obra municipal prolongada sin previo aviso", "Prohibición / Remoción de estacionamiento", "Aumento desmedido de Tasas e Impuestos Municipales"];
    const counts = causes.map(c => merchantsData.filter(i => i.impactoObra === c).length);
    const hasData = counts.some(c => c > 0);

    if (chartMerchantInstance) chartMerchantInstance.destroy();
    chartMerchantInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: hasData ? ["Bicisenda", "Sentido Calle", "Obra Prolongada", "Estacionamiento", "Tasas Municipales"] : ["Sin datos aún"], datasets: [{ data: hasData ? counts : [1], backgroundColor: hasData ? ['#d90429', '#0b2545', '#134074', '#d97706', '#64748b'] : ['#e2e8f0'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderDemographicsChart(data) {
    const ctx = document.getElementById('chartDemographics').getContext('2d');
    const mCount = data.filter(i => i.sexo === "Masculino").length;
    const fCount = data.filter(i => i.sexo === "Femenino").length;
    const oCount = data.filter(i => i.sexo !== "Masculino" && i.sexo !== "Femenino").length;
    const hasData = (mCount + fCount + oCount) > 0;

    if (chartDemoInstance) chartDemoInstance.destroy();
    chartDemoInstance = new Chart(ctx, {
        type: 'pie',
        data: { labels: ["Masculino", "Femenino", "Otro / Prefiero no decir"], datasets: [{ data: hasData ? [mCount, fCount, oCount] : [1, 0, 0], backgroundColor: ['#0b2545', '#0d9488', '#94a3b8'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

/* ============ EXPORTACIÓN PDF Y POWERPOINT ============ */
function exportPDFReport() {
    if (typeof html2pdf === 'undefined') {
        showToast("No se pudo cargar la librería de exportación a PDF (sin conexión).", "error");
        return;
    }
    const element = document.getElementById('reportExportContainer');
    const opt = { margin: [0.4, 0.4, 0.4, 0.4], filename: 'Reporte_Ejecutivo_Neuquen_Escucha.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' } };
    showToast("Generando PDF, un momento...", "info");
    html2pdf().set(opt).from(element).save();
}

function exportPPTXReport() {
    if (typeof PptxGenJS === 'undefined') {
        showToast("No se pudo cargar la librería de exportación a PowerPoint (sin conexión).", "error");
        return;
    }
    const pptx = new PptxGenJS();
    pptx.author = "Neuquén Escucha";
    pptx.company = "Ing. Rubén Fernández Seppi";
    pptx.title = "Informe Ejecutivo de Diagnóstico Vecinal";

    let slide1 = pptx.addSlide();
    slide1.background = { color: "0B2545" };
    slide1.addText("Neuquén Escucha", { x: 1, y: 1.5, fontSize: 36, color: "FFFFFF", bold: true });
    slide1.addText("Informe Ejecutivo de Reclamos Vecinales, Proyectos y Aportes Positivos", { x: 1, y: 2.3, fontSize: 18, color: "94A3B8" });
    slide1.addText("Iniciativa impulsada por el Ing. Rubén Fernández Seppi", { x: 1, y: 3.5, fontSize: 14, color: "D97706", italic: true });

    let slide2 = pptx.addSlide();
    slide2.addText("Resumen de Indicadores Clave", { x: 0.8, y: 0.6, fontSize: 24, color: "0B2545", bold: true });
    const total = document.getElementById('kpiTotal').innerText;
    const severity = document.getElementById('kpiCommercialSeverity').innerText;
    const ideas = document.getElementById('kpiIdeas').innerText;
    const positivos = document.getElementById('kpiPositivos').innerText;

    slide2.addTable([
        [{ text: "Total Registros", options: { bold: true, fill: "F1F5F9" } }, { text: "Afectación Comercial", options: { bold: true, fill: "F1F5F9" } }, { text: "Proyectos Vecinales", options: { bold: true, fill: "F1F5F9" } }, { text: "Aportes Positivos", options: { bold: true, fill: "F1F5F9" } }],
        [total, severity, ideas, positivos]
    ], { x: 0.8, y: 1.5, w: 8.4, colW: [2.1, 2.1, 2.1, 2.1], border: { pt: "1", color: "CBD5E1" } });

    pptx.writeFile({ filename: "Presentacion_Ejecutiva_Neuquen_Escucha.pptx" });
    showToast("PowerPoint generado y descargado", "success");
}
