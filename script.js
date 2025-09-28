// ** TU URL PÚBLICA DE GOOGLE SHEET **
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRcumpa6f1_6lkdyOU1hkymg4evm6a1vXFaWfNRDJ-cxM8qqETGPJ6GnfrzYdOdQ8RHxJ3-wuwxymzD/pub?output=csv';
const MAX_STUDENTS_OUT_PER_GROUP = 2; 

// Elementos del DOM y Constantes
const container = document.getElementById('estudiantes-container');
const filtroGrado = document.getElementById('filtro-grado');
const filtroGrupo = document.getElementById('filtro-grupo');
const searchInput = document.getElementById('search-input');
const themeToggle = document.getElementById('theme-toggle');

// Estado Global Avanzado (incluye tiempos)
let estudiantesData = []; 
let estudiantesStatus = {}; // { 'ID': { state: 'in'/'out', outTime: timestamp, totalTimeOut: ms }, ... }
let statusChartInstance = null;
let timeChartInstance = null;

// --- UTILERÍAS ---

// Función para guardar el estado en el almacenamiento local
function saveStatus() {
    localStorage.setItem('estudiantesStatus', JSON.stringify(estudiantesStatus));
}

// Función para cargar el estado desde el almacenamiento local
function loadStatus() {
    const savedStatus = localStorage.getItem('estudiantesStatus');
    if (savedStatus) {
        estudiantesStatus = JSON.parse(savedStatus);
    }
}

// Convierte milisegundos a formato mm:ss o m min
function formatTime(ms) {
    if (ms < 60000) {
        return `${Math.round(ms / 1000)} seg`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes} min`;
}

// --- LÓGICA CSV Y CARGA ---

function parseCSVtoJSON(csvText) {
    // [Se mantiene la función de parseo CSV]
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
            if (header === 'Grado' || header === 'ID') {
                student[header] = isNaN(Number(value)) || value === '' ? value : Number(value);
            } else {
                student[header] = value;
            }
        });

        if (student.Nombre_alumno && student.Nombre_alumno !== '') {
            const id = student.ID;
            data.push(student);
            
            // Inicializar el estado si no existe (o si es un nuevo estudiante en el sheet)
            if (!estudiantesStatus.hasOwnProperty(id)) {
                 estudiantesStatus[id] = { state: 'in', outTime: null, totalTimeOut: 0 }; 
            } else {
                 // Si el estado se cargó, asegurar que tenga todas las propiedades
                 if (!estudiantesStatus[id].totalTimeOut) estudiantesStatus[id].totalTimeOut = 0;
            }
        }
    }
    return data;
}

async function cargarEstudiantes() {
    loadStatus(); // Cargar estado persistente al inicio
    container.innerHTML = '<p>Cargando datos desde Google Sheets...</p>';
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
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
        container.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}.</p>`;
    }
}

// --- LÓGICA DE REGISTRO (SALIDA/ENTRADA) CON TIEMPOS ---

function toggleRegistro(id) {
    const studentStatus = estudiantesStatus[id];
    const estudiante = estudiantesData.find(est => est.ID === id);

    if (!estudiante) return;

    if (studentStatus.state === 'in') {
        // Registrar Salida
        const outCount = countStudentsOutByGroup(estudiante.Grado, estudiante.Grupo);
        
        if (outCount >= MAX_STUDENTS_OUT_PER_GROUP) {
            alert(`Límite alcanzado: Ya hay ${MAX_STUDENTS_OUT_PER_GROUP} estudiantes del grupo ${estudiante.Grado}-${estudiante.Grupo} fuera.`);
            return; 
        }
        
        studentStatus.state = 'out';
        studentStatus.outTime = new Date().getTime(); // Marca de tiempo de salida
        
    } else {
        // Registrar Entrada
        studentStatus.state = 'in';
        if (studentStatus.outTime) {
            const timeElapsed = new Date().getTime() - studentStatus.outTime;
            studentStatus.totalTimeOut += timeElapsed; // Acumular tiempo
            studentStatus.outTime = null; // Reiniciar marca de tiempo
        }
    }

    saveStatus(); // Persistir el estado después de cada cambio
    updateGlobalStatus();
    aplicarFiltros(); // Re-renderizar la lista
}

