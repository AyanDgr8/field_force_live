import { db, insertReturning } from "@workspace/db";
import {
  customersTable,
  usersTable,
  addressesTable,
  markedPlacesTable,
  credentialsTable,
  otpTokensTable,
  onboardingInvitesTable,
  dayPlansTable,
  visitStopsTable,
  sessionsTable,
  locationPingsTable,
  dwellSegmentsTable,
  emergencyAlertsTable,
  statusEventsTable,
  dispositionsTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

function randomDelhiNcr() {
  return {
    lat: 28.4 + Math.random() * 0.5,
    lng: 76.8 + Math.random() * 0.5,
  };
}

const fieldEmployees = [
  { firstName: "Arjun", lastName: "Sharma", gender: "MALE" as const, phone: "+919876543210", email: "arjun.sharma@acme.in" },
  { firstName: "Priya", lastName: "Patel", gender: "FEMALE" as const, phone: "+919876543211", email: "priya.patel@acme.in" },
  { firstName: "Vikram", lastName: "Singh", gender: "MALE" as const, phone: "+919876543212", email: "vikram.singh@acme.in" },
  { firstName: "Neha", lastName: "Gupta", gender: "FEMALE" as const, phone: "+919876543213", email: "neha.gupta@acme.in" },
  { firstName: "Rohit", lastName: "Kumar", gender: "MALE" as const, phone: "+919876543214", email: "rohit.kumar@acme.in" },
  { firstName: "Anjali", lastName: "Verma", gender: "FEMALE" as const, phone: "+919876543215", email: "anjali.verma@acme.in" },
  { firstName: "Suresh", lastName: "Yadav", gender: "MALE" as const, phone: "+919876543216", email: "suresh.yadav@acme.in" },
  { firstName: "Kavitha", lastName: "Nair", gender: "FEMALE" as const, phone: "+919876543217", email: "kavitha.nair@acme.in" },
  { firstName: "Amit", lastName: "Joshi", gender: "MALE" as const, phone: "+919876543218", email: "amit.joshi@acme.in" },
  { firstName: "Sunita", lastName: "Reddy", gender: "FEMALE" as const, phone: "+919876543219", email: "sunita.reddy@acme.in" },
  { firstName: "Rajesh", lastName: "Mishra", gender: "MALE" as const, phone: "+919876543220", email: "rajesh.mishra@acme.in" },
  { firstName: "Meena", lastName: "Iyer", gender: "FEMALE" as const, phone: "+919876543221", email: "meena.iyer@acme.in" },
  { firstName: "Deepak", lastName: "Pandey", gender: "MALE" as const, phone: "+919876543222", email: "deepak.pandey@acme.in" },
  { firstName: "Pooja", lastName: "Tiwari", gender: "FEMALE" as const, phone: "+919876543223", email: "pooja.tiwari@acme.in" },
  { firstName: "Karan", lastName: "Malhotra", gender: "MALE" as const, phone: "+919876543224", email: "karan.malhotra@acme.in" },
  { firstName: "Aveek", lastName: "User", gender: "OTHER" as const, phone: "+919811066504", email: "aveek@multycomm.com" },
  { firstName: "Akash", lastName: "User", gender: "OTHER" as const, phone: "+919582871034", email: "akash@multycomm.com" },
  { firstName: "Deepak", lastName: "User", gender: "OTHER" as const, phone: "+919958130128", email: "deepak@multycomm.com" },
  { firstName: "Shivam", lastName: "User", gender: "OTHER" as const, phone: "+919910149171", email: "shivam@multycomm.com" },
  { firstName: "Ayan", lastName: "User", gender: "OTHER" as const, phone: "+918800154017", email: "ayan@multycomm.com" },
];

async function main() {
  logger.warn("DEMO SEED SCRIPT — for development/demo purposes only. Never run against production.");

  // Wipe existing demo data (order matters for FK constraints)
  logger.info("Wiping existing data...");
  await db.delete(statusEventsTable);
  await db.delete(emergencyAlertsTable);
  await db.delete(dwellSegmentsTable);
  await db.delete(locationPingsTable);
  await db.delete(sessionsTable);
  await db.delete(visitStopsTable);
  await db.delete(dayPlansTable);
  await db.delete(onboardingInvitesTable);
  await db.delete(otpTokensTable);
  await db.delete(credentialsTable);
  await db.delete(markedPlacesTable);
  await db.delete(addressesTable);
  await db.delete(dispositionsTable);
  await db.delete(usersTable);
  await db.delete(customersTable);

  // Create customer
  logger.info("Creating customer...");
  const customer = await insertReturning(customersTable, { name: "Acme Field Services" });

  // Create admin users
  logger.info("Creating admin users...");
  const adminPassword = "password123";
  logger.warn({ warning: "DEMO CREDENTIALS — do not use in production" }, "Demo admin credentials below");

  const adminUsers = [];
  for (let i = 1; i <= 2; i++) {
    const admin = await insertReturning(usersTable, {
      customerId: customer.id,
      firstName: `Admin${i}`,
      lastName: "User",
      gender: "MALE",
      employeeCode: `ADMIN00${i}`,
      phoneNumber: `+9198765432${i + 30}`,
      email: `admin${i}@acme.in`,
      role: "ADMIN",
      status: "ACTIVE",
      consentGivenAt: new Date(),
    });

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db.insert(credentialsTable).values({
      userId: admin.id,
      username: `admin${i}`,
      passwordHash,
    });
    adminUsers.push(admin);
  }

  logger.info({ username: "admin1", password: adminPassword }, "Demo admin 1 credentials");
  logger.info({ username: "admin2", password: adminPassword }, "Demo admin 2 credentials");

  // Create field employees
  logger.info(`Creating ${fieldEmployees.length} field employees...`);
  const createdUsers = [];
  for (let i = 0; i < fieldEmployees.length; i++) {
    const emp = fieldEmployees[i];
    const empCode = `EMP${String(i + 1).padStart(3, "0")}`;

    const user = await insertReturning(usersTable, {
      customerId: customer.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      gender: emp.gender,
      employeeCode: empCode,
      phoneNumber: emp.phone,
      email: emp.email,
      role: "USER",
      status: "ACTIVE",
      consentGivenAt: new Date(),
    });

    // Add base address
    const { lat, lng } = randomDelhiNcr();
    await db.insert(addressesTable).values({
      userId: user.id,
      type: i % 2 === 0 ? "BASE_OFFICE" : "OFFICE",
      rawAddress: `${Math.floor(Math.random() * 500) + 1}, Sector ${Math.floor(Math.random() * 50) + 1}, Delhi NCR`,
      latitude: lat,
      longitude: lng,
    });

    // 1-2 marked places
    const mpCount = Math.floor(Math.random() * 2) + 1;
    for (let j = 0; j < mpCount; j++) {
      const { lat: mlat, lng: mlng } = randomDelhiNcr();
      await db.insert(markedPlacesTable).values({
        userId: user.id,
        label: j === 0 ? "Home" : "Office Branch",
        rawAddress: `Plot ${Math.floor(Math.random() * 200) + 1}, Delhi NCR`,
        latitude: mlat,
        longitude: mlng,
      });
    }

    // Credentials (stub)
    const tempPassword = uuidv4().slice(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await db.insert(credentialsTable).values({
      userId: user.id,
      username: empCode,
      passwordHash,
    });

    // Onboarding invite
    const token = uuidv4();
    await db.insert(onboardingInvitesTable).values({
      userId: user.id,
      token,
      channel: "EMAIL",
      deepLink: `/onboarding/${token}`,
      usedAt: new Date(), // already active/consented
    });

    createdUsers.push({ user, baseLat: lat, baseLng: lng });
  }

  // Create default dispositions
  logger.info("Creating default dispositions...");
  const defaultDispositions = [
    { label: "Person not available", sortOrder: 1 },
    { label: "Premises locked", sortOrder: 2 },
    { label: "Work completed partially", sortOrder: 3 },
    { label: "Visit completed successfully", sortOrder: 4 },
  ];
  for (const d of defaultDispositions) {
    await db.insert(dispositionsTable).values({
      customerId: customer.id,
      label: d.label,
      active: true,
      sortOrder: d.sortOrder,
    });
  }

  // Contact data for seeded stops
  const contactNames = [
    "Rajesh Gupta", "Priya Mehta", "Sunil Sharma", "Anita Verma", "Deepak Singh",
    "Kavita Patel", "Mohan Yadav",
  ];
  const contactPhones = [
    "+919811001001", "+919811002002", "+919811003003", "+919811004004",
    "+919811005005", "+919811006006", "+919811007007",
  ];

  // Create day plans for ~5 employees
  logger.info("Creating day plans for first 5 employees...");
  const today = new Date().toISOString().slice(0, 10);
  const priorities = ["P1", "P2", "P3"] as const;
  const customerCodes = ["CUST001", "CUST002", "CUST003", "CUST004", "CUST005", "CUST006", "CUST007"];

  for (let i = 0; i < 5; i++) {
    const { user, baseLat, baseLng } = createdUsers[i];

    const plan = await insertReturning(dayPlansTable, {
      userId: user.id,
      visitDate: today,
    });

    const stopCount = Math.floor(Math.random() * 3) + 3; // 3-5 stops
    for (let j = 0; j < stopCount; j++) {
      const { lat, lng } = randomDelhiNcr();
      const priority = priorities[j % 3];
      await db.insert(visitStopsTable).values({
        userId: user.id,
        dayPlanId: plan.id,
        visitDate: today,
        sequence: j + 1,
        priority,
        customerCode: customerCodes[j % customerCodes.length],
        label: `Visit Stop ${j + 1} - ${priority}`,
        inputType: "ADDRESS",
        rawInput: `${Math.floor(Math.random() * 500) + 1}, Sector ${Math.floor(Math.random() * 50) + 1}, Delhi NCR`,
        latitude: lat,
        longitude: lng,
        contactName: contactNames[j % contactNames.length],
        contactPhone: contactPhones[j % contactPhones.length],
      });
    }
  }

  logger.info({ customerId: customer.id, customerName: customer.name }, "Seed complete");
  logger.info("Demo logins: admin1/password123 and admin2/password123");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
