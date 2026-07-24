import axe, { type RunOptions } from 'axe-core';
import { expect } from 'vitest';

const JSDOM_OPTIONS: RunOptions = {
  rules: {
    // jsdom does not calculate layout or rendered colors. Contrast remains a
    // browser-level manual check; all other supported axe rules stay enabled.
    'color-contrast': { enabled: false },
  },
};

export async function expectNoAccessibilityViolations(
  container: Element | Document = document,
): Promise<void> {
  const results = await axe.run(container, JSDOM_OPTIONS);
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    targets: violation.nodes.map((node) => node.target),
  }));

  expect(summary).toEqual([]);
}
