import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { mediaApi, Media, ExercisePlugin, exercisesApi } from '../services/api'
import Modal from '../components/Modal'
import ExerciseSubpageShell from '../components/exercise/ExerciseSubpageShell'
import { useAppDialog } from '../contexts/AppDialogContext'

export default function MediaLibraryPage() {
  const appDialog = useAppDialog()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const exId = parseInt(exerciseId || '0', 10)
  const [media, setMedia] = useState<Media[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [mimeTypeFilter, setMimeTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [plugins, setPlugins] = useState<ExercisePlugin[]>([])
  const [savingPlugins, setSavingPlugins] = useState(false)

  const fetchMedia = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await mediaApi.list({
        exercise_id: exerciseId ? parseInt(exerciseId) : undefined,
        page,
        page_size: pageSize,
        search: search || undefined,
        mime_type: mimeTypeFilter || undefined,
      })
      setMedia(response.media)
      setTotal(response.total)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }, [exerciseId, page, pageSize, search, mimeTypeFilter])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  useEffect(() => {
    const fetchPlugins = async () => {
      if (!exerciseId) return
      try {
        const data = await exercisesApi.get(parseInt(exerciseId))
        setPlugins(data.plugins || [])
      } catch {
        // Non-blocking: media library remains usable if plugin endpoint fails.
      }
    }
    fetchPlugins()
  }, [exerciseId])

  const handleUpload = async (files: FileList) => {
    setUploading(true)
    setError(null)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        await mediaApi.upload(file, {
          exercise_id: exerciseId ? parseInt(exerciseId) : undefined,
        })
      }
      setShowUploadModal(false)
      fetchMedia()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (mediaId: number) => {
    if (!(await appDialog.confirm('Are you sure you want to delete this file?'))) return
    try {
      await mediaApi.delete(mediaId)
      fetchMedia()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete media')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const getFileIcon = (m: Media) => {
    if (m.is_image) return '🖼️'
    if (m.is_video) return '🎬'
    if (m.is_audio) return '🎵'
    if (m.is_pdf) return '📄'
    return '📎'
  }

  const totalPages = Math.ceil(total / pageSize)

  const togglePlugin = async (pluginType: ExercisePlugin['plugin_type']) => {
    if (!exerciseId) return
    const next = plugins.map((p) => p.plugin_type === pluginType ? { ...p, enabled: !p.enabled } : p)
    const target = next.find((p) => p.plugin_type === pluginType)
    if (!target) return
    setPlugins(next)
    setSavingPlugins(true)
    try {
      await exercisesApi.togglePlugin(parseInt(exerciseId), pluginType, target.enabled)
    } finally {
      setSavingPlugins(false)
    }
  }

  return (
    <ExerciseSubpageShell
      exerciseId={exId}
      sectionLabel="Medias"
      title="Mediatheque"
      actions={
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 transition"
        >
          Upload
        </button>
      }
    >
    <div className="space-y-6">

      {/* Filters */}
      {exerciseId && plugins.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-medium">Plugins canaux medias</h2>
            {savingPlugins && <span className="text-xs text-gray-400">Sauvegarde...</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {plugins.map((p) => (
              <label key={p.plugin_type} className="flex items-center justify-between px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200">
                <span>{p.info?.name || p.plugin_type}</span>
                <input type="checkbox" checked={p.enabled} onChange={() => togglePlugin(p.plugin_type)} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <select
          value={mimeTypeFilter}
          onChange={(e) => {
            setMimeTypeFilter(e.target.value)
            setPage(1)
          }}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Tous les types</option>
          <option value="image">Images</option>
          <option value="video">Vidéos</option>
          <option value="audio">Audio</option>
          <option value="application/pdf">PDF</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      ) : (
        <>
          {/* Media Grid */}
          {media.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-4">📂</p>
              <p>Aucun fichier dans la médiathèque</p>
              <p className="text-sm mt-2">Cliquez sur "Upload" pour ajouter des fichiers</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {media.map((m) => (
                <div
                  key={m.id}
                  className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-purple-500 transition cursor-pointer group"
                  onClick={() => {
                    setSelectedMedia(m)
                    setShowEditModal(true)
                  }}
                >
                  {/* Preview */}
                  <div className="aspect-square bg-gray-900 flex items-center justify-center">
                    {m.is_image ? (
                      <img
                        src={mediaApi.getPreviewUrl(m.id)}
                        alt={m.title || m.original_filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl">{getFileIcon(m)}</span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm text-white truncate" title={m.title || m.original_filename}>
                      {m.title || m.original_filename}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatSize(m.size)}
                    </p>
                  </div>
                  {/* Actions */}
                  <div className="px-3 pb-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <a
                      href={mediaApi.getDownloadUrl(m.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-center text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
                    >
                      Télécharger
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(m.id)
                      }}
                      className="text-xs px-2 py-1 bg-red-600/20 hover:bg-red-600/40 rounded text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed text-white"
              >
                Précédent
              </button>
              <span className="text-gray-400">
                Page {page} sur {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed text-white"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <Modal isOpen={showUploadModal} title="Uploader des fichiers" onClose={() => setShowUploadModal(false)}>
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-purple-500 transition cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files.length > 0) {
                  handleUpload(e.dataTransfer.files)
                }
              }}
            >
              <input
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleUpload(e.target.files)
                  }
                }}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <p className="text-4xl mb-4">📤</p>
                <p className="text-gray-300">Glissez-déposez vos fichiers ici</p>
                <p className="text-sm text-gray-500 mt-2">ou cliquez pour sélectionner</p>
                <p className="text-xs text-gray-600 mt-4">
                  Images, vidéos, audio, PDF (max 200MB)
                </p>
              </label>
            </div>
            {uploading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mr-2"></div>
                <span className="text-gray-300">Upload en cours...</span>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedMedia && (
        <Modal isOpen={showEditModal} title="Détails du média" onClose={() => setShowEditModal(false)}>
          <MediaEditForm
            media={selectedMedia}
            onUpdate={async (data) => {
              await mediaApi.update(selectedMedia.id, data)
              fetchMedia()
              setShowEditModal(false)
            }}
            onDelete={async () => {
              await handleDelete(selectedMedia.id)
              setShowEditModal(false)
            }}
          />
        </Modal>
      )}
    </div>
    </ExerciseSubpageShell>
  )
}

function MediaEditForm({
  media,
  onUpdate,
  onDelete,
}: {
  media: Media
  onUpdate: (data: { title?: string; description?: string; tags?: string[] }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState(media.title || '')
  const [description, setDescription] = useState(media.description || '')
  const [tags, setTags] = useState((media.tags || []).join(', '))
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onUpdate({
      title: title || undefined,
      description: description || undefined,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    })
    setSaving(false)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Preview */}
      <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden">
        {media.is_image ? (
          <img
            src={mediaApi.getPreviewUrl(media.id)}
            alt={media.title || media.original_filename}
            className="max-w-full max-h-full object-contain"
          />
        ) : media.is_video ? (
          <video
            src={mediaApi.getStreamUrl(media.id)}
            controls
            className="max-w-full max-h-full"
          />
        ) : media.is_audio ? (
          <div className="text-center">
            <p className="text-4xl mb-4">🎵</p>
            <audio src={mediaApi.getStreamUrl(media.id)} controls className="mx-auto" />
          </div>
        ) : (
          <div className="text-center">
            <p className="text-4xl mb-4">📄</p>
            <p className="text-gray-400">{media.mime_type}</p>
          </div>
        )}
      </div>

      {/* File info */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-gray-400">Fichier:</div>
        <div className="text-white truncate">{media.original_filename}</div>
        <div className="text-gray-400">Type:</div>
        <div className="text-white">{media.mime_type}</div>
        <div className="text-gray-400">Taille:</div>
        <div className="text-white">{formatSize(media.size)}</div>
      </div>

      {/* Edit fields */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Titre</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Tags (séparés par des virgules)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="crise, communication, presse..."
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition"
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-4 py-2 bg-red-600/20 text-red-400 rounded hover:bg-red-600/40 transition"
        >
          Supprimer
        </button>
      </div>
    </form>
  )
}
