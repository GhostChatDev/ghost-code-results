export const demoBoard = {
  id: 'demo', title: 'Team workspace',
  columns: [
    { id: 'ideas', title: 'Ideas', cards: [
      { id: 'c1', title: 'Explore customer feedback', description: 'Gather the recurring themes from recent conversations.', dueDate: '', labels: ['Research'], checklist: [{ id: 'i1', text: 'Review support notes', done: true }, { id: 'i2', text: 'Share key takeaways', done: false }] },
      { id: 'c2', title: 'Plan the next release', description: 'Outline the opportunities for our next cycle.', dueDate: '', labels: ['Planning'], checklist: [] },
      { id: 'c3', title: 'Refresh onboarding', description: 'Make the first experience feel effortless.', dueDate: '', labels: ['Design'], checklist: [] }
    ] },
    { id: 'progress', title: 'In progress', cards: [
      { id: 'c4', title: 'Design the project overview', description: 'Bring the most important project details together.', dueDate: '', labels: ['Design'], checklist: [{ id: 'i3', text: 'Create first draft', done: true }, { id: 'i4', text: 'Get team feedback', done: false }] },
      { id: 'c5', title: 'Build notification settings', description: 'Give everyone control over their updates.', dueDate: '', labels: ['Product'], checklist: [] }
    ] },
    { id: 'review', title: 'In review', cards: [
      { id: 'c6', title: 'Update the help center', description: 'Polish the most visited guides.', dueDate: '', labels: ['Content'], checklist: [] },
      { id: 'c7', title: 'Review accessibility', description: 'Check keyboard navigation and contrast.', dueDate: '', labels: ['Quality'], checklist: [] }
    ] },
    { id: 'done', title: 'Done', cards: [
      { id: 'c8', title: 'Kick off the project', description: 'Align on goals and the next steps.', dueDate: '', labels: ['Planning'], checklist: [{ id: 'i5', text: 'Share project brief', done: true }] }
    ] }
  ]
};
