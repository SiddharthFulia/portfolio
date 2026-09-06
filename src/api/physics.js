// Physics Lab — server-side heavy-compute wrappers.
//
// The BE expects a specific request shape (see sid-be/controllers/physics):
//   params:  { L1, L2, m1, m2, g }
//   initial: { t1, t2, w1, w2 }   (radians / rad·s⁻¹)
// plus lane-specific extras (duration, dt, epsilon, initials[]).

import { post } from './request';
import { ENDPOINTS } from './endpoints';

// High-fidelity simulate — { params, initial, duration, dt }.
// Server returns { series: [{t, t1, t2, w1, w2, K, V, E, x1, y1, x2, y2}] }.
export async function simulatePendulum({ params, initial, duration = 30, dt = 0.001 } = {}) {
  const r = await post(ENDPOINTS.PHYSICS_PENDULUM_SIMULATE, { params, initial, duration, dt });
  return r?.data ?? r;
}

// Phase portrait — { params, initials: [{t1,t2,w1,w2}, ...] }.
// Server returns { curves: [{ t1: [...], w1: [...] }, ...] }.
export async function phasePendulum({ params, initials, duration = 8, dt = 0.008 } = {}) {
  const r = await post(ENDPOINTS.PHYSICS_PENDULUM_PHASE, { params, initials, duration, dt });
  return r?.data ?? r;
}

// Lyapunov — { params, initial, duration, dt, epsilon }.
// Server returns { lyapunov, series: [{ t, sep }, ...] }.
export async function lyapunovPendulum({ params, initial, duration = 20, dt = 0.005, epsilon = 1e-8 } = {}) {
  const r = await post(ENDPOINTS.PHYSICS_PENDULUM_LYAPUNOV, { params, initial, duration, dt, epsilon });
  return r?.data ?? r;
}
