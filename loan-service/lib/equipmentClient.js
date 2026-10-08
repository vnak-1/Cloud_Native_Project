async function callEquipment(equipmentId, action) {
  const baseUrl = process.env.EQUIPMENT_URL.replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/internal/equipment/${equipmentId}/${action}`, {
    method: 'PATCH',
    headers: { 'x-internal-key': process.env.INTERNAL_KEY },
    signal: AbortSignal.timeout(3000),
  });

  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

module.exports = {
  reserve: (equipmentId) => callEquipment(equipmentId, 'reserve'),
  release: (equipmentId) => callEquipment(equipmentId, 'release'),
};
