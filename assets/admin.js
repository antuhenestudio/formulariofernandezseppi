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

    // Filtros
    ['filterEstado', 'filterPerfil', 'filterBarrio', 'filterProblematica', 'filterSexo'].forEach(id => {
        on(id, 'change', applyFiltersAndRender);
    });

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

/* ================= CARGA DE DATOS Y FILTROS ================= */
async function loadDashboardData() {
    try {
        const { data, error } = await supabaseClient
            .from('registros_vecinales')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

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

function applyFiltersAndRender() {
    const estado = document.getElementById('filterEstado').value;
    const perfil = document.getElementById('filterPerfil').value;
    const barrio = document.getElementById('filterBarrio').value;
    const problematica = document.getElementById('filterProblematica').value;
    const sexo = document.getElementById('filterSexo').value;

    filteredRecords = allRecords.filter(r => {
        if (estado !== 'TODOS' && r.estado !== estado) return false;
        if (perfil !== 'TODOS' && r.tipo_perfil !== perfil) return false;
        if (barrio !== 'TODOS' && r.barrio !== barrio) return false;
        if (problematica !== 'TODAS' && r.problematica !== problematica) return false;
        if (sexo !== 'TODOS' && r.sexo !== sexo) return false;
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
            <tr onclick="openCitizenDetailModal('${r.id}')" title="Haz clic para ver el detalle completo">
                <td>#${r.id.toString().slice(-4)}</td>
                <td>
                    <strong style="color: var(--primary); font-size: 0.95rem;">${escapeHtml(r.nombre || 'Anónimo')}</strong><br>
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
    const r = allRecords.find(item => item.id == id);
    if (!r) return;

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

    // Visor Webview de Archivos Adjuntos (Fotos, Videos, PDFs)
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

    document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
}

function promptDeleteConfirmation() {
    document.getElementById('confirmDeleteModal').classList.add('active');
}

function closeConfirmDeleteModal() {
    document.getElementById('confirmDeleteModal').classList.remove('active');
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

        showToast(`Registro #${id.toString().slice(-4)} actualizado a ${newStatus.toUpperCase()}`, 'success');
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

/* ================= EXPORTACIÓN PDF / PPTX ================= */
function exportToPDF() {
    const element = document.getElementById('reportExportContainer');
    showToast('Generando reporte PDF...', 'info');
    html2pdf().set({
        margin: 10,
        filename: 'Informe_Neuquen_Escucha.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    }).from(element).save().then(() => {
        showToast('PDF descargado con éxito', 'success');
    });
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
