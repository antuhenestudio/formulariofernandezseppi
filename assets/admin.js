/**
 * admin.js — Neuquén Escucha
 * Lógica del Panel Administrativo y Tablero Gerencial.
 */

let allRecords = [];
let filteredRecords = [];
let selectedRegistroId = null;
let currentAdminUser = null;

// Instancias de gráficos
let chartCategoriesInst = null;
let chartPositivosInst = null;
let chartMerchantsInst = null;
let chartDemographicsInst = null;

// Instancia del Mapa de Calor
let heatmapMap = null;
let heatmapLayer = null;

document.addEventListener('DOMContentLoaded', () => {
    initAdminApp();
});

async function initAdminApp() {
    initEventListeners();
    checkAuthSession();
}

function initEventListeners() {
    const on = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(evt, fn);
    };

    on('loginForm', 'submit', handleAdminLogin);
    on('btnLogout', 'click', handleAdminLogout);

    // Filtros generales y temporales
    ['filterEstado', 'filterPerfil', 'filterBarrio', 'filterProblematica', 'filterSexo', 'filterFechaDesde', 'filterFechaHasta'].forEach(id => {
        on(id, 'change', applyFiltersAndRender);
    });

    on('filterPeriodoRapido', 'change', handlePeriodoRapidoChange);

    // Exportación
    on('btnExportPdf', 'click', exportToPDF);
    on('btnExportPptx', 'click', exportToPPTX);

    // Modales
    on('btnCloseDetailModal', 'click', closeDetailModal);
    on('btnDeleteCitizen', 'click', promptDeleteConfirmation);
    on('btnCancelDelete', 'click', closeConfirmDeleteModal);
    on('btnConfirmDelete', 'click', executeDeleteCitizen);
}

/* ================= AUTENTICACIÓN SUPABASE ================= */
async function checkAuthSession() {
    if (!supabaseClient) {
        showLoginView();
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            currentAdminUser = session.user;
            showDashboardView();
            loadDashboardData();
        } else {
            showLoginView();
        }
    } catch (err) {
        console.error('Error verificando sesión:', err);
        showLoginView();
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorBox = document.getElementById('loginErrorMsg');

    if (errorBox) errorBox.style.display = 'none';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        currentAdminUser = data.user;
        showDashboardView();
        loadDashboardData();
        showToast('Sesión iniciada correctamente', 'success');
    } catch (err) {
        console.error('Error de autenticación:', err);
        if (errorBox) {
            errorBox.textContent = 'Credenciales inválidas o no autorizadas.';
            errorBox.style.display = 'block';
        }
    }
}

async function handleAdminLogout() {
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
    currentAdminUser = null;
    showLoginView();
    showToast('Sesión cerrada', 'info');
}

function showLoginView() {
    document.getElementById('adminLoginView').style.display = 'flex';
    document.getElementById('dashboardView').style.display = 'none';
}

function showDashboardView() {
    document.getElementById('adminLoginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
}

/* ================= CARGA DE DATOS Y FILTROS TEMPORALES ================= */
async function loadDashboardData() {
    try {
        let { data, error } = await supabaseClient
            .from('registros_vecinales')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            console.warn('Fallo orden por ID, ejecutando consulta genérica:', error);
            const fallback = await supabaseClient.from('registros_vecinales').select('*');
            if (fallback.error) throw fallback.error;
            data = fallback.data;
        }

        allRecords = data || [];
        populateFilterDropdowns();
        applyFiltersAndRender();
    } catch (err) {
        console.error('Error cargando registros:', err);
        showToast('Error al obtener datos de Supabase', 'error');
    }
}

function populateFilterDropdowns() {
    const barrioSelect = document.getElementById('filterBarrio');
    const probSelect = document.getElementById('filterProblematica');

    if (barrioSelect && barrioSelect.options.length <= 1) {
        const barrios = [...new Set(allRecords.map(r => r.barrio).filter(Boolean))].sort();
        barrios.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b; opt.textContent = b;
            barrioSelect.appendChild(opt);
        });
    }

    if (probSelect && probSelect.options.length <= 1) {
        const probs = [...new Set(allRecords.map(r => r.problematica).filter(Boolean))].sort();
        probs.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p; opt.textContent = p;
            probSelect.appendChild(opt);
        });
    }
}

