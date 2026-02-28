import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { crisisContactsApi } from '../services/api'
import { Search, X, User } from 'lucide-react'

interface Contact {
  id: number
  name: string
  function: string | null
  organization: string | null
  email: string | null
  display_name: string
}

interface ContactAutocompleteProps {
  exerciseId: number
  value: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  className?: string
}

export default function ContactAutocomplete({
  exerciseId,
  value,
  onChange,
  placeholder = 'Rechercher des contacts...',
  className = '',
}: ContactAutocompleteProps) {
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Fetch contacts based on search
  const { data: contactsData } = useQuery({
    queryKey: ['crisis-contacts-search', exerciseId, search],
    queryFn: () => crisisContactsApi.list(exerciseId, {
      search: search || undefined,
      page_size: 10,
    }),
    enabled: isOpen && !!exerciseId,
  })

  const contacts = contactsData?.contacts || []

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle contact selection
  const handleSelect = (contact: Contact) => {
    const participant = `actor:${contact.name}`
    if (!value.includes(participant)) {
      onChange([...value, participant])
    }
    setSearch('')
    setIsOpen(false)
  }

  // Handle removing a selected contact
  const handleRemove = (participant: string) => {
    onChange(value.filter(v => v !== participant))
  }

  // Get display name from participant string
  const getDisplayName = (participant: string) => {
    const parts = participant.split(':')
    return parts.length > 1 ? parts[1] : participant
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Selected contacts */}
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map((participant) => (
          <span
            key={participant}
            className="inline-flex items-center px-2 py-1 bg-primary-100 text-primary-800 rounded text-sm"
          >
            <User size={12} className="mr-1" />
            {getDisplayName(participant)}
            <button
              type="button"
              onClick={() => handleRemove(participant)}
              className="ml-1 hover:text-primary-600"
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 border rounded-md"
        />
      </div>

      {/* Dropdown */}
      {isOpen && contacts.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {contacts.map((contact: Contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => handleSelect(contact)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100"
            >
              <div className="font-medium">{contact.name}</div>
              {(contact.function || contact.organization) && (
                <div className="text-sm text-gray-500">
                  {[contact.function, contact.organization].filter(Boolean).join(' - ')}
                </div>
              )}
              {contact.email && (
                <div className="text-xs text-gray-400">{contact.email}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && search && contacts.length === 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg p-4 text-center text-gray-500">
          Aucun contact trouvé
        </div>
      )}
    </div>
  )
}