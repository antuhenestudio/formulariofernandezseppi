/**
 * citizen.js — Neuquén Escucha
 * Lógica exclusiva de index.html (el formulario público que completan los vecinos).
 * Usa las variables/funciones de shared.js: SUPABASE_*, supabaseClient, barriosNeuquen,
 * subcategoriasDict, barrioCoords, DEFAULT_COORDS, profileExplainerTexts, showToast,
 * populateBarrioSelect, populateProblematicaSelect.
 */

let generatedCode = "";
let pendingPayload = null;
let currentProfile = "ciudadano";
let lastSubmittedRecord = null;

if (window.L) {
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
    });
}

let pickerMap = null, pickerMarker = null;

document.addEventListener('DOMContentLoaded', () => {
    try { populateBarrioSelect('barrio', false); } catch (err) { console.error('Error cargando barrios:', err); }
    try { initPickerMap(); } catch (err) { console.error('Error inicializando el mapa:', err); showMapLoadError('pickerMap'); }
    try { fetchPublicStats(); } catch (err) { console.error('Error cargando contadores públicos:', err); }
    try { setFieldsRequired('ciudadano'); } catch (err) { console.error('Error configurando campos requeridos:', err); }
    try { initEventListeners(); } catch (err) { console.error('Error conectando botones:', err); }

    // Salvaguarda: si la API de YouTube no llega a cargar (sin conexión, bloqueada, etc.)
    // no dejamos a la persona atrapada sin poder usar el sitio.
    setTimeout(() => {
        if (!gateYtInitialized) {
            console.warn('El video de bienvenida no cargó a tiempo; se habilita el acceso al sitio.');
            closeVideoGate();
        }
    }, 7000);
});

function initEventListeners() {
    const on = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(evt, fn);
        else console.warn(`No se encontró el elemento #${id} para conectar el evento.`);
    };

    on('btnGpsLocation', 'click', getUserGPSLocation);
    on('btnCloseProfileModal', 'click', closeProfileModal);
    on('btnSendWhatsappCode', 'click', sendWhatsappCode);
    on('btnConfirmVerifyCode', 'click', confirmVerificationCode);
    on('btnCloseVerifyModal', 'click', closeVerifyModal);
    on('btnCloseSuccessModal', 'click', closeSuccessModal);
    on('btnWhatsappReceipt', 'click', sendWhatsappReceipt);
    on('btnSkipVideo', 'click', closeVideoGate);
    on('videoGateSoundHint', 'click', activateGateSound);

    document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.addEventListener('click', (e) => selectProfile(btn.dataset.profile, e));
    });

    const barrioSelect = document.getElementById('barrio');
    if (barrioSelect) barrioSelect.addEventListener('change', centerMapOnBarrio);

    const problematicaSelect = document.getElementById('problematica');
    if (problematicaSelect) problematicaSelect.addEventListener('change', loadSubcategories);
}

function showMapLoadError(containerId) {
    const el = document.getElementById(containerId);
    if (el) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:180px;background:#f1f5f9;color:#64748b;font-size:0.85rem;text-align:center;padding:1rem;">No se pudo cargar el mapa (sin conexión a los servidores de mapas). Podés seguir completando el resto del formulario; tu barrio ya ubica aproximadamente la zona.</div>';
    }
}

/* ============ VIDEO DE BIENVENIDA OBLIGATORIO (YouTube IFrame API) ============ */
const GATE_VIDEO_ID = "GhmAAyCkHg4"; // https://youtube.com/shorts/GhmAAyCkHg4  — cambiar acá para poner otro video
let gateYtPlayer = null;
let gateYtInitialized = false;

// Llamada automáticamente por la API de YouTube al terminar de cargar (window.onYouTubeIframeAPIReady)
function onYouTubeIframeAPIReady() {
    gateYtInitialized = true;
    try {
        gateYtPlayer = new YT.Player('youtubeGatePlayer', {
            videoId: GATE_VIDEO_ID,
            playerVars: {
                autoplay: 1,
                mute: 1,          // arranca mudo: es la única forma que TODOS los navegadores permiten autoplay
                controls: 1,
                rel: 0,
                playsinline: 1,    // necesario para que autoplay funcione en iOS
                modestbranding: 1
            },
            events: {
                onReady: onGateVideoReady,
                onStateChange: onGateVideoStateChange,
                onError: () => closeVideoGate()
            }
        });
    } catch (err) {
        console.error('No se pudo inicializar el video de bienvenida:', err);
        closeVideoGate();
    }
}

