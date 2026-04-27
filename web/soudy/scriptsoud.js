const map = L.map('map', { zoomControl: false }).setView([49.8, 15.5], 7);
L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CartoDB',
    maxZoom: 19
}).addTo(map);

let ksData = {};
let osData = {};
let currentAgenda = "";
let currentYear = 2024;
let myChart = null;

let ksLayer = null;
let osLayer = null;
let currentLevel = "KS";

// 1. NAČTENÍ VŠECH DAT SOUČASNĚ (Data i GeoJSONy)
Promise.all([
    fetch('soudy_KS.json').then(res => res.json()).catch(() => ({})),
    fetch('soudy_OS.json').then(res => res.json()).catch(() => ({})),
    fetch('KS.geojson').then(res => res.json()).catch(() => null),
    fetch('OS.geojson').then(res => res.json()).catch(() => null)
]).then(([ks, os, ksGeo, osGeo]) => {
    ksData = ks;
    osData = os;
    
    // Inicializace filtrů
    populateFilters();

    // Příprava GeoJSON vrstev
    if (ksGeo) {
        ksLayer = L.geoJSON(ksGeo, { style: styleFeature, onEachFeature: onEachFeatureInteraction });
    }
    if (osGeo) {
        osLayer = L.geoJSON(osGeo, { style: styleFeature, onEachFeature: onEachFeatureInteraction });
    }

    // Posluchač na přepínač KS/OS
    document.querySelectorAll('input[name="court-level"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            switchLevel(e.target.value);
        });
    });

    // Zobrazení úvodní vrstvy (KS)
    switchLevel(currentLevel);
});

// NAPLNĚNÍ SELECTBOXŮ
function populateFilters() {
    const aSel = document.getElementById('agendaSelect');
    const ySel = document.getElementById('yearSelect');
    const dataset = Object.keys(osData).length > 0 ? osData : ksData;
    
    Object.keys(dataset).forEach(agenda => {
        aSel.add(new Option(agenda, agenda));
    });

    let years = new Set();
    if(dataset[Object.keys(dataset)[0]]) {
        dataset[Object.keys(dataset)[0]].forEach(d => years.add(d.rok));
    }
    
    Array.from(years).sort().forEach(y => {
        ySel.add(new Option(y, y));
    });

    if (aSel.options.length > 0) currentAgenda = aSel.value;
    if (ySel.options.length > 0) ySel.value = Math.max(...Array.from(years));
    currentYear = parseInt(ySel.value);

    aSel.onchange = (e) => { currentAgenda = e.target.value; updateMapColors(); };
    ySel.onchange = (e) => { currentYear = parseInt(e.target.value); updateMapColors(); };
}

// PŘEPÍNÁNÍ ÚROVNĚ (Zavolá se při kliknutí na přepínač)
function switchLevel(level) {
    currentLevel = level;

    // Odstranit staré vrstvy
    if (ksLayer) map.removeLayer(ksLayer);
    if (osLayer) map.removeLayer(osLayer);

    // Přidat novou a správně obarvit
    if (currentLevel === "KS" && ksLayer) {
        ksLayer.addTo(map);
        ksLayer.setStyle(styleFeature);
        ensurePragueOnTop(ksLayer);
    } 
    else if (currentLevel === "OS" && osLayer) {
        osLayer.addTo(map);
        osLayer.setStyle(styleFeature);
    }

    // Vymazání pravého panelu
    document.getElementById('details').innerHTML = `<div class="empty-state"><p>Jste na úrovni <b>${currentLevel === 'KS' ? 'krajských' : 'okresních'}</b> soudů. Vyberte území v mapě pro detail.</p></div>`;
}

// ZÍSKÁNÍ STATISTIKY PRO DANÝ POLYGON
function getStats(feature) {
    if (!currentAgenda) return null;

    if (currentLevel === "KS") {
        if (!ksData[currentAgenda]) return null;
        let id_ks = feature.properties ? parseInt(feature.properties.id_ks) : null;
        if (!id_ks || isNaN(id_ks)) id_ks = parseInt(feature.id || (feature.properties && feature.properties.id));
        return ksData[currentAgenda].find(d => d.id_ks === id_ks && d.rok === currentYear);
    } 
    else {
        if (!osData[currentAgenda]) return null;
        let id_os = feature.properties ? parseInt(feature.properties.id_os) : null;
        if (!id_os || isNaN(id_os)) id_os = parseInt(feature.id || (feature.properties && feature.properties.id));
        return osData[currentAgenda].find(d => d.id_os === id_os && d.rok === currentYear);
    }
}

// BAREVNÁ ŠKÁLA A STYLOVÁNÍ
function styleFeature(feature) {
    const stat = getStats(feature);
    const val = stat ? (stat["Délka řízení ve dnech: Průměr"] || stat["Délka řízení: Průměr"] || 0) : 0;
    
    return {
        fillColor: getColor(val),
        weight: 1.5,
        opacity: 1,
        color: 'white',
        fillOpacity: 0.75
    };
}