function countStudentsOutByGroup(grado, grupo) {
    let count = 0;
    for (const est of estudiantesData) {
        if (String(est.Grado) === String(grado) && 
            String(est.Grupo) === String(grupo) && 
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
        if (status.state === 'out') {
            outCount++;
        }
        totalTimeOutMS += status.totalTimeOut;
    }

    const totalStudents = estudiantesData.length;
    document.getElementById('count-out').textContent = outCount;
    document.getElementById('count-total').textContent = totalStudents;
    
    // Calcular tiempo promedio
    const avgTimeMs = totalStudents > 0 ? totalTimeOutMS / totalStudents : 0;
    document.getElementById('avg-time-out').textContent = formatTime(avgTimeMs);

    updateCharts(outCount, totalStudents - outCount);
}

// --- LÓGICA DE FILTRADO Y BÚSQUEDA ---

function aplicarFiltros() {
    const gradoSeleccionado = filtroGrado.value;
    const grupoSeleccionado = filtroGrupo.value;
    const searchText = searchInput.value.toLowerCase();

    let estudiantesFiltrados = estudiantesData;

    // 1. Filtrar por Grado
    if (gradoSeleccionado) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            String(est.Grado).trim() === gradoSeleccionado
        );
    }
    
    // 2. Filtrar por Grupo
    if (grupoSeleccionado) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            String(est.Grupo).trim() === grupoSeleccionado
        );
    }

    // 3. Filtrar por Búsqueda (Nombre o ID)
    if (searchText) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            est.Nombre_alumno.toLowerCase().includes(searchText) || 
            String(est.ID).includes(searchText)
        );
    }

    mostrarEstudiantes(estudiantesFiltrados);
}

// [ Las funciones llenarFiltroGrado, llenarFiltroGrupo, procesarDatosParaFiltros se mantienen de la versión anterior ]

// --- LÓGICA DE GRÁFICOS (Chart.js) ---

function initCharts() {
    // Gráfico de Estado Actual (Doughnut)
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    statusChartInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Estudiantes Fuera', 'Estudiantes Dentro'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#dc3545', '#28a745'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Estado Actual' } }
        }
    });

    // Gráfico de Ejemplo (Tiempo Promedio por Grado)
    const ctxTime = document.getElementById('timeChart').getContext('2d');
    timeChartInstance = new Chart(ctxTime, {
        type: 'bar',
        data: {
            labels: ['Grado 1', 'Grado 2', 'Grado 3'],
            datasets: [{
                label: 'Tiempo Promedio (min)',
                data: [5, 3, 7],
                backgroundColor: ['#5d5dff', '#5d5dff', '#5d5dff'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Tiempo Promedio por Grado (Ejemplo)' } }
        }
    });
}

function updateCharts(outCount, inCount) {
    if (statusChartInstance) {
        statusChartInstance.data.datasets[0].data = [outCount, inCount];
        // Actualizar colores si es modo oscuro
        const borderColor = document.body.classList.contains('dark-mode') ? '#38385e' : '#fff';
        statusChartInstance.data.datasets[0].borderColor = [borderColor, borderColor];
        statusChartInstance.options.plugins.title.color = document.body.classList.contains('dark-mode') ? '#f4f4f9' : '#333';

        statusChartInstance.update();
    }
}

// --- LÓGICA DE PESTAÑAS Y TEMA ---

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
    updateCharts(
        estudiantesData.filter(est => estudiantesStatus[est.ID].state === 'out').length,
        estudiantesData.filter(est => estudiantesStatus[est.ID].state === 'in').length
    );
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


// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    handleNavigation();
    
    // Inicializar listeners de búsqueda y filtro
    searchInput.addEventListener('keyup', aplicarFiltros);
    filtroGrado.addEventListener('change', () => {
        const grado = filtroGrado.value;
        llenarFiltroGrupo(grado);
        aplicarFiltros();
    });
    filtroGrupo.addEventListener('change', aplicarFiltros);
    
    // Cargar datos
    cargarEstudiantes();
});

// [Nota: Las funciones mostrarEstudiantes, procesarDatosParaFiltros, llenarFiltroGrado, llenarFiltroGrupo deben ser incluidas en el script.js final, ya que son esenciales para la interfaz. Se asume que el usuario las mantendrá de las versiones anteriores.]
