// Test helper: books `input` into a slot at exactly input.pujaDate (creating a
// roomy slot there if needed), as an admin would. Defaults the booking time to a
// week before the puja so tests don't depend on today's date.
import { createBooking } from '../lib/bookings-service.js';
import { createSlots } from '../lib/slots-service.js';
import { istDay } from '../lib/workflow.js';

export async function slotFor(repo, templeName, pujaDate, capacity = 50) {
  const at = new Date(pujaDate);
  const [existing] = await repo.findSlots({ templeName, startsAt: { $gte: at, $lte: at } });
  if (existing) return existing;
  const time = new Date(at.getTime() + 330 * 60 * 1000).toISOString().slice(11, 16);
  const { created } = await createSlots(
    repo,
    { templeName, from: istDay(at), to: istDay(at), times: [time], durationMinutes: 60, capacity },
    { now: new Date(0) },
  );
  return created[0];
}

export async function bookInSlot(repo, input, opts = {}) {
  const slot = await slotFor(repo, input.templeName, input.pujaDate);
  const at = opts.at ?? new Date(new Date(input.pujaDate).getTime() - 7 * 24 * 60 * 60 * 1000);
  return createBooking(repo, { ...input, slotId: slot.id }, { ...opts, at });
}
