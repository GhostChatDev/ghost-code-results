import type { RawAiTask } from "../src/lib/core/ai";

export const ANCHOR = "2025-01-06T12:00:00.000Z"; // Monday, 07:00 in New York.
export const task = (text: string, source_quote: string, proposed_due: string | null = null, proposed_reminder: string | null = null, needs_clarification = false, ambiguity_note: string | null = null): RawAiTask =>
  ({ text, source_quote, proposed_due, proposed_reminder, needs_clarification, ambiguity_note });
export interface Sample {
  name: string;
  text: string;
  raw: { title: string; tasks: RawAiTask[] } | unknown;
  count: number;
  due?: string | null;
  reminder?: string | null;
  clarification?: boolean;
}

/** Exactly 30 representative notes. Every expected result is explicit; no live model is used. */
export const samples: Sample[] = [
  { name: "rent with amount and exact relative time", text: "Pay rent $1,200 tomorrow at 9am.", raw: { title: "Pay rent", tasks: [task("Pay rent $1,200", "Pay rent $1,200 tomorrow at 9am.", "tomorrow at 9am")] }, count: 1, due: "2025-01-07T14:00:00.000Z", reminder: null },
  { name: "weekday call", text: "Call dentist Friday at 2pm.", raw: { title: "Call dentist", tasks: [task("Call dentist", "Call dentist Friday at 2pm.", "Friday at 2pm")] }, count: 1, due: "2025-01-10T19:00:00.000Z", reminder: null },
  { name: "appointment", text: "Doctor appointment on 2025-02-20 at 15:30.", raw: { title: "Doctor", tasks: [task("Doctor appointment", "2025-02-20 at 15:30", "2025-02-20 at 15:30")] }, count: 1, due: "2025-02-20T20:30:00.000Z", reminder: null },
  { name: "date without time", text: "Pay electricity $80 on 2025-02-01.", raw: { title: "Electricity", tasks: [task("Pay electricity $80", "Pay electricity $80 on 2025-02-01.", "2025-02-01")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "separate reminder", text: "Remind me to pay rent $1,200 tomorrow at 9am.", raw: { title: "Rent", tasks: [task("Pay rent $1,200", "tomorrow at 9am", "tomorrow at 9am", "tomorrow at 9am")] }, count: 1, due: "2025-01-07T14:00:00.000Z", reminder: "2025-01-07T14:00:00.000Z" },
  { name: "tomorrow without time", text: "Email Sam tomorrow.", raw: { title: "Email Sam", tasks: [task("Email Sam", "Email Sam tomorrow.", "tomorrow")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "afternoon needs time", text: "Thursday afternoon: submit report.", raw: { title: "Report", tasks: [task("Submit report", "Thursday afternoon", "Thursday afternoon", null, true, "Choose an exact time.")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "after payday", text: "Check budget after payday.", raw: { title: "Budget", tasks: [task("Check budget", "after payday", "after payday")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "completed rent", text: "I paid rent yesterday.", raw: { title: "Paid rent", tasks: [] }, count: 0 },
  { name: "no task", text: "Buy flowers.", raw: { title: "Flowers", tasks: [] }, count: 0 },
  { name: "ambiguous numeric date", text: "Meeting 03/04 with Alex.", raw: { title: "Meeting", tasks: [task("Meeting with Alex", "03/04", "03/04", null, true, "Is this March 4 or April 3?")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "Friday without time", text: "Renew passport on Friday.", raw: { title: "Passport", tasks: [task("Renew passport", "on Friday", "Friday")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "noon and cents", text: "Pay $45.50 for lunch tomorrow at noon.", raw: { title: "Lunch", tasks: [task("Pay $45.50 for lunch", "tomorrow at noon", "tomorrow at noon")] }, count: 1, due: "2025-01-07T17:00:00.000Z", reminder: null },
  { name: "today exact time", text: "Call Mom at 6pm.", raw: { title: "Call Mom", tasks: [task("Call Mom", "at 6pm", "at 6pm")] }, count: 1, due: "2025-01-06T23:00:00.000Z", reminder: null },
  { name: "prescription", text: "Pick up prescription on 2025-02-03 at 8:05.", raw: { title: "Prescription", tasks: [task("Pick up prescription", "2025-02-03 at 8:05", "2025-02-03 at 8:05")] }, count: 1, due: "2025-02-03T13:05:00.000Z", reminder: null },
  { name: "amount is not a task", text: "Rent is $1,500.", raw: { title: "Rent amount", tasks: [] }, count: 0 },
  { name: "completed call", text: "I called the dentist this morning.", raw: { title: "Called dentist", tasks: [] }, count: 0 },
  { name: "next Friday", text: "Submit invoice next Friday at 4pm.", raw: { title: "Invoice", tasks: [task("Submit invoice", "next Friday at 4pm", "next Friday at 4pm")] }, count: 1, due: "2025-01-17T21:00:00.000Z", reminder: null },
  { name: "relative unsupported duration stays unscheduled", text: "Pay internet bill in two days.", raw: { title: "Internet", tasks: [task("Pay internet bill", "in two days", "in two days")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "team lunch", text: "Team lunch on 2025-02-14 at 12:30.", raw: { title: "Lunch", tasks: [task("Team lunch", "2025-02-14 at 12:30", "2025-02-14 at 12:30")] }, count: 1, due: "2025-02-14T17:30:00.000Z", reminder: null },
  { name: "repeating request remains only a task suggestion", text: "Water plants every Saturday.", raw: { title: "Plants", tasks: [task("Water plants", "every Saturday")] }, count: 1, due: null, reminder: null },
  { name: "library deadline", text: "Return library book by 2025-02-05 at 17:00.", raw: { title: "Library", tasks: [task("Return library book", "2025-02-05 at 17:00", "2025-02-05 at 17:00")] }, count: 1, due: "2025-02-05T22:00:00.000Z", reminder: null },
  { name: "next month stays unscheduled", text: "Rent $900 due next month.", raw: { title: "Rent", tasks: [task("Pay rent $900", "next month", "next month")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "sometime next week", text: "Call plumber sometime next week.", raw: { title: "Plumber", tasks: [task("Call plumber", "sometime next week", "next week")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "tomorrow morning needs time", text: "Dentist tomorrow morning.", raw: { title: "Dentist", tasks: [task("Dentist", "tomorrow morning", "tomorrow morning", null, true, "Choose an exact time.")] }, count: 1, due: null, reminder: null, clarification: true },
  { name: "date across DST", text: "Tax payment of $700 on 2025-04-15 at 10:00.", raw: { title: "Tax", tasks: [task("Pay $700 tax", "2025-04-15 at 10:00", "2025-04-15 at 10:00")] }, count: 1, due: "2025-04-15T14:00:00.000Z", reminder: null },
  { name: "card amount", text: "Pay card bill on 2025-02-28 at 09:00, $200.", raw: { title: "Card", tasks: [task("Pay $200 card bill", "2025-02-28 at 09:00", "2025-02-28 at 09:00")] }, count: 1, due: "2025-02-28T14:00:00.000Z", reminder: null },
  { name: "reflection", text: "Vacation was great.", raw: { title: "Vacation", tasks: [] }, count: 0 },
  { name: "completed report", text: "Finished the report on Friday.", raw: { title: "Report", tasks: [] }, count: 0 },
  { name: "no actionable task", text: "Note to self: remember the milk.", raw: { title: "Milk", tasks: [] }, count: 0 },
];