function handlePeriodoRapidoChange(e) {
    const val = e.target.value;
    const desdeInput = document.getElementById('filterFechaDesde');
    const hastaInput = document.getElementById('filterFechaHasta');
    const hoy = new Date();

    if (!desdeInput || !hastaInput) return;

    if (val === 'TODOS') {
        desdeInput.value = '';
        hastaInput.value = '';
    } else if (val === 'HOY') {
        const iso = hoy.toISOString().split('T')[0];
        desdeInput.value = iso;
        hastaInput.value = iso;
    } else if (val === '7_DIAS') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        desdeInput.value = d.toISOString().split('T')[0];
        hastaInput.value = hoy.toISOString().split('T')[0];
    } else if (val === '30_DIAS') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        desdeInput.value = d.toISOString().split('T')[0];
        hastaInput.value = hoy.toISOString().split('T')[0];
    } else if (val === 'ESTE_MES') {
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        desdeInput.value = inicioMes.toISOString().split('T')[0];
        hastaInput.value = hoy.toISOString().split('T')[0];
    } else if (val === 'MES_ANTERIOR') {
        const inicioMesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        const finMesAnt = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
        desdeInput.value = inicioMesAnt.toISOString().split('T')[0];
        hastaInput.value = finMesAnt.toISOString().split('T')[0];
    } else if (val === 'ESTE_ANO') {
        const inicioAno = new Date(hoy.getFullYear(), 0, 1);
        desdeInput.value = inicioAno.toISOString().split('T')[0];
        hastaInput.value = hoy.toISOString().split('T')[0];
    }

    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    const estado = document.getElementById('filterEstado')?.value || 'TODOS';
    const perfil = document.getElementById('filterPerfil')?.value || 'TODOS';
    const barrio = document.getElementById('filterBarrio')?.value || 'TODOS';
    const problematica = document.getElementById('filterProblematica')?.value || 'TODAS';
    const sexo = document.getElementById('filterSexo')?.value || 'TODOS';

    const fechaDesde = document.getElementById('filterFechaDesde')?.value;
    const fechaHasta = document.getElementById('filterFechaHasta')?.value;

    filteredRecords = allRecords.filter(r => {
        if (estado !== 'TODOS' && r.estado !== estado) return false;
        if (perfil !== 'TODOS' && r.tipo_perfil !== perfil) return false;
        if (barrio !== 'TODOS' && r.barrio !== barrio) return false;
        if (problematica !== 'TODAS' && r.problematica !== problematica) return false;
        if (sexo !== 'TODOS' && r.sexo !== sexo) return false;

        if (r.created_at) {
            const regFecha = r.created_at.split('T')[0];
            if (fechaDesde && regFecha < fechaDesde) return false;
            if (fechaHasta && regFecha > fechaHasta) return false;
        }

        return true;
    });

    renderKPIs();
    renderAuditTable();
    renderCharts();
    renderHeatmap();
    generateIADiagnosis();
}

