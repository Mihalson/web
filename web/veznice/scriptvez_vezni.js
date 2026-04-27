document.addEventListener('DOMContentLoaded', () => {
    initLeftSidebar();
    initFiltersVezni();
});

// --- 1. OVLÁDÁNÍ SIDEBARU ---
function initLeftSidebar() {
    const sidebarLeft = document.getElementById("sidebarLeft");
    const handleLeft = document.getElementById("handleLeft");

    if (!sidebarLeft || !handleLeft) return;

    handleLeft.addEventListener("click", () => {
        sidebarLeft.classList.toggle("sidebar-left-open");
        sidebarLeft.classList.toggle("sidebar-left-collapsed");
    });
}

// --- 2. INICIALIZACE FILTRŮ (LEVÝ PANEL) ---
function initFiltersVezni() {
    const datasetFilter = document.getElementById("datasetFilter");
    const yearFilter = document.getElementById("yearFilterPrisoners"); // Opravené ID

    if (!datasetFilter || !yearFilter) return;

    datasetFilter.addEventListener("change", fetchAndRenderVezniData);
    yearFilter.addEventListener("change", fetchAndRenderVezniData);

    // Prvotní načtení při startu
    fetchAndRenderVezniData();
}

// --- 3. NAČÍTÁNÍ A ZPRACOVÁNÍ DAT ---
async function fetchAndRenderVezniData() {
    const datasetFilter = document.getElementById("datasetFilter");
    const yearFilter = document.getElementById("yearFilterPrisoners");
    
    if (!datasetFilter || !yearFilter) return;

    const dataset = datasetFilter.value;
    const year = yearFilter.value;
    const fileName = `${dataset}.json`;

    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error(`Nelze načíst ${fileName}`);
        
        const rawData = await response.json();
        
        // Uložíme kompletní data pro graf porovnání (všechny roky) pod unikátním názvem
        window.fullVezniData = rawData; 
        initCategorySelect(rawData);
        
        // Vyfiltrování dat jen pro zvolený rok pro tabulky
        const filteredData = {};
        for (const kategorie in rawData) {
            filteredData[kategorie] = rawData[kategorie].filter(item => String(item.rok) === String(year));
        }

        // Voláme přejmenovanou funkci, aby se netloukla s modálem!
        renderVezniDashboard(filteredData, dataset, year);

    } catch (error) {
        console.error("Chyba při načítání dat vězňů:", error);
        const dash = document.getElementById("prisonersDashboard");
        if (dash) dash.innerHTML = `<p style="color: red;">Nepodařilo se načíst data z <b>${fileName}</b>.</p>`;
    }
}

