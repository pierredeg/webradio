"""Calcul du humidex et analyses climatologiques associées."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

SAINTE_MAXIME = (43.309, 6.638)
LOCAL_TZ = "Europe/Paris"

# Paliers de humidex analysés (seuils cumulés, en °C).
THRESHOLDS = [30, 35, 40, 45]

# Plages horaires locales.
DAY_HOURS = range(10, 18)          # 10h -> 17h59
NIGHT_HOURS = list(range(22, 24)) + list(range(0, 6))   # 22h -> 5h59

# Le humidex n'est défini que pour T >= 20 °C (convention Environnement Canada).
HUMIDEX_MIN_T = 20.0

# Une année est retenue si au moins 80 % des heures disposent de T et U.
MIN_COMPLETENESS = 0.80


# --------------------------------------------------------------- géométrie

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance orthodromique en kilomètres."""
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ------------------------------------------------------------- météorologie

def dew_point_magnus(t_c: pd.Series, rh_pct: pd.Series) -> pd.Series:
    """Point de rosée (°C) par la formulation de Magnus-Tetens.

        alpha = 17.27*T/(237.7+T) + ln(U/100)
        Td    = 237.7*alpha / (17.27 - alpha)

    L'humidité est bornée à [1, 100] % : U = 0 rendrait le logarithme infini,
    et les valeurs > 100 (sursaturation instrumentale) sont ramenées à 100.
    """
    t = pd.to_numeric(t_c, errors="coerce").astype("float64")
    rh = pd.to_numeric(rh_pct, errors="coerce").astype("float64").clip(lower=1.0, upper=100.0)
    alpha = (17.27 * t) / (237.7 + t) + np.log(rh / 100.0)
    td = (237.7 * alpha) / (17.27 - alpha)
    return td.where(t.notna() & rh.notna())


def humidex(t_c: pd.Series, td_c: pd.Series) -> pd.Series:
    """Humidex = T + (5/9)(e - 10), e en hPa, calculé si T >= 20 °C sinon NaN.

        e = 6.11 * exp(5417.7530 * (1/273.16 - 1/(273.15 + Td)))
    """
    t = pd.to_numeric(t_c, errors="coerce").astype("float64")
    td = pd.to_numeric(td_c, errors="coerce").astype("float64")
    e = 6.11 * np.exp(5417.7530 * (1.0 / 273.16 - 1.0 / (273.15 + td)))
    h = t + (5.0 / 9.0) * (e - 10.0)
    # Hors du domaine de validité : T < 20 °C, ou T/Td manquants.
    valid = t.notna() & td.notna() & (t >= HUMIDEX_MIN_T)
    return h.where(valid)


# --------------------------------------------------------- tests de tendance

