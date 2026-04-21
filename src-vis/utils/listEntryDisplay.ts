/**
 * Role-based display logic for list widget entries.
 * Maps ioBroker state roles to semantic labels + colors,
 * mirroring the behaviour of dedicated widgets (WindowContactWidget, BinarySensorWidget).
 */

export interface RoleDisplay {
  label: string;
  color: string;
}

function isOn(val: unknown): boolean {
  if (val === true || val === 1) return true;
  if (typeof val === 'string') return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
  return false;
}

/**
 * Returns role-specific label+color for binary/contact sensors, or null if the
 * role should be rendered as a regular switch toggle / value.
 */
export function getRoleDisplay(role: string | undefined, val: unknown): RoleDisplay | null {
  const r = (role ?? '').toLowerCase();
  const on = isOn(val);

  // Window / door contacts
  if (r === 'sensor.window' || r === 'window' || r === 'sensor.door' || r === 'door') {
    return on
      ? { label: 'Geöffnet',    color: 'var(--accent-red, #ef4444)' }
      : { label: 'Geschlossen', color: 'var(--accent-green)'        };
  }

  // Motion / presence
  if (r === 'motion' || r.startsWith('sensor.motion') || r.includes('presence')) {
    return on
      ? { label: 'Bewegung', color: '#f59e0b'              }
      : { label: 'Ruhig',    color: 'var(--accent-green)'  };
  }

  // Smoke / fire alarm
  if (r.startsWith('sensor.alarm') || r.includes('smoke') || r.includes('alarm.fire')) {
    return on
      ? { label: 'Alarm!', color: 'var(--accent-red, #ef4444)' }
      : { label: 'OK',     color: 'var(--accent-green)'        };
  }

  // Flood / water
  if (r.includes('flood') || r.includes('water')) {
    return on
      ? { label: 'Wasser!',  color: 'var(--accent-red, #ef4444)' }
      : { label: 'Trocken',  color: 'var(--accent-green)'        };
  }

  // Vibration
  if (r.includes('vibration')) {
    return on
      ? { label: 'Vibration', color: '#f59e0b'              }
      : { label: 'Ruhig',     color: 'var(--accent-green)'  };
  }

  // Doorbell
  if (r.includes('doorbell') || r.includes('bell')) {
    return on
      ? { label: 'Klingelt', color: '#f59e0b'                   }
      : { label: 'Ruhig',    color: 'var(--text-secondary)'     };
  }

  // Generic sensor.* read indicators (not alarm) – show active/inactive
  if (r.startsWith('sensor.') || r.startsWith('indicator.')) {
    return on
      ? { label: 'Aktiv',   color: 'var(--accent-green)'    }
      : { label: 'Inaktiv', color: 'var(--text-secondary)'  };
  }

  return null; // use default toggle / value display
}
