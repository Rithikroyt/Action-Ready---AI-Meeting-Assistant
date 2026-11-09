// Gmail's response decides the recorded state. "SENT" means Gmail accepted the message — not delivered or read.
const a = $('Confirm Dispatch Claim').first().json;
const out = $input.first().json || {};
const id = typeof out.id === 'string' && out.id ? out.id : null;
if (id) return [{ json: { ...a, status: 'SENT', gmail_message_id: id, error_detail: '' } }];
const err = String((out.error && (out.error.message || out.error.description)) || out.message || 'Gmail did not return a message ID.').slice(0, 300);
const uncertain = /time.?out|ETIMEDOUT|ECONNRESET|socket hang up|EAI_AGAIN|\b50[234]\b/i.test(err);
return [{ json: { ...a, status: uncertain ? 'UNCERTAIN' : 'FAILED', gmail_message_id: '', error_detail: err } }];