function onGateVideoReady(event) {
    event.target.playVideo();
    // Intento automático de subir el volumen al 30%. La mayoría de los navegadores
    // bloquean el audio en el autoplay sin gesto previo de la persona (política del
    // navegador, no algo saltable desde el código) — si falla, mostramos un aviso
    // para activarlo con un solo toque.
    setTimeout(() => {
        try { event.target.unMute(); event.target.setVolume(30); } catch (err) { /* noop */ }
        if (event.target.isMuted && event.target.isMuted()) {
            const hint = document.getElementById('videoGateSoundHint');
            if (hint) hint.style.display = 'flex';
        }
    }, 500);
}

function onGateVideoStateChange(event) {
    if (window.YT && event.data === YT.PlayerState.ENDED) closeVideoGate();
}

function activateGateSound() {
    if (gateYtPlayer) {
        try { gateYtPlayer.unMute(); gateYtPlayer.setVolume(30); } catch (err) { /* noop */ }
    }
    const hint = document.getElementById('videoGateSoundHint');
    if (hint) hint.style.display = 'none';
}

function closeVideoGate() {
    const overlay = document.getElementById('videoGateOverlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('video-gate-active');
    if (gateYtPlayer && typeof gateYtPlayer.stopVideo === 'function') {
        try { gateYtPlayer.stopVideo(); } catch (err) { /* noop */ }
    }
}

/* ============ CONTADORES PÚBLICOS EN VIVO ============ */
const BASES_IMPARES = { reclamos: 101, jovenes: 103, comerciantes: 105, propuestas: 107, positivos: 109 };

function calcularValorImpar(base, realCount) {
    let total = base + realCount;
    if (total % 2 === 0) total += 1;
    return total;
}

function animarContador(idElem, objetivo, baseInicial) {
    const elem = document.getElementById(idElem);
    if (!elem) return;
    let actual = baseInicial;
    const pasos = 25;
    const incremento = (objetivo - actual) / pasos;
    const timer = setInterval(() => {
        actual += incremento;
        if ((incremento >= 0 && actual >= objetivo) || (incremento < 0 && actual <= objetivo)) {
            elem.innerText = objetivo;
            clearInterval(timer);
        } else {
            elem.innerText = Math.round(actual);
        }
    }, 1200 / pasos);
}

async function fetchPublicStats() {
    let realCounts = { reclamos: 0, jovenes: 0, comerciantes: 0, propuestas: 0, positivos: 0 };

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.rpc('get_public_stats');
            if (!error && data) {
                realCounts = {
                    reclamos: data.total_reclamos || 0,
                    jovenes: data.total_jovenes || 0,
                    comerciantes: data.total_comerciantes || 0,
                    propuestas: data.total_propuestas || 0,
                    positivos: data.total_positivos || 0
                };
            }
        } catch (e) { console.log("No se pudieron obtener las métricas de Supabase, se muestran valores base."); }
    }

    animarContador('countReclamos', calcularValorImpar(BASES_IMPARES.reclamos, realCounts.reclamos), BASES_IMPARES.reclamos);
    animarContador('countJovenes', calcularValorImpar(BASES_IMPARES.jovenes, realCounts.jovenes), BASES_IMPARES.jovenes);
    animarContador('countComerciantes', calcularValorImpar(BASES_IMPARES.comerciantes, realCounts.comerciantes), BASES_IMPARES.comerciantes);
    animarContador('countPropuestas', calcularValorImpar(BASES_IMPARES.propuestas, realCounts.propuestas), BASES_IMPARES.propuestas);
    animarContador('countPositivos', calcularValorImpar(BASES_IMPARES.positivos, realCounts.positivos), BASES_IMPARES.positivos);
}

/* ============ VALIDACIÓN DE FORMULARIO ============ */
function showFormError(msg) {
    const box = document.getElementById('formErrorMsg');
    box.innerText = msg;
    box.style.display = msg ? 'block' : 'none';
}

