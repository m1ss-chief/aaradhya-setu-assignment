'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BookingForm from '@/components/booking-form.js';
import { Icon } from '@/components/icons.js';
import { useAdmin, NoAccess } from '@/components/admin-context.js';
import { api } from '@/components/ui.js';

export default function NewBookingPage() {
  const router = useRouter();
  const { can } = useAdmin();
  if (!can('bookings:create')) return <NoAccess what="create bookings" />;

  async function create(form) {
    const { booking } = await api('/api/bookings', { method: 'POST', body: JSON.stringify(form) });
    router.push(`/bookings/${booking.bookingId}`);
  }

  return (
    <div className="narrow">
      <Link href="/bookings" className="back-link">
        <Icon name="arrowLeft" size={16} /> All bookings
      </Link>
      <div className="page-head">
        <div>
          <h1>New booking</h1>
          <p className="muted">For phone or walk-in bookings. Shopify orders are added automatically.</p>
        </div>
      </div>
      <BookingForm submitLabel="Create booking" savingLabel="Creating…" onSubmit={create} onCancel={() => router.push('/bookings')} />
    </div>
  );
}
