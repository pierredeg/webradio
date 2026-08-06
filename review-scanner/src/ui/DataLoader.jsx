import { useRef } from 'react';

/**
 * Loads a dataset: bundled fixtures for the demo, or a JSON file produced by
 * scripts/collect.mjs. Nothing is fetched from here — collection happens
 * outside the browser, where the credentials and the rate limiting live.
 */
export function DataLoader({ fixtures, current, onSelectFixture, onLoadFile, error }) {
  const inputRef = useRef(null);

  return (
    <section className="card">
      <h2>Jeu de données</h2>
      <div className="loader">
        <select value={current} onChange={(e) => onSelectFixture(e.target.value)}>
          {Object.entries(fixtures).map(([key, value]) => (
            <option key={key} value={key}>{value.label}</option>
          ))}
          <option value="__file__" disabled>— ou charger un fichier —</option>
        </select>

        <label className="file">
          Charger un JSON
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onLoadFile(file.name, String(reader.result));
              reader.readAsText(file);
            }}
          />
        </label>

        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          produit par <code>node scripts/collect.mjs</code>
        </span>
      </div>

      {error && <div className="error"><strong>Fichier refusé :</strong> {error}</div>}
    </section>
  );
}
