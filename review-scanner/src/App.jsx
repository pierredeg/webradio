import { useMemo, useState } from 'react';
import { analyze } from './engine/index.js';
import { Hero } from './ui/Hero.jsx';
import { TimelineChart } from './ui/TimelineChart.jsx';
import { DistributionChart } from './ui/DistributionChart.jsx';
import { ReviewList } from './ui/ReviewList.jsx';
import { DataLoader } from './ui/DataLoader.jsx';
import clean from './fixtures/clean.json';
import contaminated from './fixtures/contaminated.json';

const FIXTURES = {
  clean: { label: 'Démo — corpus sain (synthétique)', data: clean },
  contaminated: { label: 'Démo — corpus avec packs achetés (synthétique)', data: contaminated },
};

export default function App() {
  const [selected, setSelected] = useState('contaminated');
  const [uploaded, setUploaded] = useState(null);
  const [error, setError] = useState(null);

  const dataset = uploaded?.data ?? FIXTURES[selected].data;

  const report = useMemo(() => {
    try {
      return { value: analyze(dataset), error: null };
    } catch (e) {
      return { value: null, error: e.message };
    }
  }, [dataset]);

  function handleFile(name, contents) {
    try {
      const parsed = JSON.parse(contents);
      analyze(parsed); // fail here rather than halfway through rendering
      setUploaded({ name, data: parsed });
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Scanner d'avis Google Maps</h1>
        <p>
          Estime la part des avis portant des signaux d'inauthenticité, et montre lesquels et pourquoi.
        </p>
      </header>

      <DataLoader
        fixtures={FIXTURES}
        current={uploaded ? '__file__' : selected}
        onSelectFixture={(key) => {
          setUploaded(null);
          setError(null);
          setSelected(key);
        }}
        onLoadFile={handleFile}
        error={error}
      />

      {report.error ? (
        <div className="card error">Analyse impossible : {report.error}</div>
      ) : (
        <>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 24, marginBottom: 0 }}>
            <strong>{report.value.place.name}</strong>
            {report.value.place.city ? ` · ${report.value.place.city}` : ''}
            {report.value.collectedAt ? ` · collecté le ${report.value.collectedAt.slice(0, 10)}` : ''}
          </p>

          <Hero report={report.value} />
          <TimelineChart bursts={report.value.bursts} />
          <DistributionChart distribution={report.value.distribution} />

          {!report.value.authorData.coReviewGraphAvailable && (
            <section className="card">
              <h2>Signal manquant</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
                Le graphe de co-publication n'a pas pu être construit : les profils des auteurs
                n'ont pas été collectés ({report.value.authorData.profilesResolved} profils résolus
                sur {report.value.authorData.total}). C'est le signal le plus discriminant de la
                méthode ; sans lui, l'estimation est structurellement basse.
              </p>
            </section>
          )}

          <ReviewList reviews={report.value.reviews} />

          <footer>
            <p>
              Méthode : rafales temporelles (Poisson, seuil corrigé par le nombre de fenêtres testées),
              forme de la distribution des notes contre un a priori de catégorie, quasi-duplication de
              texte (shingles de 4 mots, Jaccard ≥ 0,6), signaux de profil auteur et graphe de
              co-publication, combinés par un modèle logistique.
            </p>
            <p>
              Les poids ne sont pas calibrés sur des données étiquetées. Ce rapport documente des
              signaux statistiques ; il n'établit pas qu'un avis donné est faux, ni qu'un
              établissement a acheté des avis.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
