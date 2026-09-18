import {
  financialPlanningGuidanceDurationMs,
  financialPlanningGuidanceEvaluationScore,
  financialPlanningGuidanceRequestsTotal,
  financialPlanningGuidanceTokensTotal,
  observeFinancialPlanningGuidance
} from '../../src/metrics';

function metricValue(
  values: Array<{ labels: Record<string, string | number>; value: number }>,
  expectedLabels: Record<string, string>
): number {
  return values.find((item) =>
    Object.entries(expectedLabels).every(([key, value]) => item.labels[key] === value)
  )?.value ?? 0;
}

function metricLabelNames(metric: unknown): string[] {
  return (metric as { labelNames: string[] }).labelNames;
}

describe('financial planning guidance metrics', () => {
  it('records outcomes, evaluation score and tokens using only bounded labels', async () => {
    const labels = {
      model: 'metrics-test-model',
      prompt_version: 'metrics-test-prompt',
      outcome: 'success',
      fallback: 'false'
    };
    const tokenLabels = {
      model: labels.model,
      prompt_version: labels.prompt_version,
      token_type: 'total'
    };
    const beforeRequests = metricValue(
      (await financialPlanningGuidanceRequestsTotal.get()).values,
      labels
    );
    const beforeScores = metricValue(
      (await financialPlanningGuidanceEvaluationScore.get()).values,
      { ...labels, le: '+Inf' }
    );
    const beforeTokens = metricValue(
      (await financialPlanningGuidanceTokensTotal.get()).values,
      tokenLabels
    );

    observeFinancialPlanningGuidance({
      model: labels.model,
      promptVersion: labels.prompt_version,
      outcome: 'success',
      durationMs: 120,
      evaluationScore: 100,
      inputTokens: 40,
      outputTokens: 20,
      totalTokens: 60
    });

    const requestValues = (await financialPlanningGuidanceRequestsTotal.get()).values;
    const scoreValues = (await financialPlanningGuidanceEvaluationScore.get()).values;
    const tokenValues = (await financialPlanningGuidanceTokensTotal.get()).values;
    expect(metricValue(requestValues, labels) - beforeRequests).toBe(1);
    expect(metricValue(scoreValues, { ...labels, le: '+Inf' }) - beforeScores).toBe(1);
    expect(metricValue(tokenValues, tokenLabels) - beforeTokens).toBe(60);
    expect(metricLabelNames(financialPlanningGuidanceRequestsTotal)).toEqual([
      'model',
      'prompt_version',
      'outcome',
      'fallback'
    ]);
    expect(metricLabelNames(financialPlanningGuidanceDurationMs)).toEqual(
      metricLabelNames(financialPlanningGuidanceRequestsTotal)
    );
    expect(metricLabelNames(financialPlanningGuidanceEvaluationScore)).toEqual(
      metricLabelNames(financialPlanningGuidanceRequestsTotal)
    );
    expect(metricLabelNames(financialPlanningGuidanceTokensTotal)).toEqual([
      'model',
      'prompt_version',
      'token_type'
    ]);
  });
});
