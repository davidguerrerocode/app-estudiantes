// Constantes y variables globales
const JSON_FILE_PATH = 'datos_estudiantes.json';
const container = document.getElementById('estudiantes-container');
const filtroGrado = document.getElementById('filtro-grado');
const filtroGrupo = document.getElementById('filtro-grupo');

let estudiantesData = []; // Almacena todos los datos cargados
let gradosUnicos = new Set();
let gruposPorGrado = {}; // { '0': [1, 2, 3], '1': [4, 5], ... }

// --- FUNCIONES DE CARGA Y VISUALIZACIÓN ---

async function cargarEstudiantes() {
    try {
        const response = await fetch(JSON_FILE_PATH);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}. El archivo no se encuentra en: ${JSON_FILE_PATH}`);
        }
        
        estudiantesData = await response.json();

        if (estudiantesData.length === 0) {
            container.innerHTML = '<p>No se encontraron estudiantes en el archivo.</p>';
            return;
        }

        // 1. Procesar datos para filtros
        procesarDatosParaFiltros(estudiantesData);

        // 2. Inicializar los Selects de filtros
        llenarFiltroGrado();
        
        // 3. Mostrar la lista inicial sin filtrar
        mostrarEstudiantes(estudiantesData);
        
        // 4. Configurar Event Listeners para el filtrado
        configurarFiltrosListeners();

    } catch (error) {
        console.error('Error al cargar o parsear los datos:', error);
        container.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}. Verifica el nombre del archivo: ${JSON_FILE_PATH}</p>`;
    }
}

function procesarDatosParaFiltros(data) {
    data.forEach(estudiante => {
        const grado = String(estudiante.Grado); // Usamos string para las claves
        const grupo = String(estudiante.Grupo);

        // Identificar Grados únicos
        gradosUnicos.add(grado);

        // Agrupar Grupos por Grado
        if (!gruposPorGrado[grado]) {
            gruposPorGrado[grado] = new Set();
        }
        gruposPorGrado[grado].add(grupo);
    });

    // Convertir Sets a Arrays ordenados
    gradosUnicos = Array.from(gradosUnicos).sort();
    for (const grado in gruposPorGrado) {
        gruposPorGrado[grado] = Array.from(gruposPorGrado[grado]).sort();
    }
}

function llenarFiltroGrado() {
    gradosUnicos.forEach(grado => {
        const option = document.createElement('option');
        option.value = grado;
        option.textContent = `Grado ${grado}`;
        filtroGrado.appendChild(option);
    });
}

function llenarFiltroGrupo(gradoSeleccionado) {
    // Limpiar y resetear el filtro de Grupo
    filtroGrupo.innerHTML = '<option value="">-- Todos los Grupos --</option>';
    filtroGrupo.disabled = true;

    if (gradoSeleccionado && gruposPorGrado[gradoSeleccionado]) {
        gruposPorGrado[gradoSeleccionado].forEach(grupo => {
            const option = document.createElement('option');
            option.value = grupo;
            option.textContent = `Grupo ${grupo}`;
            filtroGrupo.appendChild(option);
        });
        filtroGrupo.disabled = false; // Habilitar si hay grupos
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
        
        card.innerHTML = `
            <div class="estudiante-info">
                <strong>${estudiante.Nombre_alumno}</strong> (${estudiante.ID})
            </div>
            <div class="grupo-info">
                Grado: ${estudiante.Grado} | Grupo: ${estudiante.Grupo}
            </div>
        `;
        
        container.appendChild(card);
    });
}

// --- LÓGICA DE FILTRADO ---

function aplicarFiltros() {
    const gradoSeleccionado = filtroGrado.value;
    const grupoSeleccionado = filtroGrupo.value;

    let estudiantesFiltrados = estudiantesData;

    // 1. Filtrar por Grado
    if (gradoSeleccionado) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            String(est.Grado) === gradoSeleccionado
        );
    }
    
    // 2. Filtrar por Grupo (solo si se seleccionó un grado o si el filtro de grupo está activo)
    if (grupoSeleccionado) {
        estudiantesFiltrados = estudiantesFiltrados.filter(est => 
            String(est.Grupo) === grupoSeleccionado
        );
    }

    mostrarEstudiantes(estudiantesFiltrados);
}

function configurarFiltrosListeners() {
    // Cuando cambia el Grado, actualiza la lista de Grupos y aplica los filtros
    filtroGrado.addEventListener('change', () => {
        const grado = filtroGrado.value;
        llenarFiltroGrupo(grado);
        aplicarFiltros();
    });

    // Cuando cambia el Grupo, aplica los filtros
    filtroGrupo.addEventListener('change', aplicarFiltros);
}

// Iniciar la carga de datos cuando la aplicación inicia
cargarEstudiantes();
