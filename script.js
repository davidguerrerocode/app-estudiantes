document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL & DOM ---
    let allStudents = [], allHistory = [], outOfClassroom = [], activeGroup = null;
    let charts = { reasons: null, students: null, hourly: null, avgDuration: null, groupDepartures: null };
    let timers = {};
    let currentStudentId = null;
    
    // Configuración inicial de motivos
    let settings = { 
        alertThreshold: 10, 
        departureReasons: [ 
            { name: "Baño", time: 5 }, 
            { name: "Coordinación", time: 10 }, 
            { name: "Enfermería", time: 15 }, 
            { name: "Psicología", time: 10 }, 
            { name: "Otro", time: 20 }
        ]
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
        reasonsTimeList: document.getElementById('reasons-time-list'), 
        newReasonInput: document.getElementById('new-reason-input'), 
        newReasonTime: document.getElementById('new-reason-time'), 
        addReasonBtn: document.getElementById('add-reason-btn'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        exportCsvBtn: document.getElementById('export-csv'), 
        exportPdfBtn: document.getElementById('export-pdf'),
        toastContainer: document.getElementById('toast-container'),
        themeToggle: document.getElementById('theme-toggle'),
    };
    
    // --- UTILIDADES Y TEMA ---
    const toggleLoader = (show) => dom.loader.style.display = show ? 'flex' : 'none';

    function getAlertThresholdByReason(reasonName) {
        const reason = settings.departureReasons.find(r => r.name === reasonName);
        return reason ? reason.time : settings.alertThreshold; 
    }

    function showToast(message, type = 'success') { 
        const toast = document.createElement('div'); 
        const baseClass = 'toast p-3 rounded-lg text-white font-semibold shadow-xl transition-all duration-300';
        const typeClasses = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-indigo-600' };
        
        toast.className = `${baseClass} ${typeClasses[type]}`; 
        toast.textContent = message; 
        
        toast.style.opacity = 0;
        toast.style.transform = 'translateY(-10px)';
        requestAnimationFrame(() => {
            toast.style.opacity = 1;
            toast.style.transform = 'translateY(0)';
        });

        dom.toastContainer.appendChild(toast); 
        
        setTimeout(() => {
            toast.style.opacity = 0;
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300); 
        }, 3000); 
    }
    
    const applyTheme = (theme) => { 
        const isDark = theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark); 
        localStorage.setItem('theme', theme); 
        // Redibujar gráficos si estamos en la pestaña de análisis para actualizar colores
        if(document.getElementById('analytics').style.display === 'block') {
             renderAnalytics(getFilteredHistory());
        }
    };
    
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);
    
    dom.themeToggle.addEventListener('click', () => { 
        const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; 
        applyTheme(newTheme); 
    });
    
    // --- SETTINGS & LOCAL STORAGE ---
    function loadSettings() { 
        try { 
            const s = localStorage.getItem('smartBreakSettings'); 
            if(s) settings = JSON.parse(s); 
        } catch(e){} 
        renderReasonsList(); 
    }
    
    function saveSettings() { 
        dom.reasonsTimeList.querySelectorAll('.reason-time-input').forEach(input => {
            const name = input.dataset.reasonName;
            const newTime = parseInt(input.value) || 1;
            const reasonIndex = settings.departureReasons.findIndex(r => r.name === name);
            if(reasonIndex > -1) {
                settings.departureReasons[reasonIndex].time = Math.max(1, newTime); 
            }
        });

        localStorage.setItem('smartBreakSettings', JSON.stringify(settings)); 
        showToast('Configuración de límites guardada.', 'success'); 
        renderOutOfClassroom(); 
    }
    
    function renderReasonsList() { 
        dom.reasonsTimeList.innerHTML = settings.departureReasons.map((r, i) => 
            `<div class="flex justify-between items-center p-3 rounded-lg card shadow-sm">
                <span class="font-medium">${r.name}</span>
                <div class="flex items-center gap-2">
                    <input type="number" data-reason-name="${r.name}" value="${r.time}" min="1" class="reason-time-input w-16 p-1 text-center rounded-md" style="border: 1px solid var(--border-color)">
                    <span class="text-sm" style="color: var(--text-secondary)">min</span>
                    <button data-index="${i}" class="remove-reason-btn text-red-500 hover:text-red-700 font-bold text-xl px-2">&times;</button>
                </div>
            </div>`).join(''); 
            
        dom.departureReason.innerHTML = settings.departureReasons.map(r => `<option>${r.name}</option>`).join(''); 
    }
    
    function addReason() { 
        const r = dom.newReasonInput.value.trim(); 
        const t = parseInt(dom.newReasonTime.value) || 10;
        
        if (r && !settings.departureReasons.some(d => d.name.toLowerCase() === r.toLowerCase())) { 
            settings.departureReasons.push({ name: r, time: Math.max(1, t) }); 
            dom.newReasonInput.value = ''; 
            dom.newReasonTime.value = 10;
            renderReasonsList(); 
            saveSettings(); 
            showToast('Motivo de salida añadido.', 'success');
        } else if(settings.departureReasons.some(d => d.name.toLowerCase() === r.toLowerCase())) {
            showToast('Este motivo ya existe.', 'info');
        }
    }
    
    function removeReason(index) { 
        settings.departureReasons.splice(index, 1); 
        renderReasonsList(); 
        saveSettings(); 
        showToast('Motivo de salida eliminado.', 'error');
    }

    // Funciones de caché
    function saveSession() { localStorage.setItem('smartBreakSession', JSON.stringify(outOfClassroom)); }
    function loadSession() { try { const s = localStorage.getItem('smartBreakSession'); if(s) outOfClassroom = JSON.parse(s); } catch(e){ outOfClassroom = []; } }
    function saveStudentCache() { localStorage.setItem('smartBreakStudents', JSON.stringify(allStudents)); }
    function loadStudentCache() { try { const s = localStorage.getItem('smartBreakStudents'); if(s) allStudents = JSON.parse(s); } catch(e) { /* Fallback */ } }
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
        // Solo renderizar analytics si la pestaña está activa para optimización
        if(document.getElementById('analytics').style.display === 'block') {
             renderAnalytics(filteredHistory); 
        }
        renderStatCards(); 
    }

    // --- RENDER FUNCTIONS ---
    function setActiveTab(tabId) {
        dom.tabs.forEach(btn => btn.classList.toggle('tab-active', btn.dataset.tab === tabId));
        dom.tabContents.forEach(content => content.style.display = content.id === tabId ? 'block' : 'none');
        
        const showDateFilter = ['analytics', 'history'].includes(tabId);
        dom.dateFilterSection.classList.toggle('hidden', !showDateFilter);

        if (tabId === 'settings') { renderReasonsList(); }
        // Si activamos analytics, forzar render
        if (tabId === 'analytics') { renderAnalytics(getFilteredHistory()); }
    }
    
    /** Renderiza la lista de grupos en formato acordeón (Grado > Grupo) */
    function populateGroupList() {
        if (allStudents.length === 0) return;

        // 1. Obtener y ordenar los grados (orden de niveles educativos)
        const grades = [...new Set(allStudents.map(s => s.grade))];
        const gradeOrder = ["PRE-JARDIN", "JARDIN", "TRANSICION", "PRIMERO", "SEGUNDO", "TERCERO", "CUARTO", "QUINTO", "SEXTO", "SEPTIMO", "OCTAVO", "NOVENO", "DECIMO", "UNDECIMO"];
        grades.sort((a, b) => {
            const indexA = gradeOrder.indexOf(a);
            const indexB = gradeOrder.indexOf(b);
            if (indexA > -1 && indexB > -1) return indexA - indexB;
            return a.localeCompare(b);
        });

        dom.groupList.innerHTML = grades.map(g => { 
            // 2. Obtener y ordenar los grupos dentro del grado
            const groupsInGrade = [...new Set(allStudents.filter(s => s.grade === g).map(s => s.group))].sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
            
            // 3. Determinar si algún grupo del acordeón está activo
            const gradeIsActive = groupsInGrade.some(gr => activeGroup === `${g} - ${gr}`);
            
            // 4. Renderizar el componente de acordeón
            return `<div class="accordion-item">
                <button class="accordion-header w-full flex justify-between items-center p-3 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${gradeIsActive ? 'open' : ''}" style="color: var(--text-primary)">
                    <span class="font-semibold">${g}</span>
                    <svg class="accordion-arrow w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div class="accordion-content pl-4 pt-1" style="color: var(--text-primary); max-height: ${gradeIsActive ? 'fit-content' : '0'}">
                    ${groupsInGrade.map(gr => 
                        `<button class="w-full text-left p-2 rounded-lg transition-colors group-btn ${activeGroup === `${g} - ${gr}` ? 'group-btn-active' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}" data-group="${g} - ${gr}">${g} - ${gr}</button>`
                    ).join('')}
                </div>
            </div>`;
        }).join('');
        
        // 5. Aplicar lógica de Acordeón
        document.querySelectorAll('.accordion-header').forEach(h => {
            const c = h.nextElementSibling;
            // Asegurar que el acordeón activo se muestre abierto al cargar
            if (h.classList.contains('open')) { c.style.maxHeight = `${c.scrollHeight}px`; }

            h.addEventListener('click', () => { 
                h.classList.toggle('open'); 
                const isOpen = h.classList.contains('open');
                c.style.maxHeight = isOpen ? `${c.scrollHeight}px` : '0px'; 
                
                // Cierra otros acordeones para mantener la limpieza
                document.querySelectorAll('.accordion-header').forEach(otherH => {
                    if (otherH !== h) {
                        otherH.classList.remove('open');
                        otherH.nextElementSibling.style.maxHeight = '0px';
                    }
                });
            });
        });
        
        // 6. Listener para selección de grupo
        document.querySelectorAll('.group-btn').forEach(b => b.addEventListener('click', (e) => { 
            activeGroup = b.dataset.group;
            document.querySelectorAll('.group-btn').forEach(btn => btn.classList.remove('group-btn-active'));
            e.currentTarget.classList.add('group-btn-active');
            renderStudents(); 
        }));
    }

    /** Renderiza los estudiantes del grupo activo */
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
            const studentId = s.name; // Usar el nombre como ID único si no hay otro ID
            const isOut = outOfClassroom.some(o => o.id === studentId); 
            
            return `<div class="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-lg">
                <span class="font-medium">${s.name} (${s.grade} - ${s.group})</span>
                <button onclick="toggleModal(true, '${studentId}')" 
                    class="text-sm px-3 py-1 rounded-full text-white transition-colors 
                    ${isOut ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-md'}" 
                    ${isOut ? 'disabled' : ''}>
                    ${isOut ? 'Fuera' : 'Registrar Salida'}
                </button>
            </div>`; 
        }).join('');
    }

    /** Inicia/Actualiza el temporizador de alerta para un estudiante */
    function startTimer(student) {
        if (timers[student.id]) clearInterval(timers[student.id]);
        
        const timerElement = document.getElementById(`timer-${student.id}`);
        if (!timerElement) return;
        
        const threshold = getAlertThresholdByReason(student.reason);

        const updateTimer = () => {
            const diffMs = new Date() - new Date(student.time);
            const totalSeconds = Math.floor(diffMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            const diffMins = minutes + (seconds / 60);
            const card = timerElement.closest('.card');
            if(card) {
                // Aplica la clase de alerta si excede el umbral
                card.classList.toggle('long-absence-alert', diffMins > threshold); 
            }
        };

        updateTimer();
        timers[student.id] = setInterval(updateTimer, 1000);
    }
    
    /** Renderiza la lista de estudiantes actualmente fuera */
    function renderOutOfClassroom() {
        // Detener y limpiar temporizadores viejos
        Object.values(timers).forEach(clearInterval);
        timers = {};
        
        dom.noOutMessage.style.display = outOfClassroom.length === 0 ? 'block' : 'none';
        
        dom.outList.innerHTML = outOfClassroom.map(s => { 
            const threshold = getAlertThresholdByReason(s.reason);
            const diffMins = (new Date() - new Date(s.time)) / 60000; 
            const alertClass = diffMins > threshold ? 'long-absence-alert' : ''; 
            
            return `<div class="card p-4 rounded-xl shadow-lg flex flex-col justify-between animate-fade-in border-l-4 ${alertClass}" style="border-color: var(--text-accent)">
                <div>
                    <p class="font-bold text-lg">${s.name}</p>
                    <p class="text-sm" style="color: var(--text-secondary)">Motivo: ${s.reason} (Límite: ${threshold}m)</p>
                    <p class="text-xs mt-1" style="color: var(--text-secondary)">Salida: ${new Date(s.time).toLocaleTimeString()}</p>
                </div>
                <div class="mt-4">
                    <p id="timer-${s.id}" class="text-center font-mono text-xl text-red-600 dark:text-red-500 mb-2 font-bold">00:00</p>
                    <button onclick="returnStudent('${s.id}')" 
                        class="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-md">
                        Regresar a Aula
                    </button>
                </div>
            </div>`; 
        }).join('');
        
        outOfClassroom.forEach(startTimer);
    }

    /** Funciones de Salida y Regreso */
    window.toggleModal = (show, id = null) => {
        currentStudentId = id;
        if (id) {
            const student = allStudents.find(s => s.name === id);
            dom.modalStudentName.textContent = student ? student.name : 'Desconocido';
        }
        dom.modal.classList.toggle('hidden', !show);
        dom.modal.classList.toggle('flex', show);
    };

    window.confirmDeparture = () => { 
        const s = allStudents.find(s => s.name === currentStudentId); 
        if (s) { 
            const t = new Date(), t_iso = t.toISOString(), r = dom.departureReason.value, n = s.name; 
            const studentId = n; 
            
            // Registrar estudiante fuera de clase
            outOfClassroom.push({ id: studentId, name: n, reason: r, time: t_iso }); 
            // Registrar evento en historial (sin returnTime aún)
            allHistory.push({ studentId: studentId, name: n, reason: r, departureTime: t_iso, timestamp: new Date().toISOString(), returnTime: null, duration: null }); 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 
            toggleModal(false); 
            showToast(`Salida de ${n} (${r}) registrada.`, 'info'); 
        } 
    };

    window.returnStudent = (id) => { 
        const i = outOfClassroom.findIndex(s => s.id === id); 
        if (i > -1) { 
            const s = outOfClassroom[i];
            const t = new Date(), t_iso = t.toISOString();
            const d_s = Math.floor((t - new Date(s.time)) / 1000); 
            const d = `${Math.floor(d_s / 60)}m ${d_s % 60}s`; 
            
            // Actualizar registro en historial
            const h = allHistory.find(h => h.studentId === id && !h.returnTime); 
            if(h) { h.returnTime = t_iso; h.duration = d; } 
            
            // Quitar de estudiantes fuera
            outOfClassroom.splice(i, 1); 
            clearInterval(timers[id]); 
            delete timers[id]; 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 
            showToast(`Regreso de ${s.name} registrado. (Duración: ${d})`, 'success'); 
        } else {
             showToast('Error: El estudiante ya no aparece como ausente.', 'error');
        }
    };
    
    // --- ANALYTICS & STATS ---

    function getChartColors() {
        // Obtiene colores dinámicos según el tema
        const isDark = document.documentElement.classList.contains('dark');
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
        const secondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
        
        return {
            primary, secondary,
            grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            // Paleta de colores para gráficos circulares y de barras
            palette: ['#4f46e5', '#f97316', '#10b981', '#ef4444', '#f59e0b', '#3b82f6'].map(c => {
                 // Ligeros ajustes de saturación para modo oscuro si es necesario
                 return isDark ? c.replace('#4f46e5', '#818cf8').replace('#10b981', '#34d399') : c;
            }),
        };
    }

    function renderAnalytics(historyData) {
        const colors = getChartColors();
        
        // --- 1. Recolección de Datos ---
        const data = { hourly: new Array(24).fill(0), groupDepartures: {}, reasons: {}, avgDuration: {}, students: {} };
        historyData.forEach(h => {
            if (h.departureTime) {
                const hour = new Date(h.departureTime).getHours();
                data.hourly[hour]++;
            }
            const studentInfo = allStudents.find(s => s.name === h.name);
            if (studentInfo) {
                // Usar Grado - Grupo como clave
                const groupKey = `${studentInfo.grade} - ${studentInfo.group}`;
                data.groupDepartures[groupKey] = (data.groupDepartures[groupKey] || 0) + 1;
                data.students[h.name] = (data.students[h.name] || 0) + 1;
            }
            data.reasons[h.reason] = (data.reasons[h.reason] || 0) + 1;
            
            if (h.duration) {
                const parts = h.duration.match(/(\d+)m (\d+)s/);
                if (parts) {
                    const durationSec = (parseInt(parts[1]) * 60) + parseInt(parts[2]);
                    data.avgDuration[h.reason] = { totalSec: (data.avgDuration[h.reason]?.totalSec || 0) + durationSec, count: (data.avgDuration[h.reason]?.count || 0) + 1 };
                }
            }
        });
        const avgDurationData = Object.entries(data.avgDuration).map(([reason, { totalSec, count }]) => ({ reason, avg: totalSec / count }));
        const sortedStudents = Object.entries(data.students).sort(([, a], [, b]) => b - a).slice(0, 10);

        // --- 2. Opciones Base ---
        const chartOptions = (type = 'bar') => ({
            responsive: true, maintainAspectRatio: false, plugins: { 
                legend: { labels: { color: colors.primary, font: { family: 'Inter' } } }, 
                tooltip: { bodyFont: { family: 'Inter' }, titleFont: { family: 'Inter', weight: 'bold' } }
            }, 
            scales: type !== 'doughnut' && type !== 'pie' ? { 
                x: { ticks: { color: colors.secondary }, grid: { color: colors.grid } },
                y: { ticks: { color: colors.secondary }, grid: { color: colors.grid } } 
            } : {},
            font: { family: 'Inter', color: colors.primary }
        });
        
        // --- 3. Destruir Gráficos Existentes ---
        Object.values(charts).forEach(chart => { if (chart) chart.destroy(); });

        // --- 4. Crear Gráficos Dinámicos ---

        // Gráfico 1: Salidas por Hora del Día
        charts.hourly = new Chart(document.getElementById('hourly-chart').getContext('2d'), {
            type: 'bar', data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{ label: 'Salidas', data: data.hourly, backgroundColor: colors.palette[0], borderRadius: 5 }]
            }, options: chartOptions()
        });

        // Gráfico 2: Salidas por Grupo (Donut)
        charts.groupDepartures = new Chart(document.getElementById('group-departures-chart').getContext('2d'), {
            type: 'doughnut', data: {
                labels: Object.keys(data.groupDepartures),
                datasets: [{ data: Object.values(data.groupDepartures), backgroundColor: colors.palette }]
            }, options: chartOptions('doughnut')
        });

        // Gráfico 3: Duración Promedio por Motivo
        charts.avgDuration = new Chart(document.getElementById('avg-duration-chart').getContext('2d'), {
            type: 'bar', data: {
                labels: avgDurationData.map(d => d.reason),
                datasets: [{ label: 'Segundos', data: avgDurationData.map(d => d.avg), backgroundColor: colors.palette[4], borderRadius: 5 }]
            }, options: chartOptions()
        });
        
        // Gráfico 4: Motivos de Salida (Pie)
        charts.reasons = new Chart(document.getElementById('reasons-chart').getContext('2d'), {
            type: 'pie', data: {
                labels: Object.keys(data.reasons),
                datasets: [{ data: Object.values(data.reasons), backgroundColor: colors.palette }]
            }, options: chartOptions('pie')
        });

        // Gráfico 5: Estudiantes con Más Salidas (Barra horizontal)
        charts.students = new Chart(document.getElementById('students-chart').getContext('2d'), {
            type: 'bar', data: {
                labels: sortedStudents.map(([name]) => name),
                datasets: [{ label: 'Número de Salidas', data: sortedStudents.map(([, count]) => count), backgroundColor: colors.palette[2], borderRadius: 5 }]
            }, options: {
                ...chartOptions(), indexAxis: 'y', // Configuración para barra horizontal
            }
        });
    }

    function renderStatCards() {
        // Lógica de cálculo de estadísticas del día
        const historyToday = allHistory.filter(h => new Date(h.departureTime).toDateString() === new Date().toDateString());
        const totalDeparturesToday = historyToday.length;
        let totalDurationSecToday = 0;
        let completedDeparturesToday = 0;

        historyToday.forEach(h => {
            if (h.returnTime && h.duration) {
                const d_s = h.duration.match(/(\d+)m (\d+)s/);
                if (d_s) {
                    totalDurationSecToday += (parseInt(d_s[1]) * 60) + parseInt(d_s[2]);
                    completedDeparturesToday++;
                }
            }
        });

        const avgSecToday = completedDeparturesToday > 0 ? totalDurationSecToday / completedDeparturesToday : 0;
        const avgMinToday = Math.floor(avgSecToday / 60);
        const avgSecRemaining = Math.floor(avgSecToday % 60);
        
        document.getElementById('stat-out-now').textContent = outOfClassroom.length;
        document.getElementById('stat-departures-today').textContent = totalDeparturesToday;
        document.getElementById('stat-avg-duration-today').textContent = `${avgMinToday}m ${avgSecRemaining}s`;
    }

    function renderHistoryTable(historyData) {
        if (historyData.length === 0) { 
            dom.historyTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8" style="color: var(--text-secondary)">No hay registros para las fechas seleccionadas.</td></tr>`; 
            return; 
        }
        
        // Mostrar historial del más reciente al más antiguo
        dom.historyTableBody.innerHTML = historyData.slice().reverse().map(h => {
            const departure = h.departureTime ? new Date(h.departureTime).toLocaleString() : '---';
            const retorno = h.returnTime ? new Date(h.returnTime).toLocaleString() : '---';
            const duracion = h.duration || '---';

            return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <td class="p-4 font-medium">${h.name}</td>
                <td class="p-4">${h.reason}</td>
                <td class="p-4">${departure}</td>
                <td class="p-4">${retorno}</td>
                <td class="p-4">${duracion}</td>
            </tr>`;
        }).join('');
    }

    // --- INIT & LISTENERS ---
    dom.tabs.forEach(t => t.addEventListener('click', () => setActiveTab(t.dataset.tab)));
    dom.searchFilter.addEventListener('input', renderStudents);
    [dom.startDate, dom.endDate].forEach(i => i.addEventListener('change', renderAll));
    dom.resetDatesBtn.addEventListener('click', () => { dom.startDate.value = ''; dom.endDate.value = ''; renderAll(); });
    
    dom.saveSettingsBtn.addEventListener('click', saveSettings);
    dom.addReasonBtn.addEventListener('click', addReason);
    dom.reasonsTimeList.addEventListener('click', (e) => { 
        if (e.target.classList.contains('remove-reason-btn')) { removeReason(e.target.dataset.index); }
    });
    
    dom.exportCsvBtn.addEventListener('click', exportToCSV);
    dom.exportPdfBtn.addEventListener('click', exportToPDF);

    async function initializeApp() {
        toggleLoader(true);
        loadSettings();
        loadSession();
        loadHistoryCache();
        
        // CORRECCIÓN CLAVE: Carga el JSON usando ruta relativa
        try {
            const response = await fetch('datos_estudiantes.json');
            if (!response.ok) {
                // Si falla la carga, intenta usar la caché y lanza un error
                loadStudentCache(); 
                throw new Error(`Fallo de red o archivo JSON no encontrado/accesible. Código: ${response.status}`);
            }
            const data = await response.json();
            allStudents = data; 
            saveStudentCache(); 
            showToast('Datos de estudiantes cargados.', 'success');
        } catch (e) {
            if (allStudents.length === 0) { 
                showToast(`ERROR CRÍTICO: No se pudieron cargar los datos de estudiantes. Asegúrate que 'datos_estudiantes.json' esté en la raíz.`, 'error');
            } else {
                showToast(`ADVERTENCIA: Falló carga JSON. Usando ${allStudents.length} estudiantes de la caché.`, 'info');
            }
            console.error(e);
        }

        renderAll(); 
        setActiveTab('dashboard');
        toggleLoader(false);
        showToast('Aplicación iniciada. Los datos de sesión y registro se guardan en el navegador.', 'info');
    }
    
    initializeApp();
    
    // --- EXPORT FUNCTIONS ---
    function exportToCSV() { 
        const historyData = getFilteredHistory();
        if (historyData.length === 0) { showToast('No hay datos para exportar.', 'error'); return; }

        const headers = ["Estudiante", "Motivo", "Salida", "Regreso", "Duración"];
        const rows = historyData.map(h => [
            h.name, h.reason,
            h.departureTime ? new Date(h.departureTime).toLocaleString() : '',
            h.returnTime ? new Date(h.returnTime).toLocaleString() : '',
            h.duration || ''
        ]);

        let csvContent = headers.join(",") + "\n";
        rows.forEach(row => {
            csvContent += row.map(e => `"${e.replace(/"/g, '""')}"`).join(",") + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'smart_break_historial.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Historial exportado a CSV.', 'success');
    }

    function exportToPDF() { 
        const historyData = getFilteredHistory();
        if (historyData.length === 0) { showToast('No hay datos para exportar.', 'error'); return; }
        
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.text("Historial Smart Break Analytics", 14, 15);

        const columns = ["Estudiante", "Motivo", "Salida", "Regreso", "Duración"];
        const data = historyData.map(h => [
            h.name, h.reason,
            h.departureTime ? new Date(h.departureTime).toLocaleString() : '---',
            h.returnTime ? new Date(h.returnTime).toLocaleString() : '---',
            h.duration || '---'
        ]);

        doc.autoTable({
            head: [columns],
            body: data,
            startY: 20,
            headStyles: { fillColor: [79, 70, 229] }, 
            styles: { fontSize: 8 },
            margin: { top: 20 }
        });

        doc.save('smart_break_historial.pdf');
        showToast('Historial exportado a PDF.', 'success');
    }
});
