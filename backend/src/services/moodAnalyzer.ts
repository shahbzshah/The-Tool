// Sentiment analysis of commit messages (keyword-based; swap for NLP model later)

export type TSentimentTag = 'Positive' | 'Stress Signals' | 'Deep Focus' | 'Neutral';

const STRESS_KEYWORDS = [
  'fix', 'hotfix', 'broken', 'crash', 'fail', 'failing', 'urgent', 'rollback',
  'revert', 'hack', 'workaround', 'temp', 'wip', 'why', 'finally', 'ugh', 'bug'
];

const FOCUS_KEYWORDS = [
  'refactor', 'implement', 'extract', 'optimize', 'architecture', 'design',
  'test', 'coverage', 'clean', 'api', 'service', 'module'
];

const POSITIVE_KEYWORDS = [
  'feat', 'add', 'improve', 'ship', 'release', 'complete', 'done', 'polish',
  'enhance', 'success'
];

export function analyzeCommitSentiment(message: string): TSentimentTag {
  const words = message.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Neutral';

  let stress = 0;
  let focus = 0;
  let positive = 0;
  for (const word of words) {
    if (STRESS_KEYWORDS.includes(word)) stress += 1;
    if (FOCUS_KEYWORDS.includes(word)) focus += 1;
    if (POSITIVE_KEYWORDS.includes(word)) positive += 1;
  }

  // Repeated stress words (e.g. "fix fix fix") indicate high friction
  if (stress >= 2) return 'Stress Signals';
  if (positive > 0 && positive >= focus && positive > stress) return 'Positive';
  if (focus > 0 && focus >= stress) return 'Deep Focus';
  if (stress > 0) return 'Stress Signals';
  return 'Neutral';
}
