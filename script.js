document.addEventListener('DOMContentLoaded', () => {
    // --- NOTA IMPORTANTE PARA EL DESARROLLO EN VS CODE/GITHUB PAGES ---
    // La aplicación completa de Smart Break SÓLO funciona cuando se carga desde la URL de Google Apps Script.
    // Los botones (Salida/Regreso) no funcionarán en VS Code o GitHub Pages porque requieren 'google.script.run'.
    // He modificado la inicialización para que la app se cargue solo con datos de caché si falla la conexión.
    
    // --- THEME ---
    const themeToggle = document.getElementById('theme-toggle');
    const applyTheme = (theme) => { 
        document.documentElement.classList.toggle('dark', theme === 'dark'); 
        document.getElementById('theme-icon-sun').classList.toggle('hidden', theme === 'dark'); 
        document.getElementById('theme-icon-moon').classList.toggle('hidden', theme !== 'dark'); 
        // Renderizar todos los gráficos para que el color de texto se actualice
        renderAnalytics(getFilteredHistory()); 
    };
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);
    themeToggle.addEventListener('click', () => { 
        const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; 
        localStorage.setItem('theme', newTheme); 
        applyTheme(newTheme); 
        renderAll(); 
    });
    
    // --- TOAST NOTIFICATIONS ---
    const toastContainer = document.getElementById('toast-container');
    function showToast(message, type = 'success') { 
        const toast = document.createElement('div'); 
        toast.className = `toast toast-${type}`; 
        toast.textContent = message; 
        toastContainer.appendChild(toast); 
        setTimeout(() => toast.remove(), 3000); 
    }

    // --- ESTADO GLOBAL & DOM ---
    // He añadido datos de prueba para que la app no esté vacía en VS Code
    let allStudents = [
        { name: "Juan Pérez", grade: "SEXTO", group: "A" },
        { name: "María García", grade: "SEXTO", group: "B" },
        { name: "Pedro López", grade: "SEPTIMO", group: "A" },
        { name: "Ana Díaz", grade: "SEPTIMO", group: "A" },
        { name: "Luis Martínez", grade: "DECIMO", group: "C" },
    ], allHistory = [], outOfClassroom = [], activeGroup = null, currentStudentId = null;
    let charts = { reasons: null, students: null, hourly: null, avgDuration: null, groupDepartures: null };
    let timers = {};
    let settings = { 
        alertThreshold: 10, 
        departureReasons: ["Baño", "Coordinación", "Enfermería", "Psicología", "Otro"] 
    };
    const { jsPDF } = window.jspdf;

    const dom = {
        loader: document.getElementById('loader'), 
        tabs: document.querySelectorAll('.tab-btn'), 
        tabContents: document.querySelectorAll('.tab-content'),
        dateFilterSection: document.getElementById('date-filter-section'), 
        startDate: document.getElementById('start-date'), 
        endDate: document.getElementById('end-date'),
        resetDatesBtn: document.getElementById('reset-dates'), 
        outList: document.getElementById('out-of-classroom-list'), 
        noOutMessage: document.getElementById('no-students-out'),
        groupList: document.getElementById('group-list'), 
        studentList: document.getElementById('student-list'), 
        selectGroupPrompt: document.getElementById('select-group-prompt'),
        searchFilter: document.getElementById('search-filter'), 
        historyTableBody: document.getElementById('history-table-body'), 
        modal: document.getElementById('departure-modal'),
        modalStudentName: document.getElementById('modal-student-name'), 
        departureReason: document.getElementById('departure-reason'),
        reasonsList: document.getElementById('reasons-list'), 
        newReasonInput: document.getElementById('new-reason-input'), 
        addReasonBtn: document.getElementById('add-reason-btn'),
        alertThresholdInput: document.getElementById('alert-threshold'), 
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        exportCsvBtn: document.getElementById('export-csv'), 
        exportPdfBtn: document.getElementById('export-pdf'),
    };
    
    // --- SETTINGS & LOCAL STORAGE ---
    function loadSettings() { 
        try { 
            const s = localStorage.getItem('smartBreakSettings'); 
            if(s) settings = JSON.parse(s); 
        } catch(e){} 
        dom.alertThresholdInput.value = settings.alertThreshold; 
        renderReasonsList(); 
    }
    function saveSettings() { 
        settings.alertThreshold = parseInt(dom.alertThresholdInput.value) || 10; 
        localStorage.setItem('smartBreakSettings', JSON.stringify(settings)); 
        showToast('Configuración guardada.', 'success'); 
        renderAll(); 
    }
    function renderReasonsList() { 
        dom.reasonsList.innerHTML = settings.departureReasons.map((r, i) => 
            `<div class="flex justify-between items-center p-2 rounded" style="background-color: var(--bg-main)">
                <span>${r}</span>
                <button data-index="${i}" class="remove-reason-btn text-red-500 font-bold text-xl px-2">&times;</button>
            </div>`).join(''); 
        dom.departureReason.innerHTML = settings.departureReasons.map(r => `<option>${r}</option>`).join(''); 
    }
    function addReason() { 
        const r = dom.newReasonInput.value.trim(); 
        if (r && !settings.departureReasons.includes(r)) { 
            settings.departureReasons.push(r); 
            dom.newReasonInput.value = ''; 
            renderReasonsList(); 
            saveSettings(); 
            showToast('Motivo de salida añadido.', 'success');
        } else if(settings.departureReasons.includes(r)) {
            showToast('Este motivo ya existe.', 'info');
        }
    }
    function removeReason(index) { 
        settings.departureReasons.splice(index, 1); 
        renderReasonsList(); 
        saveSettings(); 
        showToast('Motivo de salida eliminado.', 'error');
    }

    const toggleLoader = (show) => dom.loader.style.display = show ? 'flex' : 'none';
    
    // Almacenamiento Local (Caché de emergencia/Offline)
    function saveSession() { localStorage.setItem('smartBreakSession', JSON.stringify(outOfClassroom)); }
    function loadSession() { try { const s = localStorage.getItem('smartBreakSession'); if(s) outOfClassroom = JSON.parse(s); } catch(e){ outOfClassroom = []; } }
    function saveStudentCache() { localStorage.setItem('smartBreakStudents', JSON.stringify(allStudents)); }
    function loadStudentCache() { try { const s = localStorage.getItem('smartBreakStudents'); if(s) allStudents = JSON.parse(s); } catch(e) { /* Usar datos de prueba si no hay caché */ } }
    function saveHistoryCache() { localStorage.setItem('smartBreakHistory', JSON.stringify(allHistory)); }
    function loadHistoryCache() { try { const h = localStorage.getItem('smartBreakHistory'); if(h) allHistory = JSON.parse(h); } catch(e){ allHistory = []; } }

    /** Filtra el historial por el rango de fechas seleccionado */
    function getFilteredHistory() { 
        const start = dom.startDate.valueAsDate, end = dom.endDate.valueAsDate; 
        if (!start && !end) return allHistory; 
        if(start) start.setHours(0,0,0,0); 
        if(end) end.setHours(23,59,59,999); 
        
        return allHistory.filter(h => { 
            const d = new Date(h.departureTime); 
            if(isNaN(d.getTime())) return false; 
            
            return (start ? d >= start : true) && (end ? d <= end : true); 
        }); 
    }

    /** Llama a todas las funciones de renderizado */
    function renderAll() { 
        const filteredHistory = getFilteredHistory();
        populateGroupList(); 
        renderStudents(); 
        renderOutOfClassroom(); 
        renderHistoryTable(filteredHistory); 
        renderAnalytics(filteredHistory); 
        renderStatCards(); 
    }

    // --- RENDER FUNCTIONS (Lógica del frontend, sin cambios) ---
    function populateGroupList() {
        // Agrupar y ordenar las asignaturas/grupos
        const grades = [...new Set(allStudents.map(s => s.grade))];
        const gradeOrder = ["PRE-JARDIN", "JARDIN", "TRANSICION", "PRIMERO", "SEGUNDO", "TERCERO", "CUARTO", "QUINTO", "SEXTO", "SEPTIMO", "OCTAVO", "NOVENO", "DECIMO", "UNDECIMO"];
        grades.sort((a, b) => {
            const indexA = gradeOrder.indexOf(a);
            const indexB = gradeOrder.indexOf(b);
            if (indexA > -1 && indexB > -1) return indexA - indexB;
            return a.localeCompare(b);
        });

        dom.groupList.innerHTML = grades.map(g => { 
            const groupsInGrade = [...new Set(allStudents.filter(s => s.grade === g).map(s => s.group))].sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
            return `<div class="accordion-item">
                <button class="accordion-header w-full flex justify-between items-center p-3 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-gray-700" style="color: var(--text-primary)">
                    <span class="font-semibold">${g}</span>
                    <svg class="accordion-arrow w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div class="accordion-content pl-4 pt-1" style="color: var(--text-primary)">
                    ${groupsInGrade.map(gr => 
                        `<button class="w-full text-left p-2 rounded-md transition-colors group-btn ${activeGroup === `${g} - ${gr}` ? 'group-btn-active' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}" data-group="${g} - ${gr}">Grupo ${gr}</button>`
                    ).join('')}
                </div>
            </div>`;
        }).join('');
        
        document.querySelectorAll('.accordion-header').forEach(h => h.addEventListener('click', () => { 
            const c = h.nextElementSibling; 
            h.classList.toggle('open'); 
            c.style.maxHeight = c.style.maxHeight ? null : `${c.scrollHeight}px`; 
        }));
        
        document.querySelectorAll('.group-btn').forEach(b => b.addEventListener('click', (e) => { 
            activeGroup = b.dataset.group;
            document.querySelectorAll('.group-btn').forEach(btn => btn.classList.remove('group-btn-active'));
            e.currentTarget.classList.add('group-btn-active');
            renderStudents(); 
        }));

        if (activeGroup) {
            const [grade] = activeGroup.split(' - ');
            const header = dom.groupList.querySelector(`.accordion-header span:contains('${grade}')`).closest('.accordion-header');
            if (header && !header.classList.contains('open')) {
                header.classList.add('open');
                header.nextElementSibling.style.maxHeight = `${header.nextElementSibling.scrollHeight}px`;
            }
        }
    }

    if (!String.prototype.includes) {
        String.prototype.includes = function(search, start) {
            'use strict';
            if (search instanceof RegExp) {
                throw TypeError('first argument must not be a RegExp');
            }
            if (start === undefined) { start = 0; }
            return this.indexOf(search, start) !== -1;
        };
    }
    
    function renderStudents() {
        if (!activeGroup) { 
            dom.studentList.innerHTML = ''; 
            dom.studentList.appendChild(dom.selectGroupPrompt); 
            dom.selectGroupPrompt.style.display = 'block';
            return; 
        }

        dom.selectGroupPrompt.style.display = 'none';
        
        const [grade, group] = activeGroup.split(' - ');
        const term = dom.searchFilter.value.toLowerCase();
        
        const toShow = allStudents.filter(s => 
            s.grade === grade && 
            s.group === group && 
            s.name.toLowerCase().includes(term)
        );
        
        if (toShow.length === 0) { 
            dom.studentList.innerHTML = `<p class="text-center p-4" style="color: var(--text-secondary)">No se encontraron estudiantes en este grupo.</p>`; 
            return; 
        }

        dom.studentList.innerHTML = toShow.map(s => { 
            const studentId = s.name; 
            const isOut = outOfClassroom.some(o => o.id === studentId); 
            
            // Los botones llaman a funciones que ya no tienen la conexión a Apps Script, pero evitan errores.
            return `<div class="flex items-center justify-between p-4">
                <span class="font-medium">${s.name}</span>
                <button onclick="toggleModal(true, '${studentId}')" 
                    class="text-sm px-3 py-1 rounded-full text-white transition-colors 
                    ${isOut ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}" 
                    ${isOut ? 'disabled' : ''}>
                    Salida
                </button>
            </div>`; 
        }).join('');
    }

    function renderOutOfClassroom() {
        Object.values(timers).forEach(clearInterval);
        timers = {};
        
        dom.noOutMessage.style.display = outOfClassroom.length === 0 ? 'block' : 'none';
        
        dom.outList.innerHTML = outOfClassroom.map(s => { 
            const diffMins = (new Date() - new Date(s.time)) / 60000; 
            const alertClass = diffMins > settings.alertThreshold ? 'long-absence-alert' : ''; 
            
            return `<div class="card p-4 rounded-lg shadow-md flex flex-col justify-between animate-fade-in border-l-4 ${alertClass}" style="border-color: var(--text-accent)">
                <div>
                    <p class="font-bold text-lg">${s.name}</p>
                    <p class="text-sm" style="color: var(--text-secondary)">${s.reason}</p>
                    <p class="text-xs mt-1" style="color: var(--text-secondary)">Salió: ${new Date(s.time).toLocaleTimeString()}</p>
                </div>
                <div class="mt-4">
                    <p id="timer-${s.id}" class="text-center font-mono text-xl text-red-600 dark:text-red-500 mb-2">00:00</p>
                    <button onclick="returnStudent('${s.id}')" 
                        class="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                        Regresar
                    </button>
                </div>
            </div>`; 
        }).join('');
        
        outOfClassroom.forEach(startTimer);
    }

    function renderHistoryTable(historyData) {
        if (historyData.length === 0) { 
            dom.historyTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8" style="color: var(--text-secondary)">No hay registros para las fechas seleccionadas.</td></tr>`; 
            return; 
        }
        
        dom.historyTableBody.innerHTML = historyData.slice().reverse().map(h => {
            const departure = h.departureTime ? new Date(h.departureTime).toLocaleString() : '---';
            const retorno = h.returnTime ? new Date(h.returnTime).toLocaleString() : '---';
            const duracion = h.duration || '---';

            return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td class="p-4 font-medium">${h.name}</td>
                <td class="p-4">${h.reason}</td>
                <td class="p-4">${departure}</td>
                <td class="p-4">${retorno}</td>
                <td class="p-4">${duracion}</td>
            </tr>`;
        }).join('');
    }

    // Funciones de gráficos y estadísticas (sin cambios, usan datos locales o de caché)
    function renderAnalytics(historyData) { /* ... Lógica de gráficos ... */ }
    function renderStatCards() { /* ... Lógica de tarjetas ... */ }
    function startTimer(student) { /* ... Lógica del contador ... */ }
    function exportToCSV() { /* ... Lógica de exportación CSV ... */ }
    function exportToPDF() { /* ... Lógica de exportación PDF ... */ }
    
    // Las funciones que interactúan con el backend han sido modificadas para *solo* funcionar localmente
    
    window.confirmDeparture = () => { 
        const s = allStudents.find(s => s.name === currentStudentId); 
        if (s) { 
            const t = new Date(), t_iso = t.toISOString(), r = dom.departureReason.value, n = s.name; 
            const studentId = n; 
            
            // Simulación local
            outOfClassroom.push({ id: studentId, name: n, reason: r, time: t_iso }); 
            allHistory.push({ studentId: studentId, name: n, reason: r, departureTime: t_iso, timestamp: new Date().toISOString(), returnTime: null, duration: null }); 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 
            toggleModal(false); 
            showToast(`Salida de ${n} simulada (Modo Local).`, 'info'); 
            
            // **AQUÍ IRÍA LA LLAMADA A GOOGLE SCRIPT, ELIMINADA PARA GITHUB PAGES**
        } 
    };

    window.returnStudent = (id) => { 
        const i = outOfClassroom.findIndex(s => s.id === id); 
        if (i > -1) { 
            const s = outOfClassroom[i];
            const t = new Date(), t_iso = t.toISOString();
            const d_s = Math.floor((t - new Date(s.time)) / 1000); 
            const d = `${Math.floor(d_s / 60)}m ${d_s % 60}s`; 
            
            // Simulación local
            const h = allHistory.find(h => h.studentId === id && !h.returnTime); 
            if(h) { h.returnTime = t_iso; h.duration = d; } 
            
            outOfClassroom.splice(i, 1); 
            clearInterval(timers[id]); 
            delete timers[id]; 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 
            showToast(`Regreso de ${s.name} simulado (Modo Local).`, 'info'); 
            
            // **AQUÍ IRÍA LA LLAMADA A GOOGLE SCRIPT, ELIMINADA PARA GITHUB PAGES**
        } else {
             showToast('Error: El estudiante ya no aparece como ausente.', 'error');
        }
    };
    
    // --- INIT & LISTENERS ---
    dom.tabs.forEach(t => t.addEventListener('click', () => setActiveTab(t.dataset.tab)));
    dom.searchFilter.addEventListener('input', renderStudents);
    [dom.startDate, dom.endDate].forEach(i => i.addEventListener('change', renderAll));
    dom.resetDatesBtn.addEventListener('click', () => { dom.startDate.value = ''; dom.endDate.value = ''; renderAll(); });
    dom.saveSettingsBtn.addEventListener('click', saveSettings);
    dom.addReasonBtn.addEventListener('click', addReason);
    dom.reasonsList.addEventListener('click', (e) => { 
        if (e.target.classList.contains('remove-reason-btn')) { removeReason(e.target.dataset.index); }
    });
    dom.exportCsvBtn.addEventListener('click', exportToCSV);
    dom.exportPdfBtn.addEventListener('click', exportToPDF);
    window.toggleModal = (show, id = null) => { /* ... Lógica del modal ... */ }; // Asegurar que sea global

    function initializeApp() {
        toggleLoader(true);
        loadSettings();
        loadSession();
        // loadStudentCache(); // Usamos los datos de prueba
        loadHistoryCache();
        
        renderAll(); 
        setActiveTab('dashboard');
        toggleLoader(false);
        showToast('Modo de desarrollo local. La app NO está conectada a la base de datos de Google Sheets.', 'info');
        
        // **ELIMINADA LA LLAMADA A google.script.run.getInitialData()**
    }
    
    initializeApp();
});
// (Aquí deberían estar las funciones auxiliares de renderAnalytics, startTimer, exports, etc., si las tienes separadas.
// Si no las tienes, asegúrate de copiarlas en la parte superior del archivo JS, antes de la función initializeApp)