// --- 4. VYKRESLENÍ TABULEK (PŘEJMENOVÁNO NA renderVezniDashboard) ---
function renderVezniDashboard(data, datasetName, year) {
    const dashboard = document.getElementById("prisonersDashboard");
    if (!dashboard) return;
    
    dashboard.innerHTML = ""; 
    let hasData = false;

    for (const [title, records] of Object.entries(data)) {
        if (!records || records.length === 0) continue;
        hasData = true;

        const section = document.createElement("div");
        section.className = "stat-card";
        section.innerHTML = `<h3>${title.toUpperCase()} (${year})</h3>`;

        const table = document.createElement("table");
        table.className = "stat-table";

        // Hlavička (skryjeme nepotřebné technické sloupce)
        const keys = Object.keys(records[0]).filter(k => k !== "rok" && k !== "id" && k !== "veznice");
        const headerRow = `<tr>${keys.map(k => `<th>${k}</th>`).join("")}</tr>`;
        
        // Tělo tabulky
        const bodyRows = records.map(row => {
            const cells = keys.map(k => {
                let val = row[k];

                // Úprava procent
                if (k.toLowerCase().includes("%") || k.toLowerCase().includes("procent")) {
                    let formattedVal = val;
                    if (typeof val === "number") {
                        formattedVal = val < 1 ? (val * 100).toFixed(1) : val.toFixed(1);
                    }
                    return `<td style="font-weight: bold; color: #2563eb;">${formattedVal} %</td>`;
                }

                return `<td>${val !== undefined && val !== null ? val : '-'}</td>`;
            }).join("");

            return `<tr>${cells}</tr>`;
        }).join("");

        table.innerHTML = `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;
        section.appendChild(table);
        dashboard.appendChild(section);
    }

    if (!hasData) {
        dashboard.innerHTML = `<p>Pro rok ${year} nejsou k dispozici žádná data v kategorii ${datasetName}.</p>`;
    }
}

// -------------------------------------------------------------------
// ČÁST PRO POROVNÁVACÍ GRAF V LEVÉM PANELU (Chart.js)
// -------------------------------------------------------------------

window.vezniComparisonChart = null; // Unikátní název pro graf

function initCategorySelect(allData) {
    const select = document.getElementById("categorySelect");
    if (!select) return;
    
    select.innerHTML = "";
    
    Object.keys(allData).forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category.toUpperCase();
        select.appendChild(option);
    });

    // Po naplnění kategorií rovnou naplníme i druhou roletku
    updateMetricSelect();
}

window.updateMetricSelect = function() {
    const categorySelect = document.getElementById("categorySelect");
    const metricSelect = document.getElementById("metricSelect");
    
    if (!categorySelect || !metricSelect || !window.fullVezniData) return;
    
    const category = categorySelect.value;
    if (!window.fullVezniData[category] || window.fullVezniData[category].length === 0) return;

    metricSelect.innerHTML = "";

    const ignoredKeys = ["rok", "id", "veznice"];
    const keys = Object.keys(window.fullVezniData[category][0]).filter(k => !ignoredKeys.includes(k));
    
    keys.forEach((key, index) => {
        // Přidáme do výběru hodnoty jen číselná data (nebo všechna kromě prvního sloupce)
        if (index > 0 || typeof window.fullVezniData[category][0][key] === "number") {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key;
            metricSelect.appendChild(option);
        }
    });
}

window.compareYears = function() {
    const categorySelect = document.getElementById("categorySelect");
    const metricSelect = document.getElementById("metricSelect");
    const ctxElement = document.getElementById('comparisonChart');
    
    if (!categorySelect || !metricSelect || !ctxElement) return;

    const category = categorySelect.value;
    const metric = metricSelect.value;
    
    // Zjistíme zaškrtnuté roky
    const checkedBoxes = document.querySelectorAll('#yearCheckboxes input[type="checkbox"]:checked');
    const selectedYears = Array.from(checkedBoxes).map(cb => cb.value).sort();

    if (selectedYears.length === 0) {
        alert("Vyberte prosím alespoň jeden rok k porovnání.");
        return;
    }

    const records = window.fullVezniData[category];
    if (!records) return;

    // Najdeme klíč pro osu X (např. Věková kategorie, měsíc atd.)
    const ignoredKeys = ["rok", "id", "veznice"];
    const allKeys = Object.keys(records[0]).filter(k => !ignoredKeys.includes(k));
    const xAxisKey = allKeys[0]; 

    // Unikátní labely pro osu X
    const xLabels = [...new Set(records.map(r => r[xAxisKey]))];

    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    const datasets = [];

    // Vytvoříme sadu dat pro každý vybraný rok
    selectedYears.forEach((year, index) => {
        const yearData = records.filter(r => String(r.rok) === year);
        
        const dataPoints = xLabels.map(label => {
            const record = yearData.find(r => r[xAxisKey] === label);
            let val = record ? record[metric] : 0;
            
            // Ošetření desetinných míst u procent
            if (metric.toLowerCase().includes("%") && typeof val === "number" && val < 1) {
                val = val * 100;
            }
            return parseFloat(val) || 0;
        });

        datasets.push({
            label: `Rok ${year}`,
            data: dataPoints,
            backgroundColor: colors[index % colors.length],
            borderRadius: 4
        });
    });

    const isPercentage = metric.toLowerCase().includes("%") || metric.toLowerCase().includes("procent");
    const ctx = ctxElement.getContext('2d');

    // Bezpečné smazání starého grafu
    if (window.vezniComparisonChart) {
        window.vezniComparisonChart.destroy();
    }

    // Vykreslení nového grafu
    window.vezniComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: xLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return isPercentage ? value + ' %' : value; }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) { 
                            return isPercentage ? `${context.dataset.label}: ${context.raw.toFixed(1)} %` : `${context.dataset.label}: ${context.raw}`; 
                        }
                    }
                }
            }
        }
    });
}