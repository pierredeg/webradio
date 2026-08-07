#!/usr/bin/env python3
"""Génère un jeu de test au format des CSV horaires Météo-France.

CE SONT DES DONNÉES SYNTHÉTIQUES. Elles servent uniquement à vérifier que la
chaîne de traitement (lecture, choix de station, humidex, analyses, rapport)
fonctionne de bout en bout sans accès réseau. Elles ne doivent jamais être
présentées comme des observations.

Le fichier reproduit les particularités du format réel :
  - séparateur ";" ;
  - colonnes NUM_POSTE, NOM_USUEL, LAT, LON, ALTI, AAAAMMJJHH, T, QT, TD, QTD,
    U, QU, plus des colonnes parasites à ignorer ;
  - horodatage AAAAMMJJHH en UTC ;
  - un fichier en décimale "," / latin-1 et un autre en décimale "." / utf-8 ;
  - une station sans humidité, pour vérifier qu'elle est bien écartée.
"""

from __future__ import annotations

import argparse
import gzip
from pathlib import Path

import numpy as np
import pandas as pd

# num_poste, nom, lat, lon, alti, première année, humidité disponible, biais thermique
STATIONS = [
    ("83107001", "SAINTE-MAXIME-PLAGE", 43.312, 6.640, 5, 2014, False, 0.4),
    ("83101001", "CAP CAMARAT", 43.187, 6.685, 128, 1995, True, 0.0),
    ("83061001", "FREJUS", 43.417, 6.733, 68, 1998, True, 0.3),
    ("83069001", "HYERES-COTE-D-AZUR", 43.097, 6.146, 2, 1995, True, -0.2),
    ("83034001", "LE LUC", 43.385, 6.387, 80, 2004, True, -0.9),
]

RNG = np.random.default_rng(20240807)


def synth_station(num, nom, lat, lon, alti, y0, y1, has_u, bias):
    hours = pd.date_range(f"{y0}-01-01 00:00", f"{y1}-12-31 23:00", freq="h", tz="UTC")
    n = len(hours)
    doy = hours.dayofyear.to_numpy()
    hod = hours.hour.to_numpy()
    year = hours.year.to_numpy()

    # Cycle saisonnier + cycle diurne + réchauffement + bruit autocorrélé.
    seasonal = 15.5 + 8.5 * np.sin(2 * np.pi * (doy - 110) / 365.25)
    diurnal = 3.6 * np.sin(2 * np.pi * (hod - 9) / 24.0)
    warming = 0.042 * (year - y0)
    noise = np.cumsum(RNG.normal(0, 0.55, n))
    noise -= pd.Series(noise).rolling(240, min_periods=1, center=True).mean().to_numpy()
    t = seasonal + diurnal + warming + noise + bias

    # Humidité : anticorrélée à la température, plus élevée la nuit et en hiver.
    rh = (
        72
        - 1.35 * (t - seasonal.mean())
        + 6.0 * np.sin(2 * np.pi * (hod - 3) / 24.0)
        + RNG.normal(0, 7.5, n)
        + 0.9 * (year - y0) * 0.15
    )
    rh = np.clip(rh, 12, 100)

    df = pd.DataFrame(
        {
            "NUM_POSTE": num,
            "NOM_USUEL": nom,
            "LAT": lat,
            "LON": lon,
            "ALTI": alti,
            "AAAAMMJJHH": hours.strftime("%Y%m%d%H"),
            "RR1": 0.0,
            "QRR1": 9,
            "FF": np.round(np.abs(RNG.normal(3, 1.5, n)), 1),
            "QFF": 9,
            "T": np.round(t, 1),
            "QT": 9,
            "TD": np.nan,
            "QTD": np.nan,
            "U": np.round(rh, 0) if has_u else np.nan,
            "QU": 9 if has_u else np.nan,
        }
    )

    # Lacunes réalistes : quelques pannes, et une année très incomplète.
    gaps = RNG.random(n) < 0.012
    df.loc[gaps, ["T", "U"]] = np.nan
    outage = (year == y0 + 3) & (doy > 120)
    df.loc[outage, ["T", "U"]] = np.nan

    # Une partie des points de rosée est publiée (le reste sera recalculé).
    published = (year >= y1 - 8) & has_u & (RNG.random(n) < 0.6)
    alpha = 17.27 * t / (237.7 + t) + np.log(np.clip(rh, 1, 100) / 100.0)
    df.loc[published, "TD"] = np.round((237.7 * alpha / (17.27 - alpha))[published], 1)
    df.loc[published, "QTD"] = 9
    return df


def write_csv_gz(df: pd.DataFrame, path: Path, decimal: str, encoding: str) -> None:
    text = df.to_csv(sep=";", index=False, decimal=decimal, na_rep="", float_format="%.1f")
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wb") as fh:
        fh.write(text.encode(encoding, errors="replace"))
    print(f"  {path.name}  {path.stat().st_size/1e6:.1f} Mo  ({len(df):,} lignes, "
          f"décimale '{decimal}', {encoding})".replace(",", " "))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "fixture_cache"))
    ap.add_argument("--start", type=int, default=1995)
    ap.add_argument("--end", type=int, default=2025)
    args = ap.parse_args()

    out = Path(args.out)
    frames = []
    for num, nom, lat, lon, alti, y0, has_u, bias in STATIONS:
        y0 = max(y0, args.start)
        frames.append(synth_station(num, nom, lat, lon, alti, y0, args.end, has_u, bias))
    full = pd.concat(frames, ignore_index=True)
    full["_year"] = full["AAAAMMJJHH"].str[:4].astype(int)

    print("Génération du jeu de test SYNTHÉTIQUE :")
    cut = args.start + (args.end - args.start) // 2
    early = full[full["_year"] <= cut].drop(columns="_year")
    late = full[full["_year"] > cut].drop(columns="_year")
    # Deux variantes de format, pour éprouver la robustesse du lecteur.
    write_csv_gz(early, out / f"H_083_{args.start}-{cut}.csv.gz", decimal=",", encoding="latin-1")
    write_csv_gz(late, out / f"H_083_latest-{cut+1}-{args.end}.csv.gz", decimal=".", encoding="utf-8")


if __name__ == "__main__":
    main()
