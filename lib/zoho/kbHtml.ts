const DANGEROUS_BLOCKS = ['script', 'style', 'iframe', 'object', 'embed', 'form']

export function removeStrongTags(html: string): string {
  return html.replace(/<\/?strong\b[^>]*>/gi, '')
}

export function sanitizeKnowledgeHtml(html: string): string {
  let sanitized = removeStrongTags(html.trim())

  for (const tag of DANGEROUS_BLOCKS) {
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }

  return sanitized
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
}

export function containsStrongTag(html: string): boolean {
  return /<\/?strong\b/i.test(html)
}
