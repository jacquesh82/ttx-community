import { InjectBankKind } from '../services/api'

export const INJECT_BANK_KIND_LABELS: Record<InjectBankKind, string> = {
  mail: 'Email',
  sms: 'SMS',
  call: 'Appel téléphonique',
  socialnet: 'Réseau social',
  tv: 'TV',
  doc: 'Document',
  directory: 'Annuaire de crise',
  story: 'Scénario',
}

export const INJECT_BANK_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  ready: 'Prêt à assembler',
  archived: 'Archivé',
}
