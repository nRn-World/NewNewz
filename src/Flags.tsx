// Self-hosted SVG flags for the UI languages — zero third-party network requests, crisp at any DPI, and works offline.
export function Flag({ code }: { code: string }) {
  switch (code) {
    case 'se':
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="24" height="16" fill="#006aa7" />
          <rect x="7" width="3.2" height="16" fill="#fecc02" />
          <rect y="6.4" width="24" height="3.2" fill="#fecc02" />
        </svg>
      )
    case 'gb':
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#fff" strokeWidth="3.2" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#c8102e" strokeWidth="1.6" />
          <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="5.2" />
          <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="3" />
        </svg>
      )
    case 'tr':
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="24" height="16" fill="#e30a17" />
          <circle cx="9" cy="8" r="4.2" fill="#fff" />
          <circle cx="10.1" cy="8" r="3.4" fill="#e30a17" />
          <polygon points="13.2,8 16.4,6.9 14.5,9.7 14.5,6.3 16.4,9.1" fill="#fff" />
        </svg>
      )
    case 'ae':
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="24" height="5.34" fill="#00732f" />
          <rect y="5.33" width="24" height="5.34" fill="#fff" />
          <rect y="10.66" width="24" height="5.34" fill="#000" />
          <rect width="6" height="16" fill="#ff0000" />
        </svg>
      )
    case 'es':
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="24" height="16" fill="#aa151b" />
          <rect y="4" width="24" height="8" fill="#f1bf00" />
        </svg>
      )
    case 'fr':
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="8" height="16" fill="#002395" />
          <rect x="8" width="8" height="16" fill="#fff" />
          <rect x="16" width="8" height="16" fill="#ed2939" />
        </svg>
      )
    case 'de':
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="24" height="5.34" fill="#000" />
          <rect y="5.33" width="24" height="5.34" fill="#dd0000" />
          <rect y="10.66" width="24" height="5.34" fill="#ffce00" />
        </svg>
      )
    case 'ku':
      // Alaya Rengîn: red, white and green with the 21-rayed sun
      return (
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true">
          <rect width="24" height="5.34" fill="#ed2024" />
          <rect y="5.33" width="24" height="5.34" fill="#fff" />
          <rect y="10.66" width="24" height="5.34" fill="#278e43" />
          <polygon
            fill="#febd11"
            points="12.00,4.00 12.34,5.73 13.18,4.18 13.00,5.93 14.25,4.70 13.56,6.31 15.13,5.51 13.99,6.85 15.72,6.54 14.24,7.49 15.99,7.70 14.29,8.17 15.90,8.89 14.14,8.84 15.46,10.00 13.80,9.43 14.72,10.93 13.30,9.90 13.74,11.60 12.68,10.20 12.60,11.96 12.00,10.30 11.40,11.96 11.32,10.20 10.26,11.60 10.70,9.90 9.28,10.93 10.20,9.43 8.54,10.00 9.86,8.84 8.10,8.89 9.71,8.17 8.01,7.70 9.76,7.49 8.28,6.54 10.01,6.85 8.87,5.51 10.44,6.31 9.75,4.70 11.00,5.93 10.82,4.18 11.66,5.73"
          />
        </svg>
      )
    default:
      return null
  }
}
