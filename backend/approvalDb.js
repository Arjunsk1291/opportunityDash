import Approval from './models/Approval.js';
import ApprovalLog from './models/ApprovalLog.js';

export default {
  async getApprovals() {
    const approvals = await Approval.find();
    const result = {};
    approvals.forEach(a => {
      result[a.opportunityId] = a.status;
    });
    return result;
  },

  async getApprovalStatus(opportunityId) {
    const approval = await Approval.findOne({ opportunityId });
    return approval?.status || 'pending';
  },

  async approveOpportunity(opportunityId, performedBy, performedByRole) {
    await Approval.findOneAndUpdate(
      { opportunityId },
      { opportunityId, status: 'approved' },
      { upsert: true }
    );

    await ApprovalLog.create({
      opportunityId,
      action: 'approved',
      performedBy,
      performedByRole,
    });

    const approvals = await this.getApprovals();
    const logs = await this.getApprovalLogs();
    return { success: true, approvals, approvalLogs: logs };
  },

  async revertApproval(opportunityId, performedBy, performedByRole) {
    await Approval.findOneAndUpdate(
      { opportunityId },
      { opportunityId, status: 'pending' }
    );

    await ApprovalLog.create({
      opportunityId,
      action: 'reverted',
      performedBy,
      performedByRole,
    });

    const approvals = await this.getApprovals();
    const logs = await this.getApprovalLogs();
    return { success: true, approvals, approvalLogs: logs };
  },

  async getApprovalLogs() {
    return await ApprovalLog.find().sort({ createdAt: -1 });
  },
};
