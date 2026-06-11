import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import AppointmentsEditor from '../../components/settings/AppointmentsEditor';
import { Appointment } from '../../utils/userData';

// Controlled wrapper so the editor reflects onChange like in SettingsPopup.
function Harness({ initial = [] as Appointment[] }) {
  const [appointments, setAppointments] = useState<Appointment[]>(initial);
  return (
    <AppointmentsEditor
      appointments={appointments}
      onChange={setAppointments}
    />
  );
}

describe('AppointmentsEditor', () => {
  test('adds an appointment then a phrase to it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(
      screen.getByPlaceholderText('New appointment…'),
      'Doctor visit',
    );
    await user.click(screen.getByRole('button', { name: /Add/i }));

    // The appointment title input now exists with that value.
    expect(screen.getByDisplayValue('Doctor visit')).toBeInTheDocument();

    // Add a phrase to it. The phrase "Add" button (inside the card) comes
    // before the bottom "new appointment" Add button in the DOM.
    await user.type(
      screen.getByPlaceholderText('Add a phrase…'),
      'Hello doctor',
    );
    const addButtons = screen.getAllByRole('button', { name: /Add/i });
    await user.click(addButtons[0]);

    expect(screen.getByText('Hello doctor')).toBeInTheDocument();
  });

  test('removes an appointment', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ title: 'Call', phrases: [] }]} />);

    expect(screen.getByDisplayValue('Call')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByDisplayValue('Call')).not.toBeInTheDocument();
  });
});
