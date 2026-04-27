// ==========================================
// 1. KONFIGURACE A GLOBÁLNÍ PROMĚNNÉ
// ==========================================
const categoryColors = {
    "násilná": "#e74c3c", "majetková": "#3498db", "mravnostní": "#9b59b6",
    "hospodářská": "#2ecc71", "dopravní": "#e67e22", "ostatní": "#f1c40f", "default": "#7f8c8d"
};

const categoriesList = ["násilná", "majetková", "mravnostní", "hospodářská", "dopravní", "ostatní"];

const categoryMapping = {
    "násilná": ["násilná", "násilná bez podtřídy", "zbraně", "zbraně bez podtřídy", "extremismus", "extrémismus bez podtřídy"],
    "majetková": ["krádeže vloupáním", "vloupání bez podtřídy", "krádeže", "krádeže bez podtřídy", "podvody", "jiná majetková", "jiná majetková bez podtřídy"],
    "mravnostní": ["mravnostní"],
    "hospodářská": ["hospodářská"],
    "dopravní": ["dopravní nehody", "př – besip", "př – doprava a siln. hospodářství z.č. 200/1990"],
    "ostatní": ["ostatní", "požáry výbuchy", "požáry bez podtřídy", "obecně nebezpečná", "obecně nebezpečná bez podtřídy", "toxikománie", "toxikománie bez podtřídy", "přestupky"]
};

let typeMap = {}, stateMap = {};
let map, heatLayer, clusterLayer, relativeGridLayer;
let superclusterIndex = null; 
const monthDataCache = {};
let currentLoadId = 0;

// Cachovaná síť obyvatelstva
let gridDataCache = null;

// ==========================================
// 2. POMOCNÉ FUNKCE
// ==========================================
// Nová funkce: Vrací nejen hlavní kategorii, ale i přesnou podkategorii pro filtrování
function getCategoryDetails(pcrTypeStr) {
    if (!pcrTypeStr) return { main: "ostatní", sub: "ostatní" };
    const typeLower = pcrTypeStr.toLowerCase();
    for (const [mainCat, pcrTypesArray] of Object.entries(categoryMapping)) {
        for (const sub of pcrTypesArray) {
            if (typeLower.includes(sub)) return { main: mainCat, sub: sub };
        }
    }
    return { main: "ostatní", sub: "ostatní" };
}

async function loadCsvToMap(url, idKey) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        return new Promise((resolve) => {
            Papa.parse(text, { header: true, complete: (res) => {
                const obj = {};
                res.data.forEach(row => { if (row[idKey]) obj[row[idKey].toString()] = row; });
                resolve(obj);
            }});
        });
    } catch (e) { return {}; }
}

