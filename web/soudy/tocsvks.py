import json
import pandas as pd
import os

# 1. Nastavení cest (hledá soubor ve stejné složce jako je skript)
base_path = os.path.dirname(__file__)
vstupni_json = os.path.join(base_path, 'soudy_KS.json')  # Uprav název, pokud se liší
vystupni_csv = os.path.join(base_path, 'soudy_KS_trestni_2024.csv')

# 2. Načtení dat
try:
    with open(vstupni_json, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 3. Filtrace dat (pouze trestní agenda a rok 2024)
    target_agenda = "trestní agenda"
    
    if target_agenda in data:
        seznam_radku = []
        for z in data[target_agenda]:
            # Filtrujeme pouze rok 2024
            if z.get('rok') == 2024:
                # Přidáme informaci o agendě do řádku
                z['agenda_typ'] = target_agenda
                seznam_radku.append(z)
        
        # 4. Vytvoření tabulky
        df = pd.DataFrame(seznam_radku)

        if not df.empty:
            # 5. Uložení do CSV (připraveno pro ArcGIS/Excel)
            df.to_csv(vystupni_csv, index=False, sep=';', encoding='utf-8-sig')
            print(f"✅ Hotovo! Vyfiltrováno {len(df)} záznamů krajských soudů.")
            print(f"Soubor uložen: {vystupni_csv}")
        else:
            print(f"❌ V agendě '{target_agenda}' nebyla pro rok 2024 nalezena žádná data.")
            
    else:
        print(f"❌ Chyba: Klíč '{target_agenda}' nebyl v JSONu nalezen.")

except FileNotFoundError:
    print(f"❌ Soubor '{vstupni_json}' nebyl nalezen. Zkontroluj název a složku.")
except Exception as e:
    print(f"❌ Došlo k chybě: {e}")