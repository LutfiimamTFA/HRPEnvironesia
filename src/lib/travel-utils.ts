import {
  Timestamp,
  writeBatch,
  doc,
  collection,
  serverTimestamp,
  setDoc,
  getDoc,
} from "firebase/firestore";
import {
  BusinessTripMission,
  BusinessTripMissionMember,
} from "@/components/dashboard/dinas/types";
import { normalizeEmployeeRow } from "@/lib/employee-row-normalizer";
import { UserProfile } from "@/lib/types";
import { Firestore } from "firebase/firestore";

type ApprovalTargetStaff = {
  isDivisionManager?: boolean;
  managerUid?: string;
  managerName?: string | null;
};

/**
 * Determine the approver for a staff member.
 * Returns the UID, name, and approval level.
 * - Regular staff: approver = their division manager.
 * - Division manager (isDivisionManager === true): approver = the director (top-level manager).
 *   The director is assumed to be the `managerUid` of the division manager.
 */
export async function determineApprovalTarget(
  firestore: Firestore,
  staff: ApprovalTargetStaff & {
    brandId?: string;
    divisionId?: string;
    employeeUid?: string;
    fullName?: string;
  },
  fallbackDirectorUid: string,
  fallbackDirectorName: string,
): Promise<{
  approverUid: string;
  approverName: string;
  level: "division_manager" | "director";
}> {
  const brandId = staff.brandId;
  const divisionId = staff.divisionId;
  const employeeUid = staff.employeeUid;
  const staffName = staff.fullName || employeeUid || "Unknown Staff";

  if (!brandId || !divisionId) {
    throw new Error(
      `Tidak dapat menentukan approver untuk ${staffName}: brandId atau divisionId tidak ditemukan pada data karyawan.`,
    );
  }

  const divRef = doc(firestore, "brands", brandId, "divisions", divisionId);
  const divSnap = await getDoc(divRef);
  if (!divSnap.exists()) {
    throw new Error(
      `Struktur organisasi tidak ditemukan untuk divisi ${divisionId} (brand ${brandId}) pada karyawan ${staffName}.`,
    );
  }

  const division = divSnap.data() as any;

  if (staff.isDivisionManager) {
    // Division Manager -> needs director/manager's supervisor
    const approverUid =
      division.managerDirectSupervisorId || division.managerDirectSupervisorUid;
    const approverName = division.managerDirectSupervisorName;

    if (!approverUid || !approverName) {
      throw new Error(
        `Struktur organisasi belum lengkap untuk Manager Divisi ${staffName} di divisi ${divisionId} (brand ${brandId}). Atasan langsung Manager Divisi belum diatur.`,
      );
    }
    if (approverUid === employeeUid) {
      throw new Error(
        `Peserta dinas (${staffName}) tidak boleh menjadi approver untuk dirinya sendiri.`,
      );
    }

    return {
      approverUid,
      approverName,
      level: "director",
    };
  } else {
    // Regular staff -> needs division manager
    const approverUid = division.managerId || division.managerUid;
    const approverName = division.managerName;

    if (!approverUid || !approverName) {
      throw new Error(
        `Struktur organisasi belum lengkap untuk staff ${staffName} di divisi ${divisionId} (brand ${brandId}). Manager Divisi belum diatur.`,
      );
    }
    if (approverUid === employeeUid) {
      throw new Error(
        `Peserta dinas (${staffName}) tidak boleh menjadi approver untuk dirinya sendiri.`,
      );
    }

    return {
      approverUid,
      approverName,
      level: "division_manager",
    };
  }
}

/**
 * Group selected staff members by their approver.
 * Returns a map where key is approverUid and value contains member UIDs and names.
 */
export function groupMembersByApprover(
  members: BusinessTripMissionMember[],
): Map<
  string,
  {
    memberUids: string[];
    memberNames: string[];
    approverName: string;
    level: "division_manager" | "director";
  }
> {
  const map = new Map();
  for (const m of members) {
    const key = m.approvalTargetUid!;
    const entry = map.get(key) ?? {
      memberUids: [],
      memberNames: [],
      approverName: m.approvalTargetName!,
      level: m.approvalLevel!,
    };
    entry.memberUids.push(m.employeeUid);
    entry.memberNames.push(m.employeeName);
    map.set(key, entry);
  }
  return map;
}

/**
 * Create a travel mission along with member documents and approval_requests sub‑collection.
 * This function consolidates the creation logic for both ManagementDinasClient and BusinessTripClient.
 */
