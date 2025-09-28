// ** CONFIGURACIÓN Y CONSTANTES **
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRcumpa6f1_6lkdyOU1hkymg4evm6a1vXFaWfNRDJ-cxM8qqETGPJ6GnfrzYdOdQ8RHxJ3-wuwxymzD/pub?output=csv';
const MAX_TIME_OUT_MS = 900000; // 15 minutos en milisegundos para la alerta

// Elementos del DOM
const container = document.getElementById('estudiantes-container'); // Lista de búsqueda/filtro
const outDashboard = document.getElementById('out-students-dashboard'); // NUEVO: Dashboard de solo salidas
const filtroGrado = document.getElementById('filtro-grado');
const filtroGrupo = document.getElementById('filtro-grupo');
const searchInput = document.getElementById('search-input');
const themeToggle = document.getElementById('theme-toggle');
const rankingContainer = document.getElementById('ranking-container');
const historialContainer = document.getElementById('historial-container'); // NUEVO

// Estado Global
let estudiantesData = []; 
let estudiantesStatus = {}; 
let gradosUnicos = new Set();
let gruposPorGrado = {};
let studentMetrics = [];

// Instancias de Gráficos
let statusChartInstance = null;
let timeChartInstance = null;


// ----------------------------------------------------------------------
// --- UTILERÍAS ---
// ----------------------------------------------------------------------

function saveStatus() {
    localStorage.setItem('estudiantesStatus', JSON.stringify(estudiantesStatus));
}

function loadStatus() {
    const savedStatus = localStorage.getItem('estudiantesStatus');
    if (savedStatus) {
        estudiantesStatus = JSON.parse(savedStatus);
    }
}

function formatTime(ms) {
    if (ms < 60000) {
        return `${Math.round(ms / 1000)} seg`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    if (seconds > 0 && minutes < 60) {
         return `${minutes} min ${seconds} seg`;
    }
    return `${minutes} min`; 
}

function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ----------------------------------------------------------------------
// --- LÓGICA CSV Y CARGA ---
// ----------------------------------------------------------------------

function parseCSVtoJSON(csvText) {
    // ... (El código de parseCSVtoJSON se mantiene igual)
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];

    const headers = lines[0].trim().split(',').map(header => header.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        const values = line.split(',');
        const student = {};

        headers.forEach((header, index) => {
            const value = values[index] ? values[index].trim() : '';
            student[header] = value; 
        });

        if (student.Nombre_alumno && student.Nombre_alumno !== '') {
            const id = student.ID;
            data.push(student);
            
            if (!estudiantesStatus.hasOwnProperty(id)) {
                 estudiantesStatus[id] = { state: 'in', outTime: null, totalTimeOut: 0 }; 
            } else {
                 if (!estudiantesStatus[id].totalTimeOut) estudiantesStatus[id].totalTimeOut = 0;
            }
        }
    }
    return data;
}

