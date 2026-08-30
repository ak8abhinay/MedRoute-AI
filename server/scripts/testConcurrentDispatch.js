/**
 * Fires two dispatch requests at the same emergency simultaneously, to
 * verify the system handles a genuine race correctly: exactly one
 * request should succeed, the other should fail with a clean error -
 * never both succeeding, never silent corruption. This is the first
 * real test of dispatchEmergency's re-validation guard and the
 * ambulance status-transition guard under actual concurrent load,
 * rather than sequential single-request testing.
 */

const BASE_URL = "http://localhost:5000";

const createEmergency = async () => {
  const res = await fetch(`${BASE_URL}/api/emergencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emergency_type: "cardiac",
      location: "Race Condition Test",
      latitude: 17.407,
      longitude: 78.497,
      severity: "High",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to create emergency: ${JSON.stringify(data)}`);
  return data;
};

const dispatch = async (emergencyId, label) => {
  const startedAt = Date.now();
  const res = await fetch(`${BASE_URL}/api/dispatch/${emergencyId}`, { method: "POST" });
  const data = await res.json();
  return { label, status: res.status, ok: res.ok, data, elapsedMs: Date.now() - startedAt };
};

const getEmergency = async (id) => {
  const res = await fetch(`${BASE_URL}/api/emergencies/${id}`);
  return res.json();
};

const run = async () => {
  console.log("Creating a fresh emergency...");
  const emergency = await createEmergency();
  console.log(`Created emergency ${emergency._id}, status: "${emergency.status}"\n`);

  console.log("Firing two concurrent dispatch requests for the SAME emergency...\n");

  // Both requests started in the same synchronous tick, not awaited
  // sequentially - this is what actually makes them concurrent rather
  // than just "close together".
  const [resultA, resultB] = await Promise.allSettled([
    dispatch(emergency._id, "Request A"),
    dispatch(emergency._id, "Request B"),
  ]);

  for (const result of [resultA, resultB]) {
    if (result.status === "fulfilled") {
      const { label, status, ok, data, elapsedMs } = result.value;
      console.log(`${label}: HTTP ${status} (${elapsedMs}ms) - ${ok ? "SUCCESS" : "REJECTED"}`);
      console.log(ok ? `  ambulance: ${data.ambulance?._id}, score: ${data.score}` : `  error: ${data.error}`);
    } else {
      console.log(`Request threw unexpectedly: ${result.reason}`);
    }
  }

  console.log("\nFinal emergency state:");
  const finalEmergency = await getEmergency(emergency._id);
  console.log(`  status: "${finalEmergency.status}"`);
  console.log(`  assigned_ambulance: ${finalEmergency.assigned_ambulance?._id || finalEmergency.assigned_ambulance}`);

  const successCount = [resultA, resultB].filter(
    (r) => r.status === "fulfilled" && r.value.ok
  ).length;

  console.log("\n" + "=".repeat(50));
  if (successCount === 1) {
    console.log("PASS - exactly one request succeeded, the other failed cleanly.");
  } else if (successCount === 2) {
    console.log("FAIL - both requests succeeded. This means the emergency was double-dispatched.");
  } else {
    console.log("FAIL - both requests failed. Something else is wrong - check the errors above.");
  }
  console.log("=".repeat(50));
};

run().catch((err) => {
  console.error("Test script error:", err.message);
  process.exit(1);
});