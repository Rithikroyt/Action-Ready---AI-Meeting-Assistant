// WEEK 4 DISPATCH SETTINGS — the only place sending is switched on. Keep send_enabled false until the owner
// explicitly authorizes live sending. Recipients must match an allowed domain or an exact allowed address.
const settings = {
  send_enabled: false,
  allowed_recipient_domains: ['asu.edu'],
  allowed_recipient_addresses: [], // exact addresses, lower-case, e.g. a personal test inbox
  max_recipients: 10,
};
const req = $input.first().json || {};
return [{ json: { settings, body: req.body } }];
