import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '@/components/planner/tasks';
export const Route = createFileRoute('/tasks')({
 head: () => ({ meta: [{title: 'Tasks — Wajib'}, {name:'description',content:'Plan, schedule, and track your tasks by category and time.'}, {property:'og:title',content:'Tasks — Wajib'}, {property:'og:description',content:'Plan, schedule, and track your tasks by category and time.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: TasksPage,
});
