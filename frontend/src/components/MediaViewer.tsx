import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ZoomIn, ZoomOut, RotateCw, Maximize2, Download, Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react'

export interface MediaViewerProps {
  // Image props
  imageUrl?: string | null
  imageAlt?: string
  
  // Video props
  videoUrl?: string | null
  
  // Common props
  isOpen: boolean
  onClose: () => void
  title?: string
  showDownload?: boolean
  downloadUrl?: string | null
}

export function MediaViewer({
  imageUrl,
  imageAlt = 'Image',
  videoUrl,
  isOpen,
  onClose,
  title,
  showDownload = false,
  downloadUrl,
}: MediaViewerProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const isVideo = Boolean(videoUrl)
  const isImage = Boolean(imageUrl)
  
  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setZoom(1)
      setRotation(0)
      setIsFullscreen(false)
      setIsPlaying(false)
      setIsLoading(true)
    }
  }, [isOpen])
  
  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case '+':
        case '=':
          if (isImage) setZoom(z => Math.min(z + 0.25, 5))
          break
        case '-':
          if (isImage) setZoom(z => Math.max(z - 0.25, 0.25))
          break
        case 'r':
        case 'R':
          if (isImage) setRotation(r => (r + 90) % 360)
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case ' ':
          if (isVideo && videoRef.current) {
            e.preventDefault()
            togglePlay()
          }
          break
        case 'm':
        case 'M':
          if (isVideo) toggleMute()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isImage, isVideo, zoom, rotation])
  
  // Handle click outside to close
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])
  
  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isImage) return
    
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom(z => Math.max(0.25, Math.min(5, z + delta)))
  }, [isImage])
  
  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])
  
  // Toggle play/pause for video
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    
    if (videoRef.current.paused) {
      videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }, [])
  
  // Toggle mute for video
  const toggleMute = useCallback(() => {
    if (!videoRef.current) return
    
    videoRef.current.muted = !videoRef.current.muted
    setIsMuted(videoRef.current.muted)
  }, [])
  
  // Handle video events
  const handleVideoPlay = () => setIsPlaying(true)
  const handleVideoPause = () => setIsPlaying(false)
  const handleVideoLoadStart = () => setIsLoading(true)
  const handleVideoCanPlay = () => setIsLoading(false)
  const handleImageLoad = () => setIsLoading(false)
  
  // Download handler
  const handleDownload = useCallback(() => {
    if (!downloadUrl) return
    
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = title || 'media'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [downloadUrl, title])
  
  if (!isOpen) return null
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={handleBackdropClick}
      ref={containerRef}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="flex items-center gap-3">
          {title && (
            <h2 className="text-lg font-medium text-white truncate max-w-md">
              {title}
            </h2>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom controls for images */}
          {isImage && (
            <>
              <button
                onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
                title="Zoom arrière"
              >
                <ZoomOut size={20} />
              </button>
              <span className="text-white/70 text-sm min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(5, z + 0.25))}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
                title="Zoom avant"
              >
                <ZoomIn size={20} />
              </button>
              <button
                onClick={() => setRotation(r => (r + 90) % 360)}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
                title="Rotation"
              >
                <RotateCw size={20} />
              </button>
            </>
          )}
          
          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
            title="Plein écran"
          >
            <Maximize2 size={20} />
          </button>
          
          {/* Download */}
          {showDownload && downloadUrl && (
            <button
              onClick={handleDownload}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
              title="Télécharger"
            >
              <Download size={20} />
            </button>
          )}
          
          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
            title="Fermer (Échap)"
          >
            <X size={24} />
          </button>
        </div>
      </div>
      
      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/30 border-t-white" />
        </div>
      )}
      
      {/* Media content */}
      <div 
        className="flex items-center justify-center w-full h-full p-16"
        onWheel={handleWheel}
      >
        {isImage && imageUrl && (
          <img
            src={imageUrl}
            alt={imageAlt}
            onLoad={handleImageLoad}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease-out',
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
            }}
            className="select-none"
            draggable={false}
          />
        )}
        
        {isVideo && videoUrl && (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onLoadStart={handleVideoLoadStart}
              onCanPlay={handleVideoCanPlay}
              className="max-h-full max-w-full"
              style={{ maxHeight: 'calc(100vh - 8rem)' }}
            />
            
            {/* Video controls overlay */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-lg p-2">
              <button
                onClick={togglePlay}
                className="p-2 text-white hover:bg-white/20 rounded transition"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                onClick={toggleMute}
                className="p-2 text-white hover:bg-white/20 rounded transition"
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer with keyboard shortcuts */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
        <div className="flex items-center justify-center gap-4 text-xs text-white/50">
          {isImage && (
            <>
              <span>Molette: zoom</span>
              <span>•</span>
              <span>R: rotation</span>
              <span>•</span>
              <span>F: plein écran</span>
            </>
          )}
          {isVideo && (
            <>
              <span>Espace: play/pause</span>
              <span>•</span>
              <span>M: muet</span>
              <span>•</span>
              <span>F: plein écran</span>
            </>
          )}
          <span>•</span>
          <span>Échap: fermer</span>
        </div>
      </div>
    </div>
  )
}

export default MediaViewer