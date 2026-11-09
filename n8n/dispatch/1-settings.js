// WEEK 4 DISPATCH SETTINGS — the only place sending is switched on. send_enabled was switched on by the owner's
// explicit authorization on 2026-11-09; set it back to false to stop all sending immediately. Recipients are typed by the approver and become part of what is approved.
// allow_any_recipient=false restricts them to the domains/addresses below. daily_send_cap limits total messages
// per UTC day (SENT, SENDING and UNCERTAIN all count), so a misuse can never become a mail flood.
const settings = {
  send_enabled: true,
  allow_any_recipient: true,
  allowed_recipient_domains: ['asu.edu'],
  allowed_recipient_addresses: [], // exact addresses, lower-case
  max_recipients: 10,
  daily_send_cap: 25,
};
const req = $input.first().json || {};
return [{ json: { settings, body: req.body } }];
