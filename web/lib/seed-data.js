// Dummy data for the demo (the assignment allows dummy data).
// Deterministic, so every reviewer sees the same dashboard, and each booking's
// status matches its puja date (future pujas are not "In Progress").

const DEVOTEES = [
  ['Ananya Sharma', '+91 98765 43210'], ['Rohit Verma', '+91 98111 22334'], ['Priya Iyer', '+91 99000 11223'],
  ['Karan Mehta', '+91 97654 32109'], ['Sneha Reddy', '+91 90000 54321'], ['Arjun Nair', '+91 93456 78901'],
  ['Kavya Joshi', '+91 98989 89898'], ['Vikram Singh', '+91 91234 56789'], ['Meera Pillai', '+91 94444 33221'],
  ['Aditya Kulkarni', '+91 95555 12345'], ['Pooja Agarwal', '+91 96666 98765'], ['Rahul Gupta', '+91 97777 45678'],
  ['Divya Menon', '+91 98888 23456'], ['Suresh Patel', '+91 99999 87654'], ['Neha Chauhan', '+91 90123 45678'],
  ['Manish Tiwari', '+91 91111 22222'], ['Lakshmi Rao', '+91 92222 33333'], ['Harsh Bansal', '+91 93333 44444'],
  ['Ishita Das', '+91 94567 89012'], ['Gaurav Mishra', '+91 95678 90123'],
];

export const PUJAS = [
  { pujaName: 'Rudrabhishek', templeName: 'Kashi Vishwanath, Varanasi', amount: 2100 },
  { pujaName: 'Maha Mrityunjaya Jaap', templeName: 'Mahakaleshwar, Ujjain', amount: 5100 },
  { pujaName: 'Satyanarayan Katha', templeName: 'ISKCON, Hyderabad', amount: 1100 },
  { pujaName: 'Lakshmi Puja', templeName: 'Mahalakshmi Temple, Mumbai', amount: 1501 },
  { pujaName: 'Navagraha Shanti', templeName: 'Suryanar Kovil, Kumbakonam', amount: 3100 },
  { pujaName: 'Kaal Sarp Dosh Nivaran', templeName: 'Trimbakeshwar, Nashik', amount: 4100 },
];

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// Where a booking should be in the workflow, given how far away its puja is.
function statusFor(daysFromToday, i) {
  if (daysFromToday >= 5) return i % 2 ? 'Confirmed' : 'Pending';
  if (daysFromToday >= 1) return 'Confirmed';
  if (daysFromToday === 0) return 'In Progress';
  if (daysFromToday >= -3) return i % 2 ? 'Completed' : 'In Progress';
  return i % 2 ? 'Video Available' : 'Completed';
}

export function buildSeedBookings(now = new Date()) {
  return DEVOTEES.map(([devoteeName, phone], i) => {
    const puja = PUJAS[(i * 7) % PUJAS.length];
    const daysFromToday = ((i * 8) % 21) - 10; // spread over the last 10 and next 10 days
    const pujaDate = new Date(now.getTime() + daysFromToday * DAY);
    pujaDate.setUTCHours(4, 30, 0, 0); // 10:00 IST
    const targetStatus = statusFor(daysFromToday, i);
    // Booked 6-9 days before the puja, but never in the future.
    const createdAt = new Date(
      Math.min(pujaDate.getTime() - (6 + (i % 4)) * DAY, now.getTime() - 3 * HOUR - i * 10 * 60 * 1000),
    );
    const notAfterNow = (t) => new Date(Math.min(t, now.getTime() - 5 * 60 * 1000));
    // Realistic timestamps for each step, used to backdate the demo history.
    const stepTimes = {
      Pending: createdAt,
      Confirmed: new Date(createdAt.getTime() + 2 * HOUR),
      'In Progress': notAfterNow(Math.max(pujaDate.getTime(), createdAt.getTime() + 3 * HOUR)),
      Completed: notAfterNow(pujaDate.getTime() + 3 * HOUR),
      'Video Available': notAfterNow(pujaDate.getTime() + 26 * HOUR),
    };
    return {
      input: {
        devoteeName,
        phone,
        email: `${devoteeName.split(' ')[0].toLowerCase()}@example.com`,
        gotra: ['Kashyap', 'Bharadwaj', 'Vashishtha', 'Gautam'][i % 4],
        ...puja,
        amount: puja.amount + (i % 3 === 0 ? 251 : 0),
        addOns: i % 3 === 0 ? [{ name: 'Diya & Chunari offering', price: 251, quantity: 1 }] : [],
        pujaDate,
      },
      targetStatus,
      stepTimes,
    };
  });
}
