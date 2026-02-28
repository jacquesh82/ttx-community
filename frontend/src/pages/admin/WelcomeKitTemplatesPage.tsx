import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2, Eye, FileText } from 'lucide-react'
import Modal from '../../components/Modal'
import { welcomeKitApi } from '../../services/api'
import { useAppDialog } from '../../contexts/AppDialogContext'

type WelcomeKitKind = 'player' | 'facilitator'

const KIND_LABELS: Record<WelcomeKitKind, string> = {
  player: 'Joueur',
  facilitator: 'Animateur',
}

const DEFAULT_TEMPLATE_MARKDOWN = `# 🎯 Kit de Bienvenue – Joueur

**Exercice :** {{exercise_name}}
**Date :** {{exercise_date}}
**Lieu :** {{exercise_location}}

---

## 🔐 Vos identifiants de connexion

| Champ            | Valeur        |
| ---------------- | ------------- |
| **Login**        | {{player_login}}  |
| **Mot de passe** | {{player_password}}  |

---

## 👤 Votre rôle dans l'exercice

* **Rôle :** {{player_role}}
* **Fonction :** {{player_function}}
* **Équipe :** {{player_team}}
* **Organisation :** {{organization_name}}

---

## 📋 Instructions

1. Connectez-vous à la plateforme avec vos identifiants.
2. Vous accéderez à votre interface personnelle.
3. Suivez les instructions de votre animateur tout au long de l'exercice.

---

## ⚠️ Important

* Ne partagez pas vos identifiants avec d'autres participants.
* Ce document est **confidentiel** et destiné uniquement à **{{player_name}}**.
* Document généré automatiquement – **Ne pas distribuer**.

---

*Page 1 / 1*
`

