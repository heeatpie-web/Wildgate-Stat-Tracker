export type AccessibilityIssueSeverity = 'error' | 'warning';

export interface AccessibilityIssue {
  rule: string;
  severity: AccessibilityIssueSeverity;
  message: string;
  selector: string;
}

export interface AccessibilityAuditSummary {
  total: number;
  errors: number;
  warnings: number;
}

const getSelector = (element: Element): string => {
  if (element.id) return `${element.tagName.toLowerCase()}#${element.id}`;
  const classes = Array.from(element.classList).slice(0, 2);
  if (classes.length > 0) {
    return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
  }
  return element.tagName.toLowerCase();
};

const hasAccessibleName = (element: Element): boolean => {
  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  const title = element.getAttribute('title');
  const text = element.textContent?.trim();
  return Boolean(
    (ariaLabel && ariaLabel.trim().length > 0)
    || (ariaLabelledBy && ariaLabelledBy.trim().length > 0)
    || (title && title.trim().length > 0)
    || (text && text.length > 0)
  );
};

const hasAssociatedLabel = (element: HTMLElement, root: ParentNode): boolean => {
  if (element.closest('label')) return true;

  const id = element.id;
  if (!id) return false;
  const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(id)
    : id.replace(/"/g, '\\"');
  return root.querySelector(`label[for="${escapedId}"]`) !== null;
};

export const runA11yAudit = (root: ParentNode = document): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];

  root.querySelectorAll('img').forEach((image) => {
    if (image.getAttribute('aria-hidden') === 'true') return;
    const alt = image.getAttribute('alt');
    const ariaLabel = image.getAttribute('aria-label');
    if ((alt == null || alt.trim().length === 0) && (ariaLabel == null || ariaLabel.trim().length === 0)) {
      issues.push({
        rule: 'WCAG 1.1.1',
        severity: 'error',
        message: 'Image is missing alt text or aria-label.',
        selector: getSelector(image),
      });
    }
  });

  root.querySelectorAll('button').forEach((button) => {
    if (button.getAttribute('aria-hidden') === 'true') return;
    if (!hasAccessibleName(button)) {
      issues.push({
        rule: 'WCAG 4.1.2',
        severity: 'error',
        message: 'Button is missing an accessible name.',
        selector: getSelector(button),
      });
    }
  });

  root.querySelectorAll<HTMLElement>('input, select, textarea').forEach((control) => {
    if (control.getAttribute('aria-hidden') === 'true') return;
    if (control instanceof HTMLInputElement && control.type === 'hidden') return;
    if (control.hasAttribute('disabled')) return;

    const ariaLabel = control.getAttribute('aria-label');
    const ariaLabelledBy = control.getAttribute('aria-labelledby');
    if (
      (ariaLabel && ariaLabel.trim().length > 0)
      || (ariaLabelledBy && ariaLabelledBy.trim().length > 0)
      || hasAssociatedLabel(control, root)
    ) {
      return;
    }

    issues.push({
      rule: 'WCAG 3.3.2',
      severity: 'warning',
      message: 'Form control appears to be missing a label association.',
      selector: getSelector(control),
    });
  });

  root.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]').forEach((dialog) => {
    const ariaModal = dialog.getAttribute('aria-modal');
    if (ariaModal !== 'true') {
      issues.push({
        rule: 'WCAG 4.1.2',
        severity: 'warning',
        message: 'Dialog should set aria-modal="true".',
        selector: getSelector(dialog),
      });
    }

    const hasDialogName = Boolean(
      dialog.getAttribute('aria-labelledby') || dialog.getAttribute('aria-label')
    );
    if (!hasDialogName) {
      issues.push({
        rule: 'WCAG 2.4.6',
        severity: 'error',
        message: 'Dialog is missing aria-labelledby/aria-label.',
        selector: getSelector(dialog),
      });
    }
  });

  root.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.trim().length === 0) {
      issues.push({
        rule: 'WCAG 2.1.1',
        severity: 'warning',
        message: 'Anchor appears without href and may not be keyboard reachable.',
        selector: getSelector(link),
      });
    }
  });

  return issues;
};

export const summarizeAccessibilityIssues = (issues: AccessibilityIssue[]): AccessibilityAuditSummary => {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  return {
    total: issues.length,
    errors,
    warnings: issues.length - errors,
  };
};

