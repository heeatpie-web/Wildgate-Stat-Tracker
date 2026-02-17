import { afterEach, describe, expect, it } from 'vitest';
import { runA11yAudit, summarizeAccessibilityIssues } from '../accessibilityAudit';

describe('accessibilityAudit', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('flags missing image alt text', () => {
    document.body.innerHTML = '<img src="test.png" />';
    const issues = runA11yAudit(document);
    expect(issues.some((issue) => issue.rule === 'WCAG 1.1.1')).toBe(true);
  });

  it('flags unnamed buttons and unlabeled form controls', () => {
    document.body.innerHTML = `
      <button type="button"><span aria-hidden="true"></span></button>
      <input type="text" />
    `;

    const issues = runA11yAudit(document);
    expect(issues.some((issue) => issue.rule === 'WCAG 4.1.2')).toBe(true);
    expect(issues.some((issue) => issue.rule === 'WCAG 3.3.2')).toBe(true);
  });

  it('summarizes issue severity counts', () => {
    document.body.innerHTML = `
      <img src="missing-alt.png" />
      <button type="button"></button>
    `;

    const issues = runA11yAudit(document);
    const summary = summarizeAccessibilityIssues(issues);

    expect(summary.total).toBeGreaterThan(0);
    expect(summary.errors).toBeGreaterThan(0);
    expect(summary.warnings).toBeGreaterThanOrEqual(0);
  });
});

