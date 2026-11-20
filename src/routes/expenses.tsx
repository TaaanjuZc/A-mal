import { createFileRoute } from '@tanstack/react-router';
import { ExpensesPage } from '@/components/planner/expenses';
export const Route = createFileRoute('/expenses')({
 head: () => ({ meta: [{title: 'Expenses — A’mal'}, {name:'description',content:'Track your spending against a monthly budget, by day and by category.'}, {property:'og:title',content:'Expenses — A’mal'}, {property:'og:description',content:'Track your spending against a monthly budget, by day and by category.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: ExpensesPage,
});
