"use client";

import {
  averageScore,
  parseJsonField,
  type IdeaScores,
} from "@/lib/constants";

type IdeaView = {
  id: string;
  title: string;
  pitch: string;
  features: string;
  targetAudience: string;
  monetization: string | null;
  scores: string | null;
};

function parseFeatures(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function CompareModal({
  ideas,
  onClose,
}: {
  ideas: IdeaView[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-card p-6 card-shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-2xl text-foreground">
            ⚖️ Compare ideas
          </h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 font-mono text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-b border-border pb-3 pr-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {""}
                </th>
                {ideas.map((idea) => {
                  const scores = parseJsonField<IdeaScores>(idea.scores);
                  const avg = averageScore(scores);
                  return (
                    <th
                      key={idea.id}
                      className="border-b border-border pb-3 pr-4 align-bottom"
                    >
                      <span className="font-serif text-lg text-foreground">
                        {idea.title}
                      </span>
                      {avg > 0 && (
                        <span className="mt-1 block font-mono text-xs text-primary">
                          avg {avg}/10
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b border-border/50 py-3 pr-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Pitch
                </td>
                {ideas.map((idea) => (
                  <td
                    key={idea.id}
                    className="border-b border-border/50 py-3 pr-4 text-muted-foreground"
                  >
                    {idea.pitch}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border-b border-border/50 py-3 pr-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Features
                </td>
                {ideas.map((idea) => (
                  <td
                    key={idea.id}
                    className="border-b border-border/50 py-3 pr-4"
                  >
                    <ul className="space-y-1">
                      {parseFeatures(idea.features).map((f, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-primary">✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border-b border-border/50 py-3 pr-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Audience
                </td>
                {ideas.map((idea) => (
                  <td
                    key={idea.id}
                    className="border-b border-border/50 py-3 pr-4 font-medium"
                  >
                    {idea.targetAudience}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Monetization
                </td>
                {ideas.map((idea) => (
                  <td key={idea.id} className="py-3 pr-4 font-medium">
                    {idea.monetization || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}