export default function WelcomeKitTemplatesPage() {
  const appDialog = useAppDialog()
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [selectedKind, setSelectedKind] = useState<WelcomeKitKind | ''>('')
  const [formData, setFormData] = useState({
    name: '',
    kind: 'player' as WelcomeKitKind,
    template_markdown: DEFAULT_TEMPLATE_MARKDOWN,
    is_default: false,
  })
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['welcome-kit-templates'],
    queryFn: () => welcomeKitApi.listTemplates(),
  })

  const templates = data?.templates || []
  const availableVariables = data?.available_variables || {}

  const createMutation = useMutation({
    mutationFn: (data: any) => welcomeKitApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welcome-kit-templates'] })
      setIsCreateModalOpen(false)
      resetForm()
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la création')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => welcomeKitApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welcome-kit-templates'] })
      setIsEditModalOpen(false)
      setEditingTemplate(null)
      resetForm()
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la mise à jour')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => welcomeKitApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welcome-kit-templates'] })
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      kind: 'player',
      template_markdown: DEFAULT_TEMPLATE_MARKDOWN,
      is_default: false,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    createMutation.mutate(formData)
  }

  const handleEdit = (template: any) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      kind: template.kind,
      template_markdown: template.template_markdown,
      is_default: template.is_default,
    })
    setIsEditModalOpen(true)
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    updateMutation.mutate({ id: editingTemplate.id, data: formData })
  }

  const handleDelete = async (id: number, isDefault: boolean) => {
    if (isDefault) {
      await appDialog.alert('Impossible de supprimer le template par défaut')
      return
    }
    if (await appDialog.confirm('Êtes-vous sûr de vouloir supprimer ce template ?')) {
      deleteMutation.mutate(id)
    }
  }

  const handlePreview = (markdown: string) => {
    // Convert markdown to HTML with proper styling
    let html = markdown
    
    // Tables - must be processed before other replacements
    html = html.replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g, (match, header, body) => {
      const headers = header.split('|').filter((h: string) => h.trim()).map((h: string) => `<th class="border border-gray-300 px-3 py-2 bg-gray-100 text-left text-sm font-medium">${h.trim()}</th>`).join('')
      const rows = body.trim().split('\n').map((row: string) => {
        const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td class="border border-gray-300 px-3 py-2 text-sm">${c.trim()}</td>`).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      return `<table class="w-full border-collapse border border-gray-300 my-4"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
    })
    
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-6 mb-3 text-gray-900">$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-6 mb-3 text-gray-900 border-b pb-2">$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-0 mb-4 text-gray-900">$1</h1>')
    
    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    
    // Code
    html = html.replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-blue-700">$1</code>')
    
    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr class="my-6 border-gray-300" />')
    
    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li class="ml-6 list-disc text-gray-700">$1</li>')
    
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-6 list-decimal text-gray-700">$1</li>')
    
    // Line breaks (but not inside tables)
    html = html.replace(/\n/g, '<br/>')
    
    // Clean up extra breaks around block elements
    html = html.replace(/<br\/>\s*<(h[1-6]|hr|table|ul|ol|li)/g, '<$1')
    html = html.replace(/<\/(h[1-6]|hr|table|ul|ol|li)>\s*<br\/>/g, '</$1>')
    
    setPreviewContent(html)
    setIsPreviewModalOpen(true)
  }

  const filteredTemplates = selectedKind
    ? templates.filter((t: any) => t.kind === selectedKind)
    : templates

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates de kits de bienvenue</h1>
          <p className="text-gray-600">Personnalisez les kits PDF générés pour les participants</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setIsCreateModalOpen(true)
          }}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <Plus className="mr-2" size={20} />
          Nouveau template
        </button>
      </div>

      <div className="mb-4">
        <select
          value={selectedKind}
          onChange={(e) => setSelectedKind(e.target.value as WelcomeKitKind | '')}
          className="px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">Tous les types</option>
          <option value="player">Joueur</option>
          <option value="facilitator">Animateur</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mise à jour</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredTemplates.map((template: any) => (
              <tr key={template.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{template.name}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded text-xs ${
                    template.kind === 'player' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {KIND_LABELS[template.kind as WelcomeKitKind] || template.kind}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {template.is_default ? (
                    <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">Par défaut</span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">Personnalisé</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(template.updated_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-6 py-4 text-sm space-x-2">
                  <button
                    onClick={() => handlePreview(template.template_markdown)}
                    className="text-gray-600 hover:text-gray-800"
                    title="Aperçu"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    className="text-primary-600 hover:text-primary-700"
                    title="Modifier"
                  >
                    <Edit size={16} />
                  </button>
                  {!template.is_default && (
                    <button
                      onClick={() => handleDelete(template.id, template.is_default)}
                      className="text-red-600 hover:text-red-700"
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && (
          <div className="p-8 text-center text-gray-500">Chargement...</div>
        )}

        {!isLoading && filteredTemplates.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <FileText className="mx-auto mb-2" size={32} />
            Aucun template trouvé
          </div>
        )}
      </div>

      {/* Variables disponibles */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Variables disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(availableVariables).map(([key, description]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <code className="bg-gray-100 px-2 py-1 rounded text-blue-700">{`{{${key}}}`}</code>
              <span className="text-gray-600">{description as string}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nouveau template"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du template</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={formData.kind}
              onChange={(e) => setFormData({ ...formData, kind: e.target.value as WelcomeKitKind })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="player">Joueur</option>
              <option value="facilitator">Animateur</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contenu Markdown</label>
            <textarea
              value={formData.template_markdown}
              onChange={(e) => setFormData({ ...formData, template_markdown: e.target.value })}
              rows={15}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs"
              placeholder="# Titre du kit..."
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_default"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
            />
            <label htmlFor="is_default" className="text-sm text-gray-700">
              Définir comme template par défaut pour ce type
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handlePreview(formData.template_markdown)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Aperçu
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Modifier le template"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du template</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={formData.kind}
              onChange={(e) => setFormData({ ...formData, kind: e.target.value as WelcomeKitKind })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
              disabled
            >
              <option value="player">Joueur</option>
              <option value="facilitator">Animateur</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">Le type ne peut pas être modifié</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contenu Markdown</label>
            <textarea
              value={formData.template_markdown}
              onChange={(e) => setFormData({ ...formData, template_markdown: e.target.value })}
              rows={15}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit_is_default"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
            />
            <label htmlFor="edit_is_default" className="text-sm text-gray-700">
              Définir comme template par défaut pour ce type
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handlePreview(formData.template_markdown)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Aperçu
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        title="Aperçu du template"
      >
        <div className="overflow-auto max-h-[70vh] bg-white rounded-lg border border-gray-200 p-8">
          <div
            className="max-w-none text-gray-900"
            style={{
              fontFamily: 'Times New Roman, Times, serif',
              fontSize: '12pt',
              lineHeight: '1.5',
            }}
            dangerouslySetInnerHTML={{ __html: previewContent }}
          />
        </div>
        <div className="flex justify-end pt-4">
          <button
            onClick={() => setIsPreviewModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Fermer
          </button>
        </div>
      </Modal>
    </div>
  )
}
