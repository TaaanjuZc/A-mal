import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/planner/dashboard';
export const Route = createFileRoute('/')({
 head: () => ({ meta: [{title: 'A’mal — A day that’s yours'}, {name:'description',content:'Your personal overview for routines, Namaz, spending, schedules, and notes.'}, {property:'og:title',content:'A’mal — A day that’s yours'}, {property:'og:description',content:'Your personal overview for routines, Namaz, spending, schedules, and notes.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: Dashboard,
});
