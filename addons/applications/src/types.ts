export interface ApplicationForm {
  id: string;
  guildId: string;
  name: string;
  description: string;
  fields: ApplicationField[];
  reviewChannelId: string;
  acceptRoleId?: string;
  denyDmMessage?: string;
  acceptDmMessage?: string;
  enabled: boolean;
  createdAt: string;
}

export interface ApplicationField {
  id: string;
  label: string;
  placeholder?: string;
  required: boolean;
  style: 'short' | 'paragraph';
  minLength?: number;
  maxLength?: number;
}

export interface ApplicationSubmission {
  id: string;
  formId: string;
  guildId: string;
  userId: string;
  userTag: string;
  answers: Record<string, string>; // fieldId → answer
  status: 'pending' | 'accepted' | 'denied';
  reviewerId?: string;
  reviewerTag?: string;
  reviewNote?: string;
  reviewMessageId?: string;
  reviewChannelId?: string;
  submittedAt: string;
}
