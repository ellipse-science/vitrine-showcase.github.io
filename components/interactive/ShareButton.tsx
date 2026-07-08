'use client'

import { useEffect, useRef, useState } from 'react'

interface ShareButtonProps {
  title: string
  // Id de la section ciblée (ex. "partis-et-couverture") — ajouté en fragment
  // d'URL pour que le lien partagé amène directement au module, pas juste à
  // l'accueil.
  anchor?: string
}

// Réseaux ouverts en repli quand le navigateur ne supporte pas
// navigator.share() (la plupart des navigateurs desktop). URL de partage
// standard, sans dépendance externe.
function networkLinks(title: string, url: string) {
  return [
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  ]
}

// Icône seule (pas de libellé) pour rester discret dans les en-têtes de
// module. navigator.share() ouvre la feuille native (mobile, et certains
// navigateurs desktop) ; sinon un petit menu de réseaux s'ouvre — plutôt
// qu'une simple copie de lien silencieuse, peu utile sur desktop.
export function ShareButton({ title, anchor }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => clearTimeout(copiedTimeout.current), [])

  useEffect(() => {
    if (!panelOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setPanelOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [panelOpen])

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      clearTimeout(copiedTimeout.current)
      setCopied(true)
      copiedTimeout.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // presse-papier non disponible
    }
  }

  // Fragment d'URL pour ramener directement au module partagé, plutôt qu'à
  // l'accueil.
  const shareUrl = () => {
    const { origin, pathname, search } = window.location
    return anchor ? `${origin}${pathname}${search}#${anchor}` : window.location.href
  }

  const handleClick = async () => {
    const url = shareUrl()
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        // échec autre qu'une annulation — on retombe sur la copie du lien
      }
      await copyLink(url)
      return
    }
    setPanelOpen((v) => !v)
  }

  return (
    <div ref={wrapperRef} className="share-wrap">
      <button
        type="button"
        className={`share-btn${copied ? ' copied' : ''}`}
        onClick={handleClick}
        aria-label={`Partager : ${title}`}
        aria-expanded={panelOpen}
        title={copied ? 'Copié !' : 'Partager'}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M2.5 6.8L5.2 9.5L10.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <circle cx="9.5" cy="2.5" r="1.8" stroke="currentColor" strokeWidth="1.1" />
            <circle cx="2.5" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.1" />
            <circle cx="9.5" cy="10.5" r="1.8" stroke="currentColor" strokeWidth="1.1" />
            <line x1="4.2" y1="5.5" x2="7.8" y2="3.4" stroke="currentColor" strokeWidth="1.1" />
            <line x1="4.2" y1="7.5" x2="7.8" y2="9.6" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        )}
      </button>

      {panelOpen && (
        <div className="share-panel">
          {networkLinks(title, shareUrl()).map((n) => (
            <a
              key={n.key}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              className="share-panel-item"
              onClick={() => setPanelOpen(false)}
            >
              {n.label}
            </a>
          ))}
          <button
            type="button"
            className="share-panel-item"
            onClick={() => { copyLink(shareUrl()); setPanelOpen(false) }}
          >
            Copier le lien
          </button>
        </div>
      )}
    </div>
  )
}
