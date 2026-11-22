export type IcsBookingInput = {
  id: string;
  serviceName: string;
  providerName: string;
  clientName: string;
  clientEmail: string;
  startAt: string | Date;
  endAt: string | Date;
  createdAt?: string | Date;
  cancelled?: boolean;
};

function formatUtcStamp(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildBookingIcs(booking: IcsBookingInput): string {
  const dtStamp = formatUtcStamp(booking.createdAt ?? new Date());
  const dtStart = formatUtcStamp(booking.startAt);
  const dtEnd = formatUtcStamp(booking.endAt);
  const summary = escapeIcsText(`${booking.serviceName} — ${booking.providerName}`);
  const description = escapeIcsText(
    `Appointment for ${booking.clientName} (${booking.clientEmail}) with ${booking.providerName}.\nService: ${booking.serviceName}`
  );
  const status = booking.cancelled ? 'CANCELLED' : 'CONFIRMED';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hourglass Desk//Appointment Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@hourglassdesk.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n') + '\r\n';
}
