export function getCorsHeaders(event?: any) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const allowOrigin =
    origin === 'http://localhost:3000'
      ? 'http://localhost:3000'
      : 'https://main.d26dxmzrzyc9st.amplifyapp.com';

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Idempotency-Key',
  };
}

export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://main.d26dxmzrzyc9st.amplifyapp.com',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Idempotency-Key',
};
