"""Accès aux données climatologiques horaires de Météo-France (meteo.data.gouv.fr).

Responsabilités :
  - découvrir les ressources CSV.gz d'un département via l'API data.gouv.fr ;
  - les télécharger dans un cache local (aucun re-téléchargement si le fichier
    est déjà présent et de taille cohérente) ;
  - les lire de façon robuste (séparateur ";", décimale "." ou ",",
    encodage utf-8 ou latin-1, horodatage AAAAMMJJHH en UTC).

Le mode --offline permet de travailler uniquement sur le contenu du cache,
ce qui est nécessaire dans les environnements sans accès réseau : il suffit
alors de déposer manuellement les fichiers H_0XX_*.csv.gz dans le dossier
de cache.
"""

from __future__ import annotations

import gzip
import io
import json
import logging
import re
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import requests

log = logging.getLogger(__name__)

# Jeu de données "Données climatologiques de base - horaires".
# On résout d'abord par slug (stable et lisible), puis par identifiant.
DATASET_SLUG = "donnees-climatologiques-de-base-horaires"
DATASET_ID = "6569b51ae64326786e4e8e1a"
API_ROOT = "https://www.data.gouv.fr/api/1/datasets"

# Colonnes utiles. On ne charge que celles-ci : les fichiers horaires
# comportent plus de 60 colonnes et pèsent lourd une fois décompressés.
#   NUM_POSTE  identifiant station     AAAAMMJJHH  horodatage UTC
#   NOM_USUEL  nom de la station       T           température instantanée (°C)
#   LAT / LON  position (degrés déc.)  U           humidité relative (%)
#   ALTI       altitude (m)            TD          point de rosée (°C), si publié
# Les colonnes Q* sont les codes qualité associés.
WANTED_COLUMNS = {
    "NUM_POSTE",
    "NOM_USUEL",
    "LAT",
    "LON",
    "ALTI",
    "AAAAMMJJHH",
    "T",
    "QT",
    "U",
    "QU",
    "TD",
    "QTD",
}

NUMERIC_COLUMNS = ["LAT", "LON", "ALTI", "T", "U", "TD"]

USER_AGENT = "humidex-sainte-maxime/1.0 (analyse climatologique locale)"


@dataclass(frozen=True)
class Resource:
    """Une ressource téléchargeable du jeu de données."""

    title: str
    url: str
    filesize: int | None = None

    @property
    def filename(self) -> str:
        name = self.title.strip() or self.url.rsplit("/", 1)[-1]
        # Certains titres contiennent des espaces ou des libellés ; on retombe
        # sur le nom de fichier de l'URL s'il ressemble à un CSV.gz.
        tail = self.url.rsplit("/", 1)[-1].split("?")[0]
        if tail.endswith(".csv.gz"):
            return tail
        return re.sub(r"[^A-Za-z0-9._-]+", "_", name)


