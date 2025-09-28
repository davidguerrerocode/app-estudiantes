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
        const timeB = statusB.outTime ? new Date().getTime() - statusB.outTime : 0;
        return timeB - timeA;
    });

    // Usamos la función genérica, mostrando la alerta de tiempo
    mostrarEstudiantes(outStudents, outDashboard, true);
}


// ----------------------------------------------------------------------
// --- LÓGICA DE ESTADÍSTICAS AVANZADAS ---
// ----------------------------------------------------------------------

function calculateStudentTimeMetrics() {
    const metrics = estudiantesData.map(estudiante => {
        const id = estudiante.ID;
        const status = estudiantesStatus[id];
        
        let currentTotalTimeOut = status.totalTimeOut;
        if (status.state === 'out' && status.outTime) {
            currentTotalTimeOut += (new Date().getTime() - status.outTime);
        }

        return {
            id: id,
            name: estudiante.Nombre_alumno,
            gradeGroup: `${estudiante.Grado}-${estudiante.Grupo}`,
            totalTimeOut: currentTotalTimeOut,
        };
    }).filter(metric => metric.totalTimeOut > 0)
      .sort((a, b) => b.totalTimeOut - a.totalTimeOut);

    return metrics;
}

function displayStudentRanking(metrics) {
    if (!rankingContainer) return;
    
    if (metrics.length === 0) {
        rankingContainer.innerHTML = '<p>Ningún alumno ha salido al descanso hoy.</p>';
        return;
    }
    // ... (El resto del código de displayStudentRanking se mantiene igual)
    let tableHTML = `
        <table class="ranking-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Alumno</th>
                    <th>Grado/Grupo</th>
                    <th>Tiempo Total Fuera</th>
                </tr>
            </thead>
            <tbody>
    `;

    metrics.slice(0, 10).forEach((metric, index) => { 
        tableHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${metric.name}</td>
                <td>${metric.gradeGroup}</td>
                <td>${formatTime(metric.totalTimeOut)}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    rankingContainer.innerHTML = tableHTML;
}

// NUEVA FUNCIÓN: Simulación de Historial de Movimientos
function displayHistorial() {
    if (!historialContainer) return;

    // Simulación de 10 movimientos recientes
    const now = new Date().getTime();
    const simulatedData = [
        { alumno: "Juan Pérez", tipo: "Salida", tiempo: now - (5 * 60000), grupo: "1-A" },
        { alumno: "María López", tipo: "Entrada", tiempo: now - (8 * 60000), grupo: "3-C" },
        { alumno: "Carlos Ruiz", tipo: "Salida", tiempo: now - (15 * 60000), grupo: "2-B" },
        { alumno: "Ana Gómez", tipo: "Entrada", tiempo: now - (20 * 60000), grupo: "1-A" },
        { alumno: "Pedro Díaz", tipo: "Salida", tiempo: now - (35 * 60000), grupo: "3-C" },
        { alumno: "Sofía Castro", tipo: "Entrada", tiempo: now - (40 * 60000), grupo: "2-B" },
    ].sort((a, b) => b.tiempo - a.tiempo); // Más reciente primero

    let tableHTML = `
        <table class="ranking-table">
            <thead>
                <tr>
                    <th>Hora</th>
                    <th>Alumno</th>
                    <th>Grado/Grupo</th>
                    <th>Tipo</th>
                </tr>
            </thead>
            <tbody>
    `;

    simulatedData.forEach(item => {
        const rowClass = item.tipo === 'Salida' ? 'out' : 'in';
        tableHTML += `
            <tr class="${rowClass}">
                <td>${formatDateTime(item.tiempo)}</td>
                <td>${item.alumno}</td>
                <td>${item.grupo}</td>
                <td style="font-weight: bold; color: ${item.tipo === 'Salida' ? '#6A0DAD' : '#28a745'};">${item.tipo}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    historialContainer.innerHTML = tableHTML;
}


// ----------------------------------------------------------------------
// --- LÓGICA DE GRÁFICOS Y TEMA ---
// ----------------------------------------------------------------------

function initCharts() {
    // ... (El código de initCharts se mantiene igual)
    const totalStudents = estudiantesData.length;
    const outCount = estudiantesData.filter(est => estudiantesStatus[est.ID].state === 'out').length;
    const inCount = totalStudents - outCount;
    
    // Gráfico de Estado Actual (Doughnut)
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    statusChartInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Estudiantes Fuera', 'Estudiantes Dentro'],
            datasets: [{
                data: [outCount, inCount],
                backgroundColor: ['#6A0DAD', '#28a745'], 
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Estado Actual' } }
        }
    });

    // Gráfico de Distribución por Grupo (Barras)
    const ctxTime = document.getElementById('timeChart').getContext('2d');
    timeChartInstance = new Chart(ctxTime, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Tiempo Acumulado (min)',
                data: [],
                backgroundColor: '#6A0DAD', 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: { title: { display: true, text: 'Tiempo Total Acumulado por Grado/Grupo' } }
        }
    });
    
    updateTimeChartByGroup(calculateStudentTimeMetrics());
}

function updateCharts(outCount, inCount) {
    if (statusChartInstance) {
        statusChartInstance.data.datasets[0].data = [outCount, inCount];
        const color = document.body.classList.contains('dark-mode') ? '#1e1e1e' : '#fff';
        statusChartInstance.data.datasets[0].borderColor = [color, color];
        statusChartInstance.options.plugins.title.color = document.body.classList.contains('dark-mode') ? '#f0f0f0' : '#2c2c2c';

        statusChartInstance.update();
    }
    updateTimeChartByGroup(calculateStudentTimeMetrics()); 
}

function handleNavigation() {
    document.querySelectorAll('.main-nav .nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.main-nav .nav-item').forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(this.dataset.section);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    updateGlobalStatus();
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️';
    } else {
        themeToggle.textContent = '🌙';
    }
}


// ----------------------------------------------------------------------
// --- INICIALIZACIÓN ---
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    handleNavigation();
    
    // Los filtros ahora solo llaman a aplicarFiltros (que maneja la lista vacía)
    if (searchInput) searchInput.addEventListener('keyup', aplicarFiltros);
    if (filtroGrado) filtroGrado.addEventListener('change', () => {
        llenarFiltroGrupo(filtroGrado.value);
        aplicarFiltros();
    });
    if (filtroGrupo) filtroGrupo.addEventListener('change', aplicarFiltros);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    
    cargarEstudiantes();
    
    // Actualización de tiempo real cada 5 segundos
    setInterval(() => {
        if (document.getElementById('registro').classList.contains('active')) {
             displayOutStudentsDashboard(); // Actualiza el tiempo 'Lleva fuera'
             // Solo actualizamos la lista principal si ya tiene contenido (filtros aplicados)
             if (container.innerHTML !== '<p>Utilice la búsqueda o los filtros para mostrar la lista completa de alumnos.</p>') {
                 aplicarFiltros(); 
             }
        }
        updateGlobalStatus(); // Actualiza contadores y gráficos
        if (document.getElementById('estadisticas').classList.contains('active')) {
            displayHistorial();
        }
    }, 5000); 
});
