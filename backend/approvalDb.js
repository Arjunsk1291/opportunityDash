import Approval from './models/Approval.js';
import ApprovalLog from './models/ApprovalLog.js';

const normalizeApproval = (approval) => ({
  status: approval?.status || 'pending',
  proposalHeadApproved: approval?.proposalHeadApproved || false,
  proposalHeadBy: approval?.proposalHeadBy || null,
  svpApproved: approval?.svpApproved || false,
  svpBy: approval?.svpBy || null,
  svpGroup: approval?.svpGroup || null,
});

export default {
  async getApprovals() {
    const approvals = await Approval.find().lean();
    const result = {};
    approvals.forEach((a) => {
      result[a.opportunityRefNo] = a.status;
    });
    return result;
  },

  async getApprovalStates() {
    const approvals = await Approval.find().lean();
    const result = {};
    approvals.forEach((a) => {
      result[a.opportunityRefNo] = normalizeApproval(a);
    });
    return result;
  },

  async approveAsProposalHead(opportunityRefNo, performedBy, performedByRole) {
    const approval = await Approval.findOneAndUpdate(
      { opportunityRefNo },
      {
        opportunityRefNo,
        status: 'proposal_head_approved',
        proposalHeadApproved: true,
        proposalHeadBy: performedBy,
        proposalHeadAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await ApprovalLog.create({
      opportunityRefNo,
      action: 'proposal_head_approved',
      performedBy,
      performedByRole,
    });

    const approvals = await this.getApprovals();
    const approvalStates = await this.getApprovalStates();
    const logs = await this.getApprovalLogs();
    return { success: true, approval: normalizeApproval(approval), approvals, approvalStates, approvalLogs: logs };
  },

  async approveAsSVP(opportunityRefNo, performedBy, performedByRole, group) {
    const current = await Approval.findOne({ opportunityRefNo });
    if (!current || !current.proposalHeadApproved) {
      throw new Error('Proposal Head approval is required before SVP approval');
    }

    const approval = await Approval.findOneAndUpdate(
      { opportunityRefNo },
      {
        status: 'fully_approved',
        svpApproved: true,
        svpBy: performedBy,
        svpAt: new Date(),
        svpGroup: group || null,
      },
      { new: true }
    );

    await ApprovalLog.create({
      opportunityRefNo,
      action: 'svp_approved',
      performedBy,
      performedByRole,
      group: group || null,
    });

    const approvals = await this.getApprovals();
    const approvalStates = await this.getApprovalStates();
    const logs = await this.getApprovalLogs();
    return { success: true, approval: normalizeApproval(approval), approvals, approvalStates, approvalLogs: logs };
  },

  async bulkApproveAsProposalHead(opportunityRefNos, performedBy, performedByRole) {
    const refs = Array.isArray(opportunityRefNos) ? opportunityRefNos.filter(Boolean) : [];
    if (!refs.length) {
      return { success: true, updatedCount: 0, approvals: await this.getApprovals(), approvalStates: await this.getApprovalStates(), approvalLogs: await this.getApprovalLogs() };
    }
    const now = new Date();
    const ops = refs.map((opportunityRefNo) => ({
      updateOne: {
        filter: { opportunityRefNo },
        update: {
          $set: {
            opportunityRefNo,
            status: 'proposal_head_approved',
            proposalHeadApproved: true,
            proposalHeadBy: performedBy,
            proposalHeadAt: now,
          },
        },
        upsert: true,
      },
    }));

    await Approval.bulkWrite(ops, { ordered: false });
    await ApprovalLog.insertMany(
      refs.map((opportunityRefNo) => ({
        opportunityRefNo,
        action: 'proposal_head_approved',
        performedBy,
        performedByRole,
      }))
    );

    const approvals = await this.getApprovals();
    const approvalStates = await this.getApprovalStates();
    const logs = await this.getApprovalLogs();
    return { success: true, updatedCount: refs.length, approvals, approvalStates, approvalLogs: logs };
  },

  async bulkApproveAsSVP(opportunityRefNos, performedBy, performedByRole, group) {
    const refs = Array.isArray(opportunityRefNos) ? opportunityRefNos.filter(Boolean) : [];
    if (!refs.length) {
      return { success: true, updatedCount: 0, approvals: await this.getApprovals(), approvalStates: await this.getApprovalStates(), approvalLogs: await this.getApprovalLogs(), skipped: [] };
    }

    const eligible = await Approval.find({ opportunityRefNo: { $in: refs }, proposalHeadApproved: true }).lean();
    const eligibleRefs = new Set(eligible.map((item) => item.opportunityRefNo));
    const toApprove = refs.filter((ref) => eligibleRefs.has(ref));
    const skipped = refs.filter((ref) => !eligibleRefs.has(ref));

    if (toApprove.length > 0) {
      const now = new Date();
      const ops = toApprove.map((opportunityRefNo) => ({
        updateOne: {
          filter: { opportunityRefNo },
          update: {
            $set: {
              status: 'fully_approved',
              svpApproved: true,
              svpBy: performedBy,
              svpAt: now,
              svpGroup: group || null,
            },
          },
        },
      }));

      await Approval.bulkWrite(ops, { ordered: false });
      await ApprovalLog.insertMany(
        toApprove.map((opportunityRefNo) => ({
          opportunityRefNo,
          action: 'svp_approved',
          performedBy,
          performedByRole,
          group: group || null,
        }))
      );
    }

    const approvals = await this.getApprovals();
    const approvalStates = await this.getApprovalStates();
    const logs = await this.getApprovalLogs();
    return { success: true, updatedCount: toApprove.length, skipped, approvals, approvalStates, approvalLogs: logs };
  },

  async bulkRevert(opportunityRefNos, performedBy, performedByRole) {
    const refs = Array.isArray(opportunityRefNos) ? opportunityRefNos.filter(Boolean) : [];
    if (!refs.length) {
      return { success: true, updatedCount: 0, approvals: await this.getApprovals(), approvalStates: await this.getApprovalStates(), approvalLogs: await this.getApprovalLogs() };
    }

    const ops = refs.map((opportunityRefNo) => ({
      updateOne: {
        filter: { opportunityRefNo },
        update: {
          $set: {
            opportunityRefNo,
            status: 'pending',
            proposalHeadApproved: false,
            proposalHeadBy: null,
            proposalHeadAt: null,
            svpApproved: false,
            svpBy: null,
            svpAt: null,
            svpGroup: null,
          },
        },
        upsert: true,
      },
    }));

    await Approval.bulkWrite(ops, { ordered: false });
    await ApprovalLog.insertMany(
      refs.map((opportunityRefNo) => ({
        opportunityRefNo,
        action: 'reverted',
        performedBy,
        performedByRole,
      }))
    );

    const approvals = await this.getApprovals();
    const approvalStates = await this.getApprovalStates();
    const logs = await this.getApprovalLogs();
    return { success: true, updatedCount: refs.length, approvals, approvalStates, approvalLogs: logs };
  },

  async revertApproval(opportunityRefNo, performedBy, performedByRole) {
    await Approval.findOneAndUpdate(
      { opportunityRefNo },
      {
        opportunityRefNo,
        status: 'pending',
        proposalHeadApproved: false,
        proposalHeadBy: null,
        proposalHeadAt: null,
        svpApproved: false,
        svpBy: null,
        svpAt: null,
        svpGroup: null,
      },
      { upsert: true, new: true }
    );

    await ApprovalLog.create({
      opportunityRefNo,
      action: 'reverted',
      performedBy,
      performedByRole,
    });

    const approvals = await this.getApprovals();
    const approvalStates = await this.getApprovalStates();
    const logs = await this.getApprovalLogs();
    return { success: true, approvals, approvalStates, approvalLogs: logs };
  },

  async getApprovalLogs() {
    return await ApprovalLog.find().sort({ createdAt: -1 }).lean();
  },
};