export async function createTravelMission(params: {
  firestore: Firestore;
  missionForm: any; // shape matches UI state but without finance fields
  selectedStaffUids: string[];
  userProfile: UserProfile;
  directorUid: string; // usually the creating user's UID (director/management)
  directorName: string;
}): Promise<{ missionId: string }> {
  const {
    firestore,
    missionForm,
    selectedStaffUids,
    userProfile,
    directorUid,
    directorName,
  } = params;
  const batch = writeBatch(firestore);

  const missionRef = doc(collection(firestore, "business_trip_missions"));
  const missionId = missionRef.id;

  const missionData: BusinessTripMission = {
    id: missionId,
    missionName: missionForm.missionName,
    assignmentNumber: missionForm.assignmentNumber,
    projectName: missionForm.projectName,
    clientName: missionForm.clientName,
    tripType: missionForm.tripType,
    tripTypeOther: missionForm.tripTypeOther,
    destinationProvince: missionForm.destinationProvince,
    destinationRegency: missionForm.destinationRegency,
    destinationAddress: missionForm.destinationAddress,
    destinationGoogleMaps: missionForm.destinationGoogleMaps,
    startDate: missionForm.startDate,
    endDate: missionForm.endDate,
    durationDays: missionForm.durationDays,
    instructionNote: missionForm.instructionNote,
    instructionHtml: missionForm.instructionHtml,
    assignedByUid: userProfile.uid,
    assignedByName: userProfile.fullName,
    // visibility and status are derived later
    status: "draft_mission",
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  } as BusinessTripMission;

  batch.set(missionRef, missionData);

  // Fetch employee profiles for selected staff
  const staffDocs = await Promise.all(
    selectedStaffUids.map(async (uid) => {
      const snap = await getDoc(doc(firestore, "employee_profiles", uid));
      return { uid, data: snap.exists() ? snap.data() : null } as const;
    }),
  );

  const memberDocs: BusinessTripMissionMember[] = [];
  for (const { uid, data } of staffDocs) {
    const normalized = normalizeEmployeeRow(data, null, null);
    const { approverUid, approverName, level } = await determineApprovalTarget(
      firestore,
      { ...(normalized as any), employeeUid: uid },
      directorUid,
      directorName,
    );
    // If no approver could be determined, abort creation and surface error
    if (!approverUid) {
      throw new Error(
        `Tidak dapat menentukan approver untuk user ${uid} (${normalized.fullName}). Periksa Struktur Organisasi.`,
      );
    }
    const member: BusinessTripMissionMember = {
      missionId,
      missionName: missionForm.missionName,
      employeeUid: uid,
      employeeName: normalized.fullName,
      brandId: normalized.brandId,
      brandName: normalized.brandName,
      divisionId: normalized.divisionId,
      divisionName: (normalized as any).divisi || normalized.divisionId || "",
      managerUid: normalized.managerUid,
      managerName: normalized.managerName,
      directSupervisorUid: normalized.managerUid,
      directSupervisorName: normalized.managerName,
      approvalTargetUid: approverUid,
      approvalTargetName: approverName,
      approvalLevel: level,
      requiresApproval: true,
      approvalStatus: "pending",
      memberStatus: "waiting_manager_validation",
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    } as BusinessTripMissionMember;
    memberDocs.push(member);
    // Use employee UID as document id for members (canonical)
    const memberRef = doc(collection(missionRef, "members"), uid);
    batch.set(memberRef, member);
    // Create notification for staff
    const staffNotifRef = doc(
      collection(firestore, "users", uid, "notifications"),
    );
    batch.set(staffNotifRef, {
      type: "business_trip_assigned",
      missionId,
      missionName: missionForm.missionName,
      createdAt: serverTimestamp() as any,
      read: false,
      byUid: userProfile.uid,
      byName: userProfile.fullName || userProfile.uid,
    });
  }

  // Build approval_requests sub‑collection (one doc per distinct approver)
  const approvalsMap = new Map<
    string,
    {
      approverName: string;
      level: "division_manager" | "director";
      memberUids: string[];
      memberNames: string[];
    }
  >();
  for (const m of memberDocs) {
    const key = m.approvalTargetUid!;
    const entry = approvalsMap.get(key) ?? {
      approverName: m.approvalTargetName!,
      level: m.approvalLevel!,
      memberUids: [],
      memberNames: [],
    };
    entry.memberUids.push(m.employeeUid);
    entry.memberNames.push(m.employeeName);
    approvalsMap.set(key, entry);
  }
  approvalsMap.forEach((group, approverUid) => {
    // Use approver UID as document id for approval_requests (canonical)
    const approvalRef = doc(
      collection(missionRef, "approval_requests"),
      approverUid,
    );
    const approvalData = {
      missionId,
      missionName: missionForm.missionName,
      approverUid,
      approverName: group.approverName,
      approverRole:
        group.level === "division_manager" ? "manager_division" : "director",
      approvalLevel: group.level,
      memberUids: group.memberUids,
      memberNames: group.memberNames,
      status: "pending",
      notes: "",
      decidedAt: null,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    batch.set(approvalRef, approvalData);
    // Create notification for approver
    const notifRef = doc(
      collection(firestore, "users", approverUid, "notifications"),
    );
    batch.set(notifRef, {
      type: "business_trip_approval_request",
      missionId,
      missionName: missionForm.missionName,
      approverUid,
      createdAt: serverTimestamp() as any,
      read: false,
      byUid: userProfile.uid,
      byName: userProfile.fullName || userProfile.uid,
    });
  });

  await batch.commit();
  return { missionId };
}
