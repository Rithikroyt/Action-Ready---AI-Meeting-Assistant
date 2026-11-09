// Only the first recorded claim for a dispatch_key may send. A concurrent duplicate never sends.
const a = $('Authorize Dispatch').first().json;
const rows = $input.all().map((i) => i.json || {});
const stop = (http, code, message) => [{ json: { confirmed: false, http_status: http, response_body: { schema_version: '1', job_id: a.job_id, version: a.version, dispatch_status: 'REFUSED', error: { code, message } } } }];
if (rows.some((r) => r.error)) return stop(503, 'CLAIM_NOT_RECORDED', 'The send could not be recorded first, so nothing was sent.');
const mine = rows.filter((r) => r.dispatch_key === a.dispatch_key).sort((x, y) => (x.id || 0) - (y.id || 0));
if (!mine.length) return stop(503, 'CLAIM_NOT_RECORDED', 'The send could not be recorded first, so nothing was sent.');
if (mine[0].claim_id !== a.claim_id) return stop(409, 'DUPLICATE_IN_PROGRESS', 'Another request is already sending this exact message. Nothing was sent by this request.');
return [{ json: { ...a, confirmed: true } }];
