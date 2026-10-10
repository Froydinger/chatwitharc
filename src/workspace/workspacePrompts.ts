import { GENERAL_QUICK_PROMPTS } from '@/components/WelcomeSection';

const welcomeCategories = [
  ['Ask a question', 'Explain a topic', 'Research this', 'Check the sources', 'Book recs'],
  ['Reflect on today', 'Think it through', 'Plan my day'],
  ['Write together', 'Create art', 'Draft an email', 'Tell a story', 'Build something', 'Analyze data'],
];

/** One Ask, Reflect and Create option, reusing the existing prompt objects. */
export function pickWorkspacePrompts(random = Math.random) {
  return welcomeCategories.flatMap(labels => {
    const choices = GENERAL_QUICK_PROMPTS.filter(prompt => labels.includes(prompt.label));
    if (!choices.length) return [];
    const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
    return [choices[index]];
  });
}
