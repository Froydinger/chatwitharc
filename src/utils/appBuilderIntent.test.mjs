import { deepStrictEqual, equal } from 'node:assert/strict';
import { getAppBuilderIntent } from './appBuilderIntent.ts';

equal(getAppBuilderIntent('How do I build an app?'), null);
deepStrictEqual(getAppBuilderIntent('Create a shopping list app'), {
  action: 'create', prompt: 'Create a shopping list app',
});
deepStrictEqual(getAppBuilderIntent('/app Build an expense tracker'), {
  action: 'create', prompt: 'Build an expense tracker',
});
deepStrictEqual(getAppBuilderIntent('Update my website header'), {
  action: 'edit', prompt: 'Update my website header',
});
deepStrictEqual(getAppBuilderIntent('Make it easier to read', true), {
  action: 'edit', prompt: 'Make it easier to read',
});
