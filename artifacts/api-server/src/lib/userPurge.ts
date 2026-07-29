import { eq, inArray, or } from "drizzle-orm";
import {
  db,
  usersTable,
  addressesTable,
  markedPlacesTable,
  credentialsTable,
  otpTokensTable,
  onboardingInvitesTable,
  sessionsTable,
  locationPingsTable,
  dwellSegmentsTable,
  emergencyAlertsTable,
  statusEventsTable,
  dayPlansTable,
  visitStopsTable,
  publicTrackLinksTable,
  riderHubAssignmentsTable,
  attendanceAttemptsTable,
  vehicleAccessEventsTable,
  deviceAssignmentsTable,
  trackedDevicesTable,
  adminStateScopesTable,
  adminHubScopesTable,
  backgroundVerificationsTable,
  importJobsTable,
  deliveryRecordsTable,
  vehiclesTable,
} from "@workspace/db";

/** `db` itself, or the transaction handle passed to `db.transaction()`. */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PurgeableUser = {
  id: number;
  parentUserId: number | null;
  vehicleId: number | null;
};

/**
 * Permanently removes a user and everything hanging off them.
 *
 * Every foreign key into `users` is ON DELETE NO ACTION, so each child row has
 * to be cleared explicitly and in dependency order — deepest first. Rows that
 * belong to the person (pings, plans, credentials, attendance) are deleted;
 * rows that belong to the organization but merely *mention* the person
 * (imported verification/delivery records, audit trails on other people's rows)
 * keep their history and only lose the link.
 *
 * Call inside `db.transaction()` so a failure part-way through cannot leave a
 * half-erased account behind.
 */
export async function purgeUser(tx: DbExecutor, user: PurgeableUser): Promise<void> {
  const { id } = user;

  // Public track links hang off visit stops, which hang off day plans.
  const plans = await tx.select({ id: dayPlansTable.id }).from(dayPlansTable).where(eq(dayPlansTable.userId, id));
  const planIds = plans.map(p => p.id);
  const stops = await tx.select({ id: visitStopsTable.id }).from(visitStopsTable).where(
    planIds.length
      ? or(eq(visitStopsTable.userId, id), inArray(visitStopsTable.dayPlanId, planIds))
      : eq(visitStopsTable.userId, id),
  );
  const stopIds = stops.map(s => s.id);
  if (stopIds.length) {
    await tx.delete(publicTrackLinksTable).where(inArray(publicTrackLinksTable.visitStopId, stopIds));
    await tx.delete(visitStopsTable).where(inArray(visitStopsTable.id, stopIds));
  }
  if (planIds.length) await tx.delete(dayPlansTable).where(inArray(dayPlansTable.id, planIds));

  await tx.delete(statusEventsTable).where(eq(statusEventsTable.userId, id));
  await tx.delete(locationPingsTable).where(eq(locationPingsTable.userId, id));
  await tx.delete(dwellSegmentsTable).where(eq(dwellSegmentsTable.userId, id));
  await tx.delete(sessionsTable).where(eq(sessionsTable.userId, id));
  await tx.delete(attendanceAttemptsTable).where(eq(attendanceAttemptsTable.userId, id));
  await tx.delete(vehicleAccessEventsTable).where(eq(vehicleAccessEventsTable.userId, id));
  await tx.delete(riderHubAssignmentsTable).where(eq(riderHubAssignmentsTable.userId, id));
  await tx.delete(emergencyAlertsTable).where(eq(emergencyAlertsTable.userId, id));
  await tx.delete(deviceAssignmentsTable).where(eq(deviceAssignmentsTable.userId, id));
  await tx.delete(addressesTable).where(eq(addressesTable.userId, id));
  await tx.delete(markedPlacesTable).where(eq(markedPlacesTable.userId, id));
  await tx.delete(credentialsTable).where(eq(credentialsTable.userId, id));
  await tx.delete(otpTokensTable).where(eq(otpTokensTable.userId, id));
  await tx.delete(onboardingInvitesTable).where(eq(onboardingInvitesTable.userId, id));
  await tx.delete(adminStateScopesTable).where(eq(adminStateScopesTable.userId, id));
  await tx.delete(adminHubScopesTable).where(eq(adminHubScopesTable.userId, id));

  // Organization records that outlive the person: keep the row, drop the link.
  await tx.update(emergencyAlertsTable).set({ triggeredByAdminId: null }).where(eq(emergencyAlertsTable.triggeredByAdminId, id));
  await tx.update(deviceAssignmentsTable).set({ assignedByAdminId: null }).where(eq(deviceAssignmentsTable.assignedByAdminId, id));
  await tx.update(trackedDevicesTable).set({ assignedUserId: null }).where(eq(trackedDevicesTable.assignedUserId, id));
  await tx.update(backgroundVerificationsTable).set({ userId: null }).where(eq(backgroundVerificationsTable.userId, id));
  await tx.update(importJobsTable).set({ uploadedByUserId: null }).where(eq(importJobsTable.uploadedByUserId, id));
  await tx.update(deliveryRecordsTable).set({ userId: null }).where(eq(deliveryRecordsTable.userId, id));

  // Anyone reporting to the deleted account moves up to its parent rather than
  // being left pointing at an id that no longer exists.
  await tx.update(usersTable).set({ parentUserId: user.parentUserId }).where(eq(usersTable.parentUserId, id));

  if (user.vehicleId) {
    await tx.update(vehiclesTable).set({ status: "AVAILABLE" }).where(eq(vehiclesTable.id, user.vehicleId));
  }

  await tx.delete(usersTable).where(eq(usersTable.id, id));
}
