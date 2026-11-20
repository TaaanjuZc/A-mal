import { createFileRoute } from '@tanstack/react-router';
import { SettingsView } from '@/components/planner/views';
export const Route = createFileRoute('/settings')({
 head: () => ({ meta: [{title: 'Your preferences — A’mal'}, {name:'description',content:'Choose your A’mal theme and personal preferences.'}, {property:'og:title',content:'Your preferences — A’mal'}, {property:'og:description',content:'Choose your A’mal theme and personal preferences.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: SettingsView,
});
