export function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' && value.length > 0 ? value : fallbackMessage, { cause: value });
}

