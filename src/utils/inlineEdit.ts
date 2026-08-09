export function normalizeInsertionText(text: string): string {
  return text.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '');
}

