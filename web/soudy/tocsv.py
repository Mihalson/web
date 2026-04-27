import json
import pandas as pd
import os

# 1. Nastavení cest (hledá soubor ve stejné složce jako je skript)
base_path = os.path.dirname(__file__)
vstupni_json = os.path.join(base_path, 'soudy_OS.json')
vystupni_csv = os.path.join(base_path, 'soudy_trestni_2024.csv')

# 2. Načtení dat
try:
    with open(vstupni_json, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 3. Filtrace dat (pouze trestní agenda a rok 2024)
    klice_agendy = "trestní agenda"
    
    if klice_agendy in data:
        seznam_radku = []
        for z in data[klice_agendy]:
            if z.get('rok') == 2024:
                # Přidáme informaci o agendě pro jistotu i do tabulky
                z['agenda_typ'] = klice_agendy
                seznam_radku.append(z)
        
        # 4. Vytvoření DataFrame
        df = pd.DataFrame(seznam_radku)

        if not df.empty:
            # 5. Uložení do CSV (středník a UTF-8 s BOM pro bezchybný Excel/ArcGIS)
            df.to_csv(vystupni_csv, index=False, sep=';', encoding='utf-8-sig')
            print(f"✅ Hotovo! Vyfiltrováno {len(df)} soudů z trestní agendy.")
            print(f"Soubor uložen v: {vystupni_csv}")
        else:
            print("❌ Chyba: Pro rok 2024 v trestní agendě nebyla nalezena žádná data.")
            
    else:
        print(f"❌ Chyba: Klíč '{klice_agendy}' v JSONu neexistuje.")

except FileNotFoundError:
    print(f"❌ Chyba: Soubor '{vstupni_json}' nebyl nalezen. Ujisti se, že je ve stejné složce jako skript.")
except Exception as e:
    print(f"❌ Nastala neočekávaná chyba: {e}")