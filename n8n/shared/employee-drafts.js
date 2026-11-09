// WEEK 4 EMPLOYEE DRAFTS (shared): one fixed-template email per action owner, built ONLY from the reviewed
// version's validated actions. No model call. Identical copies live in Build Job Result and Authorize Dispatch,
// so the website previews exactly what the dispatcher will accept. Parity: web/src/lib/employeeDrafts.ts.
function employeeDrafts(cand, caseId, version) {
  const clean = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const title = clean(cand && cand.meeting_title, 150) || 'our recent meeting';
  const acts = (cand && Array.isArray(cand.actions) ? cand.actions : []).slice(0, 30);
  const groups = [];
  for (const a of acts) {
    const owner = clean(a && a.owner, 120);
    const task = clean(a && a.task, 300);
    if (!owner || !task) continue;
    let g = groups.find((x) => x.key === owner.toLowerCase());
    if (!g) groups.push((g = { key: owner.toLowerCase(), employee: owner, items: [] }));
    g.items.push({ id: clean(a.id, 20) || null, task, due: clean(a.due_text, 120), hours: typeof a.estimated_hours === 'number' && isFinite(a.estimated_hours) ? a.estimated_hours : null });
  }
  return groups.slice(0, 12).map((g) => {
    const n = g.items.length;
    const known = g.items.filter((i) => i.hours !== null);
    const total = Math.round(known.reduce((s, i) => s + i.hours, 0) * 100) / 100;
    const lines = g.items.map((i) => '- ' + i.task + (i.due ? ' (due: ' + i.due + ')' : ' (no due date given)') + (i.hours !== null ? ', estimated ' + i.hours + ' h' : ''));
    const body = [
      'Hi ' + g.employee.split(' ')[0] + ',',
      '',
      (n === 1 ? 'Here is the action item assigned to you' : 'Here are the ' + n + ' action items assigned to you') + ' in ' + title + ':',
      '',
      ...lines,
      '',
      known.length === n ? 'Total estimated effort: ' + total + ' h.' : 'Estimated effort is known for ' + known.length + ' of ' + n + ' items (' + total + ' h so far).',
      '',
      'These items were taken from the meeting notes, checked by ActionReady (AI review plus a capacity check), and approved by the organizer before this email was sent. If anything is wrong or unclear, please reply to this email.',
      '',
      'Reference: ' + caseId + ', version ' + version,
    ].join('\n');
    return { employee: g.employee, subject: 'Your action items: ' + title, body, action_ids: g.items.map((i) => i.id).filter(Boolean), action_count: n };
  });
}
