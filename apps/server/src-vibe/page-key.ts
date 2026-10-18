// C-1: decodeURIComponent throws a native defect; the public synchronous API catches it.
export const pageKeyImpl = (pathname: string): string | undefined => {
  let path: string
  try {
    path = decodeURIComponent(pathname)
  } catch {
    return undefined
  }
  if (path.endsWith("/index.html")) path = path.slice(0, -"index.html".length)
  return path.endsWith("/") ? path : `${path}/`
}

