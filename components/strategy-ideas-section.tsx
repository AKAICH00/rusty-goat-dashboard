'use client';

import { useState } from "react";

export type StrategyIdea = {
  id: string;
  name: string | null;
  concept: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  signal_logic: string;
  edge_hypothesis: string;
  submitted_at: string;
};

type StrategyIdeasSectionProps = {
  ideas: StrategyIdea[];
};

const timeframes: StrategyIdea["timeframe"][] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const fieldClasses =
  "mt-2 w-full rounded-2xl border border-gray-600 bg-gray-700 px-4 py-3 text-white outline-none transition focus:border-[#f7931a] focus:ring-2 focus:ring-[#f7931a]/20";

export default function StrategyIdeasSection({ ideas }: StrategyIdeasSectionProps) {
  const [name, setName] = useState("");
  const [concept, setConcept] = useState("");
  const [timeframe, setTimeframe] = useState<StrategyIdea["timeframe"]>("1h");
  const [signalLogic, setSignalLogic] = useState("");
  const [edgeHypothesis, setEdgeHypothesis] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const visibleIdeas = [...ideas].reverse();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/submit-idea", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          concept,
          timeframe,
          signalLogic,
          edgeHypothesis,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to submit idea.");
      }

      setName("");
      setConcept("");
      setTimeframe("1h");
      setSignalLogic("");
      setEdgeHypothesis("");
      setSuccessMessage("Thanks! Idea submitted.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit idea.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10 sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#f7931a]">Strategy ideas</p>
        <h2 className="text-2xl font-semibold">Submit a strategy concept</h2>
        <p className="max-w-2xl text-sm text-gray-400">
          Share a setup, the logic behind it, and why it might survive real market conditions.
        </p>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="text-sm font-medium text-gray-200">
              Name
              <input
                className={fieldClasses}
                name="name"
                placeholder="Optional"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-gray-200">
              Strategy concept
              <input
                required
                className={fieldClasses}
                name="concept"
                placeholder="e.g. BTC funding-rate fade"
                value={concept}
                onChange={(event) => setConcept(event.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-gray-200">
              Timeframe
              <select
                required
                className={fieldClasses}
                name="timeframe"
                value={timeframe}
                onChange={(event) => setTimeframe(event.target.value as StrategyIdea["timeframe"])}
              >
                {timeframes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-gray-200">
              Signal logic
              <textarea
                className={`${fieldClasses} min-h-28 resize-y`}
                name="signalLogic"
                placeholder="Describe entries, exits, filters, and invalidation."
                value={signalLogic}
                onChange={(event) => setSignalLogic(event.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-gray-200">
              Edge hypothesis
              <textarea
                className={`${fieldClasses} min-h-28 resize-y`}
                name="edgeHypothesis"
                placeholder="Why should this keep working?"
                value={edgeHypothesis}
                onChange={(event) => setEdgeHypothesis(event.target.value)}
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl bg-[#f7931a] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#ffac4d] disabled:cursor-not-allowed disabled:bg-[#f7931a]/60"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
              {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}
            </div>

            {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleIdeas.length > 0 ? (
            visibleIdeas.map((idea) => (
              <article key={idea.id} className="rounded-3xl border border-white/10 bg-gray-900/80 p-5 shadow-lg shadow-black/10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{idea.name?.trim() || "Anonymous"}</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{idea.concept}</h3>
                  </div>
                  <span className="rounded-full border border-[#f7931a]/30 bg-[#f7931a]/10 px-3 py-1 text-xs font-medium text-orange-100">
                    {idea.timeframe}
                  </span>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-400">Timeframe</dt>
                    <dd className="mt-1 text-gray-100">{idea.timeframe}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Submitted at</dt>
                    <dd className="mt-1 text-gray-100">
                      {Number.isNaN(Date.parse(idea.submitted_at))
                        ? idea.submitted_at
                        : timestampFormatter.format(new Date(idea.submitted_at))}
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <article className="rounded-3xl border border-dashed border-white/10 bg-gray-900/60 p-5 text-sm text-gray-400 md:col-span-2">
              No ideas submitted yet.
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
