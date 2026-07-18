import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflowUrl = new URL('../../.github/workflows/promote.yml', import.meta.url);

describe('promote workflow', () => {
  it('checks only production deployments created by the LA deploy console', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');
    const consoleFilter = workflow.indexOf("previous.creator?.login === 'github-actions[bot]'");
    const vercelStatusLookup = workflow.indexOf(
      'deployment_id: previous.id',
      consoleFilter,
    );

    expect(consoleFilter).toBeGreaterThan(-1);
    expect(workflow).toContain(
      "previous.description?.startsWith('Approved through LA deploy console by ')",
    );
    expect(workflow).toContain("'gray_deployment_id' in previous.payload");
    expect(workflow.indexOf('if (!isConsolePromotion) continue;', consoleFilter))
      .toBeLessThan(vercelStatusLookup);
  });

  it('treats queued console deployments as active', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).toContain("state === 'queued'");
  });
});
