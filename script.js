document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL & DOM ---
    let allStudents = [], allHistory = [], outOfClassroom = [], activeGroup = null, currentStudentId = null;
    let charts = { reasons: null, students: null, hourly: null, avgDuration: null, groupDepartures: null };
    let timers = {};
    
    // Configuración inicial de motivos y tiempos de alerta (en minutos)
    let settings = { 
        alertThreshold: 10, // Fallback si un motivo se borra accidentalmente
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
    };
    
    // --- UTILIDADES ---
    const toggleLoader = (show) => dom.loader.style.display = show ? 'flex' : 'none';

    // Función clave: Obtiene el tiempo de alerta (en minutos) de un motivo
    function getAlertThresholdByReason(reasonName) {
        const reason = settings.departureReasons.find(r => r.name === reasonName);
        return reason ? reason.time : settings.alertThreshold; // Usa el tiempo específico o el global (10 min) como fallback
    }

    // --- TOAST NOTIFICATIONS ---
    const toastContainer = document.getElementById('toast-container');
    function showToast(message, type = 'success') { 
        const toast = document.createElement('div'); 
        toast.className = `toast toast-${type}`; 
        toast.textContent = message; 
        toastContainer.appendChild(toast); 
        setTimeout(() => toast.remove(), 3000); 
    }
    
    // --- TEMA ---
    const themeToggle = document.getElementById('theme-toggle');
    const applyTheme = (theme) => { 
        document.documentElement.classList.toggle('dark', theme === 'dark'); 
        document.getElementById('theme-icon-sun').classList.toggle('hidden', theme === 'dark'); 
        document.getElementById('theme-icon-moon').classList.toggle('hidden', theme !== 'dark'); 
        renderAll(); 
    };
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);
    themeToggle.addEventListener('click', () => { 
        const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; 
        localStorage.setItem('theme', newTheme); 
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
        // Recolectar los nuevos tiempos de los inputs antes de guardar
        dom.reasonsTimeList.querySelectorAll('.reason-time-input').forEach(input => {
            const name = input.dataset.reasonName;
            const newTime = parseInt(input.value) || 1;
            const reasonIndex = settings.departureReasons.findIndex(r => r.name === name);
            if(reasonIndex > -1) {
                // Asegura que el tiempo sea al menos 1 minuto
                settings.departureReasons[reasonIndex].time = Math.max(1, newTime); 
            }
        });

        localStorage.setItem('smartBreakSettings', JSON.stringify(settings)); 
        showToast('Configuración de motivos y tiempos guardada.', 'success'); 
        // Renderizar el Dashboard para aplicar los nuevos límites de alerta
        renderOutOfClassroom(); 
    }
    
    function renderReasonsList() { 
        // Renderiza la lista de motivos y sus tiempos en la pestaña Configuración
        dom.reasonsTimeList.innerHTML = settings.departureReasons.map((r, i) => 
            `<div class="flex justify-between items-center p-3 rounded card">
                <span class="font-medium">${r.name}</span>
                <div class="flex items-center gap-2">
                    <input type="number" data-reason-name="${r.name}" value="${r.time}" min="1" class="reason-time-input w-16 p-1 text-center rounded-md" style="border: 1px solid var(--border-color)">
                    <span class="text-sm" style="color: var(--text-secondary)">min</span>
                    <button data-index="${i}" class="remove-reason-btn text-red-500 font-bold text-xl px-2">&times;</button>
                </div>
            </div>`).join(''); 
            
        // Rellenar el Select del Modal (solo con nombres)
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

    // Almacenamiento Local (Caché de emergencia/Offline)
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
        renderAnalytics(filteredHistory); 
        renderStatCards(); 
    }

    // --- RENDER FUNCTIONS ---
    function setActiveTab(tabId) {
        dom.tabs.forEach(btn => btn.classList.toggle('tab-active', btn.dataset.tab === tabId));
        dom.tabContents.forEach(content => content.style.display = content.id === tabId ? 'block' : 'none');
        
        const showDateFilter = ['analytics', 'history'].includes(tabId);
        dom.dateFilterSection.classList.toggle('hidden', !showDateFilter);

        // Si se cambia a Configuración, asegurarse de que los motivos estén al día
        if (tabId === 'settings') { renderReasonsList(); }
    }
    
    function populateGroupList() {
        if (allStudents.length === 0) return;

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
            
            const gradeIsActive = groupsInGrade.some(gr => activeGroup === `${g} - ${gr}`);
            
            // Renderiza el botón de grado (acordeón)
            return `<div class="accordion-item">
                <button class="accordion-header w-full flex justify-between items-center p-3 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${gradeIsActive ? 'open' : ''}" style="color: var(--text-primary)">
                    <span class="font-semibold">${g}</span>
                    <svg class="accordion-arrow w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div class="accordion-content pl-4 pt-1" style="color: var(--text-primary); max-height: ${gradeIsActive ? 'fit-content' : '0'}">
                    ${groupsInGrade.map(gr => 
                        // Renderiza el botón de grupo
                        `<button class="w-full text-left p-2 rounded-md transition-colors group-btn ${activeGroup === `${g} - ${gr}` ? 'group-btn-active' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}" data-group="${g} - ${gr}">Grupo ${gr}</button>`
                    ).join('')}
                </div>
            </div>`;
        }).join('');
        
        // Lógica de Acordeón
        document.querySelectorAll('.accordion-header').forEach(h => {
            const c = h.nextElementSibling;
            if (h.classList.contains('open')) {
                 c.style.maxHeight = `${c.scrollHeight}px`;
            }

            h.addEventListener('click', () => { 
                h.classList.toggle('open'); 
                // Toggle del max-height para animación CSS
                c.style.maxHeight = c.style.maxHeight === 'fit-content' || c.style.maxHeight === '' || c.style.maxHeight === null || c.style.maxHeight === '0px' ? `${c.scrollHeight}px` : '0px'; 
            });
        });
        
        // Listener para seleccionar grupo
        document.querySelectorAll('.group-btn').forEach(b => b.addEventListener('click', (e) => { 
            activeGroup = b.dataset.group;
            document.querySelectorAll('.group-btn').forEach(btn => btn.classList.remove('group-btn-active'));
            e.currentTarget.classList.add('group-btn-active');
            renderStudents(); 
        }));
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
            const studentId = s.name; // Usamos el nombre como ID local
            const isOut = outOfClassroom.some(o => o.id === studentId); 
            
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

    function startTimer(student) {
        if (timers[student.id]) clearInterval(timers[student.id]);
        
        const timerElement = document.getElementById(`timer-${student.id}`);
        if (!timerElement) return;
        
        // Obtiene el límite de alerta específico para el motivo de este estudiante
        const threshold = getAlertThresholdByReason(student.reason);

        const updateTimer = () => {
            const diffMs = new Date() - new Date(student.time);
            const totalSeconds = Math.floor(diffMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            const minStr = minutes.toString().padStart(2, '0');
            const secStr = seconds.toString().padStart(2, '0');
            
            timerElement.textContent = `${minStr}:${secStr}`;
            
            const diffMins = minutes + (seconds / 60);
            const card = timerElement.closest('.card');
            if(card) {
                // Usa el threshold específico del motivo para aplicar la alerta
                card.classList.toggle('long-absence-alert', diffMins > threshold); 
            }
        };

        updateTimer();
        timers[student.id] = setInterval(updateTimer, 1000);
    }
    
    function renderOutOfClassroom() {
        Object.values(timers).forEach(clearInterval);
        timers = {};
        
        dom.noOutMessage.style.display = outOfClassroom.length === 0 ? 'block' : 'none';
        
        dom.outList.innerHTML = outOfClassroom.map(s => { 
            const threshold = getAlertThresholdByReason(s.reason);
            const diffMins = (new Date() - new Date(s.time)) / 60000; 
            const alertClass = diffMins > threshold ? 'long-absence-alert' : ''; 
            
            return `<div class="card p-4 rounded-lg shadow-md flex flex-col justify-between animate-fade-in border-l-4 ${alertClass}" style="border-color: var(--text-accent)">
                <div>
                    <p class="font-bold text-lg">${s.name}</p>
                    <p class="text-sm" style="color: var(--text-secondary)">${s.reason} (Límite: ${threshold}m)</p>
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

    // Funciones de simulación de Salida/Regreso (MODO LOCAL)
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
            
            // Simulación local de salida
            outOfClassroom.push({ id: studentId, name: n, reason: r, time: t_iso }); 
            allHistory.push({ studentId: studentId, name: n, reason: r, departureTime: t_iso, timestamp: new Date().toISOString(), returnTime: null, duration: null }); 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 
            toggleModal(false); 
            showToast(`Salida de ${n} registrada.`, 'info'); 
        } 
    };

    window.returnStudent = (id) => { 
        const i = outOfClassroom.findIndex(s => s.id === id); 
        if (i > -1) { 
            const s = outOfClassroom[i];
            const t = new Date(), t_iso = t.toISOString();
            const d_s = Math.floor((t - new Date(s.time)) / 1000); 
            const d = `${Math.floor(d_s / 60)}m ${d_s % 60}s`; 
            
            // Simulación local de regreso
            const h = allHistory.find(h => h.studentId === id && !h.returnTime); 
            if(h) { h.returnTime = t_iso; h.duration = d; } 
            
            outOfClassroom.splice(i, 1); 
            clearInterval(timers[id]); 
            delete timers[id]; 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 
            showToast(`Regreso de ${s.name} registrado.`, 'success'); 
        } else {
             showToast('Error: El estudiante ya no aparece como ausente.', 'error');
        }
    };
    
    // --- ANALYTICS & EXPORTS ---

    function renderAnalytics(historyData) {
        // ... Lógica de recopilación de datos para gráficos ...
        const data = {
            hourly: new Array(24).fill(0),
            groupDepartures: {},
            reasons: {},
            avgDuration: {},
            students: {}
        };
        
        let totalDurationSeconds = 0;
        let departuresToday = 0;
        const today = new Date().toDateString();

        historyData.forEach(h => {
            // Recopilación de salidas por hora y hoy
            if (h.departureTime) {
                const hour = new Date(h.departureTime).getHours();
                data.hourly[hour]++;
                if (new Date(h.departureTime).toDateString() === today) {
                    departuresToday++;
                }
            }

            // Recopilación de salidas por grupo y estudiante
            const studentInfo = allStudents.find(s => s.name === h.name);
            if (studentInfo) {
                const groupKey = `${studentInfo.grade} - ${studentInfo.group}`;
                data.groupDepartures[groupKey] = (data.groupDepartures[groupKey] || 0) + 1;
                data.students[h.name] = (data.students[h.name] || 0) + 1;
            }

            // Recopilación de motivos
            data.reasons[h.reason] = (data.reasons[h.reason] || 0) + 1;
            
            // Recopilación de duración promedio
            if (h.duration) {
                const parts = h.duration.match(/(\d+)m (\d+)s/);
                if (parts) {
                    const durationSec = (parseInt(parts[1]) * 60) + parseInt(parts[2]);
                    data.avgDuration[h.reason] = { 
                        totalSec: (data.avgDuration[h.reason]?.totalSec || 0) + durationSec,
                        count: (data.avgDuration[h.reason]?.count || 0) + 1
                    };
                    totalDurationSeconds += durationSec;
                }
            }
        });
        
        const avgDurationData = Object.entries(data.avgDuration).map(([reason, { totalSec, count }]) => ({
            reason,
            avg: totalSec / count
        }));

        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--text-accent').trim();
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
        
        // Opciones base para los gráficos
        const chartOptions = (title) => ({
            responsive: true, maintainAspectRatio: false, plugins: { 
                legend: { labels: { color: primaryColor } }, 
                title: { display: true, text: title, color: primaryColor } 
            }, 
            scales: { 
                x: { ticks: { color: primaryColor }, grid: { color: 'rgba(156, 163, 175, 0.1)' } },
                y: { ticks: { color: primaryColor }, grid: { color: 'rgba(156, 163, 175, 0.1)' } } 
            }
        });
        
        // Destrucción de gráficos previos
        ['hourly', 'groupDepartures', 'avgDuration', 'reasons', 'students'].forEach(key => {
            if (charts[key]) charts[key].destroy();
        });

        // Gráfico 1: Salidas por Hora del Día
        charts.hourly = new Chart(document.getElementById('hourly-chart').getContext('2d'), {
            type: 'bar', data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{ label: 'Número de Salidas', data: data.hourly, backgroundColor: accentColor, }]
            }, options: chartOptions('Salidas por Hora del Día')
        });

        // Gráfico 2: Salidas por Grupo (Pie)
        charts.groupDepartures = new Chart(document.getElementById('group-departures-chart').getContext('2d'), {
            type: 'pie', data: {
                labels: Object.keys(data.groupDepartures),
                datasets: [{ data: Object.values(data.groupDepartures),
                    backgroundColor: ['#4f46e5', '#818cf8', '#6366f1', '#a5b4fc', '#c7d2fe', '#e0e7ff'].slice(0, Object.keys(data.groupDepartures).length),
                }]
            }, options: chartOptions('Salidas por Grupo')
        });

        // Gráfico 3: Duración Promedio por Motivo (Barra)
        charts.avgDuration = new Chart(document.getElementById('avg-duration-chart').getContext('2d'), {
            type: 'bar', data: {
                labels: avgDurationData.map(d => d.reason),
                datasets: [{ label: 'Duración Promedio (segundos)', data: avgDurationData.map(d => d.avg), backgroundColor: '#f59e0b', }]
            }, options: chartOptions('Duración Promedio por Motivo')
        });
        
        // Gráfico 4: Motivos de Salida (Doughnut)
        charts.reasons = new Chart(document.getElementById('reasons-chart').getContext('2d'), {
            type: 'doughnut', data: {
                labels: Object.keys(data.reasons),
                datasets: [{ data: Object.values(data.reasons),
                    backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'].slice(0, Object.keys(data.reasons).length),
                }]
            }, options: chartOptions('Motivos de Salida')
        });

        // Gráfico 5: Estudiantes con Más Salidas (Barra horizontal)
        const sortedStudents = Object.entries(data.students).sort(([, a], [, b]) => b - a).slice(0, 10);
        charts.students = new Chart(document.getElementById('students-chart').getContext('2d'), {
            type: 'bar', data: {
                labels: sortedStudents.map(([name]) => name),
                datasets: [{ label: 'Número de Salidas', data: sortedStudents.map(([, count]) => count), backgroundColor: '#10b981', }]
            }, options: {
                ...chartOptions('Estudiantes con Más Salidas (Top 10)'), indexAxis: 'y',
            }
        });
    }

    function renderStatCards() {
        const historyToday = allHistory.filter(h => new Date(h.departureTime).toDateString() === new Date().toDateString());
        const totalDeparturesToday = historyToday.length;
        let totalDurationSecToday = 0;
        let completedDeparturesToday = 0;

        historyToday.forEach(h => {
            if (h.returnTime) {
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

        doc.autoTable(columns, data, {
            startY: 20,
            headStyles: { fillColor: [79, 70, 229] }, 
            styles: { fontSize: 8 },
            margin: { top: 20 }
        });

        doc.save('smart_break_historial.pdf');
        showToast('Historial exportado a PDF.', 'success');
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

    // Función de inicialización con carga de JSON
    async function initializeApp() {
        toggleLoader(true);
        loadSettings();
        loadSession();
        loadHistoryCache();
        
        // CORRECCIÓN: Asegura que se solicite 'datos_estudiantes.json'
        try {
            const response = await fetch('datos_estudiantes.json');
            if (!response.ok) {
                loadStudentCache(); 
                throw new Error(`No se pudo cargar 'datos_estudiantes.json'. Código: ${response.status}`);
            }
            const data = await response.json();
            allStudents = data; 
            saveStudentCache(); 
            showToast('Datos de estudiantes cargados.', 'success');
        } catch (e) {
            if (allStudents.length === 0) { 
                showToast(`ERROR CRÍTICO: No hay estudiantes. Revisa el archivo JSON.`, 'error');
            } else {
                showToast(`ADVERTENCIA: Falló carga JSON. Usando ${allStudents.length} estudiantes de la caché.`, 'info');
            }
            console.error(e);
        }

        renderAll(); 
        setActiveTab('dashboard');
        toggleLoader(false);
        showToast('Modo de desarrollo local. Los datos se guardan en el navegador.', 'info');
    }
    
    initializeApp();
});