function getColor(d) {
    return d > 300 ? '#ef4444' :
           d > 200 ? '#f97316' :
           d > 150 ? '#f59e0b' :
           d > 100 ? '#84cc16' :
           d > 0   ? '#22c55e' : '#cbd5e1';
}

function updateMapColors() {
    if (currentLevel === "KS" && ksLayer) { ksLayer.setStyle(styleFeature); ensurePragueOnTop(ksLayer); }
    if (currentLevel === "OS" && osLayer) { osLayer.setStyle(styleFeature); }
    
    // Obnovení detailu, pokud je zrovna nějaký otevřený, nebo jeho skrytí
    document.getElementById('details').innerHTML = `<div class="empty-state"><p>Data byla aktualizována. Klikněte na oblast pro nové statistiky.</p></div>`;
}

// INTERAKCE S MYŠÍ
function onEachFeatureInteraction(feature, layer) {
    layer.on({
        mouseover: (e) => {
            e.target.setStyle({ weight: 3, color: '#2563eb', fillOpacity: 0.9 });
            if (currentLevel === "KS") ensurePragueOnTop(ksLayer);
        },
        mouseout: (e) => {
            if (currentLevel === "KS" && ksLayer) { ksLayer.resetStyle(e.target); ensurePragueOnTop(ksLayer); }
            if (currentLevel === "OS" && osLayer) { osLayer.resetStyle(e.target); }
        },
        click: (e) => {
            map.fitBounds(e.target.getBounds(), { padding: [50, 50], animate: true, duration: 0.5 });
            renderDetails(feature);
        }
    });
}

// VYKRESLENÍ DETAILŮ DO PANELU
function renderDetails(feature) {
    const stat = getStats(feature);
    const container = document.getElementById('details');
    
    if (!stat) {
        container.innerHTML = `<div class="empty-state"><p style="color:#ef4444;">Data pro tento soud nejsou ve vybraném filtru dostupná.</p></div>`;
        return;
    }

    const isKS = currentLevel === "KS";
    const targetId = isKS ? stat.id_ks : stat.id_os;
    const dataset = isKS ? ksData : osData;
    
    // Historie pro graf
    const history = dataset[currentAgenda]
        .filter(d => (isKS ? d.id_ks === targetId : d.id_os === targetId))
        .sort((a, b) => a.rok - b.rok);

    let html = `
        <div class="court-title">${stat["Název soudu"] || 'Neznámý soud'}</div>
        <p style="font-size: 13px; color: #64748b; margin-top:-10px; margin-bottom:15px;">Nadřízený soud: ${stat["Nadřízený soud"] || 'Neznámý'}</p>
        
        <div class="chart-container">
            <canvas id="trendChart"></canvas>
        </div>
        <div class="stats-grid">
    `;

    for (let key in stat) {
        if (['id_ks', 'id_os', 'rok', 'Nadřízený soud', 'Název soudu'].includes(key)) continue;
        let val = stat[key];
        if (typeof val === 'number' && val % 1 !== 0) val = Math.round(val * 100) / 100;
        html += `<div class="stat-item"><span class="stat-label">${key}</span><span class="stat-value">${val}</span></div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;

    // Vykreslení grafu
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(h => h.rok),
            datasets: [{
                label: 'Průměrná délka řízení',
                data: history.map(h => h["Délka řízení ve dnech: Průměr"] || h["Délka řízení: Průměr"] || 0),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#2563eb'
            }]
        },
        options: { 
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } }
        }
    });
}

// OCHRANA PRAHY (jen pro krajské soudy)
function ensurePragueOnTop(layerGroup) {
    if (!layerGroup) return;
    layerGroup.eachLayer(l => {
        let id_ks = l.feature.properties ? parseInt(l.feature.properties.id_ks) : null;
        let fallbackId = l.feature.id ? parseInt(l.feature.id) : null;
        if (id_ks === 101 || fallbackId === 1 || fallbackId === 101) {
            l.bringToFront();
        }
    });
}

// LEGENDA
var legend = L.control({position: 'bottomleft'});
legend.onAdd = function (map) {
    var div = L.DomUtil.create('div', 'legend'),
        grades = [0, 100, 150, 200, 300],
        labels = ['<strong>Průměrná délka (dny)</strong>'];

    for (var i = 0; i < grades.length; i++) {
        div.innerHTML += labels.push(
            '<div class="legend-item"><div class="legend-color" style="background:' + getColor(grades[i] + 1) + '"></div> ' +
            grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + ' dní</div>' : '+ dní</div>')
        );
    }
    div.innerHTML = labels.join('');
    return div;
};
legend.addTo(map);