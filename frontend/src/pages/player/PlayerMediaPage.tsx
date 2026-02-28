import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { playerApi } from '../../services/playerApi'
import {
  FolderOpen,
  FileText,
  Image,
  Video,
  File,
  Download,
  Search,
  Grid,
  List,
  Clock,
  FileImage,
  FileVideo,
  FileAudio,
} from 'lucide-react'

interface MediaItem {
  id: number
  name: string
  type: string
  size?: number
  created_at: string
  url?: string
}

export default function PlayerMediaPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')

  // Placeholder media data - in real app would come from API
  const mediaItems: MediaItem[] = []

  const filteredMedia = mediaItems.filter((item) => {
    if (selectedType !== 'all' && item.type !== selectedType) return false
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const typeFilters = [
    { id: 'all', label: 'Tous', icon: FolderOpen },
    { id: 'image', label: 'Images', icon: Image },
    { id: 'video', label: 'Vidéos', icon: Video },
    { id: 'document', label: 'Documents', icon: FileText },
  ]

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <FileImage size={32} className="text-blue-400" />
      case 'video':
        return <FileVideo size={32} className="text-purple-400" />
      case 'audio':
        return <FileAudio size={32} className="text-green-400" />
      default:
        return <File size={32} className="text-gray-400" />
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Médiathèque</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Grid size={20} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
            }`}
          >
            <List size={20} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un fichier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-2">
            {typeFilters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setSelectedType(filter.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  selectedType === filter.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <filter.icon size={16} />
                <span className="text-sm">{filter.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Media grid/list */}
      {filteredMedia.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-12">
          <div className="text-center text-gray-400">
            <FolderOpen size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-lg">Aucun document disponible</p>
            <p className="text-sm mt-2">
              Les documents liés aux injects et aux événements apparaîtront ici.
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredMedia.map((item) => (
            <div
              key={item.id}
              className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors group"
            >
              {/* Preview */}
              <div className="aspect-square bg-gray-700 flex items-center justify-center">
                {item.type === 'image' && item.url ? (
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getMediaIcon(item.type)
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-sm font-medium text-white truncate">{item.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    {formatFileSize(item.size)}
                  </span>
                  <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-all">
                    <Download size={14} className="text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-3 text-sm font-medium text-gray-400">Nom</th>
                <th className="text-left p-3 text-sm font-medium text-gray-400">Type</th>
                <th className="text-left p-3 text-sm font-medium text-gray-400">Taille</th>
                <th className="text-left p-3 text-sm font-medium text-gray-400">Date</th>
                <th className="text-right p-3 text-sm font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredMedia.map((item) => (
                <tr key={item.id} className="hover:bg-gray-700/50 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center">
                        {getMediaIcon(item.type)}
                      </div>
                      <span className="text-sm text-white">{item.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-gray-400 capitalize">{item.type}</td>
                  <td className="p-3 text-sm text-gray-400">{formatFileSize(item.size)}</td>
                  <td className="p-3 text-sm text-gray-400">{formatDate(item.created_at)}</td>
                  <td className="p-3 text-right">
                    <button className="p-2 hover:bg-gray-600 rounded-lg transition-colors">
                      <Download size={16} className="text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Help text */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="flex items-start gap-3">
          <Clock size={20} className="text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-300">
              Les documents apparaissent automatiquement lorsqu'ils sont associés à des injects ou des événements.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Vous pouvez les télécharger ou les utiliser comme pièces jointes dans vos décisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}