async function cargarEstudiantes() {
    loadStatus(); 
    if (container) container.innerHTML = '<p>Utilice la búsqueda o los filtros para mostrar la lista completa de alumnos.</p>'; // Inicia vacío
    if (outDashboard) outDashboard.innerHTML = '<p>Cargando datos...</p>';

    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}.`);
        }
        const csvText = await response.text();
        estudiantesData = parseCSVtoJSON(csvText);

        if (estudiantesData.length === 0) {
            container.innerHTML = '<p>No se encontraron estudiantes.</p>';
            outDashboard.innerHTML = '<p>No se encontraron estudiantes.</p>';
            return;
        }

        procesarDatosParaFiltros(estudiantesData); 
        llenarFiltroGrado();
        
        // NO llamamos a aplicarFiltros() para que la lista principal inicie vacía
        updateGlobalStatus(); 
        initCharts();
        displayHistorial(); // NUEVO: Muestra el historial simulado
        
    } catch (error) {
        console.error('Error al cargar los datos:', error);
        if (container) container.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}.</p>`;
        if (outDashboard) outDashboard.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}.</p>`;
    }
}


// ----------------------------------------------------------------------
// --- LÓGICA DE FILTRADO Y PROCESAMIENTO ---
// ----------------------------------------------------------------------

function procesarDatosParaFiltros(data) {
    gradosUnicos = new Set();
    gruposPorGrado = {};
    
    data.forEach(estudiante => {
        const grado = String(estudiante.Grado).trim(); 
        const grupo = String(estudiante.Grupo).trim();

        if (grado && grado !== 'N/A') gradosUnicos.add(grado);
        
        if (!gruposPorGrado[grado]) {
            gruposPorGrado[grado] = new Set();
        }
        if (grupo && grupo !== 'N/A') gruposPorGrado[grado].add(grupo);
    });

    gradosUnicos = Array.from(gradosUnicos).sort();
    for (const grado in gruposPorGrado) {
        gruposPorGrado[grado] = Array.from(gruposPorGrado[grado]).sort();
    }
}

function llenarFiltroGrado() {
    filtroGrado.innerHTML = '<option value="">Todos</option>';
    gradosUnicos.forEach(grado => {
        const option = document.createElement('option');
        option.value = grado;
        option.textContent = `Grado ${grado}`;
        filtroGrado.appendChild(option);
    });
}

function llenarFiltroGrupo(gradoSeleccionado) {
    filtroGrupo.innerHTML = '<option value="">Todos</option>';
    filtroGrupo.disabled = true;

    if (gradoSeleccionado && gruposPorGrado[gradoSeleccionado]) {
        gruposPorGrado[gradoSeleccionado].forEach(grupo => {
            const option = document.createElement('option');
            option.value = grupo;
            option.textContent = `Grupo ${grupo}`;
            filtroGrupo.appendChild(option);
        });
        filtroGrupo.disabled = false;
    }
}

function aplicarFiltros() {
    const gradoSeleccionado = filtroGrado.value;
    const grupoSeleccionado = filtroGrupo.value;
    const searchText = searchInput.value.toLowerCase();
    
    // Si no hay filtros aplicados, la lista principal permanece vacía.
    if (!gradoSeleccionado && !grupoSeleccionado && !searchText) {
         container.innerHTML = '<p>Utilice la búsqueda o los filtros para mostrar la lista completa de alumnos.</p>';
         return;
    }

    let estudiantesFiltrados = estudiantesData;

    if (gradoSeleccionado) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            String(est.Grado).trim() === gradoSeleccionado
        );
    }
    
    if (grupoSeleccionado) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            String(est.Grupo).trim() === grupoSeleccionado
        );
    }

    if (searchText) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            (est.Nombre_alumno && est.Nombre_alumno.toLowerCase().includes(searchText)) || 
            (est.ID && String(est.ID).includes(searchText))
        );
    }
    
    // Priorización: Mueve los alumnos FUERA al inicio de la lista filtrada
    estudiantesFiltrados.sort((a, b) => {
        const aIsOut = estudiantesStatus[a.ID].state === 'out';
        const bIsOut = estudiantesStatus[b.ID].state === 'out';
        return bIsOut - aIsOut;
    });

    // Muestra la lista principal, que ahora se llena solo con filtros.
    mostrarEstudiantes(estudiantesFiltrados, container, true); 
}


// ----------------------------------------------------------------------
// --- LÓGICA DE REGISTRO Y ESTADO ---
// ----------------------------------------------------------------------

function toggleRegistro(id) {
    const studentStatus = estudiantesStatus[id];
    const estudiante = estudiantesData.find(est => est.ID === id);

    if (!estudiante) return;

    if (studentStatus.state === 'in') {
        // Registro de Salida (ya no hay límite de MAX_STUDENTS_OUT_PER_GROUP)
        studentStatus.state = 'out';
        studentStatus.outTime = new Date().getTime(); 
        
    } else {
        // Registro de Entrada
        studentStatus.state = 'in';
        if (studentStatus.outTime) {
            const timeElapsed = new Date().getTime() - studentStatus.outTime;
            studentStatus.totalTimeOut += timeElapsed;
            studentStatus.outTime = null; 
        }
    }

    saveStatus(); 
    updateGlobalStatus();
    aplicarFiltros(); 
}

function updateGlobalStatus() {
    let outCount = 0;
    let totalTimeOutMS = 0;

    for (const id in estudiantesStatus) {
        const status = estudiantesStatus[id];
        if (status.state === 'out') {
            outCount++;
        }
        
        let currentTotalTimeOut = status.totalTimeOut;
        if (status.state === 'out' && status.outTime) {
            currentTotalTimeOut += (new Date().getTime() - status.outTime);
        }
        totalTimeOutMS += currentTotalTimeOut;
    }

    const totalStudents = estudiantesData.length;
    document.getElementById('count-out').textContent = outCount;
    document.getElementById('count-total').textContent = totalStudents;
    
    const avgTimeMs = totalStudents > 0 ? totalTimeOutMS / totalStudents : 0;
    document.getElementById('avg-time-out').textContent = formatTime(avgTimeMs);

    studentMetrics = calculateStudentTimeMetrics();
    updateCharts(outCount, totalStudents - outCount);
    displayStudentRanking(studentMetrics); 
    
    // Actualiza el dashboard de alumnos actualmente fuera
    displayOutStudentsDashboard();
}

// Función genérica para mostrar tarjetas de estudiantes (tanto para dashboard como para filtros)
function mostrarEstudiantes(estudiantesAMostrar, targetContainer, showTimeAlert) {
    targetContainer.innerHTML = ''; 

    if (estudiantesAMostrar.length === 0) {
        targetContainer.innerHTML = '<p>No se encontraron alumnos.</p>';
        return;
    }

    estudiantesAMostrar.forEach(estudiante => {
        const id = estudiante.ID;
        const grado = estudiante.Grado;
        const grupo = estudiante.Grupo;
        const status = estudiantesStatus[id];
        const isOut = status.state === 'out';
        
        let isTimeAlert = false;
        let timeElapsed = 0;
        if (isOut && status.outTime) {
            timeElapsed = new Date().getTime() - status.outTime;
            if (timeElapsed > MAX_TIME_OUT_MS) {
                isTimeAlert = true;
            }
        }
        
        const card = document.createElement('div');
        card.classList.add('estudiante-card');
        if (isOut) card.classList.add('out');
        if (isTimeAlert && showTimeAlert) card.classList.add('time-alert'); 
        
        const btnText = isOut ? 'Registrar Entrada' : 'Registrar Salida';
        
        let timeInfo = `Tiempo total fuera: ${formatTime(status.totalTimeOut)}`;
        if (isOut) {
            timeInfo = `Lleva fuera: ${formatTime(timeElapsed)}<br>Total acumulado: ${formatTime(status.totalTimeOut)}`;
        }
        
        card.innerHTML = `
            <div class="estudiante-info">
                <strong>${estudiante.Nombre_alumno}</strong> (${id})
            </div>
            <div class="grupo-info">
                Grado: ${grado} | Grupo: ${grupo}
                <br>${timeInfo}
            </div>
            <button class="registro-btn" data-id="${id}">
                ${btnText}
            </button>
        `;
        
        targetContainer.appendChild(card);
    });
    
    // Asegurarse de que los nuevos botones tengan el listener
    targetContainer.querySelectorAll('.registro-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            toggleRegistro(id);
        });
    });
}

// NUEVA FUNCIÓN: Muestra solo los alumnos que están fuera
function displayOutStudentsDashboard() {
    const outStudents = estudiantesData.filter(est => estudiantesStatus[est.ID].state === 'out');
    
    if (outStudents.length === 0) {
        outDashboard.innerHTML = '<p>Ningún estudiante fuera de clase.</p>';
        return;
    }
    
    // Priorizamos los que llevan más tiempo fuera en el dashboard
    outStudents.sort((a, b) => {
        const statusA = estudiantesStatus[a.ID];
        const statusB = estudiantesStatus[b.ID];
        const timeA = statusA.outTime ? new Date().getTime() - statusA.outTime : 0;
