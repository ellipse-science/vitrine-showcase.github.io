'use client'

import React, { useEffect, useRef, useState } from 'react'

interface ShareButtonProps {
  title: string
  saillanceLabel: string
  section: string
  url?: string
  hashtags?: string[]
}

export function ShareButton({ title, saillanceLabel, section, url, hashtags = [] }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [pageUrl, setPageUrl] = useState(url ?? '')
  const [copied, setCopied] = useState(false)
  const [igCopied, setIgCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!url) setPageUrl(window.location.href)
  }, [url])

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  const hashtagStr = hashtags.length > 0 ? ' ' + hashtags.map(h => `#${h}`).join(' ') : ''
  const xText = `📰 ${title} — ${saillanceLabel} | La Vitrine démocratique${hashtagStr}`
  const whatsappText = `📰 *${title}* — ${saillanceLabel}\n\nVia La Vitrine démocratique :\n${pageUrl}`
  const emailSubject = `${title} — La Vitrine démocratique`
  const emailBody = `${title}\n\n${saillanceLabel} — ${section}\n\nVoir la source :\n${pageUrl}\n\nVia La Vitrine démocratique (CLESSN — Université Laval)`

  const networks = [
    {
      key: 'x',
      label: 'X',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(pageUrl)}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <text x="1" y="15" fontFamily="'IBM Plex Mono', monospace" fontSize="16" fontWeight="700" fill="currentColor">𝕏</text>
        </svg>
      ),
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="4" y="7" width="2.2" height="7" fill="currentColor" />
          <circle cx="5.1" cy="4.8" r="1.2" fill="currentColor" />
          <path d="M8.5 7v7M8.5 9.5c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10.5 6H9.5C9.2 6 9 6.2 9 6.5V8H10.5L10.2 10H9V15H7V10H6V8H7V6.5C7 5.1 8.1 4 9.5 4H10.5V6Z" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'instagram',
      label: igCopied ? 'Copié !' : 'Instagram',
      href: null as string | null,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1.5" y="1.5" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="13.2" cy="4.8" r="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 13l1.5-4a5 5 0 1 1 2 2L5 13z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      key: 'email',
      label: 'Courriel',
      href: `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1.5" y="4" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1.5 5.5L9 11l7.5-5.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ),
    },
  ]

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  const handleInstagram = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setIgCopied(true)
      setTimeout(() => setIgCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  const truncUrl = pageUrl.length > 48 ? pageUrl.slice(0, 45) + '…' : pageUrl

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={btnRef}
        className="share-btn"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Partager cet article"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
          <circle cx="7.5" cy="2" r="1.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="2" cy="5" r="1.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="7.5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1" />
          <line x1="3.4" y1="4.3" x2="6.1" y2="2.7" stroke="currentColor" strokeWidth="1" />
          <line x1="3.4" y1="5.7" x2="6.1" y2="7.3" stroke="currentColor" strokeWidth="1" />
        </svg>
        Partager
      </button>

      {open && (
        <div ref={panelRef} className="share-panel">
          <p className="share-panel-title">Partager</p>
          <div className="share-networks">
            {networks.map(n => {
              if (n.key === 'instagram') {
                return (
                  <button
                    key="instagram"
                    className="share-network-btn"
                    onClick={handleInstagram}
                    title="Copier le lien pour Instagram"
                    type="button"
                  >
                    <span className="share-network-icon">{n.icon}</span>
                    <span className="share-network-label" style={igCopied ? { color: 'var(--cordovan)' } : undefined}>
                      {n.label}
                    </span>
                  </button>
                )
              }
              return (
                <a
                  key={n.key}
                  href={n.href ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="share-network-btn"
                  onClick={() => setOpen(false)}
                >
                  <span className="share-network-icon">{n.icon}</span>
                  <span className="share-network-label">{n.label}</span>
                </a>
              )
            })}
          </div>
          <div className="share-copy-row">
            <span className="share-copy-url">{truncUrl}</span>
            <button
              type="button"
              className={`share-copy-btn${copied ? ' copied' : ''}`}
              onClick={handleCopy}
            >
              {copied ? 'Copié !' : 'Copier le lien'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
