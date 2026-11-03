// Pure mapping from a synthetic example to the New Meeting form's real (controlled) field values.
// Used for both ?example= on first render and the "load example" buttons, so the two can never drift apart.
export interface ExampleSource {
  notes: string;
  period: { start: string; end: string };
  timezone: string;
}

export interface MeetingFormValues {
  notes: string;
  period_start: string;
  period_end: string;
  timezone: string;
}

export const exampleFormState = (e: ExampleSource): MeetingFormValues => ({
  notes: e.notes,
  period_start: e.period.start,
  period_end: e.period.end,
  timezone: e.timezone,
});

/** Placeholder shown in the empty notes box: phrased as a hint so it is never mistaken for entered notes. */
export const NOTES_PLACEHOLDER =
  "Paste the complete meeting notes here, or load a synthetic example.\n\nInclude owners, deadlines and estimated hours, for example:\n“Maya will prepare the demo walkthrough by Friday, estimated 4 hours.”";