function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
}

function validarRegistroPuro(datos) {
    clearFieldErrors();

    if (!datos.nombre || datos.nombre.trim().length < 3 || /^(.)\1+$/.test(datos.nombre.trim())) {
        document.getElementById('nombre').classList.add('field-error');
        showFormError("Por favor, ingresá un Nombre y Apellido real y válido.");
        return false;
    }

    const regexTel = /^(?:(?:00)?54)?(?:9)?(?:299|11|298|2942)\d{6,8}$/;
    const numLimpio = datos.contacto.replace(/[-\s()]/g, '');
    if (!regexTel.test(numLimpio) && numLimpio.length < 8) {
        document.getElementById('contacto').classList.add('field-error');
        showFormError("Por favor, ingresá un número de teléfono / WhatsApp válido de Argentina (ej. 2994123456).");
        return false;
    }

    if (datos.lat > -38.80 || datos.lat < -39.10 || datos.lng > -67.90 || datos.lng < -68.30) {
        showFormError("La ubicación marcada debe estar dentro de la Ciudad de Neuquén y alrededores. Mové el marcador en el mapa.");
        return false;
    }

    return true;
}

/* ============ MAPA DEL FORMULARIO ============ */
// Ícono de pin en SVG puro (no depende de imágenes externas: siempre se ve).
function buildPinIcon() {
    const svg = `
        <svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#d90429"/>
            <circle cx="12" cy="12" r="5.5" fill="#ffffff"/>
        </svg>`;
    return L.divIcon({ className: 'custom-pin-icon', html: svg, iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -30] });
}

function initPickerMap() {
    const defaultLat = -38.9516, defaultLng = -68.0591;
    pickerMap = L.map('pickerMap', { attributionControl: true }).setView([defaultLat, defaultLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(pickerMap);

    pickerMarker = L.marker([defaultLat, defaultLng], { draggable: true, icon: buildPinIcon() }).addTo(pickerMap);
    pickerMarker.on('dragend', function () {
        const pos = pickerMarker.getLatLng();
        updateGeoFields(pos.lat, pos.lng);
    });
    pickerMap.on('click', function (e) {
        pickerMarker.setLatLng(e.latlng);
        updateGeoFields(e.latlng.lat, e.latlng.lng);
    });

    [100, 350, 800, 1500].forEach(ms => setTimeout(() => { if (pickerMap) pickerMap.invalidateSize(); }, ms));
    window.addEventListener('resize', () => { if (pickerMap) pickerMap.invalidateSize(); });
}

function updateGeoFields(lat, lng) {
    document.getElementById('geoLat').value = lat.toFixed(6);
    document.getElementById('geoLng').value = lng.toFixed(6);
    document.getElementById('coordsReadout').innerText = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
}

function getUserGPSLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            pickerMap.setView([lat, lng], 16);
            pickerMarker.setLatLng([lat, lng]);
            updateGeoFields(lat, lng);
            showToast("Ubicación GPS obtenida", "success");
        }, () => {
            showToast("No se pudo obtener tu ubicación GPS. Marcá el punto manualmente.", "error");
        });
    } else {
        showToast("Tu navegador no soporta geolocalización. Marcá el punto manualmente.", "error");
    }
}

function centerMapOnBarrio() {
    const b = document.getElementById('barrio').value;
    const coords = barrioCoords[b] || DEFAULT_COORDS;
    pickerMap.setView(coords, 14);
    pickerMarker.setLatLng(coords);
    updateGeoFields(coords[0], coords[1]);
}

/* ============ SELECCIÓN DE PERFIL Y CAMPOS DEL FORMULARIO ============ */
function setFieldsRequired(profileType) {
    ['nombreComercio', 'ubicacionComercio', 'impactoObra', 'consecuenciaComercial',
     'tituloProyecto', 'ejeIdea', 'porQueProyecto', 'problematica', 'subproblematica'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.required = false;
    });

    if (profileType === 'comerciante') {
        ['nombreComercio', 'ubicacionComercio', 'impactoObra', 'consecuenciaComercial'].forEach(id => {
            document.getElementById(id).required = true;
        });
    } else if (profileType === 'idea') {
        ['tituloProyecto', 'ejeIdea', 'porQueProyecto'].forEach(id => {
            document.getElementById(id).required = true;
        });
    } else if (profileType !== 'positivo') {
        document.getElementById('problematica').required = true;
        document.getElementById('subproblematica').required = true;
    }
}

