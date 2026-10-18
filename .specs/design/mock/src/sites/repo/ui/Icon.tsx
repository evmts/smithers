/* Repo-only additions keep the shared app icon contract intact. */
import { Icon as AppIcon } from "../../app/lib"

export const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  if (name !== "search" && name !== "agent" && name !== "link") return <AppIcon name={name} size={size} />
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "link" ? <><path d="M10 13a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-2 2" /><path d="M14 11a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l2-2" /></> : name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      ) : (
        <>
          <rect x="4" y="7" width="16" height="13" rx="3" />
          <path d="M12 3v4M2 12v4m20-4v4M8 16h8" />
          <circle cx="8.5" cy="11.5" r=".5" fill="currentColor" />
          <circle cx="15.5" cy="11.5" r=".5" fill="currentColor" />
        </>
      )}
    </svg>
  )
}
