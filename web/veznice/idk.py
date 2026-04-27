import json
import pandas as pd
import math

def bezpecne_cislo(hodnota):
    """Převede hodnotu na číslo. NaN nebo prázdné hodnoty nahradí nulou."""
    if hodnota is None:
        return 0
    try:
        cislo = float(hodnota)
        if math.isnan(cislo):
            return 0
        return cislo
    except (ValueError, TypeError):
        return 0

# 1. Načtení dat
vstupni_soubor = 'vez_j.json'
vystupni_soubor = 'veznice_2024_prumery.csv'

with open(vstupni_soubor, 'r', encoding='utf-8') as f:
    data = json.load(f)

vysledky = []

# 2. Procházení každé věznice
for veznice, zaznamy in data.items():
    soucet_kap_2024 = 0
    soucet_stav_2024 = 0
    pocet_mesicu = 0

    for z in zaznamy:
        # Zajímá nás pouze rok 2024
        if z.get('rok') == 2024:
            # Sečteme všechny kapacity a stavy v daném měsíci (přes všechny kategorie)
            kapacita_mesic = sum(bezpecne_cislo(v) for k, v in z.items() if k.startswith('kapacita'))
            stav_mesic = sum(bezpecne_cislo(v) for k, v in z.items() if k.startswith('stav'))
            
            soucet_kap_2024 += kapacita_mesic
            soucet_stav_2024 += stav_mesic
            pocet_mesicu += 1

    # 3. Výpočet průměrů
    if pocet_mesicu > 0:
        prumer_kap = round(soucet_kap_2024 / pocet_mesicu, 1)
        prumer_stav = round(soucet_stav_2024 / pocet_mesicu, 1)
        
        vysledky.append({
            'veznice': veznice,
            'kapacita_2024': prumer_kap,
            'stav_2024': prumer_stav
        })

# 4. Export do CSV (středník jako oddělovač pro ArcGIS a Excel)
df = pd.DataFrame(vysledky)
df.to_csv(vystupni_soubor, index=False, sep=';', encoding='utf-8-sig')

print(f"✅ Hotovo! Průměry za rok 2024 uloženy do: {vystupni_soubor}")