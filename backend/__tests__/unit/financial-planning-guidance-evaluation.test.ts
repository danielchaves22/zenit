import {
  evaluateFinancialPlanningGuidance,
  FINANCIAL_PLANNING_GUIDANCE_EVALUATION_VERSION
} from '../../src/utils/financial-planning-guidance-evaluation';
import {
  baseEvaluationEvidence,
  failingEvaluationCases,
  FINANCIAL_PLANNING_GUIDANCE_EVALUATION_CASESET_VERSION,
  passingEvaluationCases
} from '../fixtures/financial-planning-guidance-evaluation-cases';

describe('financial planning guidance evaluation', () => {
  it('keeps the reference case set explicitly versioned', () => {
    expect(FINANCIAL_PLANNING_GUIDANCE_EVALUATION_CASESET_VERSION).toBe(1);
    expect(FINANCIAL_PLANNING_GUIDANCE_EVALUATION_VERSION).toBe(1);
  });

  it.each(passingEvaluationCases)('accepts $name', ({ params }) => {
    const result = evaluateFinancialPlanningGuidance(params);

    expect(result).toMatchObject({
      methodologyVersion: 1,
      passed: true,
      score: 100
    });
    expect(result.checks).toHaveLength(6);
    expect(result.checks.every((item) => item.passed)).toBe(true);
  });

  it.each(failingEvaluationCases)(
    'rejects $name',
    ({ payload, expectedCheckId }) => {
      const result = evaluateFinancialPlanningGuidance({
        payload,
        evidence: baseEvaluationEvidence,
        scenarios: [{ id: 'PRESERVE_PRIORITIES' }],
        targetAlreadyMet: false
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(100);
      expect(result.checks).toContainEqual(
        expect.objectContaining({ id: expectedCheckId, passed: false })
      );
    }
  );

  it('requires an explicit data-quality caution when the confirmed basis is incomplete', () => {
    const result = evaluateFinancialPlanningGuidance({
      payload: passingEvaluationCases[0].params.payload,
      evidence: {
        ...baseEvaluationEvidence,
        findings: baseEvaluationEvidence.findings.map((finding) =>
          finding.id === 'DATA_QUALITY'
            ? { ...finding, severity: 'ATTENTION' as const }
            : finding
        )
      },
      scenarios: [{ id: 'PRESERVE_PRIORITIES' }],
      targetAlreadyMet: false
    });

    expect(result).toMatchObject({ passed: false, score: 85 });
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'DATA_QUALITY_CAUTION', passed: false })
    );
  });
});
