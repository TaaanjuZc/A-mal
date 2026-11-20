import { createFileRoute } from '@tanstack/react-router';
import { ClassesPage } from '@/components/planner/classes';
export const Route = createFileRoute('/classes')({
 head: () => ({ meta: [{title: 'Class routine — A’mal'}, {name:'description',content:'Upload your class routine and get automatic class countdowns.'}, {property:'og:title',content:'Class routine — A’mal'}, {property:'og:description',content:'Upload your class routine and get automatic class countdowns.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: ClassesPage,
});
