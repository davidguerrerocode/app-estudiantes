// --- VARIABLES GLOBALES ---
let estudiantes = [];
const tablaBody = document.querySelector('#tablaEstudiantes tbody');
const busquedaNombreInput = document.getElementById('busquedaNombre');
const filtroGradoSelect = document.getElementById('filtroGrado');
const reportesDiv = document.getElementById('reportes');

// --- 1. CARGA DE DATOS ---

async function cargarDatos() {
    try {
        // Lee el archivo JSON local
        const response = await fetch('datos_estudiantes.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        estudiantes = await response.json();
        
        inicializarApp(estudiantes);

    } catch (error) {
        console.error("Error al cargar los datos:", error);
        tablaBody.innerHTML = '<tr><td colspan="4">Error al cargar la base de datos. Asegúrate de tener el archivo datos_estudiantes.json.</td></tr>';
    }
}

// --- 2. FUNCIONES PRINCIPALES ---

function inicializarApp(data) {
    renderizarTabla(data); 
    llenarOpcionesGrado(data);
    generarReporte(data);

    // Configura los eventos para que la tabla se filtre al escribir o seleccionar
    busquedaNombreInput.addEventListener('input', filtrarEstudiantes);
    filtroGradoSelect.addEventListener('change', filtrarEstudiantes);
}

function renderizarTabla(data) {
    tablaBody.innerHTML = ''; 
    
    if (data.length === 0) {
        tablaBody.innerHTML = '<tr><td colspan="4">No se encontraron estudiantes.</td></tr>';
        return;
    }

    data.forEach(estudiante => {
        const fila = tablaBody.insertRow();
        fila.insertCell().textContent = estudiante.ID;
        fila.insertCell().textContent = estudiante.Nombre_alumno;
        fila.insertCell().textContent = estudiante.Grado;
        fila.insertCell().textContent = estudiante.Grupo;
    });
}

function filtrarEstudiantes() {
    const textoBusqueda = busquedaNombreInput.value.toLowerCase();
    const gradoSeleccionado = filtroGradoSelect.value;
    
    const estudiantesFiltrados = estudiantes.filter(estudiante => {
        // Filtro 1: Búsqueda por Nombre (case-insensitive)
        const coincideNombre = estudiante.Nombre_alumno.toLowerCase().includes(textoBusqueda);
        
        // Filtro 2: Filtrado por Grado
        const coincideGrado = gradoSeleccionado === "" || estudiante.Grado === gradoSeleccionado;
        
        return coincideNombre && coincideGrado;
    });

    renderizarTabla(estudiantesFiltrados);
}

function llenarOpcionesGrado(data) {
    const gradosUnicos = [...new Set(data.map(e => e.Grado))].sort();

    gradosUnicos.forEach(grado => {
        const option = document.createElement('option');
        option.value = grado;
        option.textContent = `Grado ${grado}`;
        filtroGradoSelect.appendChild(option);
    });
}

function generarReporte(data) {
    const conteoGrados = data.reduce((conteo, estudiante) => {
        const grado = estudiante.Grado;
        conteo[grado] = (conteo[grado] || 0) + 1; 
        return conteo;
    }, {});

    let htmlReporte = '<ul>';
    Object.entries(conteoGrados).sort().forEach(([grado, total]) => {
        htmlReporte += `<li>**Grado ${grado}:** ${total} estudiantes</li>`;
    });
    htmlReporte += '</ul>';

    reportesDiv.innerHTML = `
        <h2>Reporte de Grados</h2>
        ${htmlReporte}
    `;
}

// --- INICIO DE LA APLICACIÓN ---
cargarDatos();