/* ================= RENDERS DE LA TABLA Y MODAL DE DETALLE ================= */
function renderAuditTable() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    if (filteredRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay registros que coincidan con los filtros aplicados.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredRecords.map(r => {
        const statusClass = r.estado === 'valid' ? 'status-valid' : 'status-spam';
        const statusText = r.estado === 'valid' ? 'VALID' : (r.estado === 'spam' ? 'SPAM' : 'REVISIÓN');
        
        let detalleTexto = r.problematica || r.titulo_proyecto || '-';
        if (r.aspectos_positivos && Array.isArray(r.aspectos_positivos) && r.aspectos_positivos.length > 0) {
            detalleTexto = r.aspectos_positivos.join(', ');
        }

        return `
            <tr onclick="openCitizenDetailModal('${r.id}')" style="cursor: pointer;" title="Haz clic para ver el detalle completo">
                <td>#${String(r.id).slice(-4)}</td>
                <td>
                    <strong style="color: var(--primary); font-size: 0.95rem; text-decoration: underline;">${escapeHtml(r.nombre || 'Anónimo')}</strong><br>
                    <small style="color: var(--text-muted); font-weight: 600;">${escapeHtml(r.tipo_perfil || 'Vecino')}</small>
                </td>
                <td>
                    ${escapeHtml(r.barrio || '-')}<br>
                    <small style="color: var(--text-muted);">${escapeHtml(r.contacto || '-')}</small>
                </td>
                <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml(detalleTexto)}
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td onclick="event.stopPropagation();">
                    <button type="button" class="btn-action-sm btn-approve" onclick="updateRecordStatus('${r.id}', 'valid')">Validar</button>
                    <button type="button" class="btn-action-sm btn-discard" onclick="updateRecordStatus('${r.id}', 'spam')">Descartar</button>
                </td>
            </tr>
        `;
    }).join('');
}

function openCitizenDetailModal(id) {
    // Búsqueda flexible comparando id como String para asegurar coincidencia
    const r = allRecords.find(item => String(item.id) === String(id));
    if (!r) {
        console.error('No se encontró el registro con ID:', id);
        return;
    }

    selectedRegistroId = id;

    document.getElementById('modalCiudadanoNombre').textContent = r.nombre || 'Sin Nombre';
    document.getElementById('modalCiudadanoPerfil').textContent = r.tipo_perfil || 'Vecino / Ciudadano';
    document.getElementById('modalCiudadanoEdadSexo').textContent = `${r.edad || '-'} años · ${r.sexo || '-'}`;
    document.getElementById('modalCiudadanoBarrio').textContent = r.barrio || '-';
    document.getElementById('modalCiudadanoContacto').textContent = r.contacto || '-';
    document.getElementById('modalCiudadanoCoords').textContent = `Lat: ${r.lat || '-'}, Lng: ${r.lng || '-'}`;
    document.getElementById('modalCiudadanoDetalle').textContent = r.detalle || 'Sin descripción detallada.';

    // Botón de WhatsApp Directo
    const cleanPhone = (r.contacto || '').replace(/\D/g, '');
    const wsMsg = encodeURIComponent(`Hola ${r.nombre || 'vecino'}, te contactamos desde Neuquén Escucha respecto a tu aporte registrado.`);
    const btnWs = document.getElementById('btnWsDirect');
    if (btnWs) btnWs.href = `https://wa.me/549${cleanPhone}?text=${wsMsg}`;

    // Sección Comercio
    const boxComercio = document.getElementById('boxComercio');
    if (r.nombre_comercio || r.ubicacion_comercio) {
        boxComercio.style.display = 'block';
        document.getElementById('modalComercioNombre').textContent = r.nombre_comercio || '-';
        document.getElementById('modalComercioUbicacion').textContent = r.ubicacion_comercio || '-';
        document.getElementById('modalComercioImpacto').textContent = r.impacto_obra || '-';
        document.getElementById('modalComercioConsecuencia').textContent = r.consecuencia_comercial || '-';
    } else {
        boxComercio.style.display = 'none';
    }

    // Sección Proyecto / Idea
    const boxProyecto = document.getElementById('boxProyecto');
    if (r.titulo_proyecto || r.eje_idea) {
        boxProyecto.style.display = 'block';
        document.getElementById('modalProyectoTitulo').textContent = r.titulo_proyecto || '-';
        document.getElementById('modalProyectoEje').textContent = r.eje_idea || '-';
        document.getElementById('modalProyectoPorQue').textContent = r.por_que_proyecto || '-';
    } else {
        boxProyecto.style.display = 'none';
    }

    // Visor Webview de Archivos Adjuntos
    const mediaContainer = document.getElementById('mediaViewerContainer');
    const boxAdjuntos = document.getElementById('boxAdjuntos');
    mediaContainer.innerHTML = '';

    if (Array.isArray(r.archivos) && r.archivos.length > 0) {
        boxAdjuntos.style.display = 'block';
        r.archivos.forEach((fileObj, idx) => {
            const fileUrl = typeof fileObj === 'string' ? fileObj : (fileObj.path || fileObj.url || '');
            const fileName = typeof fileObj === 'object' && fileObj.nombre ? fileObj.nombre : `Adjunto_${idx+1}`;
            const ext = fileUrl.split('.').pop().toLowerCase().split('?')[0];

            let mediaHtml = '';
            if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
                mediaHtml = `
                    <div class="media-card">
                        <div class="media-preview-box">
                            <img src="${fileUrl}" alt="${fileName}">
                        </div>
                        <div class="media-actions">
                            <span><i class="fas fa-image"></i> ${fileName}</span>
                            <a href="${fileUrl}" target="_blank" download class="btn-download-file">
                                <i class="fas fa-download"></i> Descargar Imagen
                            </a>
                        </div>
                    </div>
                `;
            } else if (['mp4', 'webm', 'mov'].includes(ext)) {
                mediaHtml = `
                    <div class="media-card">
                        <div class="media-preview-box">
                            <video src="${fileUrl}" controls preload="metadata"></video>
                        </div>
                        <div class="media-actions">
                            <span><i class="fas fa-video"></i> ${fileName}</span>
                            <a href="${fileUrl}" target="_blank" download class="btn-download-file">
                                <i class="fas fa-download"></i> Descargar Video
                            </a>
                        </div>
                    </div>
                `;
            } else if (ext === 'pdf') {
                mediaHtml = `
                    <div class="media-card">
                        <div class="media-preview-box">
                            <iframe src="${fileUrl}"></iframe>
                        </div>
                        <div class="media-actions">
                            <span><i class="fas fa-file-pdf"></i> ${fileName}</span>
                            <a href="${fileUrl}" target="_blank" download class="btn-download-file">
                                <i class="fas fa-file-pdf"></i> Descargar PDF
                            </a>
                        </div>
                    </div>
                `;
            } else {
                mediaHtml = `
                    <div class="media-card">
                        <div class="media-actions">
                            <span><i class="fas fa-paperclip"></i> ${fileName}</span>
                            <a href="${fileUrl}" target="_blank" download class="btn-download-file">
                                <i class="fas fa-download"></i> Descargar Archivo
                            </a>
                        </div>
                    </div>
                `;
            }
            mediaContainer.innerHTML += mediaHtml;
        });
    } else {
        boxAdjuntos.style.display = 'none';
    }

    // Despliegue del modal con garantía de clase activa e inserción de estilo
    const modalEl = document.getElementById('detailModal');
    if (modalEl) {
        modalEl.classList.add('active');
        modalEl.style.display = 'flex';
    }
}

