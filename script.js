// ** TU URL PÚBLICA DE GOOGLE SHEET **
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRcumpa6f1_6lkdyOU1hkymg4evm6a1vXFaWfNRDJ-cxM8qqETGPJ6GnfrzYdOdQ8RHxJ3-wuwxymzD/pub?output=csv';
const MAX_STUDENTS_OUT_PER_GROUP = 2; // Límite de salida

// Elementos del DOM
const container = document.getElementById('estudiantes-container');
const filtroGrado = document.getElementById('filtro-grado');
const filtroGrupo = document.getElementById('filtro-grupo');
const themeToggle = document.getElementById('theme-toggle');
const statusContador = document.getElementById('status-contador');
document.getElementById('max-limit').textContent = MAX_STUDENTS_OUT_PER_GROUP;

// Estado Global
let estudiantesData = []; // Todos los estudiantes cargados
let estudiantesStatus = {}; // { 'ID': 'out'/'in', ... }
let statusChartInstance = null; // Instancia del gráfico

// --- LÓGICA CSV Y CARGA ---

function parseCSVtoJSON(csvText) {
    // [Se mantiene la función de parseo CSV que funciona con tus datos]
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
            data.push(student);
            // Inicializar el estado de todos los estudiantes a 'in'
            if (!estudiantesStatus.hasOwnProperty(student.ID)) {
                 estudiantesStatus[student.ID] = 'in'; 
            }
        }
    }
    return data;
}


async function cargarEstudiantes() {
    // ... Lógica de carga desde GOOGLE_SHEET_URL ...
    container.innerHTML = '<p>Cargando datos desde Google Sheets...</p>';
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
        aplicarFiltros(); // Mostrar y filtrar
        updateGlobalStatus();
        initChart();
        configurarFiltrosListeners();
        
        console.log(`¡Datos cargados con éxito! Total: ${estudiantesData.length}`);

    } catch (error) {
        console.error('Error al cargar los datos:', error);
        container.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}.</p>`;
    }
}

// --- LÓGICA DE REGISTRO (SALIDA/ENTRADA) ---

function toggleRegistro(id) {
    const currentState = estudiantesStatus[id];
    const estudiante = estudiantesData.find(est => est.ID === id);

    if (!estudiante) return;

    if (currentState === 'in') {
        // Intentar registrar salida
        const outCount = countStudentsOutByGroup(estudiante.Grado, estudiante.Grupo);
        
        if (outCount >= MAX_STUDENTS_OUT_PER_GROUP) {
            alert(`Límite alcanzado: Ya hay ${MAX_STUDENTS_OUT_PER_GROUP} estudiantes del Grado ${estudiante.Grado}, Grupo ${estudiante.Grupo} fuera.`);
            return; // Bloquear la salida
        }
        estudiantesStatus[id] = 'out';
    } else {
        // Registrar entrada
        estudiantesStatus[id] = 'in';
    }

    // Actualizar la interfaz después del cambio de estado
    updateGlobalStatus();
    aplicarFiltros(); // Re-renderizar para actualizar el estado visual
}

function countStudentsOutByGroup(grado, grupo) {
    let count = 0;
    for (const est of estudiantesData) {
        if (String(est.Grado) === String(grado) && 
            String(est.Grupo) === String(grupo) && 
            estudiantesStatus[est.ID] === 'out') {
            count++;
        }
    }
    return count;
}

function updateGlobalStatus() {
    let outCount = 0;
    for (const id in estudiantesStatus) {
        if (estudiantesStatus[id] === 'out') {
            outCount++;
        }
    }
    statusContador.textContent = `Estudiantes fuera: ${outCount} / Total: ${estudiantesData.length}`;
    updateChart(outCount, estudiantesData.length - outCount);
}


// --- LÓGICA DE FILTRADO Y VISUALIZACIÓN ---

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
        const isOut = estudiantesStatus[id] === 'out';
        
        // Verificar si el límite del grupo está alcanzado (si el estudiante está dentro)
        const outCount = countStudentsOutByGroup(grado, grupo);
        const limitReached = !isOut && outCount >= MAX_STUDENTS_OUT_PER_GROUP;


        const card = document.createElement('div');
        card.classList.add('estudiante-card');
        if (isOut) card.classList.add('out');
        if (limitReached) card.classList.add('limit-reached');
        
        const btnText = isOut ? 'Registrar Entrada' : 'Registrar Salida';
        
        card.innerHTML = `
            <div class="estudiante-info">
                <strong>${estudiante.Nombre_alumno}</strong> (${id})
            </div>
            <div class="grupo-info">
                Grado: ${grado} | Grupo: ${grupo}
            </div>
            <button class="registro-btn" 
                    data-id="${id}" 
                    ${limitReached ? 'disabled' : ''}>
                ${btnText}
            </button>
        `;
        
        container.appendChild(card);
    });
    
    // Asignar listeners a los nuevos botones
    document.querySelectorAll('.registro-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            toggleRegistro(id);
        });
    });
}

// [ Las funciones procesarDatosParaFiltros, llenarFiltroGrado, llenarFiltroGrupo, aplicarFiltros se mantienen de la versión anterior ]
// (Para ahorrar espacio, asumimos que están incluidas aquí, ya que funcionan correctamente)

// --- LÓGICA DE GRÁFICOS (Chart.js) ---

function initChart() {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    statusChartInstance = new Chart(ctx, {
        type: 'doughnut', // Gráfico de pastel (donut)
        data: {
            labels: ['Estudiantes Fuera', 'Estudiantes Dentro'],
            datasets: [{
                data: [0, 0], // Valores iniciales
                backgroundColor: [
                    'rgba(220, 53, 69, 0.8)', // Rojo para Fuera
                    'rgba(40, 167, 69, 0.8)' // Verde para Dentro
                ],
                borderColor: [
                    'rgba(255, 255, 255, 1)',
                    'rgba(255, 255, 255, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // CLAVE para que funcione la solución CSS
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Estado Actual del Aula'
                }
            }
        }
    });
}

function updateChart(outCount, inCount) {
    if (statusChartInstance) {
        statusChartInstance.data.datasets[0].data = [outCount, inCount];
        // Opcional: ajustar colores para el modo oscuro
        const borderColor = document.body.classList.contains('dark-mode') ? '#333' : '#fff';
        statusChartInstance.data.datasets[0].borderColor = [borderColor, borderColor];
        
        statusChartInstance.update();
    }
}

// --- LÓGICA DE MODO CLARO / OSCURO ---

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Opcional: forzar actualización del gráfico para cambiar bordes/colores si aplica
    updateChart(
        estudiantesData.filter(est => estudiantesStatus[est.ID] === 'out').length,
        estudiantesData.filter(est => estudiantesStatus[est.ID] === 'in').length
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
loadTheme(); // Cargar tema antes de cualquier otra cosa
themeToggle.addEventListener('click', toggleTheme);
cargarEstudiantes();
