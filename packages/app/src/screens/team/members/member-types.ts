export interface TeamMemberProposal {
  name: string;
  description: string;
  rolePrompt: string;
  templateId: string;
}

export interface MemberWorkspaceOption {
  id: string;
  label: string;
  description?: string;
}

export interface MemberProjectOption {
  projectId: string;
  projectName: string;
  workspaceOptions: readonly MemberWorkspaceOption[];
  /** True for the project being edited from: it must keep an assignment. */
  required: boolean;
}

export interface MemberAssignmentRecord {
  projectId: string;
  homeWorkspaceId: string | null;
}