function closeDetailModal() {
    const modalEl = document.getElementById('detailModal');
    if (modalEl) {
        modalEl.classList.remove('active');
        modalEl.style.display = 'none';
    }
}

function promptDeleteConfirmation() {
    const confirmEl = document.getElementById('confirmDeleteModal');
    if (confirmEl) {
        confirmEl.classList.add('active');
        confirmEl.style.display = 'flex';
    }
}

function closeConfirmDeleteModal() {
    const confirmEl = document.getElementById('confirmDeleteModal');
    if (confirmEl) {
        confirmEl.classList.remove('active');
        confirmEl.style.display = 'none';
    }
}

async function executeDeleteCitizen() {
    if (!selectedRegistroId) return;

    try {
        const { error } = await supabaseClient
            .from('registros_vecinales')
            .delete()
            .eq('id', selectedRegistroId);

        if (error) throw error;

        closeConfirmDeleteModal();
        closeDetailModal();

        showToast('Ciudadano y sus datos eliminados con éxito', 'success');
        loadDashboardData();
    } catch (err) {
        console.error('Error al eliminar registro:', err);
        showToast('No se pudo eliminar el registro', 'error');
    }
}

async function updateRecordStatus(id, newStatus) {
    try {
        const { error } = await supabaseClient
            .from('registros_vecinales')
            .update({ estado: newStatus })
            .eq('id', id);

        if (error) throw error;

        showToast(`Registro #${String(id).slice(-4)} actualizado a ${newStatus.toUpperCase()}`, 'success');
        loadDashboardData();
    } catch (err) {
        console.error('Error actualizando estado:', err);
        showToast('Error al actualizar el estado', 'error');
    }
}

