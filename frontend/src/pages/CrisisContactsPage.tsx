import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { crisisContactsApi } from '../services/api'
import { ArrowLeft, Search, Plus, Upload, Download, Phone, Mail, Edit2, Trash2, X, AlertCircle } from 'lucide-react'
import Modal from '../components/Modal'
import LoadingScreen from '../components/LoadingScreen'

interface Contact {
  id: number
  exercise_id: number
  name: string
  function: string | null
  organization: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  category: string
  priority: string
  notes: string | null
  availability: string | null
  display_name: string
  created_at: string
  updated_at: string
}

const categoryLabels: Record<string, string> = {
  autorite: 'Autorité',
  expert: 'Expert',
  media: 'Média',
  interne: 'Interne',
  externe: 'Externe',
  urgence: 'Urgence',
  autre: 'Autre',
}

const priorityLabels: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critique', color: 'bg-red-100 text-red-800' },
  high: { label: 'Haute', color: 'bg-orange-100 text-orange-800' },
  normal: { label: 'Normale', color: 'bg-primary-100 text-primary-800' },
  low: { label: 'Basse', color: 'bg-gray-100 text-gray-800' },
}

export default function CrisisContactsPage() {
  const { t } = useTranslation()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null)

  // Fetch contacts
  const { data: contactsData, isLoading } = useQuery({
    queryKey: ['crisis-contacts', exerciseId, search, categoryFilter, priorityFilter],
    queryFn: () => crisisContactsApi.list(parseInt(exerciseId!), {
      search: search || undefined,
      category: categoryFilter || undefined,
      priority: priorityFilter || undefined,
      page_size: 100,
    }),
    enabled: !!exerciseId,
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => crisisContactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crisis-contacts', exerciseId] })
      setDeletingContact(null)
    },
  })

  const contacts = contactsData?.contacts || []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate(`/exercises/${exerciseId}`)}
            className="mr-4 p-2 hover:bg-gray-200 rounded"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Annuaire de Crise</h1>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">{t('exercises.intros.contacts')}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Upload size={18} className="mr-2" />
            Importer
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <Plus size={18} className="mr-2" />
            Ajouter
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom, fonction, organisation, email..."
                className="w-full pl-10 pr-4 py-2 border rounded-md"
              />
            </div>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="">Toutes catégories</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="">Toutes priorités</option>
            {Object.entries(priorityLabels).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Contacts List */}
      {isLoading ? (
        <LoadingScreen />
      ) : contacts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 mb-4">Aucun contact trouvé</p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <Plus size={18} className="mr-2" />
            Ajouter un contact
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coordonnées
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Catégorie
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priorité
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Disponibilité
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contacts.map((contact: Contact) => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{contact.name}</div>
                      {contact.function && (
                        <div className="text-sm text-gray-500">{contact.function}</div>
                      )}
                      {contact.organization && (
                        <div className="text-sm text-gray-400">{contact.organization}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center text-sm text-primary-600 hover:underline"
                        >
                          <Mail size={14} className="mr-1" />
                          {contact.email}
                        </a>
                      )}
                      {contact.phone && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone size={14} className="mr-1" />
                          {contact.phone}
                        </div>
                      )}
                      {contact.mobile && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone size={14} className="mr-1" />
                          {contact.mobile}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                      {categoryLabels[contact.category] || contact.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${priorityLabels[contact.priority]?.color || 'bg-gray-100'}`}>
                      {priorityLabels[contact.priority]?.label || contact.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {contact.availability || '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setEditingContact(contact)}
                      className="p-1 text-gray-400 hover:text-gray-600 mr-2"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeletingContact(contact)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <ContactFormModal
        isOpen={isCreateModalOpen || !!editingContact}
        onClose={() => {
          setIsCreateModalOpen(false)
          setEditingContact(null)
        }}
        exerciseId={parseInt(exerciseId!)}
        contact={editingContact}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['crisis-contacts', exerciseId] })
          setIsCreateModalOpen(false)
          setEditingContact(null)
        }}
      />

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        exerciseId={parseInt(exerciseId!)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['crisis-contacts', exerciseId] })
          setIsImportModalOpen(false)
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingContact}
        onClose={() => setDeletingContact(null)}
        title="Confirmer la suppression"
      >
        <div className="p-6">
          <p className="mb-4">
            Êtes-vous sûr de vouloir supprimer le contact <strong>{deletingContact?.name}</strong> ?
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setDeletingContact(null)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
            >
              Annuler
            </button>
            <button
              onClick={() => deletingContact && deleteMutation.mutate(deletingContact.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Contact Form Modal Component
function ContactFormModal({
  isOpen,
  onClose,
  exerciseId,
  contact,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  exerciseId: number
  contact: Contact | null
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    name: '',
    function: '',
    organization: '',
    email: '',
    phone: '',
    mobile: '',
    category: 'autre',
    priority: 'normal',
    notes: '',
    availability: '',
  })

  // Reset form when contact changes
  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name,
        function: contact.function || '',
        organization: contact.organization || '',
        email: contact.email || '',
        phone: contact.phone || '',
        mobile: contact.mobile || '',
        category: contact.category,
        priority: contact.priority,
        notes: contact.notes || '',
        availability: contact.availability || '',
      })
    } else {
      setFormData({
        name: '',
        function: '',
        organization: '',
        email: '',
        phone: '',
        mobile: '',
        category: 'autre',
        priority: 'normal',
        notes: '',
        availability: '',
      })
    }
  }, [contact])

  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (contact) {
        return crisisContactsApi.update(contact.id, data)
      }
      return crisisContactsApi.create({ exercise_id: exerciseId, ...data })
    },
    onSuccess: () => onSuccess(),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    mutation.mutate(formData)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contact ? 'Modifier le contact' : 'Ajouter un contact'}
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fonction
            </label>
            <input
              type="text"
              value={formData.function}
              onChange={(e) => setFormData({ ...formData, function: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organisation
            </label>
            <input
              type="text"
              value={formData.organization}
              onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Téléphone
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mobile
            </label>
            <input
              type="text"
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Catégorie
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priorité
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            >
              {Object.entries(priorityLabels).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Disponibilité
            </label>
            <input
              type="text"
              value={formData.availability}
              onChange={(e) => setFormData({ ...formData, availability: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
              placeholder="ex: 24/7, 9h-18h"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !formData.name.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Enregistrement...' : contact ? 'Modifier' : 'Ajouter'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Import Modal Component
function ImportModal({
  isOpen,
  onClose,
  exerciseId,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  exerciseId: number
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{
    success: number
    errors: any[]
    total: number
    users_created?: number
    users_assigned?: number
    users_updated?: number
    users_skipped?: number
  } | null>(null)

  const mutation = useMutation({
    mutationFn: (file: File) => crisisContactsApi.import(exerciseId, file),
    onSuccess: (data) => {
      setResult(data)
      if (data.success > 0) {
        onSuccess()
      }
    },
  })

  const handleDownloadTemplate = async () => {
    const blob = await crisisContactsApi.downloadTemplate()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'annuaire_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    setFile(null)
    setResult(null)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importer des contacts"
    >
      <div className="p-6 space-y-4">
        {!result ? (
          <>
            <div className="bg-primary-50 text-primary-800 p-3 rounded-md text-sm">
              <p className="font-medium mb-1">Formats acceptés : CSV, JSON</p>
              <p>
                <button
                  onClick={handleDownloadTemplate}
                  className="underline hover:no-underline"
                >
                  Télécharger le template CSV
                </button>
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".csv,.json"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="import-file"
              />
              <label
                htmlFor="import-file"
                className="cursor-pointer"
              >
                <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                <p className="text-gray-600">
                  {file ? file.name : 'Cliquez pour sélectionner un fichier'}
                </p>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Annuler
              </button>
              <button
                onClick={() => file && mutation.mutate(file)}
                disabled={!file || mutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {mutation.isPending ? t('crisis.importing') : t('crisis.import')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`p-4 rounded-md ${result.errors.length > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
              <p className={`font-medium ${result.errors.length > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                {t('crisis.import_complete', { imported: result.success, total: result.total })}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                {t('crisis.import_stats', {
                  created: result.users_created || 0,
                  assigned: result.users_assigned || 0,
                  updated: result.users_updated || 0,
                  skipped: result.users_skipped || 0,
                })}
              </p>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-50 p-3 rounded-md">
                <div className="flex items-center text-red-800 font-medium mb-2">
                  <AlertCircle size={16} className="mr-2" />
                  {t('crisis.import_errors_count', { count: result.errors.length })}
                </div>
                <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i}>{t('crisis.import_error_line', { line: err.row, error: err.error })}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
