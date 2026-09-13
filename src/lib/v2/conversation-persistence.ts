import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../domain/errors";
import { hash } from "../domain/hash";
import type { Conversation, ConversationMessage, ConversationView, SchedulingProposal } from "./contracts";
import { V2_SCHEMA_VERSION } from "./contracts";

interface ConversationState {
  conversations: Record<string, Conversation>;
  messages: ConversationMessage[];
  proposals: SchedulingProposal[];
  approvals?: Record<string, ProposalApproval>;
}

interface ProposalApproval {
  proposal_id: string; user_id: string; proposal_version: number; proposal_hash: string; manifest_hash: string;
  approved_at: string; expires_at: string; consumed_at?: string;
  execution_lease?: { owner_id: string; acquired_at: string; expires_at: string };
}

function hashForStoredProposal(proposal: Omit<SchedulingProposal, "proposal_hash">): string { return hash(proposal); }

export class ConversationStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename = path.join(process.cwd(), ".data", "v2-conversations.json")) {}

  private async read(): Promise<ConversationState> {
    try { return JSON.parse(await readFile(this.filename, "utf8")) as ConversationState; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { conversations: {}, messages: [], proposals: [] };
      throw error;
    }
  }

  private async write(state: ConversationState): Promise<void> {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, this.filename);
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async create(conversation: Conversation): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      state.conversations[conversation.conversation_id] = structuredClone(conversation);
      await this.write(state);
    });
  }

  async append(conversation: Conversation, messages: ConversationMessage[], proposal?: SchedulingProposal, expectedVersion?: number): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      const existing = state.conversations[conversation.conversation_id];
      if (!existing) throw new DomainError("Conversation not found.", "NOT_FOUND");
      if (expectedVersion !== undefined && existing.version !== expectedVersion) throw new DomainError("The conversation changed. Refresh and try again.", "STALE_APPROVAL");
      state.conversations[conversation.conversation_id] = structuredClone(conversation);
      state.messages.push(...structuredClone(messages));
      if (proposal) state.proposals.push(structuredClone(proposal));
      await this.write(state);
    });
  }

  async view(conversationId: string, userId: string): Promise<ConversationView> {
    const state = await this.read();
    const conversation = state.conversations[conversationId];
    if (!conversation || conversation.user_id !== userId) throw new DomainError("Conversation not found.", "NOT_FOUND");
    return {
      schema_version: V2_SCHEMA_VERSION,
      conversation: structuredClone(conversation),
      messages: structuredClone(state.messages.filter((message) => message.conversation_id === conversationId)),
      proposals: structuredClone(state.proposals.filter((proposal) => proposal.conversation_id === conversationId)),
    };
  }

  async proposal(proposalId: string, userId: string): Promise<SchedulingProposal> {
    const state = await this.read();
    const proposal = state.proposals.find((item) => item.proposal_id === proposalId && item.user_id === userId);
    if (!proposal) throw new DomainError("Proposal not found.", "NOT_FOUND");
    return structuredClone(proposal);
  }

  async updateProposal(proposal: SchedulingProposal, expectedVersion: number): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      const index = state.proposals.findIndex((item) => item.proposal_id === proposal.proposal_id && item.user_id === proposal.user_id);
      if (index < 0) throw new DomainError("Proposal not found.", "NOT_FOUND");
      if (state.proposals[index].version !== expectedVersion) throw new DomainError("The proposal changed. Refresh and try again.", "STALE_APPROVAL");
      state.proposals[index] = structuredClone(proposal);
      await this.write(state);
    });
  }

  async saveApproval(approval: ProposalApproval): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      state.approvals ??= {};
      state.approvals[approval.proposal_id] = structuredClone(approval);
      await this.write(state);
    });
  }

  async transitionWithApproval(proposal: SchedulingProposal, expectedVersion: number, approval: ProposalApproval): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      const index = state.proposals.findIndex((item) => item.proposal_id === proposal.proposal_id && item.user_id === proposal.user_id);
      if (index < 0) throw new DomainError("Proposal not found.", "NOT_FOUND");
      if (state.proposals[index].version !== expectedVersion || state.approvals?.[proposal.proposal_id]) throw new DomainError("The proposal was already confirmed or changed.", "STALE_APPROVAL");
      state.proposals[index] = structuredClone(proposal);
      state.approvals ??= {};
      state.approvals[proposal.proposal_id] = structuredClone(approval);
      await this.write(state);
    });
  }

  async consumeApproval(proposalId: string, userId: string, proposalVersion: number): Promise<ProposalApproval> {
    return this.serialized(async () => {
      const state = await this.read();
      const approval = state.approvals?.[proposalId];
      if (!approval || approval.user_id !== userId || approval.proposal_version !== proposalVersion) throw new DomainError("Approval does not match this proposal.", "STALE_APPROVAL");
      if (approval.consumed_at) throw new DomainError("This approval was already used.", "INVALID_STATE");
      if (Date.parse(approval.expires_at) <= Date.now()) throw new DomainError("Approval expired. Review the proposal again.", "STALE_APPROVAL");
      const consumed = { ...approval, consumed_at: new Date().toISOString() };
      state.approvals![proposalId] = consumed;
      await this.write(state);
      return structuredClone(consumed);
    });
  }

  async beginExecution(proposalId: string, userId: string, ownerId: string, now: Date, leaseMs: number): Promise<{ proposal: SchedulingProposal; approval: ProposalApproval; resumed: boolean }> {
    return this.serialized(async () => {
      const state = await this.read();
      const index = state.proposals.findIndex((item) => item.proposal_id === proposalId && item.user_id === userId);
      if (index < 0) throw new DomainError("Proposal not found.", "NOT_FOUND");
      const current = state.proposals[index];
      const approval = state.approvals?.[proposalId];
      if (!approval || approval.user_id !== userId) throw new DomainError("Approval does not match this proposal.", "STALE_APPROVAL");
      const activeLease = approval.execution_lease && Date.parse(approval.execution_lease.expires_at) > now.getTime();
      if (activeLease) throw new DomainError("Another execution attempt is already in progress.", "INVALID_STATE");
      const lease = { owner_id: ownerId, acquired_at: now.toISOString(), expires_at: new Date(now.getTime() + leaseMs).toISOString() };
      if (current.status === "EXECUTING" || current.status === "PARTIALLY_COMPLETED") {
        if (!approval.consumed_at) throw new DomainError("The execution journal is inconsistent.", "INVALID_STATE");
        const resumedApproval = { ...approval, execution_lease: lease };
        state.approvals![proposalId] = resumedApproval;
        await this.write(state);
        return { proposal: structuredClone(current), approval: structuredClone(resumedApproval), resumed: true };
      }
      if (current.status !== "APPROVED" || approval.proposal_version !== current.version || approval.consumed_at) throw new DomainError("This approval cannot be executed.", "INVALID_STATE");
      if (Date.parse(approval.expires_at) <= now.getTime()) throw new DomainError("Approval expired. Review the proposal again.", "STALE_APPROVAL");
      const { proposal_hash: _, ...base } = current;
      const executingBase = { ...base, version: current.version + 1, status: "EXECUTING" as const };
      const executing = { ...executingBase, proposal_hash: hashForStoredProposal(executingBase) } as SchedulingProposal;
      const consumed = { ...approval, consumed_at: now.toISOString(), execution_lease: lease };
      state.proposals[index] = executing;
      state.approvals![proposalId] = consumed;
      await this.write(state);
      return { proposal: structuredClone(executing), approval: structuredClone(consumed), resumed: false };
    });
  }

  async assertExecutionLease(proposalId: string, userId: string, ownerId: string, now: Date, leaseMs: number): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      const approval = state.approvals?.[proposalId];
      const lease = approval?.execution_lease;
      if (!approval || approval.user_id !== userId || !lease || lease.owner_id !== ownerId || Date.parse(lease.expires_at) <= now.getTime()) throw new DomainError("Execution ownership was lost; no provider action was started.", "INVALID_STATE");
      approval.execution_lease = { ...lease, expires_at: new Date(now.getTime() + leaseMs).toISOString() };
      state.approvals![proposalId] = approval;
      await this.write(state);
    });
  }

  async finishExecution(proposal: SchedulingProposal, expectedVersion: number, ownerId: string): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      const index = state.proposals.findIndex((item) => item.proposal_id === proposal.proposal_id && item.user_id === proposal.user_id);
      const approval = state.approvals?.[proposal.proposal_id];
      if (index < 0 || state.proposals[index].version !== expectedVersion) throw new DomainError("The proposal changed during execution.", "STALE_APPROVAL");
      if (!approval?.execution_lease || approval.execution_lease.owner_id !== ownerId) throw new DomainError("Execution ownership was lost.", "INVALID_STATE");
      state.proposals[index] = structuredClone(proposal);
      delete approval.execution_lease;
      state.approvals![proposal.proposal_id] = approval;
      await this.write(state);
    });
  }

  async approval(proposalId: string): Promise<ProposalApproval | undefined> {
    return structuredClone((await this.read()).approvals?.[proposalId]);
  }
}
