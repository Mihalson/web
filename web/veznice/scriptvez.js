// --- 1. GLOBÁLNÍ STAV ---
window.state = {
    map: L.map('map').setView([49.8, 15.5], 7),
    prisonStats: null,
    fotoData: null,
    employeeData: null,
    vezniceInfo: null,    
    idToNameMap: {},
    selectedPrison: null,
    comparisonPrison: null,
    modalCharts: [],      
    typeColors: {},
    sidebarOpen: false,
    prisonLayers: {}      
};

const CATEGORIES = [
    { key: "obvineni", label: "Obvinění", color: "#3498db" },
    { key: "odsouzeni", label: "Odsouzení", color: "#2ecc71" },
    { key: "chovanci", label: "Chovanci", color: "#9b59b6" },
    { key: "nemocnice", label: "Nemocnice", color: "#e67e22" }
];

const palette = ["#3498db", "#e74c3c", "#9b59b6", "#2ecc71", "#f1c40f", "#e67e22", "#1abc9c"];

document.addEventListener("DOMContentLoaded", async () => {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(state.map);

    // --- 2. NAČTENÍ VŠECH DAT ---
    try {
        const [geoRes, statsRes, fotoRes, empRes, infoRes] = await Promise.all([
            fetch("veznice.geojson"),
            fetch("vez_j.json"),
            fetch("foto_data.json"),
            fetch("zamestnanci_vez.json"),
            fetch("veznice_info.json") 
        ]);
        
        const geoData = await geoRes.json();
        state.prisonStats = await statsRes.json();
        state.fotoData = await fotoRes.json();
        state.employeeData = await empRes.json();
        
        if (infoRes.ok) {
            state.vezniceInfo = await infoRes.json();
        } else {
            console.warn("Soubor veznice_info.json nenalezen.");
        }

        // Přiřazení barev podle druhu věznice
        const druhySet = new Set(geoData.features.map(f => f.properties.druh));
        Array.from(druhySet).forEach((druh, index) => {
            state.typeColors[druh] = palette[index % palette.length];
        });

        // Mapování OBJECTID na Název věznice
        Object.keys(state.prisonStats).forEach(name => {
            const firstEntry = state.prisonStats[name][0];
            if (firstEntry) state.idToNameMap[firstEntry.id] = name;
        });

        // Inicializace mapy a ovládacích prvků
        initMapLayer(geoData);
        initModalFilters();
        buildLegend();
        L.control.scale({ imperial: false, position: 'bottomright' }).addTo(state.map);
        initSearch();

        // Inicializace pravého sidebaru (pokud existuje)
        if (typeof initSidebar === "function") {
            initSidebar();
            if (typeof renderStats === "function") renderStats("2024");
        }

    } catch (err) { 
        console.error("Kritická chyba inicializace:", err); 
    }
});

// --- POMOCNÉ FUNKCE PRO VÝPOČET VELIKOSTI BODU ---
function getPrisonAvgById(id, year = 2024) {
    if (!state.vezniceInfo || !state.vezniceInfo["průměrný počet vězňů"]) return 0;
    const records = state.vezniceInfo["průměrný počet vězňů"];
    const record = records.find(r => Number(r.id) === Number(id) && Number(r.rok) === year);
    return record ? record["průměr vězňů na 1 den"] : 0;
}

function calculateRadius(avg) {
    if (!avg || avg <= 0) return 6; // Minimální velikost pro malé/neznámé
    // Výpočet: plošně úměrný poloměr, minimálně 6px
    return Math.max(6, Math.sqrt(avg) * 0.6); 
}

