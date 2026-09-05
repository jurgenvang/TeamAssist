// Kleine hulpjes rond Request en Response. Bewust dun: alles wat hier bij komt,
// komt in elke route terecht.

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

export function fout(status, boodschap, extra = {}) {
  return json({ fout: boodschap, ...extra }, status);
}

export async function leesJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Een pad opdelen zonder lege stukken, zodat '/api/mij/' en '/api/mij'
// hetzelfde opleveren.
export function paddelen(pad) {
  return pad.split('/').filter(Boolean);
}
