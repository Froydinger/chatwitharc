export interface GeneratedFile {
  id: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize?: number;
  mimeType?: string;
  prompt?: string;
  createdAt: Date;
  downloadedCount?: number;
}

export type FileType = 'pdf' | 'docx' | 'txt' | 'xlsx' | 'csv' | 'json' | 'xml' | 'html' | 'md';

export const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  txt: '📃',
  xlsx: '📊',
  csv: '📊',
  json: '{}',
  xml: '<>',
  html: '🌐',
  md: '📝',
  default: '📁'
};

export const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: 'from-red-500/20 to-red-600/20',
  docx: 'from-blue-500/20 to-blue-600/20',
  txt: 'from-gray-500/20 to-gray-600/20',
  xlsx: 'from-green-500/20 to-green-600/20',
  csv: 'from-green-500/20 to-green-600/20',
  json: 'from-yellow-500/20 to-yellow-600/20',
  xml: 'from-purple-500/20 to-purple-600/20',
  html: 'from-orange-500/20 to-orange-600/20',
  md: 'from-indigo-500/20 to-indigo-600/20',
  default: 'from-muted/20 to-muted/30'
};
