// Ruta del archivo JSON
const JSON_FILE_PATH = 'datos_estudiantes.json';
const container = document.getElementById('estudiantes-container');

async function cargarEstudiantes() {
    try {
        // 1. Petición al archivo JSON
        const response = await fetch(JSON_FILE_PATH);
        
        // Manejo de errores de HTTP (ej: 404 No encontrado)
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}. El archivo no se encuentra en: ${JSON_FILE_PATH}`);
        }
        
        // 2. Convertir la respuesta a un objeto JavaScript (JSON)
        const estudiantes = await response.json();

        // Limpiar el mensaje de "Cargando datos..."
        container.innerHTML = ''; 

        // 3. Verificar si el arreglo está vacío
        if (estudiantes.length === 0) {
            container.innerHTML = '<p>No se encontraron estudiantes en el archivo.</p>';
            return;
        }

        // 4. Mostrar la lista de estudiantes
        estudiantes.forEach(estudiante => {
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

        console.log(`¡Datos cargados con éxito! Total de estudiantes: ${estudiantes.length}`);

    } catch (error) {
        // 5. Mostrar cualquier error de carga
        console.error('Error al cargar o parsear los datos:', error);
        container.innerHTML = `<p style="color: red;">⚠️ Error al cargar los datos: ${error.message}</p>`;
    }
}

// Iniciar la carga
cargarEstudiantes();