function getMonthsInRange(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const months = [];
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
        months.push(`${current.getFullYear()}_${String(current.getMonth() + 1).padStart(2, '0')}`);
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

// Načtení odlehčené polygonové sítě ČSÚ
async function loadPopulationGrid() {
    try {
        const res = await fetch('kriminalita/sit_cr_lehka.geojson'); 
        gridDataCache = await res.json();
    } catch (e) {
        console.warn("Nepodařilo se načíst grid obyvatelstva. Ujisti se, že soubor sit_cr_lehka.geojson je ve složce kriminalita.");
    }
}

function updateLegend(mode) {
    const legend = document.getElementById('legend');
    if (!legend) return;

    if (mode === 'heatmap') {
        legend.innerHTML = `
            <strong>Hustota kriminality (Heatmapa)</strong><br>
            <span style="font-size: 10px; color: #ef4444; font-weight: 600;">(Absolutní počty, nezohledňuje populaci)</span><br>
            <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <span style="font-size: 11px; font-weight: bold; color: #64748b;">Nízká</span>
                <div style="height: 12px; flex-grow: 1; background: linear-gradient(to right, blue, cyan, lime, yellow, red); border-radius: 6px;"></div>
                <span style="font-size: 11px; font-weight: bold; color: #ef4444;">Vysoká</span>
            </div>`;
    } else if (mode === 'relative') {
        legend.innerHTML = `
            <strong>Relativní riziko (na 1000 obyv.)</strong><br>
            <span style="font-size: 10px; color: #64748b; font-weight: 600;">(Očištěno o hustotu obyvatelstva)</span><br>
            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
                <div><span style="display:inline-block; width:12px; height:12px; background:#fef0d9; border:1px solid #ccc; margin-right:5px; opacity:0.8;"></span> Nízké (do 5 činů)</div>
                <div><span style="display:inline-block; width:12px; height:12px; background:#fdcc8a; border:1px solid #ccc; margin-right:5px; opacity:0.8;"></span> Zvýšené (5 - 15)</div>
                <div><span style="display:inline-block; width:12px; height:12px; background:#fc8d59; border:1px solid #ccc; margin-right:5px; opacity:0.8;"></span> Vysoké (15 - 30)</div>
                <div><span style="display:inline-block; width:12px; height:12px; background:#e34a33; border:1px solid #ccc; margin-right:5px; opacity:0.8;"></span> Velmi vysoké (30 - 60)</div>
                <div><span style="display:inline-block; width:12px; height:12px; background:#b30000; border:1px solid #ccc; margin-right:5px; opacity:0.8;"></span> Extrémní (nad 60)</div>
            </div>`;
    } else {
        const legendData = [
            { id: "Násilná", color: "#e74c3c" }, { id: "Majetková", color: "#3498db" },
            { id: "Mravnostní", color: "#9b59b6" }, { id: "Hospodářská", color: "#2ecc71" },
            { id: "Dopravní", color: "#e67e22" }, { id: "Ostatní", color: "#f1c40f" },
        ];
        let html = "<strong>Kategorie činů</strong><br><div style='display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;'>";
        legendData.forEach(item => {
            html += `<div style="display:flex; align-items:center; font-size: 13px;"><span style="width:12px; height:12px; border-radius:50%; background:${item.color}; margin-right:8px; border: 1px solid rgba(0,0,0,0.1);"></span>${item.id}</div>`;
        });
        legend.innerHTML = html + "</div>";
    }
}

// ==========================================
// 3. INTERAKTIVNÍ PANEL FILTRŮ (STROM)
// ==========================================
// Vytvoří rozbalovací menu pro podkategorie
function buildDynamicFilters() {
    const container = document.getElementById('typeFilter');
    if (!container) return;

    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    
    for (const [mainCat, subCats] of Object.entries(categoryMapping)) {
        const color = categoryColors[mainCat] || categoryColors.default;
        const safeCatId = mainCat.replace(/\s+/g, '_'); // Bezpečné ID pro HTML

        html += `
        <div class="filter-group" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <label style="font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #0f172a; margin: 0; flex-grow: 1;">
                    <input type="checkbox" class="main-cat-cb" value="${mainCat}" checked onchange="window.toggleMainCat('${mainCat}', this.checked)">
                    <span style="width:14px; height:14px; border-radius:50%; background:${color}; display:inline-block; border: 1px solid rgba(0,0,0,0.1);"></span>
                    ${mainCat.toUpperCase()}
                </label>
                <button onclick="window.toggleFilterDropdown('${safeCatId}')" style="border:none; background:none; cursor:pointer; font-size:18px; color:#64748b; padding:0 5px; height: 20px; line-height: 15px;">▾</button>
            </div>
            
            <div id="sub_${safeCatId}" style="margin-left: 26px; margin-top: 8px; display: none; flex-direction: column; gap: 6px; font-size: 12px; color: #475569;">
        `;
        
        subCats.forEach(sub => {
            const subLabel = sub.charAt(0).toUpperCase() + sub.slice(1);
            html += `
                <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; margin: 0;">
                    <input type="checkbox" class="sub-cat-cb" data-main="${mainCat}" value="${sub}" checked onchange="window.toggleSubCat('${mainCat}')">
                    ${subLabel}
                </label>
            `;
        });
        
        html += `</div></div>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// Funkce pro rozbalování podmenu
window.toggleFilterDropdown = function(id) {
    const el = document.getElementById(`sub_${id}`);
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

// Vypnutí/zapnutí celé hlavní kategorie
window.toggleMainCat = function(mainCat, isChecked) {
    document.querySelectorAll(`.sub-cat-cb[data-main="${mainCat}"]`).forEach(cb => {
        cb.checked = isChecked;
    });
    loadAndFilterData();
};

// Vypnutí/zapnutí jedné konkrétní podkategorie
window.toggleSubCat = function(mainCat) {
    const subs = document.querySelectorAll(`.sub-cat-cb[data-main="${mainCat}"]`);
    const mainCb = document.querySelector(`.main-cat-cb[value="${mainCat}"]`);
    // Pokud je zaškrtnutá aspoň jedna podkategorie, svítí i hlavní checkbox
    mainCb.checked = Array.from(subs).some(cb => cb.checked);
    loadAndFilterData();
};

// ==========================================
// 4. VYKRESLOVÁNÍ SHLUKŮ
// ==========================================
function createClusterIcon(feature, latlng) {
    const props = feature.properties;

    // --- SAMOSTATNÝ BOD ---
    if (!props.cluster) {
        const mainGroup = props._mainGroup || "ostatní";
        const color = categoryColors[mainGroup] || categoryColors.default;
        
        const marker = L.circleMarker(latlng, { radius: 5, fillColor: color, color: "#fff", weight: 0.5, fillOpacity: 0.9 });
        
        const types = props.t || props.types;
        const typeId = Array.isArray(types) ? types[0] : (types || null);
        const label = typeMap[typeId]?.label || 'Neznámý čin';
        
        marker.bindTooltip(`<b>${label}</b>`, { direction: 'top', className: 'cluster-tooltip' });
        marker.on('click', function() {
            const ts = props.ts || (props.date ? new Date(props.date).getTime() : 0);
            const displayDate = ts ? new Date(ts).toLocaleDateString('cs-CZ') : 'Neznámé datum';
            const state = props.s || props.state;
            const stateLabel = stateMap[state]?.label || 'Neznámý';
            
            marker.bindPopup(`
                <div style="font-family: 'Inter', sans-serif;">
                    <strong style="color:${color}; font-size: 14px;">${label}</strong><br><br>
                    📅 <b>Datum:</b> ${displayDate}<br>
                    ⚖️ <b>Stav:</b> ${stateLabel}
                </div>
            `).openPopup();
        });
        return marker;
    }

    // --- SHLUK (CLUSTER) S GRAFY ---
    const count = props.point_count;
    let maxCount = -1, dominantCat = "ostatní";

    for (const cat of categoriesList) {
        if (props[cat] > maxCount) { maxCount = props[cat]; dominantCat = cat; }
    }

    const bgColor = categoryColors[dominantCat] || categoryColors.default;
    let size = count > 10000 ? 70 : count > 1000 ? 60 : count > 200 ? 50 : count > 50 ? 45 : 40;

    const icon = L.divIcon({ html: `<div style="background-color: ${bgColor};"><span>${count}</span></div>`, className: 'custom-cluster-icon', iconSize: L.point(size, size) });
    const clusterMarker = L.marker(latlng, { icon });

    let tooltipHtml = `<div style="font-size: 12px; text-align: left; min-width: 120px;"><strong style="font-size: 14px;">Celkem činů: ${count}</strong><hr style="margin: 6px 0; border: 0; border-top: 1px solid #e2e8f0;">`;
    categoriesList.forEach(cat => {
        if (props[cat] > 0) {
            tooltipHtml += `<div style="display:flex; justify-content:space-between; gap:15px; margin-bottom: 3px;"><span><span style="color:${categoryColors[cat]}; font-size: 14px;">●</span> ${cat.charAt(0).toUpperCase() + cat.slice(1)}</span><strong>${props[cat]}</strong></div>`;
        }
    });
    tooltipHtml += `</div>`;
    clusterMarker.bindTooltip(tooltipHtml, { direction: 'top', className: 'cluster-tooltip' });

    const popupHtml = `
        <div style="width: 260px; text-align: center; font-family: 'Inter', sans-serif;">
            <h4 style="margin: 0 0 5px 0; color: #0f172a; font-size: 15px;">Složení kriminality</h4>
            <div style="width: 260px; height: 160px; position: relative;"><canvas id="chart_${props.cluster_id}"></canvas></div>
            <div id="dynamic_content_${props.cluster_id}" style="min-height: 140px; margin-top: 10px;"></div>
            <button onclick="window.zoomToCluster(${props.cluster_id}, ${latlng.lat}, ${latlng.lng})" style="margin-top: 15px; width: 100%; padding: 8px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">🔍 Přiblížit na shluk</button>
        </div>`;
    
    clusterMarker.bindPopup(popupHtml, { maxWidth: 300 });

    clusterMarker.on('popupopen', function() {
        const canvas = document.getElementById(`chart_${props.cluster_id}`);
        const dynamicDiv = document.getElementById(`dynamic_content_${props.cluster_id}`);
        if (!canvas || !dynamicDiv) return;

        if (clusterMarker._chartInstance) clusterMarker._chartInstance.destroy();
        if (clusterMarker._subChartInstance) clusterMarker._subChartInstance.destroy();

        const dataValues = categoriesList.map(cat => props[cat] || 0);
        const bgColors = categoriesList.map(cat => categoryColors[cat]);
        const labels = categoriesList.map(cat => cat.charAt(0).toUpperCase() + cat.slice(1));

        const renderDefaultTop5 = () => {
            const exact = props.exactTypes || {};
            let exactArray = Object.keys(exact).map(id => ({ id: id, count: exact[id] })).sort((a, b) => b.count - a.count);
            let html = '<div style="text-align: left; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; height: 100%;"><strong style="color:#0f172a; display:block; margin-bottom:8px; font-size: 12px; text-transform: uppercase;">Celkových TOP 5 činů:</strong>';
            exactArray.slice(0, 5).forEach(item => {
                const labelName = typeMap[item.id]?.label || typeMap[item.id]?.name || "Neznámý čin";
                html += `<div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:12px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px;"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" title="${labelName}">${labelName}</span><strong style="color: #2563eb;">${item.count}x</strong></div>`;
            });
            dynamicDiv.innerHTML = html + '</div>';
        };

        const renderSubChart = (categoryName, color) => {
            const subData = [];
            for (const [id, c] of Object.entries(props.exactTypes || {})) {
                if (getCategoryDetails(typeMap[id]?.name || "ostatní").main === categoryName) {
                    subData.push({ label: typeMap[id]?.label || typeMap[id]?.name || "Neznámý", count: c });
                }
            }
            subData.sort((a, b) => b.count - a.count);
            const topSub = subData.slice(0, 5);

            dynamicDiv.innerHTML = `<div style="margin-bottom: 8px; font-size: 12px; display:flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 8px;"><strong style="color:${color}; text-transform:uppercase;">${categoryName} (Detaily)</strong><button id="btn_back_${props.cluster_id}" style="font-size:10px; cursor:pointer; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:3px 6px; font-weight:bold; color:#475569;">✖ Zpět</button></div><div style="height: 110px; position: relative;"><canvas id="subchart_${props.cluster_id}"></canvas></div>`;
            document.getElementById(`btn_back_${props.cluster_id}`).onclick = (e) => { e.stopPropagation(); if (clusterMarker._subChartInstance) clusterMarker._subChartInstance.destroy(); renderDefaultTop5(); };

            clusterMarker._subChartInstance = new Chart(document.getElementById(`subchart_${props.cluster_id}`), {
                type: 'bar', data: { labels: topSub.map(item => item.label.length > 15 ? item.label.substring(0, 15) + '...' : item.label), datasets: [{ data: topSub.map(item => item.count), backgroundColor: color, borderRadius: 4 }] },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (ctx) => topSub[ctx[0].dataIndex].label } } }, scales: { x: { display: false }, y: { ticks: { font: { size: 10, family: 'Inter' }, color: '#475569' }, grid: { display: false }, border: {display: false} } } }
            });
        };

        clusterMarker._chartInstance = new Chart(canvas, {
            type: 'doughnut', data: { labels: labels, datasets: [{ data: dataValues, backgroundColor: bgColors, borderWidth: 2, borderColor: '#ffffff' }] },
            options: { cutout: '60%', onClick: (e, active) => { if (active.length > 0) { const idx = active[0].index; if (props[categoriesList[idx]] > 0) renderSubChart(categoriesList[idx], bgColors[idx]); } }, plugins: { legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } }, tooltip: { callbacks: { label: function(context) { return ` ${context.label}: ${context.raw} (${((context.raw / count) * 100).toFixed(1)}%)`; } } } } }
        });
        renderDefaultTop5();
    });

    return clusterMarker;
}

window.zoomToCluster = function(clusterId, lat, lng) {
    if (!superclusterIndex) return;
    map.flyTo([lat, lng], superclusterIndex.getClusterExpansionZoom(clusterId), { animate: true, duration: 1 });
    map.closePopup(); 
};

function updateMapClusters() {
    if (!superclusterIndex || !clusterLayer) return;
    const mode = document.getElementById('viewMode') ? document.getElementById('viewMode').value : 'markers';
    if (mode === 'heatmap' || mode === 'relative') return;

    const bounds = map.getBounds();
    const clusters = superclusterIndex.getClusters([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], map.getZoom());
    clusterLayer.clearLayers();
    clusterLayer.addData(clusters);
}

// ==========================================
// 5. HLAVNÍ LOGIKA A VÝPOČET RIZIKA
// ==========================================
async function loadAndFilterData() {
    const loadId = ++currentLoadId; 
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        const mode = document.getElementById('viewMode') ? document.getElementById('viewMode').value : 'markers';
        updateLegend(mode);

        let startTS = 0, endTS = Infinity, monthsRequired = [];
        const dateFromEl = document.getElementById('dateFrom');
        const dateToEl = document.getElementById('dateTo');

        if (dateFromEl && dateToEl && dateFromEl.value) {
            startTS = new Date(`${dateFromEl.value}T00:00:00`).getTime();
            endTS = new Date(`${dateToEl.value}T23:59:59`).getTime();
            monthsRequired = getMonthsInRange(dateFromEl.value, dateToEl.value);
        } else { monthsRequired = ["2025_01"]; }

        // Místo hlavních kategorií teď stahujeme stavy přímo z těch nových "pod-checkboxů"
        const checkedSubBoxes = document.querySelectorAll('.sub-cat-cb:checked');
        const selectedSubCats = Array.from(checkedSubBoxes).map(cb => cb.value.trim().toLowerCase());

        let allFeatures = [];
        const fetchPromises = monthsRequired.map(async (monthStr) => {
            if (monthDataCache[monthStr]) return monthDataCache[monthStr];
            try {
                const response = await fetch(`kriminalita/${monthStr}.geojson`);
                if (response.ok) {
                    const rawData = await response.json();
                    monthDataCache[monthStr] = rawData.features || [];
                    return monthDataCache[monthStr];
                }
            } catch (err) {}
            return [];
        });

        const results = await Promise.all(fetchPromises);
        if (loadId !== currentLoadId) return;
        results.forEach(monthFeatures => { allFeatures = allFeatures.concat(monthFeatures); });

        const filteredFeatures = allFeatures.filter(f => {
            const props = f.properties || {};
            const ts = props.ts || (props.date ? new Date(props.date).getTime() : 0);
            if (ts && (ts < startTS || ts > endTS)) return false;

            let typeId = null;
            const t_val = props.t || props.types;
            
            if (typeof t_val === 'string') {
                const match = t_val.match(/\d+/);
                if (match) typeId = parseInt(match[0], 10);
            } else if (Array.isArray(t_val)) {
                typeId = t_val[0];
            } else {
                typeId = t_val;
            }

            let cat = "ostatní";
            if (typeId !== null && typeMap[typeId] && typeMap[typeId].name) {
                cat = typeMap[typeId].name.trim().toLowerCase();
            }

            // Nová logika pro hloubkové filtrování
            const details = getCategoryDetails(cat);
            
            // Pokud přesná podkategorie (např. "podvody") není aktuálně zaškrtnutá, bod letí pryč
            if (!selectedSubCats.includes(details.sub)) return false;

            f.properties._mainGroup = details.main; // Uložíme hlavní skupinu kvůli barvě
            f.properties._cleanTypeId = typeId; 
            return true;
        });
        

        // VYČIŠTĚNÍ MAPY
        if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
        if (clusterLayer) clusterLayer.clearLayers();
        if (relativeGridLayer) { map.removeLayer(relativeGridLayer); relativeGridLayer = null; }

        // VYKRESLENÍ PODLE REŽIMU
        if (mode === 'heatmap') {
            const heatPoints = filteredFeatures.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], 0.5]);
            heatLayer = L.heatLayer(heatPoints, { radius: 20, blur: 15 }).addTo(map);

        } else if (mode === 'relative') {
            if (!gridDataCache) { return; }

            const gridCrimeCounts = {};
            filteredFeatures.forEach(f => {
                const gridId = f.properties.g;
                if (gridId) gridCrimeCounts[gridId] = (gridCrimeCounts[gridId] || 0) + 1;
            });

            relativeGridLayer = L.geoJSON(gridDataCache, {
                style: function(feature) {
                    const gridId = feature.properties.kod; 
                    const population = feature.properties.g131620000 || 0;
                    const crimes = gridCrimeCounts[gridId] || 0;
                    
                    if (crimes === 0) return { weight: 0, fillOpacity: 0 }; 
                    
                    let risk = population > 0 ? (crimes / population) * 1000 : crimes;

                    let color = '#fef0d9';
                    if (risk > 5) color = '#fdcc8a';
                    if (risk > 15) color = '#fc8d59';
                    if (risk > 30) color = '#e34a33';
                    if (risk > 60) color = '#b30000';

                    return { fillColor: color, weight: 1, color: 'rgba(255,255,255,0.1)', fillOpacity: 0.8 };
                },
                onEachFeature: function(feature, layer) {
                    const gridId = feature.properties.kod;
                    const pop = feature.properties.g131620000 || 0;
                    const crimes = gridCrimeCounts[gridId] || 0;
                    
                    if (crimes === 0) return;

                    const riskText = pop > 0 ? ((crimes / pop) * 1000).toFixed(1) : 'Oblast bez trvalých obyvatel';
                    layer.bindTooltip(`
                        <div style="font-family: Inter; text-align: left;">
                            <strong style="color: #0f172a;">Oblast: ${gridId}</strong><br>
                            👥 Obyvatel: ${pop}<br>
                            🚨 Počet činů: ${crimes}<br>
                            ⚠️ <strong>Riziko: ${riskText}</strong> <span style="font-size:10px;color:#64748b;">(činů/1000 ob.)</span>
                        </div>
                    `, { sticky: true, className: 'cluster-tooltip' });
                }
            }).addTo(map);

        } else {
            // KLASICKÝ SUPERCLUSTER
            superclusterIndex = new Supercluster({
                radius: 120, maxZoom: 15,
                map: (props) => {
                    const cat = props._mainGroup || "ostatní";
                    const typeId = props._cleanTypeId || "unknown"; 
                    
                    return {
                        "násilná": cat === "násilná" ? 1 : 0, "majetková": cat === "majetková" ? 1 : 0,
                        "mravnostní": cat === "mravnostní" ? 1 : 0, "hospodářská": cat === "hospodářská" ? 1 : 0,
                        "dopravní": cat === "dopravní" ? 1 : 0, "ostatní": cat === "ostatní" ? 1 : 0,
                        "exactTypes": { [typeId]: 1 } 
                    };
                },
                reduce: (accumulated, props) => {
                    categoriesList.forEach(cat => accumulated[cat] += props[cat]);
                    if (!accumulated.exactTypes) accumulated.exactTypes = {};
                    if (props.exactTypes) {
                        for (const key in props.exactTypes) accumulated.exactTypes[key] = (accumulated.exactTypes[key] || 0) + props.exactTypes[key];
                    }
                }
            });
            superclusterIndex.load(filteredFeatures);
            updateMapClusters();
        }

    } catch (e) {
        console.error("Kritická chyba v logice mapy:", e);
    } finally {
        if (loader && loadId === currentLoadId) loader.style.display = 'none';
    }
}

// --- VYHLEDÁVAČ ADRES ---
function initSearch() {
    const input = document.getElementById("mapSearchInput");
    const resultsBox = document.getElementById("mapSearchResults");
    if (!input || !resultsBox) return;

    input.addEventListener("input", async (e) => {
        const val = e.target.value.toLowerCase().trim();
        resultsBox.innerHTML = "";
        if (val.length < 3) { resultsBox.style.display = "none"; return; }

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${val}&countrycodes=cz`);
            const data = await res.json();
            let html = "";
            data.slice(0, 4).forEach(place => {
                const shortName = place.display_name.split(',').slice(0, 3).join(',');
                html += `<div class="search-item address-result" data-lat="${place.lat}" data-lon="${place.lon}">📍 ${shortName}</div>`;
            });

            if (html) {
                resultsBox.innerHTML = html; resultsBox.style.display = "flex";
                document.querySelectorAll('.address-result').forEach(el => {
                    el.onclick = () => {
                        map.flyTo([parseFloat(el.getAttribute("data-lat")), parseFloat(el.getAttribute("data-lon"))], 14, { animate: true, duration: 1.5 });
                        resultsBox.style.display = "none"; input.value = el.innerText.replace('📍 ', '');
                    };
                });
            } else { resultsBox.style.display = "none"; }
        } catch (err) {}
    });

    document.addEventListener("click", (e) => { if (!e.target.closest('.search-container')) resultsBox.style.display = "none"; });
}

// ==========================================
// 6. INICIALIZACE APLIKACE
// ==========================================
async function init() {
    map = L.map('map', { preferCanvas: true }).setView([49.8, 15.5], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    
    initSearch();

    clusterLayer = L.geoJSON(null, { pointToLayer: createClusterIcon }).addTo(map);
    map.on('moveend', updateMapClusters);

    // VYKRESLÍ ROZBALOVACÍ STROM DO TVÉHO LEVÉHO PANELU
    buildDynamicFilters();

    await Promise.all([
        loadCsvToMap('types.csv', 'id').then(res => typeMap = res),
        loadCsvToMap('states.csv', 'id').then(res => stateMap = res),
        loadPopulationGrid() 
    ]);
    
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const viewMode = document.getElementById('viewMode');

    if (dateFrom) dateFrom.addEventListener('change', loadAndFilterData);
    if (dateTo) dateTo.addEventListener('change', loadAndFilterData);
    if (viewMode) viewMode.addEventListener('change', loadAndFilterData);
    
    loadAndFilterData();
}

init();