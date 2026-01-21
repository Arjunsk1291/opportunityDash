import Approval from './models/Approval.js';
import ApprovalLog from './models/ApprovalLog.js';

export default {
  async getApprovals() {
    const approvals = await Approval.find();
    const result = {};
    approvals.forEach(a => {
      result[a.opportunityRefNo] = a.status;
    });
    return result;
  },

  async getApprovalStatus(opportunityRefNo) {
    const approval = await Approval.findOne({ opportunityRefNo });
    return approval?.status || 'pending';
  },

  async approveOpportunity(opportunityRefNo, performedBy, performedByRole) {
    await Approval.findOneAndUpdate(
      { opportunityRefNo },
      { 
        opportunityRefNo, 
        status: 'approved',
        approvedBy: performedBy,
        approvedByRole: performedByRole,
        approvalDate: new Date()
      },
      { upsert: true }
    );

    // ✅ FIXED: Create log with opportunityRefNo
    await ApprovalLog.create({
      opportunityRefNo,
      action: 'approved',
      performedBy,
      performedByRole,
    });

    const approvals = await this.getApprovals();
    const logs = await this.getApprovalLogs();
    return { success: true, approvals, approvalLogs: logs };
  },

  async revertApproval(opportunityRefNo, performedBy, performedByRole) {
    await Approval.findOneAndUpdate(
      { opportunityRefNo },
      { 
        opportunityRefNo, 
        status: 'pending',
        approvedBy: null,
        approvalDate: null
      }
    );

    // ✅ FIXED: Create log with opportunityRefNo
    await ApprovalLog.create({
      opportunityRefNo,
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