/* ================= RENDERS KPIS Y GRÁFICOS ================= */
function renderKPIs() {
    const total = filteredRecords.length;
    document.getElementById('kpiTotal').textContent = total;

    // Comerciantes
    const merchants = filteredRecords.filter(r => r.tipo_perfil && r.tipo_perfil.includes('Comerciante'));
    const merchantPct = total > 0 ? ((merchants.length / total) * 100).toFixed(1) : 0;
    document.getElementById('kpiCommercialSeverity').textContent = `${merchantPct}%`;
    document.getElementById('kpiMerchantsCount').textContent = `${merchants.length} comercios afectados`;

    // Ideas
    const ideas = filteredRecords.filter(r => r.tipo_perfil && r.tipo_perfil.includes('Idea'));
    const ideasPct = total > 0 ? ((ideas.length / total) * 100).toFixed(1) : 0;
    document.getElementById('kpiIdeas').textContent = ideas.length;
    document.getElementById('kpiIdeasRatio').textContent = `${ideasPct}% del total de aportes`;

    // Positivos
    const positivos = filteredRecords.filter(r => r.tipo_perfil && r.tipo_perfil.includes('Positivo'));
    const posPct = total > 0 ? ((positivos.length / total) * 100).toFixed(1) : 0;
    document.getElementById('kpiPositivos').textContent = positivos.length;
    document.getElementById('kpiPositivosRatio').textContent = `${posPct}% valoraciones positivas`;

    // Barrio Top
    const barrioCounts = {};
    filteredRecords.forEach(r => {
        if (r.barrio) barrioCounts[r.barrio] = (barrioCounts[r.barrio] || 0) + 1;
    });
    let topBarrio = '-';
    let maxCount = 0;
    for (const [b, c] of Object.entries(barrioCounts)) {
        if (c > maxCount) {
            maxCount = c;
            topBarrio = b;
        }
    }
    document.getElementById('kpiBarrioTop').textContent = topBarrio;
    document.getElementById('kpiBarrioTopCount').textContent = `${maxCount} registros en zona`;
}

