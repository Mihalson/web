import json
import pandas as pd

# 1. Název vstupního a výstupního souboru
vstupni_json = 'veznice_info.json'
vystupni_csv = 'veznice_hotovo2.csv'

# 2. Otevření JSON souboru
with open(vstupni_json, 'r', encoding='utf-8') as f:
    data = json.load(f)

# 3. Příprava prázdného seznamu, kam naházíme všechny řádky
vsechny_zaznamy = []

# 4. Procházení JSONu (město po městu, měsíc po měsíci)
for mesto, zaznamy_mesta in data.items():
    for zaznam in zaznamy_mesta:
        # K původním datům přidáme název města jako novou informaci
        zaznam['mesto'] = mesto
        vsechny_zaznamy.append(zaznam)

# 5. Vytvoření DataFrame (tabulky) z našeho seznamu
df = pd.DataFrame(vsechny_zaznamy)

# Přeřazení sloupců, aby 'mesto' bylo hned jako první sloupec (pro lepší čitelnost)
sloupce = ['mesto'] + [col for col in df.columns if col != 'mesto']
df = df[sloupce]

# 6. Uložení do CSV (připraveno pro ArcGIS)
# Používáme středník a utf-8-sig, aby v ArcGISu správně fungovala česká diakritika
df.to_csv(vystupni_csv, index=False, sep=';', encoding='utf-8-sig')

print(f"Hotovo! Tabulka byla úspěšně uložena do: {vystupni_csv}")