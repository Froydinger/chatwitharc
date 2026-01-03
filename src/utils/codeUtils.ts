// Shared utility functions for code-related operations

/**
 * Get display name for a programming language
 */
export function getLanguageDisplay(lang: string): string {
  const displayNames: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'tsx': 'React TSX',
    'jsx': 'React JSX',
    'python': 'Python',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'json': 'JSON',
    'sql': 'SQL',
    'bash': 'Shell',
    'shell': 'Shell',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'ruby': 'Ruby',
    'php': 'PHP',
    'csharp': 'C#',
    'cpp': 'C++',
    'c': 'C',
    'yaml': 'YAML',
    'yml': 'YAML',
    'markdown': 'Markdown',
    'md': 'Markdown',
    'xml': 'XML',
    'graphql': 'GraphQL',
    'dart': 'Dart',
    'scala': 'Scala',
    'lua': 'Lua',
    'perl': 'Perl',
    'r': 'R',
    'matlab': 'MATLAB',
    'latex': 'LaTeX',
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile',
  };
  return displayNames[lang.toLowerCase()] || lang.toUpperCase();
}

/**
 * Get a color class for the language badge
 */
export function getLanguageColor(lang: string): string {
  const colors: Record<string, string> = {
    'javascript': 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    'typescript': 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    'tsx': 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    'jsx': 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
    'python': 'bg-green-500/20 text-green-600 dark:text-green-400',
    'html': 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
    'css': 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
    'scss': 'bg-pink-500/20 text-pink-600 dark:text-pink-400',
    'json': 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
    'sql': 'bg-pink-500/20 text-pink-600 dark:text-pink-400',
    'go': 'bg-teal-500/20 text-teal-600 dark:text-teal-400',
    'rust': 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
    'java': 'bg-red-500/20 text-red-600 dark:text-red-400',
    'ruby': 'bg-red-500/20 text-red-600 dark:text-red-400',
    'php': 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
    'swift': 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
    'kotlin': 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
    'bash': 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
    'shell': 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
  };
  return colors[lang.toLowerCase()] || 'bg-muted text-muted-foreground';
}

/**
 * Get the file extension for a language
 */
export function getFileExtension(lang: string): string {
  const extensions: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    jsx: 'jsx',
    tsx: 'tsx',
    python: 'py',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    csharp: 'cs',
    php: 'php',
    ruby: 'rb',
    go: 'go',
    rust: 'rs',
    swift: 'swift',
    kotlin: 'kt',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yml',
    markdown: 'md',
    sql: 'sql',
    bash: 'sh',
    shell: 'sh',
    powershell: 'ps1',
    latex: 'tex',
    r: 'r',
    matlab: 'm',
    perl: 'pl',
    lua: 'lua',
    dart: 'dart',
    scala: 'scala',
    dockerfile: 'Dockerfile',
    makefile: 'Makefile',
  };
  return extensions[lang.toLowerCase()] || 'txt';
}

/**
 * Check if a language supports live preview
 */
export function canPreview(lang: string): boolean {
  const previewable = ['html', 'css', 'javascript', 'js', 'jsx', 'tsx', 'typescript'];
  return previewable.includes(lang.toLowerCase());
}

/**
 * Normalize language name for syntax highlighter
 */
export function normalizeLanguage(lang: string): string {
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'tsx': 'tsx',
    'jsx': 'jsx',
    'py': 'python',
    'rb': 'ruby',
    'rs': 'rust',
    'go': 'go',
    'sh': 'bash',
    'shell': 'bash',
    'yml': 'yaml',
    'md': 'markdown',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'sql': 'sql',
    'graphql': 'graphql',
    'swift': 'swift',
    'kotlin': 'kotlin',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'csharp': 'csharp',
    'cs': 'csharp',
    'php': 'php',
    'vue': 'javascript',
    'svelte': 'javascript',
  };
  return langMap[lang.toLowerCase()] || lang.toLowerCase();
}
