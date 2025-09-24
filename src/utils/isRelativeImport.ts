export function isRelativeImport(id: string) {
  return id.startsWith('.') || id.startsWith('/');
}
