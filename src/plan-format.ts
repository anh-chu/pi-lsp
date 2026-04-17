import { formatCompactSection } from './format.ts';
import type { NavigationPlan } from './types.ts';

export function formatNavigationPlan(plan: NavigationPlan) {
  return formatCompactSection(plan.status === 'answer-now' ? 'Navigation plan: answer now' : 'Navigation plan', [
    `- intent: ${plan.intent}`,
    `- status: ${plan.status}`,
    `- confidence: ${plan.confidence}`,
    `- best route: ${plan.bestRoute.primary}`,
    `- route reason: ${plan.bestRoute.reason}`,
    `- fresh session: ${plan.freshSession ? 'yes' : 'no'}`,
    `- grounded symbol: ${plan.evidence.symbol ?? 'none'}`,
    `- grounded file: ${plan.evidence.file ?? 'none'}`,
    `- next tool: ${plan.nextTool ?? 'none'}`,
    `- next args: ${plan.nextArgs ? JSON.stringify(plan.nextArgs) : 'none'}`,
    ...plan.steps.map((entry) => `- step ${entry.order}: ${entry.tool} — ${entry.reason}${entry.args ? ` — ${JSON.stringify(entry.args)}` : ''}`),
    ...plan.fallbackSteps.map((entry) => `- fallback ${entry.order}: ${entry.tool} — ${entry.reason}${entry.args ? ` — ${JSON.stringify(entry.args)}` : ''}`),
    ...plan.stopWhen.map((line) => `- stop when: ${line}`),
  ]);
}
