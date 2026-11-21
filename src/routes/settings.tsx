import { createFileRoute } from '@tanstack/react-router';
import { SettingsView } from '@/components/planner/views';
export const Route = createFileRoute('/settings')({
 head: () => ({ meta: [{title: 'Your preferences — Wajib'}, {name:'description',content:'Choose your Wajib theme and personal preferences.'}, {property:'og:title',content:'Your preferences — Wajib'}, {property:'og:description',content:'Choose your Wajib theme and personal preferences.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: SettingsView,
});
