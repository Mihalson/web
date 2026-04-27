import os
import glob
import pandas as pd
import geopandas as gpd
from tqdm import tqdm

# ==========================================
# 1. NASTAVENÍ SLOŽEK A SOUBORŮ
# ==========================================
INPUT_DIR = "kriminalita_og" 
OUTPUT_DIR = "kriminalita"
GRID_FILE = "populace_1km.geojson"

ID_CTVERCE_SLOUPEC = "kod" 
POPULACE_SLOUPEC = "g131620000"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# ==========================================
# 2. NAČTENÍ A PŘEVOD SÍTĚ OBYVATELSTVA
# ==========================================
print("1. Načítám čtvercovou síť ČSÚ...")
grid_komplet = gpd.read_file(GRID_FILE)

print("2. Sjednocuji souřadnice sítě do GPS (EPSG:4326)...")
# TOTO JE TEN MAGICKÝ KROK PRO WEB!
if grid_komplet.crs != "EPSG:4326":
    grid_komplet = grid_komplet.to_crs("EPSG:4326")

print("3. Vytvářím lehkou verzi sítě pro web (sit_cr_lehka.geojson)...")
grid_lehky = grid_komplet[[ID_CTVERCE_SLOUPEC, POPULACE_SLOUPEC, 'geometry']]
cesta_lehky_grid = os.path.join(OUTPUT_DIR, "sit_cr_lehka.geojson")
grid_lehky.to_file(cesta_lehky_grid, driver="GeoJSON")

# Pro spojování stačí geometrie a ID
grid_pro_join = grid_komplet[[ID_CTVERCE_SLOUPEC, 'geometry']]

# ==========================================
# 3. ZPRACOVÁNÍ A ZNAČKOVÁNÍ KRIMINALITY
# ==========================================
print("\n4. Hledám soubory s kriminalitou...")
geojson_files = sorted(glob.glob(os.path.join(INPUT_DIR, "*.geojson")))
print(f"   Nalezeno {len(geojson_files)} souborů. Zahajuji úpravy...")

for file_path in tqdm(geojson_files):
    file_name = os.path.basename(file_path)
    
    try:
        gdf = gpd.read_file(file_path)
        
        columns_to_keep = ['types', 'state', 'date', 'geometry']
        actual_cols_to_keep = [col for col in columns_to_keep if col in gdf.columns]
        gdf = gdf[actual_cols_to_keep]
        
        if 'date' in gdf.columns:
            parsed_dates = pd.to_datetime(gdf['date'], errors='coerce')
            gdf['ts'] = parsed_dates.apply(lambda x: int(x.timestamp() * 1000) if pd.notnull(x) else 0)
            gdf = gdf.drop(columns=['date'])

        # POJISTKA: Převod bodů do GPS (EPSG:4326), kdyby náhodou byly v něčem jiném
        if gdf.crs != "EPSG:4326":
            gdf = gdf.to_crs("EPSG:4326")
            
        # Spojení (nyní jsou oba datasety garantovaně v EPSG:4326)
        gdf_s_gridem = gpd.sjoin(gdf, grid_pro_join, how="left", predicate="intersects")
        
        if 'index_right' in gdf_s_gridem.columns:
            gdf_s_gridem = gdf_s_gridem.drop(columns=['index_right'])
            
        gdf_s_gridem = gdf_s_gridem.rename(columns={
            'types': 't', 
            'state': 's', 
            ID_CTVERCE_SLOUPEC: 'g'
        })
        
        output_path = os.path.join(OUTPUT_DIR, file_name)
        gdf_s_gridem.to_file(output_path, driver="GeoJSON")
        
    except Exception as e:
        print(f"\n[!] Chyba při zpracování {file_name}: {e}")

print("\n==========================================")
print("HOTOVO! Všechna data jsou nyní v GPS souřadnicích (EPSG:4326).")
print("==========================================")