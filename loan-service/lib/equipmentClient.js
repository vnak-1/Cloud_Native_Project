// Talks to the equipment service. EQUIPMENT_URL points at the nginx load balancer
// (http://equipment-lb:8080 in Docker), so either replica can answer.
//
// fetch is built into Node. It rejects (throws) on a network error, and
// AbortSignal.timeout(3000) makes it give up after 3 seconds. The routes turn both into 503.
async function callEquipment(equipmentId, action) {
  const baseUrl = process.env.EQUIPMENT_URL.replace(/\/+$/, ''); // drop a trailing slash
  const res = await fetch(`${baseUrl}/internal/equipment/${equipmentId}/${action}`, {
    method: 'PATCH',
    headers: { 'x-internal-key': process.env.INTERNAL_KEY },
    signal: AbortSignal.timeout(3000),
  });

  // The body should be JSON. If it isn't (for example an nginx error page), use {}.
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

module.exports = {
  // Take one unit (when a loan is created)
  reserve: (equipmentId) => callEquipment(equipmentId, 'reserve'),
  // Give one unit back (when a loan is rejected, cancelled or returned)
  release: (equipmentId) => callEquipment(equipmentId, 'release'),
};
