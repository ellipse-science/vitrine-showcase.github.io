'use client'

import { useEffect, useRef, useState } from 'react'

interface ShareButtonProps {
  title: string
  // Slug du module partagé (ex. "partis-et-couverture"), aussi utilisé comme
  // ancre d'accueil (#199). Pointe vers sa mini-page /partage/<slug>/, qui
  // porte ses propres balises OG/Twitter puis redirige vers #<slug> — les
  // réseaux ignorent le fragment d'URL pour construire l'aperçu, donc
  // partager l'URL brute de la page montrerait toujours la carte globale du
  // site plutôt que celle du module (#210).
  anchor?: string
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

// Réseaux ouverts en repli quand le navigateur ne supporte pas
// navigator.share() (la plupart des navigateurs desktop), ou en complément
// sur mobile. URL de partage standard, sans dépendance externe. `code` est le
// badge affiché (façon tag d'annotation) plutôt qu'un logo — pas de couleurs
// de marque dans le langage design du site.
function networkLinks(title: string, url: string) {
  return [
    { key: 'x', code: 'X', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
    { key: 'facebook', code: 'FB', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { key: 'linkedin', code: 'IN', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  ]
}

// PNG transparent 1×1 — sonde locale (aucun fetch réseau) pour tester si le
// navigateur sait partager des fichiers (navigator.canShare) avant d'exposer
// l'action Instagram. Le vrai visuel n'est récupéré qu'au moment du partage.
const PROBE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function canShareFiles(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  try {
    const res = await fetch(PROBE_PNG)
    const blob = await res.blob()
    const file = new File([blob], 'probe.png', { type: 'image/png' })
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

// Icône seule (pas de libellé) pour rester discret dans les en-têtes de
// module. Sur mobile capable de partager des fichiers, un tap ouvre le
// panneau (choix entre le lien et la story Instagram) plutôt que de partager
// le lien directement — les deux artefacts sont désormais distincts. Sinon,
// navigator.share() du lien reste immédiat ; en dernier repli, le panneau
// desktop s'ouvre.
export function ShareButton({ title, anchor }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [igSupported, setIgSupported] = useState(false)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => clearTimeout(copiedTimeout.current), [])

  useEffect(() => {
    let cancelled = false
    canShareFiles().then((supported) => { if (!cancelled) setIgSupported(supported) })
    return () => { cancelled = true }
  }, [])

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

  // Mini-page /partage/<anchor>/ (carte OG dédiée + redirection vers
  // #<anchor>) plutôt que l'URL à fragment, ignorée par les réseaux sociaux
  // pour l'aperçu de lien (#210).
  const shareUrl = () => {
    if (!anchor) return window.location.href
    return `${window.location.origin}${basePath}/partage/${anchor}/`
  }

  const previewSrc = anchor ? `${basePath}/partage/${anchor}/opengraph-image` : undefined
  // Pas de barre oblique finale : comme opengraph-image, cette route génère
  // un fichier "story" (pas un dossier avec index), même sur GitHub Pages.
  const storyUrl = () => `${window.location.origin}${basePath}/partage/${anchor}/story`

  const shareLinkNatively = async () => {
    try {
      await navigator.share({ title, url: shareUrl() })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      await copyLink(shareUrl())
    }
    setPanelOpen(false)
  }

  // Story verticale 1080×1920 (app/partage/[module]/story/route.tsx) plutôt
  // que le lien : Instagram ne déballe pas les liens, la feuille de partage
  // native est le seul chemin fiable vers Stories/Post/DM depuis le web.
  const shareToInstagram = async () => {
    try {
      const res = await fetch(storyUrl())
      const blob = await res.blob()
      const file = new File([blob], `vitrine-${anchor}.png`, { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title })
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        // échec de récupération/partage — l'utilisateur reste sur le panneau
      }
    }
    setPanelOpen(false)
  }

  const handleClick = async () => {
    if (igSupported) {
      setPanelOpen((v) => !v)
      return
    }
    if (typeof navigator.share === 'function') {
      await shareLinkNatively()
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
        aria-label={`Partager : ${title}`}
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
          {previewSrc && (
            <div className="share-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc} alt="" className="share-preview-img" />
              <div className="share-preview-title">{title}</div>
            </div>
          )}

          <div className="share-networks">
            {networkLinks(title, shareUrl()).map((n) => (
              <a
                key={n.key}
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                className="share-network-btn"
                aria-label={`Partager sur ${n.label}`}
                onClick={() => setPanelOpen(false)}
              >
                {n.code}
              </a>
            ))}
          </div>

          {igSupported && (
            <button type="button" className="share-panel-item" onClick={shareToInstagram}>
              Partager sur Instagram
            </button>
          )}
          {igSupported && (
            <button type="button" className="share-panel-item" onClick={shareLinkNatively}>
              Envoyer le lien…
            </button>
          )}
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