class MeteoFranceSource:
    def __init__(self, cache_dir: Path, offline: bool = False, timeout: int = 120):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.offline = offline
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    # ------------------------------------------------------------------ API

    def _api_get(self, url: str) -> dict:
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                resp = self.session.get(url, timeout=self.timeout)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # réseau instable : backoff exponentiel
                last_error = exc
                if attempt == 3:
                    break
                time.sleep(2**attempt)
        raise RuntimeError(f"API data.gouv.fr injoignable ({url}) : {last_error}")

    def discover_resources(self, departement: str) -> list[Resource]:
        """Liste les ressources horaires du département (ex. "83").

        Les fichiers horaires sont découpés par tranches d'années :
        H_083_1950-1959.csv.gz, ..., H_083_previous-*.csv.gz,
        H_083_latest-*.csv.gz. On accepte donc tout fichier dont le nom
        commence par H_<dep>_ et se termine par .csv.gz.
        """
        dep = departement.zfill(3)
        pattern = re.compile(rf"^H_{dep}_.*\.csv\.gz$", re.IGNORECASE)

        payload = None
        for ref in (DATASET_SLUG, DATASET_ID):
            try:
                payload = self._api_get(f"{API_ROOT}/{ref}/")
                break
            except RuntimeError as exc:
                log.warning("Résolution du jeu de données via %r échouée : %s", ref, exc)
        if payload is None:
            raise RuntimeError(
                "Impossible de résoudre le jeu de données horaires sur data.gouv.fr. "
                "Téléchargez manuellement les fichiers H_%s_*.csv.gz depuis "
                "https://meteo.data.gouv.fr/datasets/%s et placez-les dans %s, "
                "puis relancez avec --offline." % (dep, DATASET_SLUG, self.cache_dir)
            )

        found: list[Resource] = []
        for res in payload.get("resources", []):
            url = res.get("url") or ""
            title = res.get("title") or ""
            tail = url.rsplit("/", 1)[-1].split("?")[0]
            if pattern.match(tail) or pattern.match(title.strip()):
                found.append(
                    Resource(title=title, url=url, filesize=(res.get("filesize") or None))
                )

        # Le cache-buster de data.gouv peut dupliquer une même tranche.
        unique: dict[str, Resource] = {}
        for r in found:
            unique.setdefault(r.filename, r)
        resources = sorted(unique.values(), key=lambda r: r.filename)
        log.info("%d ressource(s) horaires trouvée(s) pour le département %s", len(resources), dep)
        return resources

    # ------------------------------------------------------------- download

    def _download(self, resource: Resource, dest: Path) -> None:
        tmp = dest.with_suffix(dest.suffix + ".part")
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                with self.session.get(resource.url, stream=True, timeout=self.timeout) as resp:
                    resp.raise_for_status()
                    with tmp.open("wb") as fh:
                        shutil.copyfileobj(resp.raw, fh)
                tmp.replace(dest)
                return
            except Exception as exc:
                last_error = exc
                tmp.unlink(missing_ok=True)
                if attempt == 3:
                    break
                time.sleep(2**attempt)
        raise RuntimeError(f"Téléchargement de {resource.url} impossible : {last_error}")

    def _is_valid_gzip(self, path: Path) -> bool:
        try:
            with gzip.open(path, "rb") as fh:
                return bool(fh.read(2))
        except OSError:
            return False

    def ensure_local(self, resources: list[Resource]) -> list[Path]:
        """Garantit la présence locale des ressources ; renvoie les chemins."""
        paths: list[Path] = []
        for res in resources:
            dest = self.cache_dir / res.filename
            if dest.exists() and self._is_valid_gzip(dest):
                if res.filesize and dest.stat().st_size != res.filesize:
                    log.info("Cache périmé pour %s (taille différente), re-téléchargement", dest.name)
                else:
                    log.info("Cache : %s (%.1f Mo)", dest.name, dest.stat().st_size / 1e6)
                    paths.append(dest)
                    continue
            if self.offline:
                log.warning("Mode hors-ligne : %s absent du cache, ignoré", dest.name)
                continue
            log.info("Téléchargement de %s ...", res.filename)
            self._download(res, dest)
            if not self._is_valid_gzip(dest):
                raise RuntimeError(f"{dest} n'est pas un gzip valide après téléchargement")
            paths.append(dest)
        return paths

    def cached_files(self, departement: str) -> list[Path]:
        dep = departement.zfill(3)
        return sorted(self.cache_dir.glob(f"H_{dep}_*.csv.gz"))

    def acquire(self, departement: str) -> list[Path]:
        """Point d'entrée : renvoie la liste des fichiers locaux exploitables."""
        if self.offline:
            paths = self.cached_files(departement)
            if not paths:
                raise RuntimeError(
                    f"Mode hors-ligne et aucun fichier H_{departement.zfill(3)}_*.csv.gz "
                    f"dans {self.cache_dir}."
                )
            log.info("Mode hors-ligne : %d fichier(s) dans le cache", len(paths))
            return paths

        resources = self.discover_resources(departement)
        if not resources:
            raise RuntimeError(
                f"Aucune ressource horaire trouvée pour le département {departement}."
            )
        manifest = self.cache_dir / f"manifest_{departement.zfill(3)}.json"
        manifest.write_text(
            json.dumps([r.__dict__ for r in resources], indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return self.ensure_local(resources)

    # ---------------------------------------------------------------- parse

    @staticmethod
    def _read_header(path: Path) -> tuple[list[str], str]:
        """Lit l'en-tête et détermine l'encodage utilisable."""
        with gzip.open(path, "rb") as fh:
            raw = fh.readline()
        for encoding in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                header = raw.decode(encoding)
            except UnicodeDecodeError:
                continue
            cols = [c.strip().strip('"') for c in header.rstrip("\r\n").split(";")]
            if "NUM_POSTE" in cols and "AAAAMMJJHH" in cols:
                return cols, encoding
        raise RuntimeError(
            f"En-tête inattendu dans {path.name} : séparateur ';' et colonnes "
            "NUM_POSTE/AAAAMMJJHH introuvables."
        )

    @classmethod
    def read_file(cls, path: Path) -> pd.DataFrame:
        """Lit un CSV.gz horaire en ne gardant que les colonnes utiles.

        Toutes les colonnes sont lues en texte puis converties, ce qui rend la
        lecture insensible au format décimal (point ou virgule) employé.
        """
        columns, encoding = cls._read_header(path)
        usecols = [c for c in columns if c in WANTED_COLUMNS]
        missing = WANTED_COLUMNS - set(usecols)
        if {"T", "U"} & missing:
            log.warning("%s : colonnes absentes %s", path.name, sorted({"T", "U"} & missing))

        df = pd.read_csv(
            path,
            sep=";",
            usecols=usecols,
            dtype=str,
            encoding=encoding,
            compression="gzip",
            na_values=["", " ", "NA", "NaN"],
            keep_default_na=True,
            low_memory=False,
        )
        df.columns = [c.strip() for c in df.columns]

        for col in NUMERIC_COLUMNS:
            if col in df.columns:
                df[col] = pd.to_numeric(
                    df[col].astype("string").str.strip().str.replace(",", ".", regex=False),
                    errors="coerce",
                )
            else:
                df[col] = pd.NA

        for col in ("QT", "QU", "QTD"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
            else:
                df[col] = pd.NA

        df["NUM_POSTE"] = df["NUM_POSTE"].astype("string").str.strip()
        if "NOM_USUEL" in df.columns:
            df["NOM_USUEL"] = df["NOM_USUEL"].astype("string").str.strip()
        else:
            df["NOM_USUEL"] = pd.NA

        # AAAAMMJJHH : heure UTC.
        df["time_utc"] = pd.to_datetime(
            df["AAAAMMJJHH"].astype("string").str.strip(),
            format="%Y%m%d%H",
            errors="coerce",
            utc=True,
        )
        bad = int(df["time_utc"].isna().sum())
        if bad:
            log.warning("%s : %d horodatage(s) illisibles ignorés", path.name, bad)
        df = df.dropna(subset=["time_utc"])

        return df.drop(columns=["AAAAMMJJHH"])

    @classmethod
    def read_all(cls, paths: list[Path]) -> pd.DataFrame:
        frames = []
        for path in paths:
            log.info("Lecture de %s ...", path.name)
            frame = cls.read_file(path)
            log.info("  %s lignes, %s station(s)", f"{len(frame):,}".replace(",", " "),
                     frame["NUM_POSTE"].nunique())
            frames.append(frame)
        if not frames:
            raise RuntimeError("Aucun fichier lisible.")
        df = pd.concat(frames, ignore_index=True)
        df = df.drop_duplicates(subset=["NUM_POSTE", "time_utc"], keep="last")
        return df.sort_values(["NUM_POSTE", "time_utc"], ignore_index=True)


def buffer_to_dataframe(raw: bytes) -> pd.DataFrame:
    """Utilitaire de test : lit un CSV.gz depuis un buffer mémoire."""
    tmp = io.BytesIO(raw)
    tmp.seek(0)
    return pd.read_csv(tmp, sep=";", dtype=str, compression="gzip")