// --- 3. MAPA A KLIKNUTÍ ---
function initMapLayer(geoData) {
    state.prisonLayers = state.prisonLayers || {};

    L.geoJSON(geoData, {
        pointToLayer: (feature, latlng) => {
            const color = state.typeColors[feature.properties.druh] || "#95a5a6";
            
            // 1. Zjištění průměrného počtu osob a vypočítání velikosti pro daný bod
            const avg = getPrisonAvgById(feature.properties.OBJECTID, 2024);
            const radius = calculateRadius(avg);

            return L.circleMarker(latlng, { 
                radius: radius, 
                fillColor: color, 
                color: "#fff", 
                weight: 2, 
                fillOpacity: 0.9 
            });
        },
        onEachFeature: (feature, layer) => {
            const p = feature.properties;
            const prisonName = state.idToNameMap[p.OBJECTID] || p.nazev;
            const avg = getPrisonAvgById(p.OBJECTID, 2024);

            state.prisonLayers[prisonName.toLowerCase()] = {
                latlng: layer.getLatLng(),
                name: prisonName,
                marker: layer
            };

            // 2. Vylepšený Tooltip obsahující velikost věznice
            layer.bindTooltip(`
                <div style="text-align: center;">
                    <b style="font-size: 13px;">${p.nazev}</b><br>
                    <span style="font-size: 11px; color: #64748b;">Průměrně vězňů: ${avg > 0 ? Math.round(avg) : 'N/A'}</span>
                </div>
            `);
            
            layer.on('click', (e) => {
                state.selectedPrison = prisonName;
                const targetLatLng = e.latlng || layer.getLatLng();
                state.map.flyTo(targetLatLng, 12, { animate: true, duration: 1.5 });
                
                const extra = state.fotoData?.List1?.find(i => Number(i.OBJECTID) === Number(p.OBJECTID));
                
                fillPrisonInfo(p, extra);
                document.getElementById("grafModal").style.display = "block";
                
                state.comparisonPrison = null;
                const selSrov = document.getElementById("selectSrovnani");
                if(selSrov) selSrov.value = "";
                
                renderModalDashboard();
            });
        }
    }).addTo(state.map);
}