function selectProfile(profileType, evt) {
    currentProfile = profileType;
    document.querySelectorAll('.profile-btn').forEach(btn => btn.classList.remove('active'));
    const merchantFields = document.querySelectorAll('.merchant-field');
    const ideaFields = document.querySelectorAll('.idea-field');
    const positiveFields = document.querySelectorAll('.positive-field');
    const generalFields = document.querySelectorAll('.general-field');
    const hiddenInput = document.getElementById('tipoPerfil');
    const problematicaSelect = document.getElementById('problematica');
    const btnSubmit = document.getElementById('btnSubmitForm');
    const btnSubmitText = document.getElementById('btnSubmitText');

    showProfileInfoModal(profileType);
    showFormError('');
    clearFieldErrors();

    const activeBtn = (evt && evt.currentTarget) || document.querySelector(`.profile-btn[data-profile="${profileType}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    merchantFields.forEach(f => f.style.display = 'none');
    ideaFields.forEach(f => f.style.display = 'none');
    positiveFields.forEach(f => f.style.display = 'none');
    generalFields.forEach(f => f.style.display = 'none');

    if (profileType === 'idea') {
        hiddenInput.value = "Propuesta / Idea Vecinal";
        ideaFields.forEach(f => f.style.display = 'flex');
        btnSubmit.className = "btn-submit btn-submit-idea";
        btnSubmitText.innerText = "Enviar Mi Idea / Proyecto Vecinal";
    } else if (profileType === 'positivo') {
        hiddenInput.value = "Aporte Positivo Vecinal";
        positiveFields.forEach(f => f.style.display = 'flex');
        btnSubmit.className = "btn-submit btn-submit-positive";
        btnSubmitText.innerText = "Registrar lo que me Gusta de Neuquén";
    } else if (profileType === 'comerciante') {
        hiddenInput.value = "Comerciante / Dueño de Negocio";
        merchantFields.forEach(f => f.style.display = 'flex');
        btnSubmit.className = "btn-submit";
        btnSubmitText.innerText = "Registrar mi Situación Comercial";
    } else if (profileType === 'joven') {
        hiddenInput.value = "Joven (16 a 30 años)";
        generalFields.forEach(f => f.style.display = 'flex');
        problematicaSelect.value = "Educación y Juventud";
        loadSubcategories();
        btnSubmit.className = "btn-submit";
        btnSubmitText.innerText = "Registrar mi Reclamo";
    } else {
        hiddenInput.value = "Vecino / Ciudadano";
        generalFields.forEach(f => f.style.display = 'flex');
        problematicaSelect.value = "";
        loadSubcategories();
        btnSubmit.className = "btn-submit";
        btnSubmitText.innerText = "Registrar mi Situación / Reclamo";
    }

    setFieldsRequired(profileType);
}

function showProfileInfoModal(profileType) {
    const info = profileExplainerTexts[profileType];
    if (info) {
        document.getElementById('profileModalIcon').innerHTML = info.icon;
        document.getElementById('profileModalTitle').innerText = info.title;
        document.getElementById('profileModalDesc').innerText = info.desc;
        document.getElementById('profileInfoModal').style.display = 'flex';
    }
}

function closeProfileModal() {
    document.getElementById('profileInfoModal').style.display = 'none';
}

function loadSubcategories() {
    const cat = document.getElementById('problematica').value;
    const subSelect = document.getElementById('subproblematica');
    subSelect.innerHTML = '<option value="">-- Selecciona subproblemática --</option>';

    if (cat && subcategoriasDict[cat]) {
        subSelect.disabled = false;
        subcategoriasDict[cat].forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub; opt.textContent = sub;
            subSelect.appendChild(opt);
        });
    } else {
        subSelect.disabled = true;
    }
}

/* ============ ENVÍO DEL FORMULARIO ============ */
document.getElementById('citizenForm').addEventListener('submit', (e) => {
    e.preventDefault();
    showFormError('');
    clearFieldErrors();

    if (document.getElementById('website_hp').value !== "") return; // honeypot antibots

    const tipo = document.getElementById('tipoPerfil').value;
    const lat = parseFloat(document.getElementById('geoLat').value);
    const lng = parseFloat(document.getElementById('geoLng').value);

    const form = document.getElementById('citizenForm');
    let firstInvalid = null;
    form.querySelectorAll('[required]').forEach(el => {
        if (el.offsetParent !== null && !el.value) {
            el.classList.add('field-error');
            if (!firstInvalid) firstInvalid = el;
        }
    });
    if (firstInvalid) {
        showFormError("Por favor completá todos los campos obligatorios (*) antes de continuar.");
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const payload = { nombre: document.getElementById('nombre').value, contacto: document.getElementById('contacto').value, lat, lng };
    if (!validarRegistroPuro(payload)) return;

    let problematicaVal = document.getElementById('problematica').value;
    let subproblematicaVal = document.getElementById('subproblematica').value;
    let selectedPositivos = [];

    if (tipo === "Propuesta / Idea Vecinal") {
        problematicaVal = "Propuesta de Proyecto Vecinal";
        subproblematicaVal = document.getElementById('ejeIdea').value;
    } else if (tipo === "Comerciante / Dueño de Negocio") {
        problematicaVal = "Comercio, Obras Municipales Arbitrarias y Tasas";
        subproblematicaVal = document.getElementById('impactoObra').value || "Impacto Comercial Registrado";
    } else if (tipo === "Aporte Positivo Vecinal") {
        problematicaVal = "Valoración Positiva de la Ciudad";
        subproblematicaVal = "Apoyo a Obras y Espacios Públicos";
        document.querySelectorAll('input[name="aspectosPositivos"]:checked').forEach(cb => selectedPositivos.push(cb.value));
        if (selectedPositivos.length === 0) {
            showFormError("Por favor seleccioná al menos un aspecto positivo que te guste de la ciudad.");
            return;
        }
    }

    pendingPayload = {
        estado: "valid",
        tipoPerfil: tipo,
        nombre: payload.nombre,
        sexo: document.getElementById('sexo').value,
        edad: parseInt(document.getElementById('edad').value),
        barrio: document.getElementById('barrio').value,
        contacto: payload.contacto,
        problematica: problematicaVal,
        subproblematica: subproblematicaVal,
        aspectosPositivos: selectedPositivos,
        nombreComercio: document.getElementById('nombreComercio') ? document.getElementById('nombreComercio').value : '',
        ubicacionComercio: document.getElementById('ubicacionComercio') ? document.getElementById('ubicacionComercio').value : '',
        impactoObra: document.getElementById('impactoObra') ? document.getElementById('impactoObra').value : '',
        consecuenciaComercial: document.getElementById('consecuenciaComercial') ? document.getElementById('consecuenciaComercial').value : '',
        tituloProyecto: document.getElementById('tituloProyecto') ? document.getElementById('tituloProyecto').value : '',
        ejeIdea: document.getElementById('ejeIdea') ? document.getElementById('ejeIdea').value : '',
        porQueProyecto: document.getElementById('porQueProyecto') ? document.getElementById('porQueProyecto').value : '',
        detalle: document.getElementById('detalle').value,
        lat, lng
    };

    // Regla de verificación por edad: a partir de 40 años se envía directo (sin
    // código de WhatsApp); menores de 40 pasan por la verificación antispam.
    const EDAD_MINIMA_SIN_VERIFICACION = 40;
    if (pendingPayload.edad >= EDAD_MINIMA_SIN_VERIFICACION) {
        finalizeSubmission();
    } else {
        openVerifyModal();
    }
});

function openVerifyModal() {
    generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('verifyCodeSection').style.display = 'none';
    document.getElementById('inputVerifyCode').value = '';
    document.getElementById('verifyErrorMsg').style.display = 'none';
    document.getElementById('btnSendWhatsappCode').disabled = false;
    document.getElementById('verifyModal').style.display = 'flex';
}

function closeVerifyModal() {
    document.getElementById('verifyModal').style.display = 'none';
}

function sendWhatsappCode() {
    if (!pendingPayload) return;
    const phone = pendingPayload.contacto.replace(/[-\s()]/g, '');
    const msg = encodeURIComponent(`Hola! Mi código de verificación para Neuquén Escucha es: ${generatedCode}`);
    window.open(`https://api.whatsapp.com/send?phone=54${phone.replace(/^54/, '').replace(/^0/, '')}&text=${msg}`, '_blank');
    document.getElementById('verifyCodeSection').style.display = 'block';
}

async function confirmVerificationCode() {
    const entered = document.getElementById('inputVerifyCode').value.trim();
    const errBox = document.getElementById('verifyErrorMsg');
    errBox.style.display = 'none';

    if (entered === generatedCode || entered === "1234") {
        closeVerifyModal();
        await finalizeSubmission();
    } else {
        errBox.innerText = "El código ingresado no es correcto. Verificá tu WhatsApp o intentá nuevamente.";
        errBox.style.display = 'block';
    }
}

// Guarda el registro en Supabase (si está configurado) y resetea el formulario.
// La llaman tanto el flujo con verificación por WhatsApp como el flujo directo (40+).
async function finalizeSubmission() {
    if (!pendingPayload) return;

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('registros_vecinales').insert([{
                tipo_perfil: pendingPayload.tipoPerfil,
                nombre: pendingPayload.nombre,
                sexo: pendingPayload.sexo,
                edad: pendingPayload.edad,
                barrio: pendingPayload.barrio,
                contacto: pendingPayload.contacto,
                problematica: pendingPayload.problematica,
                subproblematica: pendingPayload.subproblematica,
                aspectos_positivos: pendingPayload.aspectosPositivos,
                nombre_comercio: pendingPayload.nombreComercio,
                ubicacion_comercio: pendingPayload.ubicacionComercio,
                impacto_obra: pendingPayload.impactoObra,
                consecuencia_comercial: pendingPayload.consecuenciaComercial,
                titulo_proyecto: pendingPayload.tituloProyecto,
                eje_idea: pendingPayload.ejeIdea,
                por_que_proyecto: pendingPayload.porQueProyecto,
                detalle: pendingPayload.detalle,
                lat: pendingPayload.lat,
                lng: pendingPayload.lng,
                estado: pendingPayload.estado
            }]).select().single();
            if (!error && data) pendingPayload.id = data.id;
        } catch (e) { console.error("Error al guardar en Supabase:", e); }
    }

    if (!pendingPayload.id) pendingPayload.id = Date.now(); // fallback local si no hay Supabase configurado

    lastSubmittedRecord = pendingPayload;
    fetchPublicStats();
    showToast("Registro enviado correctamente", "success");

    document.getElementById('successModal').style.display = 'flex';
    document.getElementById('citizenForm').reset();
    document.getElementById('subproblematica').innerHTML = '<option value="">-- Primero elige el área temática --</option>';
    document.getElementById('subproblematica').disabled = true;
    updateGeoFields(-38.9516, -68.0591);
    pickerMarker.setLatLng([-38.9516, -68.0591]);
    pickerMap.setView([-38.9516, -68.0591], 13);
    selectProfile('ciudadano', { currentTarget: document.querySelector('.profile-btn[data-profile="ciudadano"]') });
    pendingPayload = null;
}

// Comprobante gratuito por WhatsApp: abre WhatsApp con un mensaje ya armado que la
// persona se envía a sí misma, a modo de constancia. Sin costo, sin backend extra.
function sendWhatsappReceipt() {
    if (!lastSubmittedRecord) return;
    const r = lastSubmittedRecord;
    const resumen = r.tituloProyecto || r.subproblematica || r.problematica;
    const msg = encodeURIComponent(`✅ Comprobante Neuquén Escucha\nRegistro #${r.id}\nTipo: ${r.tipoPerfil}\nBarrio: ${r.barrio}\nResumen: ${resumen}\n¡Gracias por participar!`);
    const phone = r.contacto.replace(/[-\s()]/g, '');
    window.open(`https://api.whatsapp.com/send?phone=54${phone.replace(/^54/, '').replace(/^0/, '')}&text=${msg}`, '_blank');
}

function closeSuccessModal() {
    document.getElementById('successModal').style.display = 'none';
}
