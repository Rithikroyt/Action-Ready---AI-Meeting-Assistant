// Final response. Never says "delivered"; an uncertain send is never retried automatically.
const r = $('Capture Send Result').first().json;
const saved = !$input.all().some((i) => i.json && i.json.error);
const base = { schema_version: '1', job_id: r.job_id, version: r.version, recipient_count: r.recipient_count, record_saved: saved };
if (r.status === 'SENT')
  return [{ json: { http_status: 200, response_body: { ...base, dispatch_status: 'SENT', gmail_message_id: r.gmail_message_id, note: 'Gmail accepted the message. Delivery and reading are not confirmed.' } } }];
if (r.status === 'UNCERTAIN')
  return [
    {
      json: {
        http_status: 504,
        response_body: { ...base, dispatch_status: 'UNCERTAIN', error: { code: 'DELIVERY_UNCERTAIN', message: 'Delivery status uncertain — check the Sent folder before retrying. Nothing will be resent automatically.' } },
      },
    },
  ];
return [{ json: { http_status: 502, response_body: { ...base, dispatch_status: 'FAILED', error: { code: 'SEND_FAILED', message: 'Gmail did not accept the message: ' + r.error_detail } } } }];
