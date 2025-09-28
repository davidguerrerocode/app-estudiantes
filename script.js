// ** CONFIGURACIÓN Y CONSTANTES **
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRcumpa6f1_6lkdyOU1hkymg4evm6a1vXFaWfNRDJ-cxM8qqETGPJ6GnfrzYdOdQ8RHxJ3-wuwxymzD/pub?output=csv';
const MAX_STUDENTS_OUT_PER_GROUP = 2; 
const MAX_TIME_OUT_MS = 900000; // 15 minutos en milisegundos para la alerta

// Elementos del DOM
const container = document.getElementById('estudiantes-container');
const filtroGrado = document.getElementById('filtro-grado');
const filtroGrupo = document.getElementById('filtro-grupo');
const searchInput = document.getElementById('search-input');
const themeToggle = document.getElementById('theme-toggle');
const maxLimitSpan = document.getElementById('max-limit');
const rankingContainer = document.getElementById('ranking-container');
const groupStatusIndicator = document.getElementById('group-status-indicator'); // NUEVO

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

// ----------------------------------------------------------------------
// --- LÓGICA CSV Y CARGA ---
// ----------------------------------------------------------------------

function parseCSVtoJSON(csvText) {
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
    if (maxLimitSpan) maxLimitSpan.textContent = MAX_STUDENTS_OUT_PER_GROUP; 
    if (container) container.innerHTML = '<p>Cargando datos desde Google Sheets...</p>';

    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}.`);
        }
        const csvText = await response.text();
        estudiantesData = parseCSVtoJSON(csvText);

        if (estudiantesData.length === 0) {
            container.innerHTML = '<p>No se encontraron estudiantes.</p>';
            return;
        }

        procesarDatosParaFiltros(estudiantesData); 
        llenarFiltroGrado();
        aplicarFiltros();
        updateGlobalStatus();
        initCharts();
        
    } catch (error) {
        console.error('Error al cargar los datos:', error);
        if (container) container.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}.</p>`;
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
    
    // PRIORIZACIÓN: Mueve los alumnos FUERA al inicio de la lista filtrada
    estudiantesFiltrados.sort((a, b) => {
        const aIsOut = estudiantesStatus[a.ID].state === 'out';
        const bIsOut = estudiantesStatus[b.ID].state === 'out';
        return bIsOut - aIsOut; // True (1) va antes que False (0)
    });

    mostrarEstudiantes(estudiantesFiltrados);
    updateGroupStatusIndicator(gradoSeleccionado, grupoSeleccionado); // NUEVO
}


// ----------------------------------------------------------------------
// --- LÓGICA DE REGISTRO Y ESTADO ---
// ----------------------------------------------------------------------

// NUEVA FUNCIÓN: Actualiza el semáforo de grupo
function updateGroupStatusIndicator(grado, grupo) {
    if (!groupStatusIndicator) return;

    // Solo muestra el semáforo si se ha seleccionado un grado Y un grupo
    if (grado && grupo) {
        groupStatusIndicator.style.display = 'block';
        const count = countStudentsOutByGroup(grado, grupo);
        
        groupStatusIndicator.classList.remove('verde', 'amarillo', 'rojo');

        if (count === 0) {
            groupStatusIndicator.classList.add('verde');
        } else if (count >= MAX_STUDENTS_OUT_PER_GROUP) {
            groupStatusIndicator.classList.add('rojo');
        } else {
            groupStatusIndicator.classList.add('amarillo');
        }
    } else {
        groupStatusIndicator.style.display = 'none';
    }
}


