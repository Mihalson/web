import json
import pandas as pd
import os

# Nastavení cest
base_path = os.path.dirname(__file__)
vstupni_json = os.path.join(base_path, 'dozivoti.json') # Změň na název tvého souboru

try:
    with open(vstupni_json, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 1. Věkové složení 2024
    vek_2024 = [z for z in data.get("věkové složení", []) if z.get("rok") == 2024]
    if vek_2024:
        df_vek = pd.DataFrame(vek_2024)
        vystup_vek = os.path.join(base_path, 'vek_2024_DO.csv')
        df_vek.to_csv(vystup_vek, index=False, sep=';', encoding='utf-8-sig')
        print(f"✅ Vytvořeno: {vystup_vek}")

    # 2. Vzdělání 2024
    vzdelani_2024 = [z for z in data.get("vzdělání", []) if z.get("rok") == 2024]
    if vzdelani_2024:
        df_vzdelani = pd.DataFrame(vzdelani_2024)
        vystup_vzdelani = os.path.join(base_path, 'vzdelani_2024_DO.csv')
        df_vzdelani.to_csv(vystup_vzdelani, index=False, sep=';', encoding='utf-8-sig')
        print(f"✅ Vytvořeno: {vystup_vzdelani}")

    # 3. Již odsouzení (Recidiva) 2024
    recidiva_2024 = [z for z in data.get("již trestaní", []) if z.get("rok") == 2024]
    if recidiva_2024:
        df_recidiva = pd.DataFrame(recidiva_2024)
        vystup_recidiva = os.path.join(base_path, 'recidiva_2024_DO.csv')
        df_recidiva.to_csv(vystup_recidiva, index=False, sep=';', encoding='utf-8-sig')
        print(f"✅ Vytvořeno: {vystup_recidiva}")

except FileNotFoundError:
    print(f"❌ Soubor '{vstupni_json}' nenalezen.")
except Exception as e:
    print(f"❌ Nastala chyba: {e}")