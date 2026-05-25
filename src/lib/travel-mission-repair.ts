import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { determineApprovalTarget } from "./travel-utils";
import { normalizeEmployeeRow } from "./employee-row-normalizer";

export interface RepairStats {
  missionsProcessed: number;
  missionsSkipped: number;
  membersRepaired: number;
  membersSkipped: number;
  approvalRequestsCreated: number;
  approvalRequestsDeleted: number;
  errors: { missionId: string; error: string }[];
}

/**
 * Repair all pending missions by re-resolving approvers from master organization.
 * - Fetch pending missions
 * - For each member, re-resolve approvalTargetUid + approvalTargetName
 * - Update member doc
 * - Delete & recreate approval_requests
 * - Recreate notifications
 */
export async function repairBusinessTripMissions(
  firestore: Firestore,
): Promise<RepairStats> {
  const stats: RepairStats = {
    missionsProcessed: 0,
    missionsSkipped: 0,
    membersRepaired: 0,
    membersSkipped: 0,
    approvalRequestsCreated: 0,
    approvalRequestsDeleted: 0,
    errors: [],
  };

  try {
    // 1. Fetch all missions with status pending_manager_validation or waiting_staff_confirmation
    const missionsRef = collection(firestore, "business_trip_missions");
    const missionsQuery = query(
      missionsRef,
      where("status", "in", [
        "pending_manager_validation",
        "waiting_staff_confirmation",
      ]),
    );
    const missionsSnap = await getDocs(missionsQuery);

    console.log(
      `🔧 Found ${missionsSnap.docs.length} missions to check for repair.`,
    );

    for (const missionDoc of missionsSnap.docs) {
      const missionId = missionDoc.id;
      const mission = missionDoc.data() as any;

      try {
        // 2. Fetch all members for this mission
        const membersRef = collection(
          firestore,
          "business_trip_missions",
          missionId,
          "members",
        );
        const membersSnap = await getDocs(membersRef);

        if (membersSnap.docs.length === 0) {
          stats.missionsSkipped++;
          continue;
        }

        console.log(
          `  Processing mission ${missionId} (${mission.missionName}) with ${membersSnap.docs.length} members...`,
        );

        const batch = writeBatch(firestore);
        const approvalGroups = new Map<
          string,
          {
            approverName: string;
            approvalLevel: "division_manager" | "director";
            memberUids: string[];
            memberNames: string[];
          }
        >();

        // 3. For each member, resolve approver anew
        for (const memberDoc of membersSnap.docs) {
          const member = memberDoc.data() as any;
          const memberUid = member.employeeUid;

          try {
            // Fetch employee profile
            const profileSnap = await getDoc(
              doc(firestore, "employee_profiles", memberUid),
            );
            const profile = profileSnap.exists() ? profileSnap.data() : null;

            // Normalize to get isDivisionManager etc
            const normalized = normalizeEmployeeRow(profile, null, null);

            // Re-resolve approver from master org
            const approvalTarget = await determineApprovalTarget(
              firestore,
              { ...normalized, employeeUid: memberUid },
              "", // fallback director UID (unused in this context since we throw if missing)
              "", // fallback director name
            );

            // Update member doc with new approver info
            const memberRef = doc(
              firestore,
              "business_trip_missions",
              missionId,
              "members",
              memberUid,
            );

            batch.update(memberRef, {
              approvalTargetUid: approvalTarget.approverUid,
              approvalTargetName: approvalTarget.approverName,
              managerName: approvalTarget.approverName, // Override stale field
              managerUid: approvalTarget.approverUid, // Override stale field
              approvalLevel: approvalTarget.level,
              approvalStatus: "pending",
              memberStatus: "waiting_manager_validation",
              staffConfirmationStatus: "waiting_staff_confirmation",
              updatedAt: serverTimestamp(),
            });

            stats.membersRepaired++;

            // Track for approval_requests grouping
            const key = approvalTarget.approverUid;
            const existing = approvalGroups.get(key);
            if (existing) {
              existing.memberUids.push(memberUid);
              existing.memberNames.push(member.employeeName);
            } else {
              approvalGroups.set(key, {
                approverName: approvalTarget.approverName,
                approvalLevel: approvalTarget.level,
                memberUids: [memberUid],
                memberNames: [member.employeeName],
              });
            }
          } catch (memberError: any) {
            console.warn(
              `    ⚠️ Failed to repair member ${memberUid}:`,
              memberError.message,
            );
            stats.membersSkipped++;
            stats.errors.push({
              missionId,
              error: `Member ${memberUid}: ${memberError.message}`,
            });
          }
        }

        // 4. Delete all existing approval_requests
        const approvalsRef = collection(
          firestore,
          "business_trip_missions",
          missionId,
          "approval_requests",
        );
        const approvalsSnap = await getDocs(approvalsRef);
        for (const approvalDoc of approvalsSnap.docs) {
          batch.delete(approvalDoc.ref);
          stats.approvalRequestsDeleted++;
        }

        // 5. Create new approval_requests based on new approver groups
        for (const [approverUid, group] of approvalGroups.entries()) {
          const approvalRef = doc(approvalsRef, approverUid);
          batch.set(approvalRef, {
            missionId,
            missionName: mission.missionName,
            approverUid,
            approverName: group.approverName,
            approverRole:
              group.approvalLevel === "division_manager"
                ? "manager_division"
                : "director",
            approvalLevel: group.approvalLevel,
            memberUids: Array.from(new Set(group.memberUids)),
            memberNames: Array.from(new Set(group.memberNames)),
            status: "pending",
            notes: "Diperbaiki oleh repair migration",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          stats.approvalRequestsCreated++;
        }

        // Commit batch
        await batch.commit();
        stats.missionsProcessed++;

        console.log(
          `  ✅ Mission ${missionId} repaired: ${stats.membersRepaired} members, ${approvalGroups.size} approvers`,
        );
      } catch (missionError: any) {
        console.error(`❌ Error repairing mission ${missionId}:`, missionError);
        stats.errors.push({
          missionId,
          error: missionError.message,
        });
        stats.missionsSkipped++;
      }
    }

    console.log("🎉 Repair process completed:", stats);
    return stats;
  } catch (error: any) {
    console.error("🚨 Fatal error during repair:", error);
    throw error;
  }
}