function toggleRegistro(id) {
    const studentStatus = estudiantesStatus[id];
    const estudiante = estudiantesData.find(est => est.ID === id);

    if (!estudiante) return;

    if (studentStatus.state === 'in') {
        const outCount = countStudentsOutByGroup(estudiante.Grado, estudiante.Grupo);
        
        if (outCount >= MAX_STUDENTS_OUT_PER_GROUP) {
            alert(`Límite alcanzado: Ya hay ${MAX_STUDENTS_OUT_PER_GROUP} estudiantes del grupo ${estudiante.Grado}-${estudiante.Grupo} fuera.`);
            return; 
        }
        
        studentStatus.state = 'out';
        studentStatus.outTime = new Date().getTime(); 
        
    } else {
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

function countStudentsOutByGroup(grado, grupo) {
    let count = 0;
    for (const est of estudiantesData) {
        if (String(est.Grado).trim() === String(grado).trim() && 
            String(est.Grupo).trim() === String(grupo).trim() && 
            estudiantesStatus[est.ID].state === 'out') {
            count++;
        }
    }
    return count;
}

function updateGlobalStatus() {
    let outCount = 0;
    let totalTimeOutMS = 0;

    for (const id in estudiantesStatus) {
        const status = estudiantesStatus[id];
        // Si el alumno está fuera, actualiza su tiempo de sesión actual
        if (status.state === 'out' && status.outTime) {
            // Calculamos el tiempo transcurrido desde la salida para la métrica global
            totalTimeOutMS += (new Date().getTime() - status.outTime);
        }
        totalTimeOutMS += status.totalTimeOut;
    }

    const totalStudents = estudiantesData.length;
    document.getElementById('count-out').textContent = outCount;
    document.getElementById('count-total').textContent = totalStudents;
    
    const avgTimeMs = totalStudents > 0 ? totalTimeOutMS / totalStudents : 0;
    document.getElementById('avg-time-out').textContent = formatTime(avgTimeMs);

    studentMetrics = calculateStudentTimeMetrics();
    updateCharts(outCount, totalStudents - outCount);
    displayStudentRanking(studentMetrics); 
}

function mostrarEstudiantes(estudiantesAMostrar) {
    container.innerHTML = ''; 

    if (estudiantesAMostrar.length === 0) {
        container.innerHTML = '<p>No se encontraron estudiantes con los filtros aplicados.</p>';
        return;
    }

    estudiantesAMostrar.forEach(estudiante => {
        const id = estudiante.ID;
        const grado = estudiante.Grado;
        const grupo = estudiante.Grupo;
        const status = estudiantesStatus[id];
        const isOut = status.state === 'out';
        
        // Lógica de Alerta de Tiempo (15 minutos)
        let isTimeAlert = false;
        if (isOut && status.outTime) {
            const timeElapsed = new Date().getTime() - status.outTime;
            if (timeElapsed > MAX_TIME_OUT_MS) {
                isTimeAlert = true;
            }
        }
        
        const outCount = countStudentsOutByGroup(grado, grupo);
        const limitReached = !isOut && outCount >= MAX_STUDENTS_OUT_PER_GROUP;

        const card = document.createElement('div');
        card.classList.add('estudiante-card');
        if (isOut) card.classList.add('out');
        if (limitReached) card.classList.add('limit-reached');
        if (isTimeAlert) card.classList.add('time-alert'); // AÑADIDO: Clase de alerta
        
        const btnText = isOut ? 'Registrar Entrada' : 'Registrar Salida';
        
        // Si el alumno está fuera, mostramos el tiempo que lleva fuera en la tarjeta
        let timeInfo = `Tiempo total fuera: ${formatTime(status.totalTimeOut)}`;
        if (isOut && status.outTime) {
            const timeElapsed = new Date().getTime() - status.outTime;
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
            <button class="registro-btn" 
                    data-id="${id}" 
                    ${limitReached ? 'disabled' : ''}>
                ${btnText}
            </button>
        `;
        
        container.appendChild(card);
    });
    
    document.querySelectorAll('.registro-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            toggleRegistro(id);
        });
    });
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

function updateTimeChartByGroup(metrics) {
    const groupTimes = {}; 

    metrics.forEach(metric => {
        const key = metric.gradeGroup;
        if (!groupTimes[key]) groupTimes[key] = 0;
        groupTimes[key] += metric.totalTimeOut;
    });

    const labels = Object.keys(groupTimes).sort();
    const data = labels.map(key => Math.round(groupTimes[key] / 60000));

    if (timeChartInstance) {
        timeChartInstance.data.labels = labels;
        timeChartInstance.data.datasets[0].data = data;
        timeChartInstance.data.datasets[0].label = 'Tiempo Acumulado (min)';
        timeChartInstance.data.datasets[0].backgroundColor = labels.map((_, i) => i % 2 === 0 ? '#6A0DAD' : '#9370DB');
        timeChartInstance.options.plugins.title.text = 'Tiempo Total Acumulado por Grado/Grupo';
        timeChartInstance.update();
    }
}


// ----------------------------------------------------------------------
// --- LÓGICA DE GRÁFICOS Y TEMA ---
// ----------------------------------------------------------------------

function initCharts() {
    // ... (El código de initCharts es el mismo que en la versión anterior)
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
                backgroundColor: ['#B22222', '#28a745'], 
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
    
    // El evento 'change' en filtroGrado ahora también desencadena la actualización del semáforo.
    if (searchInput) searchInput.addEventListener('keyup', aplicarFiltros);
    if (filtroGrado) filtroGrado.addEventListener('change', () => {
        const grado = filtroGrado.value;
        llenarFiltroGrupo(grado);
        aplicarFiltros();
    });
    if (filtroGrupo) filtroGrupo.addEventListener('change', aplicarFiltros);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    
    cargarEstudiantes();
    
    // Opcional: Actualizar la visualización cada 5 segundos para tiempo real
    setInterval(() => {
        // Solo actualizamos la visualización si estamos en la pestaña de registro activa
        if (document.getElementById('registro').classList.contains('active')) {
             aplicarFiltros(); // Esto redibuja las tarjetas y actualiza el tiempo "Lleva fuera"
        }
        updateGlobalStatus(); // Esto actualiza los contadores y gráficos
    }, 5000); 
});
