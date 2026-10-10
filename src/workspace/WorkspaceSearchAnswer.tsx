import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { richMarkdownComponents } from '@/components/richMarkdown';

/** Keep tables, code, diagrams and media consistent with the original reply. */
export default function WorkspaceSearchAnswer({ content }: { content: string }) {
  return <div className="wsw-answer"><ReactMarkdown remarkPlugins={[remarkGfm]} components={richMarkdownComponents}>{content}</ReactMarkdown></div>;
}
