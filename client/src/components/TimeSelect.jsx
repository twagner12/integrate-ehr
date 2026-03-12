// Reusable time slot selector component
// Generates options from 7:00 AM to 8:00 PM in 15-minute increments

export function generateTimeSlots() {
  const slots = [];
  for (let h = 7; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 20 && m > 0) break;
      const hour24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const hour12h = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12h}:${String(m).padStart(2, '0')} ${ampm}`;
      slots.push({ value: hour24, label });
    }
  }
  return slots;
}

export function addMinutes(time24, minutes) {
  const [h, m] = time24.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function TimeSelect({ value, onChange, className }) {
  const slots = generateTimeSlots();
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Select time</option>
      {slots.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}