// --- 4. VYHLEDÁVAČ NA MAPĚ ---
function initSearch() {
    const input = document.getElementById("mapSearchInput");
    const resultsBox = document.getElementById("mapSearchResults");
    if (!input || !resultsBox) return;

    input.addEventListener("input", async (e) => {
        const val = e.target.value.toLowerCase().trim();
        resultsBox.innerHTML = "";

        if (val.length < 2) {
            resultsBox.style.display = "none";
            return;
        }

        let html = "";

        const prisonMatches = Object.keys(state.prisonLayers).filter(name => name.includes(val));
        prisonMatches.forEach(match => {
            const pData = state.prisonLayers[match];
            html += `<div class="search-item prison-result" data-name="${match}">🏛️ ${pData.name}</div>`;
        });

        if (val.length > 3 && prisonMatches.length === 0) { 
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${val}&countrycodes=cz`);
                const data = await res.json();
                
                data.slice(0, 3).forEach(place => {
                    const shortName = place.display_name.split(',').slice(0, 3).join(',');
                    html += `<div class="search-item address-result" data-lat="${place.lat}" data-lon="${place.lon}">📍 ${shortName}</div>`;
                });
            } catch (err) {
                console.warn("Chyba při hledání adresy:", err);
            }
        }

        if (html) {
            resultsBox.innerHTML = html;
            resultsBox.style.display = "flex";
            
            document.querySelectorAll('.prison-result').forEach(el => {
                el.onclick = () => {
                    const pName = el.getAttribute("data-name");
                    const layerData = state.prisonLayers[pName];
                    resultsBox.style.display = "none";
                    input.value = layerData.name; 
                    layerData.marker.fire('click', { latlng: layerData.latlng }); 
                };
            });

            document.querySelectorAll('.address-result').forEach(el => {
                el.onclick = () => {
                    const lat = parseFloat(el.getAttribute("data-lat"));
                    const lon = parseFloat(el.getAttribute("data-lon"));
                    resultsBox.style.display = "none";
                    input.value = el.innerText.replace('📍 ', '');
                    state.map.flyTo([lat, lon], 13, { animate: true, duration: 1.5 });
                };
            });
        } else {
            resultsBox.style.display = "none";
        }
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest('.search-container')) {
            resultsBox.style.display = "none";
        }
    });
}

// --- 5. MODÁL: ZÁKLADNÍ INFO (Leden 2024 a fotky) ---
function fillPrisonInfo(p, extra) {
    const infoDiv = document.getElementById("prisonInfoContent");
    const barva = state.typeColors[p.druh] || "#333";
    
    let stav2024 = 0;
    let kapacita2024 = 0;
    const dataJan24 = state.prisonStats[state.selectedPrison]?.find(d => d.rok === 2024 && String(d.mesic).toLowerCase() === "leden");
    
    if (dataJan24) {
        CATEGORIES.forEach(cat => {
            stav2024 += dataJan24[`stav ${cat.key}`] || 0;
            kapacita2024 += dataJan24[`kapacita ${cat.key}`] || 0;
        });
    }
    const naplnenostPct = kapacita2024 > 0 ? ((stav2024 / kapacita2024) * 100).toFixed(1) : 0;

    infoDiv.innerHTML = `
        <div style="margin-bottom:25px;">
            <h2 style="margin:0 0 10px 0; font-size:26px; color:#0f172a;">${p.nazev}</h2>
            <span class="prison-tag" style="background:${barva}">${p.druh || 'Zařízení'}</span>
        </div>

        <div class="january-badge">
            <div class="badge-title">Kapacita a stav (Leden 2024)</div>
            <div class="badge-value">${stav2024} / ${kapacita2024}</div>
            <div class="badge-sub">Naplněnost: <b>${naplnenostPct} %</b></div>
        </div>

        <div class="detail-item"><span class="detail-label">Adresa</span><span class="detail-value">${p.adresa || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Město</span><span class="detail-value">${p.mesto || '-'}</span></div>
        ${p.specializace ? `<div class="detail-item"><span class="detail-label">Specializace</span><div class="specializace-box">${p.specializace}</div></div>` : ''}
        
        <div id="prisonerTablesContainer"></div>

        <div style="margin-top: 20px;">
            ${extra?.url_obrazek ? `<img src="${extra.url_obrazek}" class="prison-img" alt="Foto věznice">` : ''}
            ${extra?.url_odkaz ? `<a href="${extra.url_odkaz}" target="_blank" class="btn-web">🌐 Přejít na web věznice</a>` : ''}
        </div>
    `;
}

// --- 6. MODÁL: KRESLENÍ GRAFŮ A TABULEK ---
function renderModalDashboard() {
    const container = document.getElementById("chartContainer");
    if (!state.selectedPrison || !container) return;

    const rok = parseInt(document.getElementById("rok").value);
    const mesic = document.getElementById("mesic").value;

    if (typeof renderPrisonerTables === "function") {
        renderPrisonerTables(rok);
    }

    container.innerHTML = "";
    state.modalCharts.forEach(c => { if(c) c.destroy(); });
    state.modalCharts = [];

    const dataT = state.prisonStats[state.selectedPrison]?.find(d => d.rok === rok && String(d.mesic).toLowerCase() === String(mesic).toLowerCase());
    const dataC = state.comparisonPrison ? state.prisonStats[state.comparisonPrison]?.find(d => d.rok === rok && String(d.mesic).toLowerCase() === String(mesic).toLowerCase()) : null;

    if (!dataT) {
        container.innerHTML = `
            <div style="padding: 30px; text-align: center; color: #64748b; background: #fff; border-radius: 8px;">
                <h4>Data chybí</h4>
                <p>Pro období <b>${mesic} ${rok}</b> nejsou u této věznice k dispozici žádná data.</p>
            </div>`;
    } else {
        CATEGORIES.forEach(cat => {
            const tCap = dataT[`kapacita ${cat.key}`];
            const tStav = dataT[`stav ${cat.key}`];
            
            if (tCap !== undefined && tCap !== null && tCap > 0) {
                const row = document.createElement('div');
                row.className = "gauge-row";
                row.style.cssText = "background: white; padding: 20px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
                
                row.innerHTML = `<div style="font-size: 15px; font-weight: 700; color: #475569; text-align: center; margin-bottom: 15px; text-transform: uppercase;">${cat.label}</div>`;
                
                const flex = document.createElement('div');
                flex.style.cssText = "display: flex; flex-direction: row; justify-content: space-evenly; align-items: center; gap: 20px; width: 100%; flex-wrap: wrap;";
                
                const boxT = document.createElement('div');
                boxT.style.cssText = "position: relative; width: 220px; height: 150px;";
                const canvasT = document.createElement('canvas');
                boxT.appendChild(canvasT);
                flex.appendChild(boxT);

                let canvasC = null;
                if (state.comparisonPrison) {
                    const boxC = document.createElement('div');
                    boxC.style.cssText = "position: relative; width: 220px; height: 150px;";
                    canvasC = document.createElement('canvas');
                    boxC.appendChild(canvasC);
                    flex.appendChild(boxC);
                }

                row.appendChild(flex);
                container.appendChild(row); 

                initGaugeChart(canvasT, tStav, tCap, cat.color, state.selectedPrison);
                
                if (state.comparisonPrison && canvasC) {
                    const cCap = dataC?.[`kapacita ${cat.key}`] || 0;
                    const cStav = dataC?.[`stav ${cat.key}`] || 0;
                    initGaugeChart(canvasC, cStav, cCap, cat.color, state.comparisonPrison);
                }
            }
        });
    }

    if (typeof window.renderTrendChart === "function") {
        window.renderTrendChart();
    }
}

// --- 7. TABULKY ODSOUZENÝCH Z VEZNICE_INFO.JSON ---
function renderPrisonerTables(rok) {
    const container = document.getElementById("prisonerTablesContainer");
    if (!container || !state.vezniceInfo) return;

    let html = "";
    const ignoreKeys = ["id", "rok", "veznice", "obvinění", "odsouzení", "chovanci", "celkem", "průměr vězňů na 1 den", "nezařazeni"];

    Object.keys(state.vezniceInfo).forEach(category => {
        const records = state.vezniceInfo[category].filter(d => d.veznice === state.selectedPrison && String(d.rok) === String(rok));

        records.forEach(record => {
            let rows = "";
            for (const [key, val] of Object.entries(record)) {
                if (val > 0 && !ignoreKeys.includes(key) && !String(key).startsWith("Úhrnem")) {
                    rows += `
                        <tr>
                            <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 13px;">${key}</td>
                            <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a; text-align: right; font-size: 13px;">${val}</td>
                        </tr>
                    `;
                }
            }

            if (rows) {
                html += `
                    <div style="margin-top: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1;">
                        <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #2563eb; text-transform: uppercase;">${category}</h4>
                        <table style="width: 100%; border-collapse: collapse;"><tbody>${rows}</tbody></table>
                    </div>
                `;
            }
        });
    });

    if (html === "") {
        html = `<p style="font-size: 13px; color: #ef4444; margin-top: 15px;">Pro rok ${rok} nejsou detailní tabulky chovanců k dispozici.</p>`;
    }

    container.innerHTML = html;
}

// --- 8. INICIALIZACE JEDNOHO GAUGE GRAFU ---
function initGaugeChart(canvas, cur, max, col, label) {
    const numCur = Number(cur) || 0;
    const numMax = Number(max) || 0;
    const over = numCur > numMax;
    const remainder = Math.max(0, numMax - numCur);

    const chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [numCur, remainder],
                backgroundColor: [over ? "#ef4444" : col, "#e2e8f0"],
                borderWidth: 0
            }]
        },
        options: {
            circumference: 180, rotation: 270, cutout: '75%',
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                title: { display: true, text: label, font: { size: 12 } }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw: (chart) => {
                const { ctx, chartArea: { left, right, bottom } } = chart;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.fillStyle = over ? '#ef4444' : '#1e293b';
                ctx.font = 'bold 14px "Inter", sans-serif';
                ctx.fillText(`${numCur} / ${numMax}`, (left + right) / 2, bottom - 10);
                ctx.restore();
            }
        }]
    });
    state.modalCharts.push(chart);
}

// --- 9. TRENDOVÝ GRAF (SLOUPCE V ČASE) ---
window.trendChartInstance = null;

window.renderTrendChart = function() {
    if (!window.state || !window.state.selectedPrison || !window.state.prisonStats[window.state.selectedPrison]) return;

    const checkedBoxes = document.querySelectorAll('#trendYears input[type="checkbox"]:checked');
    const selectedYears = Array.from(checkedBoxes).map(cb => parseInt(cb.value)).sort();
    const metricCategory = document.getElementById("trendMetric")?.value || "obvineni";
    const selectedMonth = document.getElementById("mesic")?.value || "leden";

    if (selectedYears.length === 0) return;

    const labels = selectedYears.map(y => String(y));
    const dataStav = [];
    const dataKapacita = [];

    const categoryConfig = CATEGORIES.find(c => c.key === metricCategory);
    const mainColor = categoryConfig ? categoryConfig.color : '#3498db';

    selectedYears.forEach(year => {
        const records = window.state.prisonStats[window.state.selectedPrison];
        const recordForYear = records.find(d => d.rok === year && String(d.mesic).toLowerCase() === selectedMonth);
        
        if (recordForYear) {
            dataStav.push(recordForYear[`stav ${metricCategory}`] || 0);
            dataKapacita.push(recordForYear[`kapacita ${metricCategory}`] || 0);
        } else {
            dataStav.push(0);
            dataKapacita.push(0);
        }
    });

    const ctxEl = document.getElementById('trendChartCanvas');
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    
    if (window.trendChartInstance) {
        window.trendChartInstance.destroy();
    }

    window.trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Skutečný stav`,
                    data: dataStav,
                    backgroundColor: mainColor,
                    borderRadius: 4
                },
                {
                    label: `Kapacita`,
                    data: dataKapacita,
                    backgroundColor: '#cbd5e1',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}` } },
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            }
        }
    });
}

// --- 10. FILTRY A LEGENDA ---
function initModalFilters() {
    const selRok = document.getElementById("rok");
    const selMesic = document.getElementById("mesic");
    const selSrovnani = document.getElementById("selectSrovnani");
    const closeBtn = document.querySelector(".close");

    const roky = [2024, 2023, 2022, 2021, 2020];
    const mesice = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
    
    selRok.innerHTML = ""; selMesic.innerHTML = "";
    roky.forEach(r => selRok.add(new Option(r, r)));
    mesice.forEach(m => selMesic.add(new Option(m, m)));
    
    selRok.value = "2024";
    selMesic.value = "leden";

    Object.keys(state.prisonStats).sort().forEach(n => selSrovnani.add(new Option(n, n)));

    [selRok, selMesic].forEach(el => el.addEventListener("change", renderModalDashboard));
    selSrovnani.addEventListener("change", (e) => { 
        state.comparisonPrison = e.target.value; 
        renderModalDashboard(); 
    });
    
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById("grafModal").style.display = "none";
            state.comparisonPrison = null;
            selSrovnani.value = "";
        };
    }
}

function buildLegend() {
    const leg = document.getElementById("legend");
    if (!leg) return;
    
    // Vyčištění aktuálního obsahu
    leg.innerHTML = "";
    
    // ČÁST 1: Barvy podle typu zařízení
    let html = "<strong>Typy zařízení</strong>";
    html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">`;
    Object.keys(window.state.typeColors).forEach(typ => {
        if (!typ || typ === "null" || typ === "undefined") return;
        html += `
            <div class="legend-item" style="display:flex; align-items:center; font-size:12px;">
                <div style="width:14px; height:14px; background:${window.state.typeColors[typ]}; margin-right:8px; border-radius:50%; border: 1px solid rgba(0,0,0,0.1);"></div>
                ${typ}
            </div>
        `;
    });
    html += `</div>`;

    // ČÁST 2: Velikosti bodů
    html += "<strong style='margin-top: 15px; padding-top: 10px; border-top: 1px solid #cbd5e1;'>Kapacita věznice (počet osob)</strong>";
    html += `<div style="display: flex; align-items: flex-end; justify-content: space-around; margin-top: 10px; padding-bottom: 5px;">`;
    
    // Vzorové velikosti do legendy
    const sizes = [200, 600, 1200];
    sizes.forEach(size => {
        const r = calculateRadius(size);
        html += `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                <div style="width:${r*2}px; height:${r*2}px; background:#94a3b8; border-radius:50%; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
                <span style="font-size: 11px; color: #475569; font-weight: 600;">${size}</span>
            </div>
        `;
    });
    html += `</div>`;
    
    leg.innerHTML = html;
}