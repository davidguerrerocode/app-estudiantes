document.addEventListener('DOMContentLoaded', () => {
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
    let allStudents = [], allHistory = [], outOfClassroom = [], activeGroup = null, currentStudentId = null;
    let charts = { reasons: null, students: null, hourly: null, avgDuration: null, groupDepartures: null };
    let timers = {};
    let settings = { 
        alertThreshold: 10, 
        departureReasons: ["Baño", "Coordinación Académica", "Coordinación de Convivencia", "Enfermería", "Psicología", "Biblioteca", "Otro"] 
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
            saveSettings(); // Guarda los nuevos motivos inmediatamente
            showToast('Motivo de salida añadido.', 'success');
        } else if(settings.departureReasons.includes(r)) {
            showToast('Este motivo ya existe.', 'info');
        }
    }
    function removeReason(index) { 
        settings.departureReasons.splice(index, 1); 
        renderReasonsList(); 
        saveSettings(); // Guarda los cambios inmediatamente
        showToast('Motivo de salida eliminado.', 'error');
    }

    const toggleLoader = (show) => dom.loader.style.display = show ? 'flex' : 'none';
    
    // Almacenamiento Local (Caché de emergencia/Offline)
    function saveSession() { localStorage.setItem('smartBreakSession', JSON.stringify(outOfClassroom)); }
    function loadSession() { try { const s = localStorage.getItem('smartBreakSession'); if(s) outOfClassroom = JSON.parse(s); } catch(e){ outOfClassroom = []; } }
    function saveStudentCache() { localStorage.setItem('smartBreakStudents', JSON.stringify(allStudents)); }
    function loadStudentCache() { try { const s = localStorage.getItem('smartBreakStudents'); if(s) allStudents = JSON.parse(s); } catch(e) { allStudents = []; } }
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
            // Manejar fechas de salida que no son válidas por si acaso
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
        
        // Inicializar listeners de Acordeón
        document.querySelectorAll('.accordion-header').forEach(h => h.addEventListener('click', () => { 
            const c = h.nextElementSibling; 
            h.classList.toggle('open'); 
            c.style.maxHeight = c.style.maxHeight ? null : `${c.scrollHeight}px`; 
        }));
        
        // Inicializar listeners de Botones de Grupo
        document.querySelectorAll('.group-btn').forEach(b => b.addEventListener('click', (e) => { 
            activeGroup = b.dataset.group;
            // Remover 'group-btn-active' de todos y añadirlo al clicado
            document.querySelectorAll('.group-btn').forEach(btn => btn.classList.remove('group-btn-active'));
            e.currentTarget.classList.add('group-btn-active');
            renderStudents(); 
        }));

        // Abrir acordeón del grupo activo
        if (activeGroup) {
            const [grade] = activeGroup.split(' - ');
            const header = dom.groupList.querySelector(`.accordion-header span:contains('${grade}')`).closest('.accordion-header');
            if (header && !header.classList.contains('open')) {
                header.classList.add('open');
                header.nextElementSibling.style.maxHeight = `${header.nextElementSibling.scrollHeight}px`;
            }
        }
    }

    // Extensión para buscar texto en el span (usado arriba)
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
            // Usamos s.name como ID temporal ya que Apps Script no siempre tiene un ID numérico único
            const studentId = s.name; 
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

    function renderOutOfClassroom() {
        // Limpiar todos los intervalos de tiempo existentes
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
        
        // Iniciar el contador de tiempo para cada estudiante
        outOfClassroom.forEach(startTimer);
    }

    function renderHistoryTable(historyData) {
        if (historyData.length === 0) { 
            dom.historyTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8" style="color: var(--text-secondary)">No hay registros para las fechas seleccionadas.</td></tr>`; 
            return; 
        }
        
        // Muestra el historial del más reciente al más antiguo
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

    function renderAnalytics(historyData) {
        // Colores dinámicos basados en el tema
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9ca3af' : '#4b5563';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const accentColor = isDark ? '#818cf8' : '#4f46e5';

        const defaultChartOptions = {
            scales: {
                y: { ticks: { color: textColor }, grid: { color: gridColor } },
                x: { ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
                legend: { labels: { color: textColor } }
            },
            maintainAspectRatio: false,
            responsive: true,
        };

        // Función para destruir gráficos antiguos
        Object.keys(charts).forEach(key => { if (charts[key]) charts[key].destroy(); });
        
        // --- 1. Gráfico: Motivos de Salida (Horizontal Bar) ---
        const reasonCounts = historyData.reduce((acc, h) => { (acc[h.reason] = (acc[h.reason] || 0) + 1); return acc; }, {});
        const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
        charts.reasons = new Chart(document.getElementById('reasons-chart'), { 
            type: 'bar', 
            data: { 
                labels: sortedReasons.map(r => r[0]), 
                datasets: [{ 
                    data: sortedReasons.map(r => r[1]), 
                    backgroundColor: 'rgba(129, 140, 248, 0.5)', 
                    borderColor: accentColor, 
                    borderWidth: 1 
                }] 
            }, 
            options: { 
                ...defaultChartOptions,
                indexAxis: 'y', // Hace el gráfico horizontal
                scales: { 
                    y: { ...defaultChartOptions.scales.y, grid: { display: false } }, 
                    x: { ...defaultChartOptions.scales.x, beginAtZero: true, } 
                },
                plugins: { legend: { display: false } } 
            } 
        });
        
        // --- 2. Gráfico: Estudiantes con Más Salidas (Doughnut) ---
        const studentCounts = historyData.reduce((acc, h) => { (acc[h.name] = (acc[h.name] || 0) + 1); return acc; }, {});
        const sortedStudents = Object.entries(studentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        charts.students = new Chart(document.getElementById('students-chart'), { 
            type: 'doughnut', 
            data: { 
                labels: sortedStudents.map(s => s[0]), 
                datasets: [{ 
                    data: sortedStudents.map(s => s[1]), 
                    backgroundColor: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'], 
                    hoverOffset: 4 
                }] 
            }, 
            options: { 
                ...defaultChartOptions,
                scales: {}, // Desactivar ejes para Doughnut
                plugins: { legend: { position: 'top', labels: { color: textColor } } } 
            } 
        });
        
        // --- 3. Gráfico: Salidas por Hora del Día (Bar) ---
        const hourlyCounts = Array(24).fill(0);
        historyData.forEach(h => {
            const departureDate = new Date(h.departureTime);
            if (!isNaN(departureDate.getTime())) {
                hourlyCounts[departureDate.getHours()]++;
            }
        });
        charts.hourly = new Chart(document.getElementById('hourly-chart'), { 
            type: 'bar', 
            data: { 
                labels: Array.from({length: 24}, (_, i) => `${i}:00`), 
                datasets: [{
                    label: 'Nº de Salidas', 
                    data: hourlyCounts, 
                    backgroundColor: 'rgba(52, 211, 153, 0.5)', 
                    borderColor: '#10b981', 
                    borderWidth: 1
                }] 
            }, 
            options: { 
                ...defaultChartOptions,
                scales: { 
                    y: { ...defaultChartOptions.scales.y, beginAtZero: true, stepSize: 1, }, 
                    x: { ...defaultChartOptions.scales.x, } 
                }, 
                plugins: { legend: { display: false } } 
            } 
        });
        
        // --- 4. Gráfico: Duración Promedio por Motivo (Bar Horizontal) ---
        const durationData = historyData.filter(h => h.returnTime).reduce((acc, h) => { 
            const departureTime = new Date(h.departureTime);
            const returnTime = new Date(h.returnTime);
            
            if (isNaN(departureTime.getTime()) || isNaN(returnTime.getTime())) return acc;

            const durationSecs = (returnTime - departureTime) / 1000; 
            if(!acc[h.reason]) acc[h.reason] = { total: 0, count: 0}; 
            acc[h.reason].total += durationSecs; 
            acc[h.reason].count++; 
            return acc; 
        }, {});
        
        const avgDurations = Object.entries(durationData).map(([reason, data]) => ({ 
            reason, 
            avg: (data.total / data.count) / 60 // en minutos
        })); 
        
        charts.avgDuration = new Chart(document.getElementById('avg-duration-chart'), { 
            type: 'bar', 
            data: { 
                labels: avgDurations.map(d => d.reason), 
                datasets: [{ 
                    label: 'Minutos Promedio', 
                    data: avgDurations.map(d => d.avg.toFixed(2)), 
                    backgroundColor: 'rgba(251, 146, 60, 0.5)', 
                    borderColor: '#f97316', 
                    borderWidth: 1 
                }] 
            }, 
            options: { 
                ...defaultChartOptions,
                indexAxis: 'y',
                scales: { 
                    x: { ...defaultChartOptions.scales.x, beginAtZero: true, }, 
                    y: { ...defaultChartOptions.scales.y, grid: { display: false } } 
                }, 
                plugins: { legend: { display: false } } 
            } 
        });

        // --- 5. Gráfico: Salidas por Grupo (Bar) ---
        const groupDeparturesData = historyData.reduce((acc, h) => { 
            const student = allStudents.find(s => s.name === h.studentId); 
            if (student) { 
                const groupName = `${student.grade} - ${student.group}`; 
                acc[groupName] = (acc[groupName] || 0) + 1; 
            } 
            return acc; 
        }, {});
        
        const sortedGroups = Object.entries(groupDeparturesData).sort((a, b) => b[1] - a[1]);
        charts.groupDepartures = new Chart(document.getElementById('group-departures-chart'), { 
            type: 'bar', 
            data: { 
                labels: sortedGroups.map(g => g[0]), 
                datasets: [{ 
                    label: 'Nº de Salidas', 
                    data: sortedGroups.map(g => g[1]), 
                    backgroundColor: 'rgba(239, 68, 68, 0.5)', 
                    borderColor: '#ef4444', 
                    borderWidth: 1 
                }] 
            }, 
            options: { 
                ...defaultChartOptions,
                scales: { 
                    y: { ...defaultChartOptions.scales.y, beginAtZero: true, stepSize: 1, }, 
                    x: { ...defaultChartOptions.scales.x, grid: { display: false } } 
                }, 
                plugins: { legend: { display: false } } 
            } 
        });
    }

    function renderStatCards() {
        document.getElementById('stat-out-now').textContent = outOfClassroom.length;
        
        const todayStart = new Date(); 
        todayStart.setHours(0,0,0,0);
        
        const todayHistory = allHistory.filter(h => {
            const departureDate = new Date(h.departureTime);
            return !isNaN(departureDate.getTime()) && departureDate >= todayStart;
        });
        
        document.getElementById('stat-departures-today').textContent = todayHistory.length;
        
        const durations = todayHistory.filter(h => h.returnTime).map(h => (new Date(h.returnTime) - new Date(h.departureTime)) / 1000);
        
        if (durations.length > 0) { 
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length; 
            document.getElementById('stat-avg-duration-today').textContent = `${Math.floor(avg / 60)}m ${Math.round(avg % 60)}s`; 
        } else { 
            document.getElementById('stat-avg-duration-today').textContent = '0m 0s'; 
        }
    }

    function startTimer(student) {
        const timerEl = document.getElementById(`timer-${student.id}`); 
        if (!timerEl) return;
        
        clearInterval(timers[student.id]);
        
        timers[student.id] = setInterval(() => {
            const diff = Math.floor((new Date() - new Date(student.time)) / 1000);
            const minutes = String(Math.floor(diff / 60)).padStart(2, '0');
            const seconds = String(diff % 60).padStart(2, '0');
            
            if (timerEl) timerEl.textContent = `${minutes}:${seconds}`;
            
            // Lógica de alerta visual
            const cardEl = timerEl ? timerEl.closest('.card') : null;
            if (cardEl) { 
                (diff / 60 > settings.alertThreshold) 
                    ? cardEl.classList.add('long-absence-alert') 
                    : cardEl.classList.remove('long-absence-alert'); 
            }
        }, 1000);
    }
    
    // --- UI & SERVER ACTIONS ---
    function setActiveTab(tabId) { 
        dom.tabContents.forEach(c => c.style.display = 'none'); 
        dom.tabs.forEach(t => t.classList.remove('tab-active')); 
        document.getElementById(tabId).style.display = 'block'; 
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('tab-active'); 
        dom.dateFilterSection.style.display = (tabId === 'analytics' || tabId === 'history') ? 'flex' : 'none';
        
        // Vuelve a renderizar gráficos si es la pestaña de analytics
        if (tabId === 'analytics') {
             renderAnalytics(getFilteredHistory());
        }
    }
    
    window.toggleModal = (show, id = null) => { 
        if (show && id) { 
            currentStudentId = id; 
            const s = allStudents.find(s => s.name === id); 
            if(s) dom.modalStudentName.textContent = s.name; 
            dom.modal.classList.remove('hidden'); 
            dom.modal.classList.add('flex'); 
        } else { 
            dom.modal.classList.add('hidden'); 
            dom.modal.classList.remove('flex'); 
        } 
    };

    window.confirmDeparture = () => { 
        const s = allStudents.find(s => s.name === currentStudentId); 
        if (s) { 
            const t = new Date(), t_iso = t.toISOString(), r = dom.departureReason.value, n = s.name; 
            const studentId = n; // Usamos el nombre como ID para Apps Script por simplicidad
            
            outOfClassroom.push({ id: studentId, name: n, reason: r, time: t_iso }); 
            
            // Agregar al historial local
            allHistory.push({ 
                studentId: studentId, 
                name: n, 
                reason: r, 
                departureTime: t_iso, 
                timestamp: new Date().toISOString(), 
                returnTime: null, 
                duration: null 
            }); 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 
            toggleModal(false); 

            // Llamada a Apps Script
            google.script.run
                .withSuccessHandler(() => showToast(`Salida de ${n} registrada.`, 'success'))
                .withFailureHandler(e => showToast(`Error al registrar salida: ${e.message}`, 'error'))
                .recordHistory('departure', studentId, n, r, t_iso, null, null);
        } 
    };

    window.returnStudent = (id) => { 
        const i = outOfClassroom.findIndex(s => s.id === id); 
        if (i > -1) { 
            const s = outOfClassroom[i];
            const t = new Date(), t_iso = t.toISOString();
            const d_s = Math.floor((t - new Date(s.time)) / 1000); // Duración en segundos
            const d = `${Math.floor(d_s / 60)}m ${d_s % 60}s`; // Formato: 3m 45s
            
            // Actualizar historial local
            const h = allHistory.find(h => h.studentId === id && !h.returnTime); 
            if(h) { 
                h.returnTime = t_iso; 
                h.duration = d; 
            } 
            
            outOfClassroom.splice(i, 1); 
            clearInterval(timers[id]); 
            delete timers[id]; 
            
            saveSession(); 
            saveHistoryCache(); 
            renderAll(); 

            // Llamada a Apps Script
            google.script.run
                .withSuccessHandler(() => showToast(`Regreso de ${s.name} registrado.`, 'success'))
                .withFailureHandler(e => showToast(`Error al registrar regreso: ${e.message}`, 'error'))
                .recordHistory('return', id, null, null, null, t_iso, d); 
        } else {
             showToast('Error: El estudiante ya no aparece como ausente.', 'error');
        }
    };
    
    // --- EXPORTS ---
    function exportToCSV() { 
        const h = ["Estudiante", "Motivo", "Salida", "Regreso", "Duración"]; 
        const d = getFilteredHistory().map(i => [
            i.name, 
            i.reason, 
            new Date(i.departureTime).toLocaleString(), 
            i.returnTime ? new Date(i.returnTime).toLocaleString() : 'N/A', 
            i.duration || 'N/A'
        ]); 
        let c = "data:text/csv;charset=utf-8," + [h.join(","), ...d.map(e => `"${e.join('","')}"`)].join("\n"); 
        const u = encodeURI(c); 
        const l = document.createElement("a"); 
        l.setAttribute("href", u); 
        l.setAttribute("download", "historial_salidas.csv"); 
        document.body.appendChild(l); 
        l.click(); 
        l.remove(); 
        showToast('Historial exportado a CSV.', 'info'); 
    }
    
    function exportToPDF() { 
        const doc = new jsPDF(); 
        doc.autoTable({ 
            head: [['Estudiante', 'Motivo', 'Salida', 'Regreso', 'Duración']], 
            body: getFilteredHistory().map(h => [
                h.name, 
                h.reason, 
                new Date(h.departureTime).toLocaleString(), 
                h.returnTime ? new Date(h.returnTime).toLocaleString() : 'N/A', 
                h.duration || 'N/A'
            ]), 
            styles: { font: "Inter", fontSize: 8 }, 
            headStyles: { fillColor: [79, 70, 229] }, // Color Índigo
            startY: 10,
        }); 
        doc.save('historial_salidas.pdf'); 
        showToast('Historial exportado a PDF.', 'info'); 
    }

    // --- INIT & LISTENERS ---
    dom.tabs.forEach(t => t.addEventListener('click', () => setActiveTab(t.dataset.tab)));
    dom.searchFilter.addEventListener('input', renderStudents);
    [dom.startDate, dom.endDate].forEach(i => i.addEventListener('change', renderAll));
    dom.resetDatesBtn.addEventListener('click', () => { dom.startDate.value = ''; dom.endDate.value = ''; renderAll(); });
    dom.saveSettingsBtn.addEventListener('click', saveSettings);
    dom.addReasonBtn.addEventListener('click', addReason);
    dom.reasonsList.addEventListener('click', (e) => { 
        if (e.target.classList.contains('remove-reason-btn')) {
            removeReason(e.target.dataset.index);
        }
    });
    dom.exportCsvBtn.addEventListener('click', exportToCSV);
    dom.exportPdfBtn.addEventListener('click', exportToPDF);
    
    function initializeApp() {
        toggleLoader(true);
        loadSettings();
        loadSession();
        loadStudentCache();
        loadHistoryCache();
        
        // Renderizar inmediatamente con datos locales para una carga más rápida
        renderAll(); 
        setActiveTab('dashboard');
        
        // Intenta obtener datos de Google Sheets
        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
                .withSuccessHandler(data => {
                    toggleLoader(false);
                    if (data.error) { 
                        showToast(`Error de servidor al sincronizar. Usando caché local.`, 'error'); 
                        return; 
                    }
                    
                    // Nota: Usamos 'name' como 'id' en el frontend, ya que Apps Script no mapea ID's únicos fácilmente.
                    allStudents = data.students; 
                    allHistory = data.history || [];
                    
                    // La sesión de 'outOfClassroom' se mantiene local, pero la actualizamos con nombres que coincidan.
                    // Si el estudiante no está en la nueva lista, se elimina de 'outOfClassroom'.
                    const studentNames = new Set(allStudents.map(s => s.name));
                    outOfClassroom = outOfClassroom.filter(s => studentNames.has(s.id));
                    
                    saveStudentCache();
                    saveHistoryCache();
                    saveSession();
                    renderAll();
                    showToast('Datos sincronizados con Google Sheets.', 'success');
                })
                .withFailureHandler(err => {
                    toggleLoader(false);
                    showToast(`Fallo la conexión con Google Scripts. La app funciona en modo OFFLINE.`, 'info');
                })
                .getInitialData();
        } else {
            toggleLoader(false);
            showToast('Modo de prueba local. La aplicación NO está conectada a la base de datos.', 'info');
        }
    }
    
    initializeApp();
});