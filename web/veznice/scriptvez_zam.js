// --- SIDEBAR A STATISTIKY ZAMĚSTNANCŮ ---

function initSidebar() {
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebarHandle");
    const yearFilter = document.getElementById("yearFilterStaff"); // Opraveno ID podle HTML

    if (!sidebar || !handle) {
        console.error("Chyba: Sidebar nebo Handle nebyl v DOM nalezen.");
        return;
    }

    // Obsluha otevírání/zavírání
    handle.addEventListener("click", () => {
        state.sidebarOpen = !state.sidebarOpen;
        
        // Přepínání tříd přesně podle tvého CSS
        if (state.sidebarOpen) {
            sidebar.classList.remove("sidebar-collapsed");
            sidebar.classList.add("sidebar-open");
        } else {
            sidebar.classList.remove("sidebar-open");
            sidebar.classList.add("sidebar-collapsed");
        }
    });

    // Filtrování roků
    if (yearFilter) {
        yearFilter.addEventListener("change", (e) => {
            renderStats(e.target.value);
        });
    } else {
        console.warn("Varování: yearFilterStaff nebyl nalezen.");
    }
}

function renderStats(year) {
    const dashboard = document.getElementById("statsDashboard");
    
    // 1. Kontrola existence dashboardu a dat
    if (!dashboard) return;
    if (!state.employeeData) {
        console.log("Data pro zaměstnance se ještě načítají...");
        return;
    }

    // 2. Vyčištění dashboardu
    dashboard.innerHTML = "";

    // 3. Procházení kategorií (Věk, Vzdělání, Délka praxe atd.)
    Object.keys(state.employeeData).forEach(categoryName => {
        const isTotalChart = categoryName.toLowerCase().includes('celkem');
        
        // Filtrace dat: Pokud jde o 'Celkem', bereme vše (pro line chart), 
        // jinak filtrujeme podle zvoleného roku.
        const dataToRender = isTotalChart 
            ? state.employeeData[categoryName] 
            : state.employeeData[categoryName].filter(d => String(d.rok) === String(year));

        if (dataToRender.length > 0) {
            // Vytvoření karty (HTML struktura)
            const card = createStatCard(categoryName, dataToRender, isTotalChart);
            dashboard.appendChild(card);
            
            // Vykreslení grafu do canvasu, který už v tuto chvíli existuje v DOM
            createDashboardChart(categoryName, dataToRender);
        }
    });
}
function createStatCard(name, data, isTotalChart) {
    const card = document.createElement("div");
    card.className = "stat-card";
    
    const lowerName = name.toLowerCase();
    const isGenderData = lowerName.includes('věk') || lowerName.includes('délka') || lowerName.includes('vzdělání');
    
    let col1 = isGenderData ? "Muži" : (isTotalChart ? "Plán" : "Příslušníci");
    let col2 = isGenderData ? "Ženy" : (isTotalChart ? "Skutečnost" : "Občané");

    let tableHtml = `<table class="stat-table">
        <thead>
            <tr>
                <th>${isTotalChart ? "Rok" : "Kategorie"}</th>
                <th>${col1}</th>
                <th>${col2}</th>
            </tr>
        </thead>
        <tbody>`;

    data.forEach(row => {
        const label = row["Věková škála"] || row["Délka služebního poměru"] || 
                      row["Délka pracovního poměru"] || row["druh vzdělání"] || 
                      row["kategorie"] || row["rok"] || "";

        if (String(label).trim() !== "Celkem") {
            let val1 = isTotalChart ? (row["Schválené počty  (plánované)"] || 0) : (row["Muži"] || row["příslušníci"] || 0);
            let val2 = isTotalChart ? (row["Skutečný počet (se zálohami, bez nekázně)"] || 0) : (row["Ženy"] || row["občanští zaměstnanci"] || 0);

            tableHtml += `<tr>
                <td>${label}</td>
                <td>${Number(val1).toLocaleString('cs-CZ')}</td>
                <td>${Number(val2).toLocaleString('cs-CZ')}</td>
            </tr>`;
        }
    });
    
    tableHtml += `</tbody></table>`;

    card.innerHTML = `
        <div class="stat-card-header"><h3>${name}</h3></div>
        <div class="chart-container" style="height:280px;"><canvas id="chart-${name.replace(/\s+/g, '')}"></canvas></div>
        <div class="table-container" style="margin-top:10px;">${tableHtml}</div>
    `;
    return card;
}

function createDashboardChart(name, data) {
    const canvasId = `chart-${name.replace(/\s+/g, '')}`;
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;
    
    const ctx = canvasEl.getContext('2d');
    const lowerName = name.toLowerCase();
    const isTotalChart = lowerName.includes('celkem');
    const isEducation = lowerName.includes('vzdělání');

    const colors = {
        primary: '#1e40af',   // Modrá
        secondary: '#ef4444', // Červená
        lightBlue: 'rgba(30, 64, 175, 0.1)'
    };

    let filtered = data.filter(d => {
        const label = String(d["Věková škála"] || d["Délka služebního poměru"] || d["druh vzdělání"] || d["kategorie"] || "");
        return label.trim() !== "Celkem";
    });

    filtered.sort((a, b) => (a.rok || 0) - (b.rok || 0));

    // Rozhodnutí o typu grafu a skládání (stacking)
    let chartType = isTotalChart ? 'line' : 'bar';
    let isStacked = !isTotalChart && !isEducation; // Vzdělání nebude stacked, ostatní bar grafy ano

    let config = {
        type: chartType,
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: {
                y: { beginAtZero: true, stacked: isStacked },
                x: { stacked: isStacked }
            }
        }
    };

    if (isTotalChart) {
        config.data.labels = filtered.map(d => d.rok);
        config.data.datasets = [
            {
                label: 'Skutečnost',
                data: filtered.map(d => d["Skutečný počet (se zálohami, bez nekázně)"] || 0),
                borderColor: colors.primary,
                backgroundColor: colors.lightBlue,
                fill: true,
                tension: 0.4
            },
            {
                label: 'Plán',
                data: filtered.map(d => d["Schválené počty  (plánované)"] || 0),
                borderColor: colors.secondary,
                borderDash: [5, 5]
            }
        ];
    } else {
        const isGender = lowerName.includes('věk') || lowerName.includes('délka') || isEducation;
        config.data.labels = filtered.map(d => d["Věková škála"] || d["Délka služebního poměru"] || d["druh vzdělání"] || d["kategorie"] || "");
        config.data.datasets = [
            { 
                label: isGender ? 'Muži' : 'Příslušníci', 
                data: filtered.map(d => d["Muži"] || d["příslušníci"] || 0), 
                backgroundColor: colors.primary,
                borderRadius: isStacked ? 0 : 4
            },
            { 
                label: isGender ? 'Ženy' : 'Občané', 
                data: filtered.map(d => d["Ženy"] || d["občanští zaměstnanci"] || 0), 
                backgroundColor: colors.secondary,
                borderRadius: isStacked ? 0 : 4
            }
        ];
    }

    if (state.dashboardCharts && state.dashboardCharts[canvasId]) {
        state.dashboardCharts[canvasId].destroy();
    }
    
    if (!state.dashboardCharts) state.dashboardCharts = {};
    state.dashboardCharts[canvasId] = new Chart(ctx, config);
}