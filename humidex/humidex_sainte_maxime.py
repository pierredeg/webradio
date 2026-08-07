#!/usr/bin/env python3
"""Série historique de humidex pour la région de Sainte-Maxime (Var, 83).

Chaîne complète :
  1. téléchargement (avec cache local) des données horaires Météo-France du Var ;
  2. choix de la station la plus proche de Sainte-Maxime disposant d'un long
     historique de température ET d'humidité relative ;
  3. calcul du point de rosée puis du humidex, heure par heure, en heure locale ;
  4. analyses annuelles, saisonnières, jour/nuit et tests de tendance ;
  5. production de `rapport.html` (fichier unique autonome) et de
     `synthese_annuelle.csv`.

Exemples :
    python humidex_sainte_maxime.py
    python humidex_sainte_maxime.py --offline --cache-dir ./cache
    python humidex_sainte_maxime.py --departement 83 --min-good-years 25
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import analyse as an
from meteo_source import MeteoFranceSource

log = logging.getLogger("humidex")

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "report_template.html"

MONTH_NAMES = ["janv.", "févr.", "mars", "avril", "mai", "juin",
               "juil.", "août", "sept.", "oct.", "nov.", "déc."]


# ----------------------------------------------------------------- utilitaires

def jsonable(value):
    """Convertit les types numpy/pandas en types JSON, NaN -> None."""
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return None if not math.isfinite(f) else round(f, 4)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if value is pd.NA:
        return None
    return value


def records(df: pd.DataFrame) -> list[dict]:
    return [{k: jsonable(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


# ---------------------------------------------------------------------- rapport

def compute_kpis(annual: pd.DataFrame, trends: dict) -> dict:
    """Les trois chiffres clés affichés en tête de rapport."""
    kept = annual[annual["retenue"]].copy()
    kpi: dict = {}

    t = trends.get("humidex_moyen", {})
    kpi["tendance_par_decennie"] = t.get("sen_slope_per_decade")
    kpi["tendance_ols_par_decennie"] = t.get("ols_slope_per_decade")
    kpi["tendance_p"] = t.get("mk_p")
    kpi["tendance_significative"] = t.get("significant_05")
    kpi["tendance_lo"] = t.get("sen_lo_per_decade")
    kpi["tendance_hi"] = t.get("sen_hi_per_decade")

    if not kept.empty and kept["humidex_max"].notna().any():
        idx = kept["humidex_max"].idxmax()
        kpi["annee_record"] = int(kept.loc[idx, "annee"])
        kpi["humidex_record"] = float(kept.loc[idx, "humidex_max"])
        kpi["date_record"] = str(kept.loc[idx, "date_max"])

    # Évolution des heures > 35 : moyenne des 10 premières vs 10 dernières
    # années retenues, sur les comptages normalisés à l'année complète.
    if len(kept) >= 6:
        window = min(10, len(kept) // 2)
        first = kept.head(window)["heures_sup35_norm"].mean()
        last = kept.tail(window)["heures_sup35_norm"].mean()
        kpi["h35_fenetre_annees"] = int(window)
        kpi["h35_debut"] = float(first)
        kpi["h35_fin"] = float(last)
        kpi["h35_periode_debut"] = f"{int(kept.head(window)['annee'].min())}–{int(kept.head(window)['annee'].max())}"
        kpi["h35_periode_fin"] = f"{int(kept.tail(window)['annee'].min())}–{int(kept.tail(window)['annee'].max())}"
        kpi["h35_delta"] = float(last - first)
        kpi["h35_ratio"] = float(last / first) if first and first > 0 else None

    kpi["tendance_nuit_par_decennie"] = trends.get("humidex_moyen_nuit", {}).get("sen_slope_per_decade")
    kpi["tendance_jour_par_decennie"] = trends.get("humidex_moyen_jour", {}).get("sen_slope_per_decade")
    return kpi


def build_payload(
    station: an.StationCandidate,
    ranking: list[an.StationCandidate],
    provenance: dict,
    annual: pd.DataFrame,
    grid: pd.DataFrame,
    clim: pd.DataFrame,
    hours: pd.DataFrame,
    trends: dict,
    sources: list[str],
    args,
) -> dict:
    kept = annual[annual["retenue"]]
    excluded = annual[~annual["retenue"]]

    return {
        "meta": {
            "genere_le": datetime.now(timezone.utc).astimezone().strftime("%d/%m/%Y %H:%M %Z"),
            "cible": {"nom": "Sainte-Maxime", "lat": an.SAINTE_MAXIME[0], "lon": an.SAINTE_MAXIME[1]},
            "departement": args.departement,
            "fuseau": an.LOCAL_TZ,
            "seuil_completude": an.MIN_COMPLETENESS,
            "seuil_temperature": an.HUMIDEX_MIN_T,
            "paliers": an.THRESHOLDS,
            "plage_jour": [min(an.DAY_HOURS), max(an.DAY_HOURS) + 1],
            "plage_nuit": [22, 6],
            "fichiers_sources": sources,
            "donnees_synthetiques": bool(getattr(args, "synthetic_banner", False)),
        },
        "station": {
            "num_poste": station.num_poste,
            "nom": station.nom,
            "lat": round(station.lat, 5),
            "lon": round(station.lon, 5),
            "alti": jsonable(station.alti),
            "distance_km": round(station.distance_km, 1),
            "premiere_annee": station.first_year,
            "derniere_annee": station.last_year,
            "motif": station.reason,
            "couverture_tu": round(station.coverage_tu, 4),
        },
        "candidats": [
            {
                "num_poste": c.num_poste,
                "nom": c.nom,
                "distance_km": round(c.distance_km, 1),
                "lat": round(c.lat, 4),
                "lon": round(c.lon, 4),
                "premiere_annee": c.first_year,
                "derniere_annee": c.last_year,
                "annees_exploitables": c.n_good_years,
                "couverture_tu": round(c.coverage_tu, 4),
                "eligible": c.eligible,
                "motif": c.reason,
                "retenue": c.num_poste == station.num_poste,
            }
            for c in ranking[:12]
        ],
        "provenance": provenance,
        "periode": {
            "debut": int(kept["annee"].min()) if not kept.empty else None,
            "fin": int(kept["annee"].max()) if not kept.empty else None,
            "annees_retenues": int(len(kept)),
            "annees_exclues": [
                {"annee": int(r["annee"]), "completude": round(float(r["completude"]) * 100, 1)}
                for _, r in excluded.iterrows()
            ],
        },
        "kpi": compute_kpis(annual, trends),
        "annuel": records(annual),
        "grille_mensuelle": records(grid),
        "climatologie": records(clim),
        "profil_horaire": records(hours),
        "tendances": trends,
        "mois": MONTH_NAMES,
    }


def render_report(payload: dict, out_path: Path) -> None:
    if not TEMPLATE.exists():
        raise RuntimeError(f"Gabarit introuvable : {TEMPLATE}")
    template = TEMPLATE.read_text(encoding="utf-8")
    if "__HUMIDEX_DATA__" not in template:
        raise RuntimeError("Le gabarit ne contient pas le marqueur __HUMIDEX_DATA__.")
    blob = json.dumps(payload, ensure_ascii=False, allow_nan=False)
    # Neutralise toute séquence pouvant fermer prématurément la balise <script>.
    blob = blob.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    out_path.write_text(template.replace("__HUMIDEX_DATA__", blob), encoding="utf-8")
    log.info("Rapport écrit : %s (%.0f Ko)", out_path, out_path.stat().st_size / 1024)


# -------------------------------------------------------------------- pipeline

def run(args) -> int:
    source = MeteoFranceSource(cache_dir=Path(args.cache_dir), offline=args.offline)
    paths = source.acquire(args.departement)
    raw = MeteoFranceSource.read_all(paths)
    log.info("Jeu brut : %d lignes, %d stations", len(raw), raw["NUM_POSTE"].nunique())

    candidates = an.profile_stations(raw)
    if not candidates:
        raise RuntimeError("Aucune station exploitable dans les fichiers lus.")
    station, ranking = an.select_station(
        candidates, min_good_years=args.min_good_years, force_num_poste=args.station
    )
    log.info(
        "Station retenue : %s (%s) — %.1f km de Sainte-Maxime, %d-%d, %d années exploitables",
        station.nom, station.num_poste, station.distance_km,
        station.first_year, station.last_year, station.n_good_years,
    )
    for c in ranking[:6]:
        log.info(
            "  candidat %-28s %6.1f km  %d-%d  %3d années OK  U rempli à %5.1f%%  -> %s",
            c.nom[:28], c.distance_km, c.first_year, c.last_year,
            c.n_good_years, 100 * c.coverage_tu,
            "RETENUE" if c is station else ("éligible" if c.eligible else c.reason),
        )

    hourly, provenance = an.build_hourly(raw, station)
    annual = an.annual_summary(hourly)
    kept_years = set(annual.loc[annual["retenue"], "annee"].astype(int))
    if not kept_years:
        raise RuntimeError(
            "Aucune année n'atteint %d %% de complétude pour la station retenue."
            % int(an.MIN_COMPLETENESS * 100)
        )
    log.info(
        "%d années retenues (%d exclues pour complétude < %d %%)",
        len(kept_years), int((~annual["retenue"]).sum()), int(an.MIN_COMPLETENESS * 100),
    )

    grid = an.monthly_grid(hourly, kept_years)
    clim = an.month_climatology(hourly, kept_years)
    hours_profile = an.hour_of_day_profile(hourly, kept_years)

    kept = annual[annual["retenue"]]
    trend_series = [
        "humidex_moyen", "humidex_max", "humidex_p95",
        "heures_sup30_norm", "heures_sup35_norm", "heures_sup40_norm",
        "humidex_moyen_jour", "humidex_moyen_nuit",
        "heures_nuit_sup30_norm", "heures_jour_sup30_norm",
        "temperature_moyenne",
    ]
    trends: dict[str, dict] = {}
    for col in trend_series:
        if col not in kept.columns:
            continue
        res = an.analyse_trend(kept["annee"].to_numpy(), kept[col].to_numpy(dtype="float64"))
        trends[col] = {k: jsonable(v) for k, v in res.as_dict().items()}

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "synthese_annuelle.csv"
    annual.to_csv(csv_path, index=False, sep=";", decimal=",", encoding="utf-8-sig",
                  float_format="%.3f")
    log.info("Synthèse annuelle écrite : %s", csv_path)

    grid.to_csv(out_dir / "grille_mensuelle.csv", index=False, sep=";", decimal=",",
                encoding="utf-8-sig", float_format="%.3f")

    payload = build_payload(
        station, ranking, provenance, annual, grid, clim, hours_profile, trends,
        [p.name for p in paths], args,
    )
    render_report(payload, out_dir / "rapport.html")

    kpi = payload["kpi"]
    print()
    print("=" * 68)
    print(f"  Station   : {station.nom} ({station.num_poste})")
    print(f"  Distance  : {station.distance_km:.1f} km de Sainte-Maxime")
    print(f"  Période   : {payload['periode']['debut']}–{payload['periode']['fin']} "
          f"({payload['periode']['annees_retenues']} années retenues)")
    if kpi.get("tendance_par_decennie") is not None:
        p = kpi.get("tendance_p")
        p_txt = "< 0.001" if p is not None and p < 0.001 else f"{p:.3f}" if p is not None else "n/a"
        print(f"  Tendance  : {kpi['tendance_par_decennie']:+.2f} °C/décennie "
              f"(Sen, Mann-Kendall p {p_txt})")
    if kpi.get("annee_record"):
        print(f"  Record    : {kpi['humidex_record']:.1f} le {kpi['date_record']}")
    if kpi.get("h35_debut") is not None:
        print(f"  Heures>35 : {kpi['h35_debut']:.0f} h/an ({kpi['h35_periode_debut']}) "
              f"-> {kpi['h35_fin']:.0f} h/an ({kpi['h35_periode_fin']})")
    print("=" * 68)
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--departement", default="83", help="Code département (défaut : 83, Var)")
    parser.add_argument("--cache-dir", default=str(HERE / "cache"),
                        help="Dossier de cache des CSV.gz Météo-France")
    parser.add_argument("--out-dir", default=str(HERE / "out"),
                        help="Dossier de sortie (rapport.html + CSV)")
    parser.add_argument("--offline", action="store_true",
                        help="N'utiliser que les fichiers déjà présents dans le cache")
    parser.add_argument("--min-good-years", type=int, default=20,
                        help="Années exploitables minimales pour qu'une station soit éligible")
    parser.add_argument("--station", default=None, metavar="NUM_POSTE",
                        help="Force une station précise (ex. 83019001) au lieu du choix automatique")
    parser.add_argument("--synthetic-banner", action="store_true",
                        help="Marque le rapport comme construit sur des données synthétiques")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname).1s %(message)s",
    )
    try:
        return run(args)
    except RuntimeError as exc:
        log.error("%s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
