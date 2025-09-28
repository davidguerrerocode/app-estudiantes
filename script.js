// ** TU URL PÚBLICA DE GOOGLE SHEET **
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRcumpa6f1_6lkdyOU1hkymg4evm6a1vXFaWfNRDJ-cxM8qqETGPJ6GnfrzYdOdQ8RHxJ3-wuwxymzD/pub?output=csv';

const container = document.getElementById('estudiantes-container');
const filtroGrado = document.getElementById('filtro-grado');
const filtroGrupo = document.getElementById('filtro-grupo');

let estudiantesData = [];
let gradosUnicos = new Set();
let gruposPorGrado = {};

// ----------------------------------------------------------------------
// FUNCIONES DE PROCESAMIENTO CSV A JSON
// ----------------------------------------------------------------------

/**
 * Convierte el texto CSV (separado por comas) en un arreglo de objetos JSON.
 * Se asume que la primera fila son los encabezados: ID, Nombre_alumno, Grado, Grupo.
 */
function parseCSVtoJSON(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return []; // Solo encabezado o vacío

    // 1. Obtener y limpiar los encabezados
    const headers = lines[0].trim().split(',').map(header => header.trim());
    const data = [];

    // 2. Procesar cada línea de datos
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue; 

        // Usar una expresión regular para manejar comas dentro de comillas (si aplica)
        // Pero para CSV básico, split(',') es suficiente
        const values = line.split(','); 
        const student = {};

        // Mapear valores a sus encabezados
        headers.forEach((header, index) => {
            const value = values[index] ? values[index].trim() : '';

            if (header === 'Grado' || header === 'ID') {
                // Intenta convertir a número, si falla, usa el valor original (string)
                student[header] = isNaN(Number(value)) || value === '' ? value : Number(value);
            } else {
                student[header] = value;
            }
        });
        
        // Solo agregar si tiene un nombre (para ignorar filas incompletas)
        if (student.Nombre_alumno && student.Nombre_alumno !== '') {
            data.push(student);
        }
    }
    return data;
}

// ----------------------------------------------------------------------
// FUNCIONES DE CARGA DE DATOS DESDE LA URL
// ----------------------------------------------------------------------

async function cargarEstudiantes() {
    container.innerHTML = '<p>Cargando datos desde Google Sheets...</p>';
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}. Verifica que la URL sea correcta y la hoja esté publicada.`);
        }
        
        const csvText = await response.text();
        estudiantesData = parseCSVtoJSON(csvText);

        if (estudiantesData.length === 0) {
            container.innerHTML = '<p>No se encontraron estudiantes en la hoja de cálculo. Revisa los encabezados.</p>';
            return;
        }

        // Procesar y mostrar
        procesarDatosParaFiltros(estudiantesData);
        llenarFiltroGrado();
        mostrarEstudiantes(estudiantesData);
        configurarFiltrosListeners();
        console.log(`¡Datos cargados con éxito! Total de estudiantes: ${estudiantesData.length}`);

    } catch (error) {
        console.error('Error al cargar los datos desde Google Sheets:', error);
        container.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}.</p>`;
    }
}

// ----------------------------------------------------------------------
// FUNCIONES DE FILTRADO (Lógica sin cambios)
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
    filtroGrado.innerHTML = '<option value="">-- Todos los Grados --</option>';
    gradosUnicos.forEach(grado => {
        const option = document.createElement('option');
        option.value = grado;
        option.textContent = `Grado ${grado}`;
        filtroGrado.appendChild(option);
    });
}

function llenarFiltroGrupo(gradoSeleccionado) {
    filtroGrupo.innerHTML = '<option value="">-- Todos los Grupos --</option>';
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

function mostrarEstudiantes(estudiantesAMostrar) {
    container.innerHTML = ''; 

    if (estudiantesAMostrar.length === 0) {
        container.innerHTML = '<p>No se encontraron estudiantes con los filtros aplicados.</p>';
        return;
    }

    estudiantesAMostrar.forEach(estudiante => {
        const card = document.createElement('div');
        card.classList.add('estudiante-card');
        
        const nombre = estudiante.Nombre_alumno || 'Nombre Desconocido';
        const id = estudiante.ID || 'N/A';
        const grado = estudiante.Grado || 'N/A';
        const grupo = estudiante.Grupo || 'N/A';

        card.innerHTML = `
            <div class="estudiante-info">
                <strong>${nombre}</strong> (${id})
            </div>
            <div class="grupo-info">
                Grado: ${grado} | Grupo: ${grupo}
            </div>
        `;
        
        container.appendChild(card);
    });
}

function aplicarFiltros() {
    const gradoSeleccionado = filtroGrado.value;
    const grupoSeleccionado = filtroGrupo.value;

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

    mostrarEstudiantes(estudiantesFiltrados);
}

function configurarFiltrosListeners() {
    filtroGrado.addEventListener('change', () => {
        const grado = filtroGrado.value;
        llenarFiltroGrupo(grado);
        aplicarFiltros();
    });
    filtroGrupo.addEventListener('change', aplicarFiltros);
}

// Iniciar la carga de datos
cargarEstudiantes();
