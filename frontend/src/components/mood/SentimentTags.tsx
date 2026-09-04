import type { ISentiments } from '../../lib/types';

const TAG_STYLES: Record<string, string> = {
  Positive: 'bg-primary/15 text-primary',
  'Stress Signals': 'bg-error/15 text-error',
  'Deep Focus': 'bg-secondary/15 text-secondary',
  Neutral: 'bg-surface-high text-on-surface-variant'
};

/** AI-generated sentiment tags per analyzed commit. */
export default function SentimentTags({ data }: { data: ISentiments }) {
  if (data.commits.length === 0) {
    return <p className="text-sm text-on-surface-variant">No commits analyzed. Start coding!</p>;
  }
  return (
    <div className="space-y-3">
      <div aria-label="Sentiment summary" className="flex flex-wrap gap-2">
        {Object.entries(data.summary)
          .filter(([, count]) => count > 0)
          .map(([tag, count]) => (
            <span key={tag} className={`rounded-full px-3 py-1 text-xs font-medium ${TAG_STYLES[tag] ?? TAG_STYLES.Neutral}`}>
              {tag} · {count}
            </span>
          ))}
      </div>
      <ul className="space-y-2" aria-label="Analyzed commits">
        {data.commits.map((c) => (
          <li key={c.commit_hash} className="rounded-lg border border-outline-variant bg-surface-container p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xs text-on-surface-variant">{c.message}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TAG_STYLES[c.sentiment_tag] ?? TAG_STYLES.Neutral}`}>
                {c.sentiment_tag}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
