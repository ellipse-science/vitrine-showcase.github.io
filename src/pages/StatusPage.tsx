import React, { ReactElement, useEffect, useState } from 'react';

type TableStatus = {
  name: string;
  status: 'ok' | 'error';
  rowCount?: number;
  generatedAt?: string;
  error?: string;
};

type Meta = {
  generatedAt: string;
  workflowRunUrl: string;
  tables: TableStatus[];
};

const ageLabel = (iso: string): string => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
  return `${Math.floor(diff / 86400)}j`;
};

const freshnessColor = (iso: string | undefined): string => {
  if (!iso) return '#f87171'; // red — missing
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 5)  return '#4ade80'; // green
  if (hours < 8)  return '#facc15'; // yellow
  return '#f87171';                  // red
};

const styles: Record<string, React.CSSProperties> = {
  page:     { fontFamily: 'monospace', padding: '2rem', maxWidth: 800, margin: '0 auto', color: '#111' },
  heading:  { fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub:      { fontSize: '0.85rem', color: '#555', marginBottom: '1.5rem' },
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th:       { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '0.4rem 0.6rem' },
  td:       { borderBottom: '1px solid #eee', padding: '0.4rem 0.6rem', verticalAlign: 'middle' },
  dot:      { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginRight: 6 },
  errText:  { color: '#ef4444', fontSize: '0.75rem', maxWidth: 300, wordBreak: 'break-all' },
  link:     { color: '#2563eb', textDecoration: 'none', fontSize: '0.8rem' },
};

const StatusPage = (): ReactElement => {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/data/meta.json?ts=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch');
        return r.json() as Promise<Meta>;
      })
      .then((data) => {
        setMeta(data);
        setFetchedAt(new Date());
      })
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div style={styles.page}>
        <p style={{ color: '#ef4444' }}>
          Impossible de charger <code>/data/meta.json</code>. La première exécution du workflow
          créera ce fichier.
        </p>
      </div>
    );
  }

  if (!meta) {
    return <div style={styles.page}><p>Chargement…</p></div>;
  }

  const age = ageLabel(meta.generatedAt);

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Vitrine — statut des données</h1>
      <p style={styles.sub}>
        Dernier rafraîchissement : <strong>{meta.generatedAt}</strong> (il y a {age})
        {meta.workflowRunUrl && (
          <>
            {' · '}
            <a href={meta.workflowRunUrl} style={styles.link} target="_blank" rel="noopener noreferrer">
              voir le run GitHub Actions
            </a>
          </>
        )}
        {fetchedAt && (
          <span style={{ marginLeft: '1rem', color: '#aaa' }}>
            (page chargée à {fetchedAt.toLocaleTimeString('fr-CA')})
          </span>
        )}
      </p>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Table</th>
            <th style={styles.th}>Statut</th>
            <th style={styles.th}>Lignes</th>
            <th style={styles.th}>Généré il y a</th>
          </tr>
        </thead>
        <tbody>
          {meta.tables.map((t) => (
            <tr key={t.name}>
              <td style={styles.td}><code>{t.name}</code></td>
              <td style={styles.td}>
                <span
                  style={{ ...styles.dot, backgroundColor: t.status === 'ok' ? freshnessColor(t.generatedAt) : '#f87171' }}
                />
                {t.status === 'ok' ? 'ok' : 'erreur'}
                {t.status === 'error' && t.error && (
                  <div style={styles.errText}>{t.error}</div>
                )}
              </td>
              <td style={styles.td}>{t.rowCount ?? '—'}</td>
              <td style={styles.td}>{t.generatedAt ? ageLabel(t.generatedAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#999' }}>
        Vert = données de moins de 5h · Jaune = 5–8h · Rouge = plus de 8h ou erreur
      </p>
    </div>
  );
};

export default StatusPage;
