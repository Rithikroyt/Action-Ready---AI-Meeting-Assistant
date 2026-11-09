// Find this meeting's tab in the spreadsheet, or plan ONE batchUpdate that creates it fully set up: header row,
// frozen header, a Status dropdown, and warning-only protection on every column except Status and Update note.
// (Sheet protection is a guard against accidental edits, not a confidentiality boundary.)
const plan = $('Plan Tracker Publication').first().json;
const r = $input.first().json || {};
const HEADERS = ['Task ID', 'Meeting', 'Owner', 'Email', 'Task', 'Due wording', 'Due date', 'Estimate (h)', 'Status', 'Update note', 'Case ID', 'Version', 'Approval state', 'Email state', 'Last synced'];
const fail = (message) => [{ json: { action: 'RESPOND', http_status: 502, response_body: { schema_version: '1', job_id: plan.job_id, version: plan.version, tracker_status: 'FAILED', error: { code: 'SHEET_UNAVAILABLE', message } } } }];
if (r.error || r.statusCode !== 200 || !r.body || !Array.isArray(r.body.sheets)) {
  const st = r.statusCode ? ' (HTTP ' + r.statusCode + ')' : '';
  return fail('The Google Sheet could not be read' + st + '. Check the Google Sheets credential and that it can open the tracker. Nothing was published.');
}
const tabs = r.body.sheets.map((s) => s.properties || {});
const read_url = plan.base + '/values/' + encodeURIComponent("'" + plan.tab + "'!A1:O500");
const found = tabs.find((t) => t.title === plan.tab);
if (found) return [{ json: { action: 'EXISTS', tab: plan.tab, sheet_id: found.sheetId, read_url } }];
const used = new Set(tabs.map((t) => t.sheetId));
let sheetId = 1000 + Math.floor(Math.random() * 1e9);
while (used.has(sheetId)) sheetId += 1;
const range = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
const request_body = {
  requests: [
    { addSheet: { properties: { sheetId, title: plan.tab, gridProperties: { rowCount: 500, columnCount: 15, frozenRowCount: 1 } } } },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [{ values: HEADERS.map((h) => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.91, blue: 1 } } })) }],
        fields: 'userEnteredValue,userEnteredFormat(textFormat,backgroundColor)',
      },
    },
    {
      setDataValidation: {
        range: range(1, 500, 8, 9),
        rule: { condition: { type: 'ONE_OF_LIST', values: plan.settings.statuses.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
      },
    },
    { addProtectedRange: { protectedRange: { range: range(0, 1, 0, 15), description: 'ActionReady header (managed by the workflow)', warningOnly: true } } },
    { addProtectedRange: { protectedRange: { range: range(1, 500, 0, 8), description: 'ActionReady task fields (managed by the workflow)', warningOnly: true } } },
    { addProtectedRange: { protectedRange: { range: range(1, 500, 10, 15), description: 'ActionReady approval and sync fields (managed by the workflow)', warningOnly: true } } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 360 }, fields: 'pixelSize' } },
  ],
};
return [{ json: { action: 'CREATE', tab: plan.tab, sheet_id: sheetId, read_url, create_url: plan.base + ':batchUpdate', request_body } }];
