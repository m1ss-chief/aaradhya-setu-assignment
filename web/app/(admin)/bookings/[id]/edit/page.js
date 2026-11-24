'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import BookingForm from '@/components/booking-form.js';
import { Icon } from '@/components/icons.js';
import { StatusBadge, ErrorNote, api } from '@/components/ui.js';

export default function EditBookingPage() {
  const { id } = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/bookings/${id}`)
      .then((d) => setBooking(d.booking))
      .catch((e) => setError(e.message));
  }, [id]);

  async function save(changes) {
    await api(`/api/bookings/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    router.push(`/bookings/${id}?saved=1`);
  }


  return (
    <div className="narrow">
      <Link href={`/bookings/${id}`} className="back-link">
        <Icon name="arrowLeft" size={16} /> Back to {id}
      </Link>
      <div className="page-head">
        <div>
          <h1>Edit booking</h1>
          <p className="muted mono">{id}</p>
        </div>
        {booking && <StatusBadge status={booking.status} />}
      </div>
      <ErrorNote error={error} />
      {booking ? (
        <>
          <p className="info-note">
            Status is changed from the booking page through the workflow, and the time through Reschedule, so the devotee is always told.
          </p>
          <BookingForm
            booking={booking}
            submitLabel="Save changes"
            savingLabel="Saving…"
            onSubmit={save}
            onCancel={() => router.push(`/bookings/${id}`)}
          />
        </>
      ) : (
        !error && (
          <div className="card">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )
      )}
    </div>
  );
}