function renderCharts() {
    // 1. Categorías
    const catCounts = {};
    filteredRecords.forEach(r => {
        const cat = r.problematica || r.eje_idea || 'Sin Categoría';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    const ctxCat = document.getElementById('chartCategories');
    if (ctxCat) {
        if (chartCategoriesInst) chartCategoriesInst.destroy();
        chartCategoriesInst = new Chart(ctxCat, {
            type: 'bar',
            data: {
                labels: Object.keys(catCounts),
                datasets: [{
                    label: 'Registros',
                    data: Object.values(catCounts),
                    backgroundColor: '#134074'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 2. Aspectos Positivos
    const posCounts = {};
    filteredRecords.forEach(r => {
        if (Array.isArray(r.aspectos_positivos)) {
            r.aspectos_positivos.forEach(p => {
                posCounts[p] = (posCounts[p] || 0) + 1;
            });
        }
    });
    const ctxPos = document.getElementById('chartPositivos');
    if (ctxPos) {
        if (chartPositivosInst) chartPositivosInst.destroy();
        chartPositivosInst = new Chart(ctxPos, {
            type: 'doughnut',
            data: {
                labels: Object.keys(posCounts),
                datasets: [{
                    data: Object.values(posCounts),
                    backgroundColor: ['#10b981', '#0284c7', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 3. Impacto Comercial
    const merchCounts = {};
    filteredRecords.filter(r => r.impacto_obra).forEach(r => {
        merchCounts[r.impacto_obra] = (merchCounts[r.impacto_obra] || 0) + 1;
    });
    const ctxMerch = document.getElementById('chartMerchants');
    if (ctxMerch) {
        if (chartMerchantsInst) chartMerchantsInst.destroy();
        chartMerchantsInst = new Chart(ctxMerch, {
            type: 'pie',
            data: {
                labels: Object.keys(merchCounts),
                datasets: [{
                    data: Object.values(merchCounts),
                    backgroundColor: ['#ef4444', '#f97316', '#eab308', '#06b6d4']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 4. Demografía
    const demoCounts = { '16-25': 0, '26-40': 0, '41-60': 0, '60+': 0 };
    filteredRecords.forEach(r => {
        const edad = r.edad || 0;
        if (edad >= 16 && edad <= 25) demoCounts['16-25']++;
        else if (edad >= 26 && edad <= 40) demoCounts['26-40']++;
        else if (edad >= 41 && edad <= 60) demoCounts['41-60']++;
        else if (edad > 60) demoCounts['60+']++;
    });
    const ctxDemo = document.getElementById('chartDemographics');
    if (ctxDemo) {
        if (chartDemographicsInst) chartDemographicsInst.destroy();
        chartDemographicsInst = new Chart(ctxDemo, {
            type: 'bar',
            data: {
                labels: Object.keys(demoCounts),
                datasets: [{
                    label: 'Vecinos por Edad',
                    data: Object.values(demoCounts),
                    backgroundColor: '#0d9488'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function renderHeatmap() {
    const container = document.getElementById('analyticsMapContainer');
    if (!container) return;

    if (!heatmapMap) {
        heatmapMap = L.map('analyticsMapContainer').setView([-38.9516, -68.0591], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(heatmapMap);

        const config = {
            "radius": 0.008,
            "maxOpacity": .8,
            "scaleRadius": true,
            "useLocalExtrema": true,
            latField: 'lat',
            lngField: 'lng',
            valueField: 'count'
        };
        heatmapLayer = new HeatmapOverlay(config);
        heatmapMap.addLayer(heatmapLayer);
    }

    const points = filteredRecords
        .filter(r => r.lat && r.lng)
        .map(r => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lng), count: 1 }));

    heatmapLayer.setData({ max: 5, data: points });
}

function generateIADiagnosis() {
    const iaBox = document.getElementById('iaTextContainer');
    if (!iaBox) return;

    if (filteredRecords.length === 0) {
        iaBox.textContent = 'Sin datos suficientes para generar un diagnóstico.';
        return;
    }

    const topBarrio = document.getElementById('kpiBarrioTop').textContent;
    const total = filteredRecords.length;
    const merchants = filteredRecords.filter(r => r.tipo_perfil && r.tipo_perfil.includes('Comerciante')).length;

    iaBox.innerHTML = `Prioridad de intervención detectada en el barrio <strong>${topBarrio}</strong> con mayor concentración de reclamos. Se registra un <strong>${((merchants/total)*100).toFixed(1)}%</strong> de afectación directa sobre el sector comercial por obras o tasas. Se recomienda priorizar mesas de trabajo viales y proyectos participativos de espacio público en esta zona.`;
}

/* ================= EXPORTACIÓN PROFESIONAL PDF / PPTX ================= */
async function exportToPDF() {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        showToast("Error: No se encontró la librería jsPDF.", "error");
        return;
    }

    showToast("Generando Informe Ejecutivo PDF...", "info");

    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let currentY = 15;

    const PRIMARY_COLOR = [11, 37, 69];
    const BG_LIGHT = [248, 249, 250];
    const TEXT_DARK = [33, 37, 41];

    function drawHeader() {
        doc.setFillColor(...PRIMARY_COLOR);
        doc.rect(0, 0, pageWidth, 22, "F");

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("NEUQUÉN ESCUCHA", margin, 12);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("INFORME EJECUTIVO DE AUDITORÍA Y TERRITORIO", margin, 17);

        const dateStr = new Date().toLocaleDateString("es-AR", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
        doc.text(`Fecha de emisión: ${dateStr}`, pageWidth - margin, 14, { align: "right" });
    }

    function drawFooter(pageNumber, totalPages) {
        doc.setDrawColor(220, 224, 230);
        doc.setLineWidth(0.5);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

        doc.setTextColor(100, 110, 120);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Documento Oficial de Auditoría Interna — Ley N° 25.326 Protección de Datos Personales", margin, pageHeight - 7);
        doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: "right" });
    }

    // PÁGINA 1
    drawHeader();
    currentY = 32;

    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Resumen Ejecutivo y Métricas de Auditoría", margin, currentY);
    currentY += 8;

    doc.setFillColor(...BG_LIGHT);
    doc.setDrawColor(220, 224, 230);
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 16, 2, 2, "FD");

    const fEstado = document.getElementById("filterEstado")?.value || "TODOS";
    const fPerfil = document.getElementById("filterPerfil")?.value || "TODOS";
    const fBarrio = document.getElementById("filterBarrio")?.value || "TODOS";
    const fDesde = document.getElementById("filterFechaDesde")?.value || "Histórico";
    const fHasta = document.getElementById("filterFechaHasta")?.value || "Hoy";

    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", "bold");
    doc.text("Segmentación Aplicada:", margin + 4, currentY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(`Estado: ${fEstado} | Perfil: ${fPerfil} | Barrio: ${fBarrio}`, margin + 4, currentY + 11);
    doc.text(`Período: ${fDesde} al ${fHasta}`, pageWidth - margin - 4, currentY + 11, { align: "right" });
    currentY += 22;

    const iaText = document.getElementById("iaTextContainer")?.innerText || "Sin diagnóstico disponible.";
    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(199, 210, 254);
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 22, 2, 2, "FD");

    doc.setTextColor(30, 27, 75);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("DIAGNÓSTICO ESTRATÉGICO Y CRITICIDAD DE ZONA", margin + 4, currentY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const splitIA = doc.splitTextToSize(iaText, pageWidth - (margin * 2) - 8);
    doc.text(splitIA, margin + 4, currentY + 12);
    currentY += 28;

    const totalReg = filteredRecords.length;
    const mercCount = filteredRecords.filter(r => r.tipo_perfil && r.tipo_perfil.includes("Comerciante")).length;
    const ideasCount = filteredRecords.filter(r => r.tipo_perfil && r.tipo_perfil.includes("Idea")).length;
    const posCount = filteredRecords.filter(r => r.tipo_perfil && r.tipo_perfil.includes("Positivo")).length;
    const topBarrio = document.getElementById("kpiBarrioTop")?.innerText || "-";

    const kpiBoxes = [
        { title: "TOTAL REGISTROS", val: `${totalReg}`, sub: "Registros Auditados" },
        { title: "AFECT. COMERCIAL", val: `${totalReg > 0 ? ((mercCount/totalReg)*100).toFixed(1) : 0}%`, sub: `${mercCount} comercios` },
        { title: "PROYECTOS VECINALES", val: `${ideasCount}`, sub: "Ideas de mejora" },
        { title: "VALORACIÓN POSITIVA", val: `${posCount}`, sub: "Aportes vecinos" },
        { title: "ZONA CRÍTICA TOP", val: topBarrio, sub: "Barrio con más casos" }
    ];

    const boxWidth = (pageWidth - (margin * 2) - (4 * 3)) / 5;
    kpiBoxes.forEach((kpi, i) => {
        const xPos = margin + (i * (boxWidth + 3));
        doc.setFillColor(...PRIMARY_COLOR);
        doc.rect(xPos, currentY, boxWidth, 2, "F");

        doc.setFillColor(...BG_LIGHT);
        doc.rect(xPos, currentY + 2, boxWidth, 18, "F");
        doc.setDrawColor(220, 224, 230);
        doc.rect(xPos, currentY, boxWidth, 20, "D");

        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 110, 120);
        doc.text(kpi.title, xPos + (boxWidth / 2), currentY + 6, { align: "center" });

        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text(kpi.val, xPos + (boxWidth / 2), currentY + 12, { align: "center" });

        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 130, 140);
        doc.text(kpi.sub, xPos + (boxWidth / 2), currentY + 17, { align: "center" });
    });
    currentY += 26;

    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Análisis Estadístico Avanzado", margin, currentY);
    currentY += 6;

    const chartWidth = (pageWidth - (margin * 2) - 10) / 2;
    const chartHeight = 55;

    const canvasCat = document.getElementById("chartCategories");
    if (canvasCat) {
        const imgCat = canvasCat.toDataURL("image/png", 1.0);
        doc.setFontSize(9);
        doc.text("Distribución por Área / Problemática", margin, currentY);
        doc.addImage(imgCat, "PNG", margin, currentY + 2, chartWidth, chartHeight);
    }

    const canvasDemo = document.getElementById("chartDemographics");
    if (canvasDemo) {
        const imgDemo = canvasDemo.toDataURL("image/png", 1.0);
        const xPos2 = margin + chartWidth + 10;
        doc.setFontSize(9);
        doc.text("Segmentación Demográfica (Edad y Sexo)", xPos2, currentY);
        doc.addImage(imgDemo, "PNG", xPos2, currentY + 2, chartWidth, chartHeight);
    }

    // PÁGINA 2
    doc.addPage();
    drawHeader();
    currentY = 30;

    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Auditoría Detallada de Ingreso de Datos", margin, currentY);
    currentY += 6;

    const tableBody = filteredRecords.map(r => {
        const fechaStr = r.created_at ? new Date(r.created_at).toLocaleDateString("es-AR") : "-";
        let descripcion = r.problematica || r.titulo_proyecto || "-";
        if (r.aspectos_positivos && Array.isArray(r.aspectos_positivos) && r.aspectos_positivos.length > 0) {
            descripcion = r.aspectos_positivos.join(", ");
        }

        return [
            `#${String(r.id).slice(-4)}`,
            fechaStr,
            `${r.nombre || 'Anónimo'}\n(${r.tipo_perfil || 'Vecino'})`,
            `${r.barrio || '-'}\nTel: ${r.contacto || '-'}`,
            descripcion,
            (r.estado || 'VALID').toUpperCase()
        ];
    });

    if (doc.autoTable) {
        doc.autoTable({
            startY: currentY,
            head: [["ID", "Fecha", "Ciudadano / Perfil", "Barrio / Contacto", "Problemática / Detalle", "Estado"]],
            body: tableBody,
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 7.5,
                cellPadding: 3,
                valign: "middle",
                overflow: "linebreak"
            },
            headStyles: {
                fillColor: PRIMARY_COLOR,
                textColor: [255, 255, 255],
                fontStyle: "bold"
            },
            alternateRowStyles: {
                fillColor: [245, 247, 250]
            },
            columnStyles: {
                0: { cellWidth: 14, fontStyle: "bold" },
                1: { cellWidth: 20 },
                2: { cellWidth: 42 },
                3: { cellWidth: 38 },
                4: { cellWidth: 50 },
                5: { cellWidth: 16, fontStyle: "bold", halign: "center" }
            },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    const val = data.cell.raw;
                    if (val === 'VALID') {
                        data.cell.styles.textColor = [22, 163, 74];
                    } else if (val === 'SPAM') {
                        data.cell.styles.textColor = [220, 38, 38];
                    }
                }
            }
        });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawFooter(i, pageCount);
    }

    const fileName = `Informe_Auditoria_NeuquenEscucha_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
    showToast("Informe PDF generado y descargado correctamente.", "success");
}

function exportToPPTX() {
    showToast('Generando presentación PowerPoint...', 'info');
    let pptx = new PptxGenJS();
    let slide = pptx.addSlide();
    slide.addText("Neuquén Escucha - Reporte Ejecutivo", { x: 1, y: 1, fontSize: 24, bold: true, color: "0B2545" });
    slide.addText(`Total de Registros Analizados: ${filteredRecords.length}`, { x: 1, y: 2, fontSize: 18, color: "134074" });
    pptx.writeFile({ fileName: "Reporte_Neuquen_Escucha.pptx" }).then(() => {
        showToast('PowerPoint descargado con éxito', 'success');
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
