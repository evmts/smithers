/** Keep isolated CLI environments inside the owning test run's scratch/cache scope. */
export const temporaryEnvironment = () => ({
  TMPDIR: process.env.TMPDIR,
  TMP: process.env.TMP,
  TEMP: process.env.TEMP,
  NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE
})
