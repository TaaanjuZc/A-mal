import { createFileRoute } from '@tanstack/react-router';
import { NotesPage } from '@/components/planner/notes';
export const Route = createFileRoute('/notes')({
 head: () => ({ meta: [{title: 'Notes — A’mal'}, {name:'description',content:'A place for your thoughts, ideas, and reflections.'}, {property:'og:title',content:'Notes — A’mal'}, {property:'og:description',content:'A place for your thoughts, ideas, and reflections.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: NotesPage,
});
