/**
 * Cloudflare Worker — proxy de leitura do Google Sheets
 * Dashboards B16
 *
 * Evolução do worker do CNP0426: ganha o lançamento "maestro" e o parâmetro
 * `cols`, que recorta as colunas ANTES de responder. Isso existe por dois
 * motivos, nesta ordem:
 *   1. privacidade — a base Kiwify tem nome, e-mail, CPF, telefone e IP, e o
 *      dashboard é público. O que não sai daqui não vaza.
 *   2. peso — a aba do Maestro tem ~6,5 MB; as 7 colunas do dash dão ~9 KB.
 *
 * SECRETS (Settings > Variables and Secrets):
 *   SHEET_ID_0426    → CNP0426
 *   SHEET_ID_0726    → 1Zq9mh_3ZSDlM9NeXPLGQ_ArkjpLLt0PiSwlS07LFQng
 *   SHEET_ID_MAESTRO → 1J_BryoZCsXPP-O9rJqrg1tqIMMpOIIOqoy1sno6Oz2k
 *   GOOGLE_SA_KEY    → JSON completo da Service Account GCP
 *
 * A service account precisa de acesso de leitura à planilha do Maestro.
 * Hoje ela lê porque a planilha está pública; se fechar a planilha,
 * compartilhar com o e-mail da SA antes.
 *
 * USO:
 *   ?sheet=Dados Meta Ads&lancamento=0426
 *   ?sheet=kiwify_todos_produtos&lancamento=maestro&cols=C,D,S,Y,AT,AW,BS
 */

const ALLOWED_SHEETS = [
  'Dados Meta Ads',
  'Elementor',
  'Pesquisa',
  'Pesquisa Compradores',
  'Planejamento',
  'Dados Google Ads',
  'Página1',
  'Metas Vendas',
  'Abandonos',
  'kiwify_todos_produtos',
];

const ALLOWED_ORIGINS = [
  'https://suporteb16-collab.github.io',
  'https://henriquecardosos96.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const SHEET_IDS = {
  '0426':    (env) => env.SHEET_ID_0426 || env.SHEET_ID,
  '0726':    (env) => env.SHEET_ID_0726,
  'maestro': (env) => env.SHEET_ID_MAESTRO,
};

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

async function getAccessToken(saKeyJson) {
  const sa = JSON.parse(saKeyJson);
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const enc = (obj) => btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const pemNorm = sa.private_key.replace(/\\n/g, '\n').replace(/\\r/g, '');
  const pemBody = pemNorm
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signingInput}.${sigB64}`;
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) throw new Error('Falha ao obter access_token: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

/** "AT" -> 45 (índice 0-based da coluna) */
function colToIndex(letters) {
  let n = 0;
  const s = String(letters).trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(s)) return -1;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function csvEscape(cell) {
  const s = String(cell === null || cell === undefined ? '' : cell);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

async function fetchSheetAsCSV(sheetId, sheetName, accessToken, cols) {
  const range = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Sheets error ${resp.status} para aba "${sheetName}": ${errText}`);
  }
  const data = await resp.json();
  let rows = data.values || [];
  if (rows.length === 0) return '';

  // Recorte de colunas: nada fora de `cols` sai do worker.
  if (cols && cols.length) {
    rows = rows.map(row => cols.map(i => row[i]));
  }
  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders });

    const fail = (msg, status) => new Response(
      JSON.stringify({ error: msg }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const url        = new URL(request.url);
    const sheet      = url.searchParams.get('sheet');
    const lancamento = url.searchParams.get('lancamento') || '0426';
    const colsParam  = url.searchParams.get('cols');

    if (!sheet || !ALLOWED_SHEETS.includes(sheet))
      return fail('Aba não autorizada: ' + sheet, 400);

    let cols = null;
    if (colsParam) {
      cols = colsParam.split(',').map(colToIndex);
      if (cols.some(i => i < 0)) return fail('Parâmetro cols inválido: ' + colsParam, 400);
    }

    const resolve = SHEET_IDS[lancamento];
    const sheetId = resolve ? resolve(env) : null;
    if (!sheetId) return fail('SHEET_ID não configurado para lançamento: ' + lancamento, 500);

    try {
      const saRaw = typeof env.GOOGLE_SA_KEY === 'string'
        ? env.GOOGLE_SA_KEY : JSON.stringify(env.GOOGLE_SA_KEY);
      const accessToken = await getAccessToken(saRaw);
      const csv = await fetchSheetAsCSV(sheetId, sheet, accessToken, cols);
      return new Response(csv, {
        headers: { ...corsHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } catch (err) {
      console.error('[Worker]', err.message);
      return fail(err.message, 500);
    }
  },
};
