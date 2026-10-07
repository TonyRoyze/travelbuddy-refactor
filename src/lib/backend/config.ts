export function documentDatabaseUrl(value = process.env.DOCUMENT_DATABASE_URL): string {
  if (!value) throw new Error('DOCUMENT_DATABASE_URL is required for the document backend.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('DOCUMENT_DATABASE_URL must be a PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error('DOCUMENT_DATABASE_URL must name a PostgreSQL host and database.');
  }
  if (url.searchParams.getAll('schema').length !== 1 || url.searchParams.get('schema') !== 'travelbuddy_backend') {
    throw new Error('DOCUMENT_DATABASE_URL must use schema=travelbuddy_backend to isolate the legacy database.');
  }
  return value;
}