def _phi(x: float) -> float:
    """Fonction de répartition de la loi normale centrée réduite."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


@dataclass
class TrendResult:
    n: int
    ols_slope_per_year: float | None = None
    ols_slope_per_decade: float | None = None
    ols_intercept: float | None = None
    r2: float | None = None
    mk_s: float | None = None
    mk_z: float | None = None
    mk_p: float | None = None
    mk_tau: float | None = None
    sen_slope_per_year: float | None = None
    sen_slope_per_decade: float | None = None
    sen_lo_per_decade: float | None = None
    sen_hi_per_decade: float | None = None
    significant_05: bool = False

    def as_dict(self) -> dict:
        return {k: (None if isinstance(v, float) and not math.isfinite(v) else v)
                for k, v in self.__dict__.items()}


def mann_kendall(values: np.ndarray) -> tuple[float, float, float, float]:
    """Test de Mann-Kendall (approximation normale, correction des ex aequo).

    Renvoie (S, Z, p bilatéral, tau de Kendall).
    """
    n = len(values)
    if n < 3:
        return float("nan"), float("nan"), float("nan"), float("nan")

    diff = values[None, :] - values[:, None]
    s = float(np.sign(diff[np.triu_indices(n, k=1)]).sum())

    _, counts = np.unique(values, return_counts=True)
    ties = counts[counts > 1]
    tie_term = float(np.sum(ties * (ties - 1) * (2 * ties + 5)))
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    if var_s <= 0:
        return s, float("nan"), float("nan"), float("nan")

    if s > 0:
        z = (s - 1) / math.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / math.sqrt(var_s)
    else:
        z = 0.0
    p = 2.0 * (1.0 - _phi(abs(z)))

    # tau corrigé des ex aequo (tau-b sur la variable temps sans ex aequo).
    denom = math.sqrt(
        (n * (n - 1) / 2.0 - float(np.sum(ties * (ties - 1) / 2.0)))
        * (n * (n - 1) / 2.0)
    )
    tau = s / denom if denom > 0 else float("nan")
    return s, z, p, tau


def sen_slope(x: np.ndarray, y: np.ndarray, var_s: float | None = None) -> tuple[float, float, float]:
    """Pente de Sen (médiane des pentes deux à deux) et son IC 95 % (Gilbert)."""
    n = len(x)
    slopes = []
    for i in range(n - 1):
        dx = x[i + 1:] - x[i]
        dy = y[i + 1:] - y[i]
        ok = dx != 0
        slopes.append(dy[ok] / dx[ok])
    if not slopes:
        return float("nan"), float("nan"), float("nan")
    allslopes = np.sort(np.concatenate(slopes))
    med = float(np.median(allslopes))

    if var_s is None or not math.isfinite(var_s) or var_s <= 0:
        return med, float("nan"), float("nan")
    n_slopes = len(allslopes)
    c = 1.959963985 * math.sqrt(var_s)
    lo_idx = int(math.floor((n_slopes - c) / 2.0))
    hi_idx = int(math.ceil((n_slopes + c) / 2.0)) - 1
    lo_idx = max(0, min(n_slopes - 1, lo_idx))
    hi_idx = max(0, min(n_slopes - 1, hi_idx))
    return med, float(allslopes[lo_idx]), float(allslopes[hi_idx])


def analyse_trend(years: np.ndarray, values: np.ndarray) -> TrendResult:
    """Régression linéaire + Mann-Kendall + pente de Sen sur une série annuelle."""
    mask = np.isfinite(values)
    x = np.asarray(years, dtype="float64")[mask]
    y = np.asarray(values, dtype="float64")[mask]
    res = TrendResult(n=int(len(y)))
    if len(y) < 3:
        return res

    slope, intercept = np.polyfit(x, y, 1)
    pred = slope * x + intercept
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    res.ols_slope_per_year = float(slope)
    res.ols_slope_per_decade = float(slope) * 10.0
    res.ols_intercept = float(intercept)
    res.r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else None

    s, z, p, tau = mann_kendall(y)
    res.mk_s, res.mk_z, res.mk_p, res.mk_tau = s, z, p, tau

    n = len(y)
    _, counts = np.unique(y, return_counts=True)
    ties = counts[counts > 1]
    tie_term = float(np.sum(ties * (ties - 1) * (2 * ties + 5)))
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0

    med, lo, hi = sen_slope(x, y, var_s)
    res.sen_slope_per_year = med
    res.sen_slope_per_decade = med * 10.0
    res.sen_lo_per_decade = lo * 10.0 if math.isfinite(lo) else None
    res.sen_hi_per_decade = hi * 10.0 if math.isfinite(hi) else None
    res.significant_05 = bool(math.isfinite(p) and p < 0.05)
    return res


# ------------------------------------------------------- choix de la station

@dataclass
class StationCandidate:
    num_poste: str
    nom: str
    lat: float
    lon: float
    alti: float | None
    distance_km: float
    first_year: int
    last_year: int
    n_hours: int
    n_hours_tu: int
    n_good_years: int
    coverage_tu: float
    eligible: bool = False
    reason: str = ""


def profile_stations(df: pd.DataFrame, target=SAINTE_MAXIME) -> list[StationCandidate]:
    """Profile chaque station du département : position, distance, couverture T/U."""
    local = df["time_utc"].dt.tz_convert(LOCAL_TZ)
    work = pd.DataFrame(
        {
            "NUM_POSTE": df["NUM_POSTE"].to_numpy(),
            "NOM_USUEL": df["NOM_USUEL"].to_numpy(),
            "LAT": pd.to_numeric(df["LAT"], errors="coerce").to_numpy(),
            "LON": pd.to_numeric(df["LON"], errors="coerce").to_numpy(),
            "ALTI": pd.to_numeric(df["ALTI"], errors="coerce").to_numpy(),
            "year": local.dt.year.to_numpy(),
            "has_tu": (df["T"].notna() & df["U"].notna()).to_numpy(),
        }
    )

    candidates: list[StationCandidate] = []
    for num, grp in work.groupby("NUM_POSTE", sort=True):
        lat = float(np.nanmedian(grp["LAT"])) if grp["LAT"].notna().any() else float("nan")
        lon = float(np.nanmedian(grp["LON"])) if grp["LON"].notna().any() else float("nan")
        if not (math.isfinite(lat) and math.isfinite(lon)):
            continue
        alti = float(np.nanmedian(grp["ALTI"])) if grp["ALTI"].notna().any() else None

        per_year = grp.groupby("year")["has_tu"].sum()
        expected = pd.Series(
            {int(y): hours_in_year(int(y)) for y in per_year.index}, dtype="float64"
        )
        completeness = per_year / expected
        n_good = int((completeness >= MIN_COMPLETENESS).sum())

        # Bornes de l'historique : on ignore les années réduites à quelques heures.
        # La conversion UTC -> heure locale fait déborder une heure sur l'année
        # suivante, qui ne doit pas être annoncée comme une année de mesure.
        rows_per_year = grp.groupby("year").size()
        substantial = rows_per_year[rows_per_year >= 24].index
        span = substantial if len(substantial) else rows_per_year.index

        names = grp["NOM_USUEL"].dropna()
        nom = str(names.mode().iloc[0]) if not names.empty else str(num)

        candidates.append(
            StationCandidate(
                num_poste=str(num),
                nom=nom,
                lat=lat,
                lon=lon,
                alti=alti,
                distance_km=haversine_km(target[0], target[1], lat, lon),
                first_year=int(min(span)),
                last_year=int(max(span)),
                n_hours=int(len(grp)),
                n_hours_tu=int(grp["has_tu"].sum()),
                n_good_years=n_good,
                coverage_tu=float(grp["has_tu"].mean()),
            )
        )
    return candidates


def select_station(
    candidates: list[StationCandidate],
    min_good_years: int = 20,
    force_num_poste: str | None = None,
) -> tuple[StationCandidate, list[StationCandidate]]:
    """Retient la station éligible la plus proche de Sainte-Maxime.

    Éligibilité : au moins `min_good_years` années dont >= 80 % des heures
    disposent simultanément de T et U. Le classement final est la distance.
    `force_num_poste` court-circuite le choix automatique.
    """
    for c in candidates:
        if c.n_hours_tu == 0:
            c.eligible, c.reason = False, "aucune donnée d'humidité"
        elif c.n_good_years < min_good_years:
            c.eligible = False
            c.reason = f"{c.n_good_years} année(s) exploitable(s) < {min_good_years}"
        else:
            c.eligible, c.reason = True, "retenue possible"

    ranking = sorted(candidates, key=lambda c: c.distance_km)

    if force_num_poste:
        forced = next((c for c in candidates if c.num_poste == str(force_num_poste)), None)
        if forced is None:
            known = ", ".join(c.num_poste for c in ranking[:10])
            raise RuntimeError(
                f"Station {force_num_poste} absente des fichiers lus. Postes disponibles : {known}"
            )
        if forced.n_hours_tu == 0:
            raise RuntimeError(
                f"Station {force_num_poste} ({forced.nom}) ne publie aucune humidité relative : "
                "le humidex ne peut pas y être calculé."
            )
        forced.reason = "station imposée par l'utilisateur (--station)"
        return forced, ranking

    eligible = [c for c in candidates if c.eligible]
    if not eligible:
        # Repli : la station ayant le plus d'années exploitables, à défaut la plus proche.
        fallback = sorted(candidates, key=lambda c: (-c.n_good_years, c.distance_km))
        if not fallback or fallback[0].n_hours_tu == 0:
            raise RuntimeError("Aucune station du département ne publie d'humidité relative.")
        chosen = fallback[0]
        chosen.reason = (
            f"aucune station ne remplit le critère de {min_good_years} années ; "
            "station la mieux dotée retenue par défaut"
        )
    else:
        chosen = sorted(eligible, key=lambda c: c.distance_km)[0]
        chosen.reason = "station éligible la plus proche de Sainte-Maxime"

    return chosen, ranking


# ------------------------------------------------------------------ analyses

def hours_in_year(year: int) -> int:
    """Nombre d'heures dans l'année civile (8760, ou 8784 si bissextile)."""
    leap = (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)
    return 8784 if leap else 8760


def build_hourly(df: pd.DataFrame, station: StationCandidate) -> tuple[pd.DataFrame, dict]:
    """Série horaire de la station : heure locale, point de rosée, humidex."""
    sub = df[df["NUM_POSTE"] == station.num_poste].copy()
    sub = sub.sort_values("time_utc", ignore_index=True)

    out = pd.DataFrame({"time_utc": sub["time_utc"]})
    out["time_local"] = sub["time_utc"].dt.tz_convert(LOCAL_TZ)
    out["T"] = pd.to_numeric(sub["T"], errors="coerce")
    out["U"] = pd.to_numeric(sub["U"], errors="coerce")

    td_pub = pd.to_numeric(sub.get("TD"), errors="coerce") if "TD" in sub else pd.Series(np.nan, index=sub.index)
    td_pub = td_pub.where(td_pub.notna() & (td_pub <= out["T"] + 0.5))  # garde-fou physique
    td_calc = dew_point_magnus(out["T"], out["U"])
    out["TD"] = td_pub.combine_first(td_calc)
    out["TD_source"] = np.where(td_pub.notna(), "publie", np.where(td_calc.notna(), "magnus", "absent"))

    out["humidex"] = humidex(out["T"], out["TD"])
    out["year"] = out["time_local"].dt.year
    out["month"] = out["time_local"].dt.month
    out["hour"] = out["time_local"].dt.hour
    out["has_tu"] = out["T"].notna() & out["U"].notna()

    n_tu = int(out["has_tu"].sum())
    provenance = {
        "n_hours": int(len(out)),
        "n_hours_tu": n_tu,
        "td_publie": int((out["TD_source"] == "publie").sum()),
        "td_magnus": int((out["TD_source"] == "magnus").sum()),
        "part_td_publie": (float((out["TD_source"] == "publie").sum()) / n_tu) if n_tu else 0.0,
        "n_humidex": int(out["humidex"].notna().sum()),
    }
    return out, provenance


def annual_summary(hourly: pd.DataFrame) -> pd.DataFrame:
    """Synthèse annuelle : complétude, moyennes, maxima, heures par palier."""
    rows = []
    for year, grp in hourly.groupby("year", sort=True):
        expected = hours_in_year(int(year))
        n_tu = int(grp["has_tu"].sum())
        completeness = n_tu / expected

        h = grp["humidex"]
        defined = h.notna()
        n_def = int(defined.sum())

        # Facteur de normalisation : ramène les comptages à une année complète,
        # afin que des années incomplètes (mais >= 80 %) restent comparables.
        norm = (expected / n_tu) if n_tu else float("nan")

        is_day = grp["hour"].isin(list(DAY_HOURS))
        is_night = grp["hour"].isin(NIGHT_HOURS)

        row = {
            "annee": int(year),
            "heures_avec_T_et_U": n_tu,
            "heures_attendues": expected,
            "completude": completeness,
            "heures_manquantes_pct": 100.0 * (1.0 - completeness),
            "heures_humidex_defini": n_def,
            "humidex_moyen": float(h[defined].mean()) if n_def else np.nan,
            "humidex_median": float(h[defined].median()) if n_def else np.nan,
            "humidex_p95": float(h[defined].quantile(0.95)) if n_def else np.nan,
            "humidex_max": float(h.max()) if n_def else np.nan,
            "date_max": (
                grp.loc[h.idxmax(), "time_local"].strftime("%Y-%m-%d %H:%M")
                if n_def else ""
            ),
            "temperature_moyenne": float(grp["T"].mean()) if grp["T"].notna().any() else np.nan,
        }

        for thr in THRESHOLDS:
            n = int((h > thr).sum())
            row[f"heures_sup{thr}"] = n
            row[f"heures_sup{thr}_norm"] = round(n * norm, 1) if math.isfinite(norm) else np.nan

        # Bandes disjointes (pour l'empilement, sans double comptage).
        bands = [(30, 35), (35, 40), (40, 45), (45, None)]
        for lo, hi in bands:
            sel = (h > lo) if hi is None else ((h > lo) & (h <= hi))
            key = f"heures_{lo}_{hi}" if hi else f"heures_{lo}_plus"
            n = int(sel.sum())
            row[key] = n
            row[f"{key}_norm"] = round(n * norm, 1) if math.isfinite(norm) else np.nan

        for label, mask in (("jour", is_day), ("nuit", is_night)):
            hh = h[mask]
            d = hh.notna()
            row[f"humidex_moyen_{label}"] = float(hh[d].mean()) if int(d.sum()) else np.nan
            row[f"humidex_max_{label}"] = float(hh.max()) if int(d.sum()) else np.nan
            row[f"heures_{label}_sup30"] = int((hh > 30).sum())
            row[f"heures_{label}_sup35"] = int((hh > 35).sum())
            n_slot = int(grp.loc[mask, "has_tu"].sum())
            slot_norm = (
                (len(DAY_HOURS) if label == "jour" else len(NIGHT_HOURS)) * expected / 24.0 / n_slot
                if n_slot else float("nan")
            )
            for thr in (30, 35):
                raw = int((hh > thr).sum())
                row[f"heures_{label}_sup{thr}_norm"] = (
                    round(raw * slot_norm, 1) if math.isfinite(slot_norm) else np.nan
                )
        rows.append(row)

    out = pd.DataFrame(rows).sort_values("annee", ignore_index=True)
    out["retenue"] = out["completude"] >= MIN_COMPLETENESS
    return out


def monthly_grid(hourly: pd.DataFrame, kept_years: set[int]) -> pd.DataFrame:
    """Grille mois x année : moyenne, maximum et heures > 30 du humidex."""
    sub = hourly[hourly["year"].isin(kept_years)]
    rows = []
    for (year, month), grp in sub.groupby(["year", "month"], sort=True):
        h = grp["humidex"]
        d = h.notna()
        rows.append(
            {
                "annee": int(year),
                "mois": int(month),
                "humidex_moyen": float(h[d].mean()) if int(d.sum()) else np.nan,
                "humidex_max": float(h.max()) if int(d.sum()) else np.nan,
                "heures_sup30": int((h > 30).sum()),
                "heures_definies": int(d.sum()),
                "heures_avec_T_et_U": int(grp["has_tu"].sum()),
            }
        )
    return pd.DataFrame(rows)


def month_climatology(hourly: pd.DataFrame, kept_years: set[int]) -> pd.DataFrame:
    """Cycle saisonnier moyen : par mois, jour et nuit confondus puis séparés."""
    sub = hourly[hourly["year"].isin(kept_years)]
    rows = []
    for month, grp in sub.groupby("month", sort=True):
        h = grp["humidex"]
        d = h.notna()
        is_day = grp["hour"].isin(list(DAY_HOURS))
        is_night = grp["hour"].isin(NIGHT_HOURS)
        n_years = int(grp["year"].nunique())
        rows.append(
            {
                "mois": int(month),
                "humidex_moyen": float(h[d].mean()) if int(d.sum()) else np.nan,
                "humidex_p95": float(h[d].quantile(0.95)) if int(d.sum()) else np.nan,
                "humidex_max": float(h.max()) if int(d.sum()) else np.nan,
                "humidex_moyen_jour": float(h[is_day & d].mean()) if int((is_day & d).sum()) else np.nan,
                "humidex_moyen_nuit": float(h[is_night & d].mean()) if int((is_night & d).sum()) else np.nan,
                "temperature_moyenne": float(grp["T"].mean()) if grp["T"].notna().any() else np.nan,
                "heures_sup30_par_an": (int((h > 30).sum()) / n_years) if n_years else np.nan,
            }
        )
    return pd.DataFrame(rows)


def hour_of_day_profile(hourly: pd.DataFrame, kept_years: set[int]) -> pd.DataFrame:
    """Profil horaire moyen (heure locale) sur les mois d'été."""
    sub = hourly[hourly["year"].isin(kept_years) & hourly["month"].isin([6, 7, 8, 9])]
    rows = []
    for hour, grp in sub.groupby("hour", sort=True):
        h = grp["humidex"]
        d = h.notna()
        n_years = int(grp["year"].nunique())
        rows.append(
            {
                "heure": int(hour),
                "humidex_moyen": float(h[d].mean()) if int(d.sum()) else np.nan,
                "temperature_moyenne": float(grp["T"].mean()) if grp["T"].notna().any() else np.nan,
                "heures_sup30_par_an": (int((h > 30).sum()) / n_years) if n_years else np.nan,
            }
        )
    return pd.DataFrame(rows)
