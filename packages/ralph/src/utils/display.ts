import pc from 'picocolors'

export function displaySuccess(message: string) {
  console.log(pc.green('✅ ' + message))
}

export function displayError(message: string) {
  console.error(pc.red('❌ ' + message))
}

export function displayWarning(message: string) {
  console.warn(pc.yellow('⚠️  ' + message))
}

export function displayInfo(message: string) {
  console.log(pc.blue('ℹ️  ' + message))
}

export function displayRalph(message: string) {
  console.log(pc.cyan('[Ralph] ' + message))
}

export function displayFrame(frame: number) {
  console.log(pc.cyan(`🔄 Frame ${frame} - Ralph keeps going...`))
}
