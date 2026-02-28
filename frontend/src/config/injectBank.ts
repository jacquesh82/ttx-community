import { InjectBankKind } from '../services/api'

export const INJECT_BANK_KIND_LABELS: Record<InjectBankKind, string> = {
  idea: 'Idée',
  video: 'Vidéo',
  audio: 'Audio',
  scenario: 'Scénario',
  chronogram: 'Chronogramme',
  image: 'Image',
  mail: 'Email',
  message: 'Message',
  directory: 'Répertoire',
  reference_url: 'Référence URL',
  social_post: 'Réseau social',
  document: 'Document',
  canal_press: 'Canal Press',
  canal_anssi: 'Canal ANSSI',
  canal_gouvernement: 'Canal Gouvernement',
  other: 'Autre',
}

export const INJECT_BANK_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  ready: 'Prêt à assembler',
  archived: 'Archivé',
}
