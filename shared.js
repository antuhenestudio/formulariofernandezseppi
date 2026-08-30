/**
 * shared.js — Neuquén Escucha
 * Código y datos comunes entre index.html (formulario público) y admin.html (panel).
 * Si necesitás agregar un barrio, una subproblemática o cambiar la config de Supabase,
 * TODO se edita acá — no hace falta tocar index.html ni admin.html.
 */

/* ============ CONFIGURACIÓN DE SUPABASE ============
   Reemplazá estos dos valores con los de tu proyecto en https://app.supabase.com
   (Settings > API > Project URL / anon public key). Mientras digan "TU-PROYECTO"
   y "TU_ANON_KEY", el sitio funciona en "modo prototipo" con datos de ejemplo en
   memoria (se pierden al recargar la página) y el login admin acepta cualquier
   usuario/contraseña — útil para probar el diseño, pero NO para producción. */
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU_ANON_KEY";
const SUPABASE_CONFIGURED = !SUPABASE_URL.includes("TU-PROYECTO") && !SUPABASE_ANON_KEY.includes("TU_ANON_KEY");
const supabaseClient = (SUPABASE_CONFIGURED && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/* ============ DATOS COMPARTIDOS ============ */
const barriosNeuquen = [
    "Alta Balsa", "Alta Barda - Gamma", "Altos del Limay", "Aníbal Sapere", "Área Centro Este", "Área Centro Oeste", "Área Centro Sur", "Bajo Balsa",
    "Bardas Soleadas", "Barreneche", "Barrio Nuevo", "Belgrano", "Bouquet Roldán", "Canal V", 
    "Ciudad Industrial", "Colonia Rural Nueva Esperanza", "Confluencia Urbano", "Confluencia Rural", "Copol", "Cuenca XV", 
    "Cumelén", "Don Bosco II", "Don Bosco III", "El Progreso", "Esfuerzo", 
    "Gran Neuquén Norte", "Gran Neuquén Sur", "Gregorio Álvarez", "Hibepa", "Huiliches", "Islas Malvinas", 
    "La Sirena", "Limay", "Loteo Social", "Mariano Moreno", "Melipal", 
    "Mercantiles", "Militar", "Parque Industrial", "Provincias Unidas", "Rincón de Emilio", "Río Grande", 
    "San Lorenzo Norte", "San Lorenzo Sur", "Santa Genoveva", "Terrazas del Neuquén", 
    "Unión de Mayo", "Valentina Norte Rural", "Valentina Norte Urbana", 
    "Valentina Sur Rural", "Valentina Sur Urbana", "Villa Ceferino", "Villa Farrell", "Villa Florencia", "Villa María"
].sort();

const subcategoriasDict = {
    "Calles, Tránsito y Obras Civiles": [
        "Baches profundos / Asfalto deteriorado",
        "Mal diseño / Instalación arbitraria de Bicisendas",
        "Cambio de sentido de calles sin consulta previa",
        "Obras públicas paralizadas o inconclusas",
        "Falta de semáforos, badenes o señalización vial",
        "Calles de tierra sin pavimentar / enripiado deficiente",
        "Anegamiento y pozos de agua en la calzada tras lluvias",
        "Veredas rotas, levantadas o inexistentes",
        "Falta de rampas de accesibilidad en esquinas y veredas",
        "Congestión vehicular en horas pico por mala planificación"
    ],
    "Comercio, Obras Municipales Arbitrarias y Tasas": [
        "Caída drástica de ventas por obras de Bicisendas",
        "Caída de ventas por cambio de sentido de calles",
        "Pérdida de estacionamiento para clientes frente al local",
        "Cierre o traslado forzado de local comercial",
        "Aumentos desmedidos de Tasas de Licencia Comercial",
        "Competencia desleal de comercio informal / ferias no habilitadas",
        "Demoras excesivas en habilitaciones y permisos municipales",
        "Falta de seguridad frente al local (robos, vandalismo)",
        "Obras que restringen el acceso de proveedores y carga/descarga"
    ],
    "Plazas, Espacios Públicos y Vías Verdes": [
        "Plazas abandonadas / Pastizales sin mantenimiento",
        "Juegos infantiles rotos o con riesgo físico",
        "Falta de riego, arbolado y parquización",
        "Poco mantenimiento en el Paseo Costero / Riberas",
        "Falta de bebederos, bancos o mobiliario urbano",
        "Ocupación indebida de espacios públicos",
        "Falta de iluminación en plazas y paseos",
        "Ausencia de espacios verdes cercanos en el barrio"
    ],
    "Seguridad Urbana y Entorno Seguro": [
        "Luminarias quemadas / Calles oscuras",
        "Falta de cámaras urbanas municipales",
        "Falta de patrullaje y personal policial",
        "Presencia de puntos ciegos e inseguridad en paradas",
        "Terrenos o casas abandonadas usadas como aguantaderos",
        "Falta de respuesta rápida ante denuncias vecinales",
        "Venta y consumo de sustancias en la vía pública",
        "Robos y arrebatos reiterados en el barrio"
    ],
    "Servicios Básicos y Redes": [
        "Pérdida continua de agua potable",
        "Desbordes cloacales recurrentes en vía pública",
        "Falta de red de gas natural en el barrio",
        "Colapso de pluviales y anegamiento por lluvias",
        "Baja presión de agua en horas pico",
        "Cortes de luz frecuentes y prolongados",
        "Falta de conexión a la red cloacal (pozos ciegos)",
        "Falta de alumbrado público en calles internas"
    ],
    "Transporte Público y Movilidad": [
        "Baja frecuencia de líneas de colectivo",
        "Falta de garitas / Paradas sin refugio ni iluminación",
        "Costos elevados de la tarifa de transporte",
        "Recorridos que no cubren todo el barrio",
        "Falta de rampas y accesibilidad en las unidades",
        "Mal estado / antigüedad de las unidades de colectivo",
        "Falta de frecuencias nocturnas o de fin de semana"
    ],
    "Educación y Juventud": [
        "Infraestructura escolar con problemas de gas/luz",
        "Falta de espacios y centros de capacitación juvenil municipal",
        "Ausencia de becas para estudiantes universitarios",
        "Falta de vacantes en jardines y escuelas del barrio",
        "Falta de espacios deportivos y recreativos para jóvenes",
        "Escasa oferta de primer empleo o prácticas laborales",
        "Falta de transporte escolar o boleto estudiantil accesible"
    ],
    "Limpieza, Recolección y Zonas Industriales": [
        "Microbasurales acumulados en esquinas o baldíos",
        "Poca frecuencia en la recolección de residuos domésticos",
        "Abandono e infraestructura deficiente en Parque Industrial",
        "Falta de contenedores diferenciados / puntos de reciclaje",
        "Presencia de plagas (roedores, insectos) por acumulación de basura",
        "Quema de basura a cielo abierto",
        "Falta de mantenimiento de calles internas en zonas industriales"
    ]
};

// Coordenadas aproximadas para TODOS los barrios (fallback centrado en Neuquén capital si no hay dato exacto)
const DEFAULT_COORDS = [-38.9516, -68.0591];
const barrioCoords = {
    "Área Centro Este": [-38.9516, -68.0591],
    "Área Centro Oeste": [-38.9510, -68.0680],
    "San Lorenzo Norte": [-38.9431, -68.1095],
    "San Lorenzo Sur": [-38.9520, -68.1110],
    "Confluencia Urbano": [-38.9650, -68.0380],
    "Confluencia Rural": [-38.9700, -68.0250],
    "Cuenca XV": [-38.9320, -68.1250],
    "Valentina Sur Urbana": [-38.9800, -68.1200],
    "Valentina Sur Rural": [-38.9850, -68.1350],
    "Valentina Norte Urbana": [-38.9150, -68.0700],
    "Valentina Norte Rural": [-38.9050, -68.0600],
    "Alta Balsa": [-38.9350, -68.0800],
    "Bajo Balsa": [-38.9400, -68.0850],
    "Villa Ceferino": [-38.9390, -68.0890],
    "Belgrano": [-38.9620, -68.0550],
    "Bardas Soleadas": [-38.9250, -68.0950],
    "Barreneche": [-38.9280, -68.1000],
    "Bouquet Roldán": [-38.9480, -68.0620],
    "Canal V": [-38.9900, -68.1000],
    "Ciudad Industrial": [-38.9750, -68.0900],
    "Copol": [-38.9550, -68.0480],
    "Cumelén": [-38.9200, -68.0850],
    "Don Bosco II": [-38.9450, -68.0950],
    "Don Bosco III": [-38.9470, -68.0980],
    "El Progreso": [-38.9600, -68.0700],
    "Esfuerzo": [-38.9670, -68.0620],
    "Gran Neuquén Norte": [-38.9200, -68.0500],
    "Gran Neuquén Sur": [-38.9950, -68.0850],
    "Hibepa": [-38.9380, -68.1050],
    "Huiliches": [-38.9500, -68.1150],
    "Islas Malvinas": [-38.9700, -68.0500],
    "La Sirena": [-38.9330, -68.0900],
    "Limay": [-38.9550, -68.0400],
    "Loteo Social": [-38.9800, -68.0950],
    "Mariano Moreno": [-38.9430, -68.0750],
    "Melipal": [-38.9270, -68.0800],
    "Mercantiles": [-38.9490, -68.0630],
    "Militar": [-38.9530, -68.0560],
    "Parque Industrial": [-38.9820, -68.1050],
    "Rincón de Emilio": [-38.9640, -68.0950],
    "Río Grande": [-38.9880, -68.0700],
    "Santa Genoveva": [-38.9180, -68.0620],
    "Terrazas del Neuquén": [-38.9230, -68.0700],
    "Unión de Mayo": [-38.9720, -68.0800],
    "Altos del Limay": [-38.9150, -68.0550],
    "Villa Florencia": [-38.9580, -68.1000],
    "Villa María": [-38.9420, -68.0900],
    "Aníbal Sapere": [-38.9600, -68.0450],
    "Provincias Unidas": [-38.9300, -68.0700],
    "Gregorio Álvarez": [-38.9580, -68.0520],
    "Colonia Rural Nueva Esperanza": [-39.0200, -68.1800],
    "Área Centro Sur": [-38.9560, -68.0620],
    "Barrio Nuevo": [-38.9400, -68.1000],
    "Villa Farrell": [-38.9450, -68.0850],
    "Alta Barda - Gamma": [-38.9280, -68.0930]
};

const profileExplainerTexts = {
    "ciudadano": {
        title: "Espacio para Vecinos y Ciudadanos",
        icon: "<i class='fas fa-user-check' style='color:var(--secondary);'></i>",
        desc: "En esta sección podés reportar cualquier problema de infraestructura en tu barrio: baches, falta de agua o cloacas, luminarias apagadas, basura acumulada o la falta de frecuencias del colectivo. Tu reclamo se suma al mapa general de la ciudad."
    },
    "comerciante": {
        title: "Espacio para Comerciantes y Negocios",
        icon: "<i class='fas fa-store' style='color:var(--accent);'></i>",
        desc: "Si tenés un comercio y fuiste afectado por ciclovías mal planificadas, cambios de sentido de calles, falta de estacionamiento para clientes u obras municipales sin aviso, volcá tu reclamo acá para exigir respuestas específicas para el sector comercial."
    },
    "joven": {
        title: "Espacio para Jóvenes (16 a 30 años)",
        icon: "<i class='fas fa-graduation-cap' style='color:var(--teal);'></i>",
        desc: "Acá podés exponer la falta de talleres técnicos, espacios deportivos, conectividad, estado de escuelas o problemas con el boleto estudiantil y frecuencias nocturnas. Queremos visibilizar las prioridades de la juventud neuquina."
    },
    "idea": {
        title: "Espacio de Proyectos e Ideas Vecinales",
        icon: "<i class='fas fa-lightbulb' style='color:var(--gold);'></i>",
        desc: "¡Este espacio es para construir! Podés proponer un proyecto que te gustaría ver en tu barrio: un parque lineal, un corredor seguro, un punto de reciclaje o un centro cultural. Contanos el título, por qué es necesario y cómo funcionaría."
    },
    "positivo": {
        title: "Lo Positivo de Neuquén: ¿Qué te gusta de la ciudad?",
        icon: "<i class='fas fa-heart' style='color:var(--green-positive);'></i>",
        desc: "¡Queremos saber qué cosas valorás y apoyás de Neuquén! Seleccioná todos los proyectos, obras o espacios que te gustan (Paseo Costero, plazas, eventos culturales, etc.) para potenciar las buenas decisiones y seguir mejorando la ciudad."
    }
};

/* ============ POPUPS DE CONFIRMACIÓN (TOASTS) ============
   Requiere un <div id="toastContainer"></div> en la página. */
function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    const remove = () => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 300);
    };
    const timer = setTimeout(remove, 3200);
    toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

/* ============ HELPERS COMUNES ============ */

// Llena un <select> con la lista de barrios. Se usa tanto en el formulario
// del ciudadano como en el filtro de barrio del panel admin.
function populateBarrioSelect(selectId, includeAllOption) {
    const select = document.getElementById(selectId);
    if (!select) return;
    if (includeAllOption) {
        const optAll = document.createElement('option');
        optAll.value = 'TODOS';
        optAll.textContent = 'Todos los barrios';
        select.appendChild(optAll);
    }
    barriosNeuquen.forEach(barrio => {
        const opt = document.createElement('option');
        opt.value = barrio; opt.textContent = barrio;
        select.appendChild(opt);
    });
}

// Llena un <select> con las áreas temáticas (problemáticas). Se usa en el
// formulario del ciudadano y en el filtro de "Problemática / Eje" del panel admin.
function populateProblematicaSelect(selectId, includeAllOption) {
    const select = document.getElementById(selectId);
    if (!select) return;
    if (includeAllOption) {
        const optAll = document.createElement('option');
        optAll.value = 'TODAS';
        optAll.textContent = 'Todas las áreas';
        select.appendChild(optAll);
    }
    Object.keys(subcategoriasDict).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        select.appendChild(opt);
    });
}
