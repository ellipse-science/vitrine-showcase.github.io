'use client'

import { useEffect, useRef, useState } from 'react'

interface ShareButtonProps {
  title: string
  // Id de la section ciblée (ex. "partis-et-couverture") — ajouté en fragment
  // d'URL pour que le lien partagé amène directement au module, pas juste à
  // l'accueil.
  anchor?: string
}

// Web Share API : ouvre la feuille de partage native du système (X, Instagram,
// WhatsApp, Messages, courriel, etc. — tout est déjà géré par l'OS/le navigateur).
// Repli sur la copie du lien pour les navigateurs qui ne la supportent pas,
// ou si le partage natif échoue pour une raison autre qu'une annulation.
export function ShareButton({ title, anchor }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copiedTimeout.current), [])

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

  const handleShare = async () => {
    const { origin, pathname, search } = window.location
    const url = anchor ? `${origin}${pathname}${search}#${anchor}` : window.location.href
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        // échec autre qu'une annulation — on retombe sur la copie du lien
      }
    }
    await copyLink(url)
  }

  return (
    <button
      type="button"
      className={`share-btn${copied ? ' copied' : ''}`}
      onClick={handleShare}
      aria-label={`Partager : ${title}`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="2" r="1.5" stroke="currentColor" strokeWidth="1" />
        <circle cx="2" cy="5" r="1.5" stroke="currentColor" strokeWidth="1" />
        <circle cx="7.5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1" />
        <line x1="3.4" y1="4.3" x2="6.1" y2="2.7" stroke="currentColor" strokeWidth="1" />
        <line x1="3.4" y1="5.7" x2="6.1" y2="7.3" stroke="currentColor" strokeWidth="1" />
      </svg>
      {copied ? 'Copié !' : 'Partager'}
    </button>
  )
}
